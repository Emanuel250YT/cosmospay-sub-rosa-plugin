import {
  defineHandlers,
  optionalString,
  PluginError,
  requireString,
  type PluginContext,
  type PluginJson,
  type PluginJsonObject,
} from '@/plugins/sdk';

const COLLECTION = 'rfqs';
const SCHEMA_VERSION = 1;
const SEALED_PROPOSAL_SCHEMA_REF =
  'b84a413c18205d4e45e80eff8ef29d322fbac1fd2f634b3fca9d9740c6176f6a';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_32_RE = /^[0-9a-f]{64}$/i;
const ACCOUNT_RE = /^G[A-Z2-7]{55}$/;
const CONTRACT_RE = /^C[A-Z2-7]{55}$/;
const ROUND_ID_RE = /^(0|[1-9][0-9]{0,38})$/;
const CORE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type Network = 'testnet' | 'mainnet';
type ProtocolVersion = 'core-v2' | 'reveal-policy-v3';

interface SubRosaMapping {
  network: Network;
  contractId: string;
  roundId: string;
  protocolVersion: ProtocolVersion;
  mode: 'ReceiptOnly';
  schemaRef: string;
  itemRef: string;
  revealRound: number;
  creatorAddress: string | null;
  createTxHash: string | null;
  attachedAt: string;
}

interface SelectionEvidence {
  selectedProviderAddress: string;
  receiptHash: string;
  receiptUri: string | null;
  receiptVersion: 2 | 3;
  clientVerified: true;
  openRevealTxHash: string;
  revealTxHash: string;
  clearTxHash: string;
  notes: string | null;
  recordedAt: string;
}

interface RfqRecord {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string | null;
  itemRef: string;
  commitDeadline: number;
  revealDeadline: number;
  status: 'draft' | 'round-attached' | 'provider-selected';
  createdAt: string;
  updatedAt: string;
  subRosa: SubRosaMapping | null;
  selection: SelectionEvidence | null;
  paymentIntentId: string | null;
}

function assertOnly(input: PluginJsonObject, allowed: readonly string[]): void {
  for (const field of Object.keys(input)) {
    if (!allowed.includes(field)) {
      throw new PluginError(`Unexpected field: ${field}`);
    }
  }
}

function checked(
  value: string,
  field: string,
  pattern: RegExp,
  description: string,
): string {
  if (!pattern.test(value)) {
    throw new PluginError(`${field} must be ${description}`);
  }
  return value;
}

function uuid(input: PluginJsonObject): string {
  return checked(
    requireString(input, 'rfqId', { max: 36 }),
    'rfqId',
    UUID_RE,
    'an RFC 4122 UUID',
  ).toLowerCase();
}

function hex32(input: PluginJsonObject, field: string): string {
  return checked(
    requireString(input, field, { max: 64 }),
    field,
    HEX_32_RE,
    'a 32-byte hexadecimal value',
  ).toLowerCase();
}

function account(input: PluginJsonObject, field: string): string {
  return checked(
    requireString(input, field, { max: 56 }),
    field,
    ACCOUNT_RE,
    'a structurally valid Stellar G... address',
  );
}

function optionalAccount(
  input: PluginJsonObject,
  field: string,
): string | null {
  const value = optionalString(input, field, { max: 56 });
  return value === undefined
    ? null
    : checked(
        value,
        field,
        ACCOUNT_RE,
        'a structurally valid Stellar G... address',
      );
}

function txHash(input: PluginJsonObject, field: string): string {
  return hex32(input, field);
}

function optionalTxHash(
  input: PluginJsonObject,
  field: string,
): string | null {
  const value = optionalString(input, field, { max: 64 });
  return value === undefined
    ? null
    : checked(
        value,
        field,
        HEX_32_RE,
        'a 32-byte transaction hash',
      ).toLowerCase();
}

