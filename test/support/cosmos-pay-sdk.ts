export type PluginJson =
  | string
  | number
  | boolean
  | null
  | PluginJson[]
  | { [key: string]: PluginJson };

export type PluginJsonObject = { [key: string]: PluginJson };

export interface PluginStoredRecord {
  key: string;
  value: PluginJson;
  updatedAt: string;
}

export interface PluginPaymentIntent {
  id: string;
  kind: string;
  status: string;
  source: string | null;
  destination: string;
  amount: string | null;
  asset: string;
  assetIssuer: string | null;
  memo: string;
  chain: string;
  network: string;
  txHash: string | null;
  reference: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluginContext {
  readonly plugin: { readonly slug: string; readonly version: string };
  readonly installation: {
    readonly id: string;
    readonly config: Readonly<Record<string, string | number | boolean>>;
  };
  readonly storage: {
    get(collection: string, key: string): Promise<PluginJson | null>;
    put(collection: string, key: string, value: PluginJson): Promise<void>;
    delete(collection: string, key: string): Promise<boolean>;
    list(
      collection: string,
      options?: { prefix?: string; take?: number; after?: string },
    ): Promise<{ items: PluginStoredRecord[]; nextCursor: string | null }>;
  };
  readonly core: {
    paymentIntents: {
      get(id: string): Promise<PluginPaymentIntent | null>;
    };
  };
  readonly http: {
    request(input: unknown): Promise<unknown>;
  };
  readonly log: {
    log(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

type Handler = (
  ctx: PluginContext,
  input: PluginJsonObject,
) => Promise<PluginJson> | PluginJson;

interface PluginHandlers {
  queries?: Readonly<Record<string, Handler>>;
  commands?: Readonly<Record<string, Handler>>;
}

export function defineHandlers<const T extends PluginHandlers>(handlers: T): T {
  return handlers;
}

export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginError';
  }
}

export function requireString(
  input: PluginJsonObject,
  field: string,
  options: { max?: number } = {},
): string {
  const value = input[field];
  const max = options.max ?? 500;
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new PluginError(
      `${field} must be a non-empty string of at most ${max} characters`,
    );
  }
  return value.trim();
}

export function optionalString(
  input: PluginJsonObject,
  field: string,
  options: { max?: number } = {},
): string | undefined {
  return input[field] === undefined || input[field] === null
    ? undefined
    : requireString(input, field, options);
}
