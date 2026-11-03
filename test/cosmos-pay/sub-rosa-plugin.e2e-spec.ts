import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';

process.env.PLUGINS_ENABLED = 'sub-rosa';
process.env.PLUGINS_ALLOW_UNSIGNED = 'true';

const SECRET = 'topsecret-topsecret-topsecret-topsecret';
const USERNAME = 'cosmos_sub_rosa_e2e';
const RFQ_ID = '86b82f3d-64d8-4b50-9b28-0d43f2f4500f';
const ITEM_REF = '11'.repeat(32);
const SCHEMA_REF =
  'b84a413c18205d4e45e80eff8ef29d322fbac1fd2f634b3fca9d9740c6176f6a';
const ACCOUNT = `G${'A'.repeat(55)}`;
const CONTRACT = `C${'B'.repeat(55)}`;
const TX_A = 'aa'.repeat(32);
const TX_B = 'bb'.repeat(32);
const TX_C = 'cc'.repeat(32);

describe('Sub Rosa external plugin through Cosmos Pay HTTP (e2e)', () => {
  let app: INestApplication;
  const installations = new Map<string, any>();
  const records = new Map<string, any>();
  const now = new Date('2026-11-03T12:00:00.000Z');
  const paymentIntent = {
    id: 'pi_sub_rosa_e2e',
    consumerId: 'consumer-1',
    kind: 'PAY',
    status: 'PENDING',
    chain: 'stellar',
    network: 'testnet',
    source: null,
    destination: ACCOUNT,
    amount: '25',
    asset: 'XLM',
    assetIssuer: null,
    memo: '42',
    chainReference: null,
    networkFee: null,
    msg: null,
    callback: null,
    xdr: null,
    uri: `web+stellar:pay?destination=${ACCOUNT}&amount=25&memo=42`,
    txHash: null,
    reference: 'sub-rosa-rfq',
    checkoutTheme: null,
    merchantFee: null,
    expiresAt: null,
    checkoutSeenAt: null,
    checkoutWalletAt: null,
    checkoutWalletClosedAt: null,
    checkoutSentAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const prismaMock = {
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(() => Promise.resolve([{ count: 1 }])),
    requestLog: { create: jest.fn().mockResolvedValue({ id: 'request-1' }) },
    consumer: {
      upsert: jest.fn().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: 'consumer-1',
          apisixUsername: create.apisixUsername,
          credentialId: create.credentialId ?? null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    },
    pluginInstallation: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.consumer?.apisixUsername !== USERNAME) return null;
        return installations.get(where.pluginSlug) ?? null;
      }),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create, update }: any) => {
        const existing = installations.get(create.pluginSlug);
        const row = {
          id: existing?.id ?? 'installation-1',
          consumerId: create.consumerId,
          pluginSlug: create.pluginSlug,
          ...(existing ? update : create),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        installations.set(create.pluginSlug, row);
        return Promise.resolve(row);
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    pluginRecord: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        const key = where.installationId_collection_key;
        const row = records.get(`${key.installationId}:${key.collection}:${key.key}`);
        return Promise.resolve(row ? { value: row.value } : null);
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        const storageKey = `${where.installationId}:${where.collection}:${where.key}`;
        const row = records.get(storageKey);
        if (!row) return Promise.resolve({ count: 0 });
        records.set(storageKey, { ...row, value: data.value, updatedAt: now });
        return Promise.resolve({ count: 1 });
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const storageKey = `${data.installationId}:${data.collection}:${data.key}`;
        const row = { ...data, updatedAt: now };
        records.set(storageKey, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(),
      count: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          [...records.values()].filter(
            (row) => row.installationId === where.installationId,
          ).length,
        ),
      ),
      findMany: jest.fn().mockImplementation(({ where, take }: any) => {
        const prefix = where.key?.startsWith ?? '';
        const after = where.key?.gt;
        return Promise.resolve(
          [...records.values()]
            .filter(
              (row) =>
                row.installationId === where.installationId &&
                row.collection === where.collection &&
                row.key.startsWith(prefix) &&
                (!after || row.key > after),
            )
            .sort((left, right) => left.key.localeCompare(right.key))
            .slice(0, take)
            .map((row) => ({
              key: row.key,
              value: row.value,
              updatedAt: row.updatedAt,
            })),
        );
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    paymentIntent: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === paymentIntent.id &&
            where.consumer?.apisixUsername === USERNAME
            ? paymentIntent
            : null,
        ),
      ),
    },
  };

  beforeAll(async () => {
    const [{ AppModule }, { PrismaService }] = await Promise.all([
      import('@/app.module'),
      import('@/prisma/prisma.service'),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const asTenant = (test: request.Test) =>
    test
      .set('x-gateway-secret', SECRET)
      .set('x-consumer-username', USERNAME)
      .set('x-consumer-role', 'user')
      .set('x-consumer-permissions', 'plugins:read,plugins:write');

  const command = (action: string, input: Record<string, unknown>) =>
    asTenant(
      request(app.getHttpServer()).post(
        `/v1/plugins/sub-rosa/commands/${action}`,
      ),
    ).send({ input });

  it('runs the complete mapping flow through the actual plugin runtime', async () => {
    await asTenant(
      request(app.getHttpServer()).put('/v1/plugins/sub-rosa/installation'),
    )
      .send({ grantCapabilities: ['payment_intents:read'] })
      .expect(200);

    await command('create-rfq', {
      rfqId: RFQ_ID,
      title: 'Testnet private RFQ',
      itemRef: ITEM_REF,
      commitDeadline: 2_000_000_000,
      revealDeadline: 2_000_000_600,
    }).expect(200);

    await command('attach-sub-rosa-round', {
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
    }).expect(200);

    await command('record-result', {
      rfqId: RFQ_ID,
      selectedProviderAddress: ACCOUNT,
      receiptHash: 'dd'.repeat(32),
      receiptVersion: 2,
      clientVerified: true,
      openRevealTxHash: TX_A,
      revealTxHash: TX_B,
      clearTxHash: TX_C,
    }).expect(200);

    const missing = await command('attach-payment-intent', {
      rfqId: RFQ_ID,
      paymentIntentId: 'pi_other_tenant',
    }).expect(400);
    expect(missing.body.code).toBe('plugin_rejected');

    await command('attach-payment-intent', {
      rfqId: RFQ_ID,
      paymentIntentId: paymentIntent.id,
    }).expect(200);

    const result = await asTenant(
      request(app.getHttpServer()).post(
        '/v1/plugins/sub-rosa/queries/get-rfq',
      ),
    )
      .send({ input: { rfqId: RFQ_ID } })
      .expect(200);

    expect(result.body.output.rfq).toMatchObject({
      id: RFQ_ID,
      status: 'provider-selected',
      paymentIntentId: paymentIntent.id,
      subRosa: {
        mode: 'ReceiptOnly',
        roundId: '42',
        itemRef: ITEM_REF,
      },
      selection: {
        selectedProviderAddress: ACCOUNT,
        receiptHash: 'dd'.repeat(32),
        clientVerified: true,
      },
    });
    expect(result.body.output.paymentIntent).toMatchObject({
      id: paymentIntent.id,
      chain: 'stellar',
      network: 'testnet',
    });
    expect(JSON.stringify(result.body)).not.toContain('revealedEnvelope');

    const list = await asTenant(
      request(app.getHttpServer()).post(
        '/v1/plugins/sub-rosa/queries/list-rfqs',
      ),
    )
      .send({ input: { take: 10 } })
      .expect(200);
    expect(list.body.output.data).toHaveLength(1);
  });
});