function integer(
  input: PluginJsonObject,
  field: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = input[field];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new PluginError(`${field} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function enumValue<T extends string>(
  input: PluginJsonObject,
  field: string,
  values: readonly T[],
): T {
  const value = requireString(input, field, { max: 40 });
  if (!(values as readonly string[]).includes(value)) {
    throw new PluginError(`${field} must be one of: ${values.join(', ')}`);
  }
  return value as T;
}

function optionalHttpsUri(input: PluginJsonObject): string | null {
  const value = optionalString(input, 'receiptUri', { max: 500 });
  if (value === undefined) return null;
  if (!/^https:\/\/[^\s]+$/i.test(value)) {
    throw new PluginError('receiptUri must be an absolute HTTPS URL');
  }
  return value;
}

function asRecord(value: PluginJson | null): RfqRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = value as unknown as RfqRecord;
  return candidate.schemaVersion === SCHEMA_VERSION ? candidate : null;
}

async function requireRfq(
  ctx: PluginContext,
  rfqId: string,
): Promise<RfqRecord> {
  const record = asRecord(await ctx.storage.get(COLLECTION, rfqId));
  if (!record) throw new PluginError(`RFQ ${rfqId} not found`);
  return record;
}

async function save(ctx: PluginContext, record: RfqRecord): Promise<void> {
  await ctx.storage.put(
    COLLECTION,
    record.id,
    record as unknown as PluginJson,
  );
}

function updated(record: RfqRecord): RfqRecord {
  return { ...record, updatedAt: new Date().toISOString() };
}

export default defineHandlers({
  commands: {
    'create-rfq': async (ctx, input) => {
      assertOnly(input, [
        'rfqId',
        'title',
        'description',
        'itemRef',
        'commitDeadline',
        'revealDeadline',
      ]);
      const id = uuid(input);
      if (await ctx.storage.get(COLLECTION, id)) {
        throw new PluginError(`RFQ ${id} already exists`);
      }
      const commitDeadline = integer(input, 'commitDeadline', 1);
      const revealDeadline = integer(input, 'revealDeadline', 1);
      if (commitDeadline >= revealDeadline) {
        throw new PluginError('commitDeadline must be before revealDeadline');
      }
      const now = new Date().toISOString();
      const record: RfqRecord = {
        schemaVersion: SCHEMA_VERSION,
        id,
        title: requireString(input, 'title', { max: 160 }),
        description:
          optionalString(input, 'description', { max: 1000 }) ?? null,
        itemRef: hex32(input, 'itemRef'),
        commitDeadline,
        revealDeadline,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subRosa: null,
        selection: null,
        paymentIntentId: null,
      };
      await save(ctx, record);
      return record as unknown as PluginJson;
    },

    'attach-sub-rosa-round': async (ctx, input) => {
      assertOnly(input, [
        'rfqId',
        'network',
        'contractId',
        'roundId',
        'protocolVersion',
        'mode',
        'schemaRef',
        'itemRef',
        'revealRound',
        'creatorAddress',
        'createTxHash',
      ]);
      const id = uuid(input);
      const record = await requireRfq(ctx, id);
      if (record.subRosa) {
        throw new PluginError(`RFQ ${id} already has a Sub Rosa round`);
      }
      const itemRef = hex32(input, 'itemRef');
      if (itemRef !== record.itemRef) {
        throw new PluginError('itemRef must match the RFQ canonical hash');
      }
      const schemaRef = hex32(input, 'schemaRef');
      if (schemaRef !== SEALED_PROPOSAL_SCHEMA_REF) {
        throw new PluginError(
          'schemaRef must be the Sub Rosa sealed-proposal v1 schema',
        );
      }
      const mode = enumValue(input, 'mode', ['ReceiptOnly'] as const);
      const roundId = checked(
        requireString(input, 'roundId', { max: 39 }),
        'roundId',
        ROUND_ID_RE,
        'a non-negative decimal round id',
      );
      const mapping: SubRosaMapping = {
        network: enumValue(input, 'network', ['testnet', 'mainnet'] as const),
        contractId: checked(
          requireString(input, 'contractId', { max: 56 }),
          'contractId',
          CONTRACT_RE,
          'a structurally valid Soroban C... contract id',
        ),
        roundId,
        protocolVersion: enumValue(input, 'protocolVersion', [
          'core-v2',
          'reveal-policy-v3',
        ] as const),
        mode,
        schemaRef,
        itemRef,
        revealRound: integer(input, 'revealRound', 1),
        creatorAddress: optionalAccount(input, 'creatorAddress'),
        createTxHash: optionalTxHash(input, 'createTxHash'),
        attachedAt: new Date().toISOString(),
      };
      const next = updated({
        ...record,
        status: 'round-attached',
        subRosa: mapping,
      });
      await save(ctx, next);
      return next as unknown as PluginJson;
    },

    'record-result': async (ctx, input) => {
      assertOnly(input, [
        'rfqId',
        'selectedProviderAddress',
        'receiptHash',
        'receiptUri',
        'receiptVersion',
        'clientVerified',
        'openRevealTxHash',
        'revealTxHash',
        'clearTxHash',
        'notes',
      ]);
      const id = uuid(input);
      const record = await requireRfq(ctx, id);
      if (!record.subRosa) {
        throw new PluginError('Attach a Sub Rosa round before recording a result');
      }
      if (record.selection) {
        throw new PluginError(`RFQ ${id} already has a recorded selection`);
      }
      if (input.clientVerified !== true) {
        throw new PluginError(
          'clientVerified must be true after companion-client receipt verification',
        );
      }
      const receiptVersion = integer(input, 'receiptVersion', 2, 3);
      const selection: SelectionEvidence = {
        selectedProviderAddress: account(input, 'selectedProviderAddress'),
        receiptHash: hex32(input, 'receiptHash'),
        receiptUri: optionalHttpsUri(input),
        receiptVersion: receiptVersion as 2 | 3,
        clientVerified: true,
        openRevealTxHash: txHash(input, 'openRevealTxHash'),
        revealTxHash: txHash(input, 'revealTxHash'),
        clearTxHash: txHash(input, 'clearTxHash'),
        notes: optionalString(input, 'notes', { max: 500 }) ?? null,
        recordedAt: new Date().toISOString(),
      };
      const next = updated({
        ...record,
        status: 'provider-selected',
        selection,
      });
      await save(ctx, next);
      return next as unknown as PluginJson;
    },

    'attach-payment-intent': async (ctx, input) => {
      assertOnly(input, ['rfqId', 'paymentIntentId']);
      const id = uuid(input);
      const record = await requireRfq(ctx, id);
      if (!record.subRosa || !record.selection) {
        throw new PluginError(
          'Record the Sub Rosa selection before attaching a payment intent',
        );
      }
      const paymentIntentId = checked(
        requireString(input, 'paymentIntentId', { max: 64 }),
        'paymentIntentId',
        CORE_ID_RE,
        'a Cosmos Pay resource id',
      );
      if (
        record.paymentIntentId !== null &&
        record.paymentIntentId !== paymentIntentId
      ) {
        throw new PluginError(`RFQ ${id} already links another payment intent`);
      }
      const intent = await ctx.core.paymentIntents.get(paymentIntentId);
      if (!intent) {
        throw new PluginError(
          `Payment intent ${paymentIntentId} was not found for this tenant`,
        );
      }
      if (intent.chain !== 'stellar') {
        throw new PluginError('The linked payment intent must settle on Stellar');
      }
      const expectedNetwork =
        record.subRosa.network === 'mainnet' ? 'public' : 'testnet';
      if (intent.network !== expectedNetwork) {
        throw new PluginError(
          `Payment intent network must be ${expectedNetwork} for this RFQ`,
        );
      }
      const next = updated({ ...record, paymentIntentId });
      await save(ctx, next);
      return next as unknown as PluginJson;
    },
  },

  queries: {
    'get-rfq': async (ctx, input) => {
      assertOnly(input, ['rfqId']);
      const record = await requireRfq(ctx, uuid(input));
      const paymentIntent = record.paymentIntentId
        ? await ctx.core.paymentIntents.get(record.paymentIntentId)
        : null;
      return {
        rfq: record as unknown as PluginJson,
        paymentIntent: paymentIntent as unknown as PluginJson,
      };
    },

    'list-rfqs': async (ctx, input) => {
      assertOnly(input, ['take', 'after']);
      const take =
        input.take === undefined ? 50 : integer(input, 'take', 1, 100);
      const after = optionalString(input, 'after', { max: 128 });
      const page = await ctx.storage.list(COLLECTION, {
        take,
        ...(after === undefined ? {} : { after }),
      });
      return {
        data: page.items.map((item) => item.value),
        nextCursor: page.nextCursor,
      };
    },
  },
});
