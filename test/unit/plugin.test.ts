import { describe, expect, it } from 'vitest';
import handlers from '../../plugin/sub-rosa/index.js';
import type {
  PluginContext,
  PluginJson,
  PluginJsonObject,
  PluginPaymentIntent,
} from '../support/cosmos-pay-sdk.js';

const RFQ_ID = '86b82f3d-64d8-4b50-9b28-0d43f2f4500f';
const ITEM_REF = '11'.repeat(32);
const SCHEMA_REF =
  'b84a413c18205d4e45e80eff8ef29d322fbac1fd2f634b3fca9d9740c6176f6a';
const ACCOUNT = `G${'A'.repeat(55)}`;
const CONTRACT = `C${'B'.repeat(55)}`;
const TX_A = 'aa'.repeat(32);
const TX_B = 'bb'.repeat(32);
const TX_C = 'cc'.repeat(32);
const RECEIPT_HASH = 'dd'.repeat(32);

function paymentIntent(
  id: string,
  overrides: Partial<PluginPaymentIntent> = {},
): PluginPaymentIntent {
  return {
    id,
    kind: 'PAY',
    status: 'PENDING',
    source: null,
    destination: ACCOUNT,
    amount: '25',
    asset: 'XLM',
    assetIssuer: null,
    memo: '42',
    chain: 'stellar',
    network: 'testnet',
    txHash: null,
    reference: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function context(intents: PluginPaymentIntent[] = []): PluginContext {
  const records = new Map<string, PluginJson>();
  const intentMap = new Map(intents.map((intent) => [intent.id, intent]));
  return {
    plugin: { slug: 'sub-rosa', version: '0.1.0' },
    installation: { id: 'installation-1', config: {} },
    storage: {
      async get(collection, key) {
        return records.get(`${collection}:${key}`) ?? null;
      },
      async put(collection, key, value) {
        records.set(`${collection}:${key}`, structuredClone(value));
      },
      async delete(collection, key) {
        return records.delete(`${collection}:${key}`);
      },
      async list(collection, options) {
        const prefix = `${collection}:`;
        const keys = [...records.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length))
          .sort()
          .filter((key) => !options?.after || key > options.after)
          .slice(0, options?.take ?? 100);
        return {
          items: keys.map((key) => ({
            key,
            value: structuredClone(records.get(`${prefix}${key}`)!),
            updatedAt: new Date().toISOString(),
          })),
          nextCursor: null,
        };
      },
    },
    core: {
      paymentIntents: {
        async get(id) {
          return intentMap.get(id) ?? null;
        },
      },
    },
    http: {
      async request() {
        throw new Error('egress is disabled');
      },
    },
    log: { log() {}, warn() {}, error() {} },
  };
}

function command(
  ctx: PluginContext,
  name: keyof NonNullable<typeof handlers.commands>,
  input: PluginJsonObject,
): Promise<PluginJson> {
  return Promise.resolve(handlers.commands[name](ctx, input));
}

function query(
  ctx: PluginContext,
  name: keyof NonNullable<typeof handlers.queries>,
  input: PluginJsonObject,
): Promise<PluginJson> {
  return Promise.resolve(handlers.queries[name](ctx, input));
}

function createInput(overrides: PluginJsonObject = {}): PluginJsonObject {
  return {
    rfqId: RFQ_ID,
    title: 'Private security review RFQ',
    description: 'Non-confidential public metadata',
    itemRef: ITEM_REF,
    commitDeadline: 2_000_000_000,
    revealDeadline: 2_000_000_600,
    ...overrides,
  };
}

function roundInput(overrides: PluginJsonObject = {}): PluginJsonObject {
  return {
    rfqId: RFQ_ID,
    network: 'testnet',
    contractId: CONTRACT,
    roundId: '42',
    protocolVersion: 'core-v2',
    mode: 'ReceiptOnly',
    schemaRef: SCHEMA_REF,
    itemRef: ITEM_REF,
    revealRound: 123456,
    creatorAddress: ACCOUNT,
    createTxHash: TX_A,
    ...overrides,
  };
}

function resultInput(overrides: PluginJsonObject = {}): PluginJsonObject {
  return {
    rfqId: RFQ_ID,
    selectedProviderAddress: ACCOUNT,
    receiptHash: RECEIPT_HASH,
    receiptVersion: 2,
    clientVerified: true,
    openRevealTxHash: TX_A,
    revealTxHash: TX_B,
    clearTxHash: TX_C,
    ...overrides,
  };
}

async function createAndAttach(ctx: PluginContext): Promise<void> {
  await command(ctx, 'create-rfq', createInput());
  await command(ctx, 'attach-sub-rosa-round', roundInput());
}

describe('sub-rosa Cosmos Pay plugin', () => {
  it('creates and reads a versioned RFQ', async () => {
    const ctx = context();
    const created = (await command(ctx, 'create-rfq', createInput())) as any;
    expect(created).toMatchObject({
      schemaVersion: 1,
      id: RFQ_ID,
      itemRef: ITEM_REF,
      status: 'draft',
      subRosa: null,
      selection: null,
      paymentIntentId: null,
    });
    const output = (await query(ctx, 'get-rfq', { rfqId: RFQ_ID })) as any;
    expect(output.rfq.id).toBe(RFQ_ID);
    expect(output.paymentIntent).toBeNull();
  });

  it('rejects a non-UUID RFQ id', async () => {
    await expect(
      command(context(), 'create-rfq', createInput({ rfqId: 'rfq-1' })),
    ).rejects.toThrow('RFC 4122 UUID');
  });

  it('rejects an itemRef that is not a canonical 32-byte hex value', async () => {
    await expect(
      command(context(), 'create-rfq', createInput({ itemRef: 'plaintext' })),
    ).rejects.toThrow('32-byte hexadecimal');
  });

  it('requires the commit deadline to precede the reveal deadline', async () => {
    await expect(
      command(
        context(),
        'create-rfq',
        createInput({ commitDeadline: 20, revealDeadline: 20 }),
      ),
    ).rejects.toThrow('commitDeadline must be before revealDeadline');
  });

  it('validates and records the complete Sub Rosa mapping', async () => {
    const ctx = context();
    await command(ctx, 'create-rfq', createInput());
    const mapped = (await command(
      ctx,
      'attach-sub-rosa-round',
      roundInput(),
    )) as any;
    expect(mapped.status).toBe('round-attached');
    expect(mapped.subRosa).toMatchObject({
      network: 'testnet',
      contractId: CONTRACT,
      roundId: '42',
      protocolVersion: 'core-v2',
      mode: 'ReceiptOnly',
      schemaRef: SCHEMA_REF,
      itemRef: ITEM_REF,
      revealRound: 123456,
    });
  });

  it('rejects a mapping with the wrong item or schema reference', async () => {
    const ctx = context();
    await command(ctx, 'create-rfq', createInput());
    await expect(
      command(
        ctx,
        'attach-sub-rosa-round',
        roundInput({ itemRef: '22'.repeat(32) }),
      ),
    ).rejects.toThrow('itemRef must match');
    await expect(
      command(
        ctx,
        'attach-sub-rosa-round',
        roundInput({ schemaRef: '33'.repeat(32) }),
      ),
    ).rejects.toThrow('sealed-proposal v1 schema');
  });

  it('records client-verified selection evidence without a full receipt', async () => {
    const ctx = context();
    await createAndAttach(ctx);
    const selected = (await command(
      ctx,
      'record-result',
      resultInput(),
    )) as any;
    expect(selected.status).toBe('provider-selected');
    expect(selected.selection).toMatchObject({
      selectedProviderAddress: ACCOUNT,
      receiptHash: RECEIPT_HASH,
      clientVerified: true,
    });
    expect(JSON.stringify(selected)).not.toContain('revealedEnvelope');
    expect(JSON.stringify(selected)).not.toContain('proposal plaintext');
  });

  it('rejects invalid receipt evidence and unverified results', async () => {
    const ctx = context();
    await createAndAttach(ctx);
    await expect(
      command(ctx, 'record-result', resultInput({ receiptHash: 'short' })),
    ).rejects.toThrow('32-byte hexadecimal');
    await expect(
      command(ctx, 'record-result', resultInput({ clientVerified: false })),
    ).rejects.toThrow('clientVerified must be true');
  });

  it('rejects proposal plaintext and all unknown fields instead of persisting them', async () => {
    const ctx = context();
    await createAndAttach(ctx);
    await expect(
      command(
        ctx,
        'record-result',
        resultInput({ proposal: 'proposal plaintext' }),
      ),
    ).rejects.toThrow('Unexpected field: proposal');
    const output = (await query(ctx, 'get-rfq', { rfqId: RFQ_ID })) as any;
    expect(JSON.stringify(output)).not.toContain('proposal plaintext');
  });

  it('verifies tenant-visible Stellar payment intents before linking', async () => {
    const intent = paymentIntent('pi_tenant_1');
    const ctx = context([intent]);
    await createAndAttach(ctx);
    await command(ctx, 'record-result', resultInput());
    const linked = (await command(ctx, 'attach-payment-intent', {
      rfqId: RFQ_ID,
      paymentIntentId: intent.id,
    })) as any;
    expect(linked.paymentIntentId).toBe(intent.id);
    const output = (await query(ctx, 'get-rfq', { rfqId: RFQ_ID })) as any;
    expect(output.paymentIntent.id).toBe(intent.id);
  });

  it('refuses missing, cross-network, and non-Stellar payment intents', async () => {
    const ctx = context([
      paymentIntent('pi_mainnet', { network: 'public' }),
      paymentIntent('pi_solana', { chain: 'solana' }),
    ]);
    await createAndAttach(ctx);
    await command(ctx, 'record-result', resultInput());
    await expect(
      command(ctx, 'attach-payment-intent', {
        rfqId: RFQ_ID,
        paymentIntentId: 'pi_other_tenant',
      }),
    ).rejects.toThrow('not found for this tenant');
    await expect(
      command(ctx, 'attach-payment-intent', {
        rfqId: RFQ_ID,
        paymentIntentId: 'pi_mainnet',
      }),
    ).rejects.toThrow('network must be testnet');
    await expect(
      command(ctx, 'attach-payment-intent', {
        rfqId: RFQ_ID,
        paymentIntentId: 'pi_solana',
      }),
    ).rejects.toThrow('must settle on Stellar');
  });

  it('inherits tenant isolation from separate installation-scoped contexts', async () => {
    const tenantA = context();
    const tenantB = context();
    await command(tenantA, 'create-rfq', createInput());
    await expect(
      query(tenantB, 'get-rfq', { rfqId: RFQ_ID }),
    ).rejects.toThrow('not found');
  });

  it('lists RFQs through the current storage enumeration API', async () => {
    const ctx = context();
    await command(ctx, 'create-rfq', createInput());
    const page = (await query(ctx, 'list-rfqs', { take: 10 })) as any;
    expect(page.data).toHaveLength(1);
    expect(page.data[0].id).toBe(RFQ_ID);
    expect(page.nextCursor).toBeNull();
  });

  it('enforces input length limits and rejects malformed fields', async () => {
    await expect(
      command(
        context(),
        'create-rfq',
        createInput({ title: 'x'.repeat(161) }),
      ),
    ).rejects.toThrow('at most 160');
    await expect(
      command(context(), 'create-rfq', createInput({ extra: true })),
    ).rejects.toThrow('Unexpected field: extra');
  });
});
