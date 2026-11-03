export interface CosmosPayClientOptions {
  baseUrl: string;
  gatewaySecret: string;
  consumerUsername: string;
  permissions?: string;
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
      'x-gateway-secret': options.gatewaySecret,
      'x-consumer-username': options.consumerUsername,
      'x-consumer-role': 'user',
      'x-consumer-permissions':
        options.permissions ?? 'plugins:read,plugins:write',
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
    });
    const body = (await response.json()) as T & {
      message?: string | string[];
      code?: string;
    };
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
