/**
 * How the client authenticates. Give exactly one of:
 *
 * - `apiKey`: a Cosmos Pay API key holding `plugins:read` and `plugins:write`,
 *   sent to the gateway (`https://api.cosmospay.lat/cosmos-api`, or your own
 *   APISIX) as `Authorization: Bearer` and `apikey`. This is the only mode for
 *   a server that is not on this machine.
 * - `gatewaySecret` + `consumerUsername`: local development against a Cosmos Pay
 *   server on this machine with no gateway in front. The gateway secret lets
 *   its holder act as ANY consumer with ANY permissions, so the client refuses
 *   to send it anywhere but a loopback address.
 */
export interface CosmosPayClientOptions {
  baseUrl: string;
  apiKey?: string;
  gatewaySecret?: string;
  consumerUsername?: string;
  permissions?: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function authHeaders(options: CosmosPayClientOptions): Record<string, string> {
  let url: URL;
  try {
    url = new URL(options.baseUrl);
  } catch {
    throw new Error('baseUrl must be an absolute URL');
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('baseUrl must be https (plain http only to this machine)');
  }
  const viaGateway = options.gatewaySecret !== undefined;
  if (Boolean(options.apiKey) === viaGateway) {
    throw new Error('Give either apiKey or gatewaySecret + consumerUsername');
  }
  if (options.apiKey) {
    return {
      authorization: `Bearer ${options.apiKey}`,
      apikey: options.apiKey,
    };
  }
  if (!loopback) {
    throw new Error(
      'gatewaySecret is for a Cosmos Pay server on this machine only; use an apiKey for ' +
        url.hostname,
    );
  }
  if (!options.gatewaySecret || !options.consumerUsername) {
    throw new Error('gatewaySecret mode needs gatewaySecret and consumerUsername');
  }
  return {
    'x-gateway-secret': options.gatewaySecret,
    'x-consumer-username': options.consumerUsername,
    'x-consumer-role': 'user',
    'x-consumer-permissions':
      options.permissions ?? 'plugins:read,plugins:write',
  };
}

export interface CreateRfqInput {
  rfqId: string;
  title: string;
  description?: string;
  itemRef: string;
  commitDeadline: number;
  revealDeadline: number;
}

export interface AttachRoundInput {
  rfqId: string;
  network: 'testnet' | 'mainnet';
  contractId: string;
  roundId: string;
  protocolVersion: 'core-v2' | 'reveal-policy-v3';
  mode: 'ReceiptOnly';
  schemaRef: string;
  itemRef: string;
  revealRound: number;
  creatorAddress?: string;
  createTxHash?: string;
}

export interface RecordResultInput {
  rfqId: string;
  selectedProviderAddress: string;
  receiptHash: string;
  receiptUri?: string;
  receiptVersion: 2 | 3;
  clientVerified: true;
  openRevealTxHash: string;
  revealTxHash: string;
  clearTxHash: string;
  notes?: string;
}

interface PluginResponse<T> {
  plugin: string;
  action: string;
  output: T;
}

export class CosmosPaySubRosaClient {
  readonly #baseUrl: string;
  readonly #headers: Record<string, string>;

  constructor(options: CosmosPayClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#headers = {
      'content-type': 'application/json',
      ...authHeaders(options),
    };
  }

  async install(): Promise<unknown> {
    return this.#request('/v1/plugins/sub-rosa/installation', {
      method: 'PUT',
      body: JSON.stringify({ grantCapabilities: ['payment_intents:read'] }),
    });
  }

  createRfq<T = unknown>(input: CreateRfqInput): Promise<T> {
    return this.#command<T>('create-rfq', input);
  }

  attachRound<T = unknown>(input: AttachRoundInput): Promise<T> {
    return this.#command<T>('attach-sub-rosa-round', input);
  }

  recordResult<T = unknown>(input: RecordResultInput): Promise<T> {
    return this.#command<T>('record-result', input);
  }

  attachPaymentIntent<T = unknown>(
    rfqId: string,
    paymentIntentId: string,
  ): Promise<T> {
    return this.#command<T>('attach-payment-intent', {
      rfqId,
      paymentIntentId,
    });
  }

  getRfq<T = unknown>(rfqId: string): Promise<T> {
    return this.#query<T>('get-rfq', { rfqId });
  }

  listRfqs<T = unknown>(take = 50, after?: string): Promise<T> {
    return this.#query<T>('list-rfqs', {
      take,
      ...(after === undefined ? {} : { after }),
    });
  }

  async #command<T>(action: string, input: object): Promise<T> {
    const response = await this.#request<PluginResponse<T>>(
      `/v1/plugins/sub-rosa/commands/${action}`,
      { method: 'POST', body: JSON.stringify({ input }) },
    );
    return response.output;
  }

  async #query<T>(action: string, input: object): Promise<T> {
    const response = await this.#request<PluginResponse<T>>(
      `/v1/plugins/sub-rosa/queries/${action}`,
      { method: 'POST', body: JSON.stringify({ input }) },
    );
    return response.output;
  }

  async #request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: { ...this.#headers, ...init.headers },
      // A redirect would carry the credentials to wherever it points.
      redirect: 'error',
    });
    const text = await response.text();
    let body: T & { message?: string | string[]; code?: string };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new Error(
        `Cosmos Pay ${response.status}: the response is not JSON (${text.slice(0, 120)})`,
      );
    }
    if (!response.ok) {
      const message = Array.isArray(body.message)
        ? body.message.join('; ')
        : (body.message ?? response.statusText);
      throw new Error(
        `Cosmos Pay ${response.status}${body.code ? ` ${body.code}` : ''}: ${message}`,
      );
    }
    return body;
  }
}
