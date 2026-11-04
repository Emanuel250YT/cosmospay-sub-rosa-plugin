import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  SEALED_PROPOSAL_SCHEMA_REF,
  SubRosaClient,
  chainInfo,
  createSealedProposalRound,
  drandRoundTime,
  fetchRoundSignature,
  generateAuditorKeypair,
  openPayload,
  quicknet,
  resolveSubRosaDeployment,
  roundInSeconds,
  sealProposal,
  serializeReceiptV2,
  verifyReceiptV2,
} from '@sub-rosa/sdk';
import {
  assertSorobanContract,
  assertStellarAccount,
  canonicalRfqItemRef,
  CosmosPaySubRosaClient,
  sha256Hex,
} from '../../../src/index.js';

// Keep this script opt-in: it submits real Stellar Testnet transactions.
function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function lastHash(client: SubRosaClient, operation: string): string {
  const value = client.submittedTransactionHashes.at(-1);
  if (!value) throw new Error(`${operation} did not expose a transaction hash`);
  return value;
}

async function waitUntil(unixSeconds: number): Promise<void> {
  const milliseconds = unixSeconds * 1000 - Date.now() + 2_000;
  if (milliseconds > 0) {
    console.log(`Waiting ${Math.ceil(milliseconds / 1000)}s for Drand reveal…`);
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

async function main(): Promise<void> {
  const creatorSecret = env('SUB_ROSA_CREATOR_SECRET');
  const providerSecret = env('SUB_ROSA_PROVIDER_SECRET');
  const creatorAddress = assertStellarAccount(
    Keypair.fromSecret(creatorSecret).publicKey(),
  );
  const providerAddress = assertStellarAccount(
    Keypair.fromSecret(providerSecret).publicKey(),
  );
  const deployment = resolveSubRosaDeployment('testnet');
  assertSorobanContract(deployment.contractId);

  // An API key through the gateway; the gateway secret only for a Cosmos Pay
  // server on this machine (the client refuses to send it anywhere else).
  const apiKey = process.env.COSMOS_PAY_API_KEY?.trim();
  const cosmos = new CosmosPaySubRosaClient(
    apiKey
      ? { baseUrl: env('COSMOS_PAY_URL'), apiKey }
      : {
          baseUrl: env('COSMOS_PAY_URL'),
          gatewaySecret: env('COSMOS_PAY_GATEWAY_SECRET'),
          consumerUsername: env('COSMOS_PAY_CONSUMER_USERNAME'),
          permissions:
            process.env.COSMOS_PAY_CONSUMER_PERMISSIONS ??
            'plugins:read,plugins:write',
        },
  );
  await cosmos.install();

  const creator = new SubRosaClient({
    network: 'testnet',
    secretKey: creatorSecret,
  });
  const provider = new SubRosaClient({
    network: 'testnet',
    secretKey: providerSecret,
  });
  const drand = quicknet();
  const delay = Number(process.env.SUB_ROSA_REVEAL_DELAY_SECONDS ?? '90');
  if (!Number.isSafeInteger(delay) || delay < 30) {
    throw new Error('SUB_ROSA_REVEAL_DELAY_SECONDS must be an integer >= 30');
  }
  const revealRound = await roundInSeconds(drand, delay);
  const info = await chainInfo(drand);
  const revealAt = drandRoundTime(revealRound, info);
  const now = Math.floor(Date.now() / 1000);
  const commitDeadline = Math.min(now + Math.max(10, delay - 15), revealAt - 1);
  const revealDeadline = revealAt + 300;
  if (commitDeadline <= now) {
    throw new Error('Reveal delay is too short to create and submit the round');
  }

  const rfqId = randomUUID();
  const rfqDefinition = {
    rfqId,
    title: 'Independent Soroban security review',
    description: 'Testnet private RFQ integration demonstration',
    commitDeadline,
    revealDeadline,
  };
  const itemRef = canonicalRfqItemRef(rfqDefinition);
  await cosmos.createRfq({ ...rfqDefinition, itemRef });

  const auditor = generateAuditorKeypair();
  const roundId = await createSealedProposalRound(creator, {
    itemRef: Uint8Array.from(Buffer.from(itemRef, 'hex')),
    revealRound,
    commitDeadline,
    revealDeadline,
    auditorPubkey: auditor.publicKey,
    eligibleParticipants: [providerAddress],
  });
  const createTxHash = lastHash(creator, 'createSealedProposalRound');
  await cosmos.attachRound({
    rfqId,
    network: 'testnet',
    contractId: deployment.contractId,
    roundId: roundId.toString(),
    protocolVersion: 'core-v2',
    mode: 'ReceiptOnly',
    schemaRef: Buffer.from(SEALED_PROPOSAL_SCHEMA_REF).toString('hex'),
    itemRef,
    revealRound,
    creatorAddress,
    createTxHash,
  });

  const sealed = await sealProposal({
    round: revealRound,
    drand,
    identity: new TextEncoder().encode(providerAddress),
    auditorPublicKey: auditor.publicKey,
    price: 2_500n,
    proposal: {
      timelineDays: 14,
      approach: 'Manual and automated Soroban review',
      deliverables: ['Threat model', 'Findings report', 'Remediation review'],
    },
  });
  await provider.submitV2({ roundId, sealed, escrow: 0n });
  const submitTxHash = lastHash(provider, 'submitV2');

  await waitUntil(revealAt);
  const signature = await fetchRoundSignature(drand, revealRound);
  await creator.openRevealV2(roundId, signature);
  const openRevealTxHash = lastHash(creator, 'openRevealV2');
  const envelope = await openPayload(sealed.ciphertext, drand);
  await provider.revealV2({ roundId, bidder: providerAddress, envelope });
  const revealTxHash = lastHash(provider, 'revealV2');
  await creator.clearV2(roundId);
  const clearTxHash = lastHash(creator, 'clearV2');

  const receipt = await creator.exportReceiptV2(roundId);
  const verification = verifyReceiptV2(receipt);
  if (!verification.valid) {
    throw new Error(
      `Receipt verification failed: ${JSON.stringify(verification.issues)}`,
    );
  }
  const serializedReceipt = serializeReceiptV2(receipt);
  const receiptHash = sha256Hex(serializedReceipt);
  const receiptUri = process.env.SUB_ROSA_RECEIPT_URI?.trim();
  await cosmos.recordResult({
    rfqId,
    selectedProviderAddress: providerAddress,
    receiptHash,
    ...(receiptUri ? { receiptUri } : {}),
    receiptVersion: receipt.version,
    clientVerified: true,
    openRevealTxHash,
    revealTxHash,
    clearTxHash,
    notes: `ReceiptOnly selection; submit transaction ${submitTxHash}`,
  });

  const paymentIntentId = process.env.COSMOS_PAY_PAYMENT_INTENT_ID?.trim();
  if (paymentIntentId) {
    await cosmos.attachPaymentIntent(rfqId, paymentIntentId);
  }

  const finalMapping = await cosmos.getRfq(rfqId);
  console.log(
    JSON.stringify(
      {
        rfqId,
        roundId: roundId.toString(),
        itemRef,
        receiptHash,
        transactionHashes: {
          createTxHash,
          submitTxHash,
          openRevealTxHash,
          revealTxHash,
          clearTxHash,
        },
        finalMapping,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
