import { DONUT } from './chains';

// Thin typed wrapper over the public Blockscout REST API v2 running on
// donut.push.network. No key, no backend — the browser calls it directly.

export interface AddressInfo {
  hash: string;
  coin_balance: string | null; // wei string
  is_contract: boolean;
  creation_tx_hash?: string | null;
  implementations?: unknown[];
  name?: string | null;
}

export interface Counters {
  transactions_count: string | null;
  token_transfers_count: string | null;
  gas_usage_count: string | null;
  validations_count: string | null;
}

export interface TxParty {
  hash: string;
  is_contract: boolean;
  name: string | null;
}

export interface Tx {
  hash: string;
  from: TxParty | null;
  to: TxParty | null;
  value: string; // wei
  fee?: { type: string; value: string } | null;
  gas_used?: string | null;
  gas_price?: string | null;
  timestamp: string | null;
  method?: string | null;
  result?: string | null;
  status?: string | null;
  block_number?: number | null;
}

export interface TokenInfo {
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: string | null;
  type: string | null;
}

export interface TokenTransfer {
  method: string | null;
  timestamp: string | null;
  tx_hash?: string | null;
  transaction_hash?: string | null;
  from: TxParty | null;
  to: TxParty | null;
  token: TokenInfo | null;
  total?: { value: string | null; decimals: string | null } | null;
}

class ApiError extends Error {}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DONUT.blockscoutApi}${path}`, {
      headers: { accept: 'application/json' },
    });
  } catch (e) {
    throw new ApiError(
      `Не вдалося звернутись до Blockscout (${(e as Error).message}). Можливо, мережа недоступна або CORS заблоковано.`
    );
  }
  if (res.status === 404) {
    // Blockscout returns 404 for an address it has never seen — a valid
    // "no activity" answer, not a failure.
    throw new ApiError('404');
  }
  if (!res.ok) {
    throw new ApiError(`Blockscout відповів ${res.status}`);
  }
  return (await res.json()) as T;
}

export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.message === '404';
}

export async function getAddressInfo(address: string): Promise<AddressInfo> {
  return get<AddressInfo>(`/addresses/${address}`);
}

export async function getCounters(address: string): Promise<Counters> {
  return get<Counters>(`/addresses/${address}/counters`);
}

export async function getTransactions(address: string): Promise<Tx[]> {
  const data = await get<{ items: Tx[] }>(`/addresses/${address}/transactions`);
  return data.items ?? [];
}

export async function getTokenTransfers(address: string): Promise<TokenTransfer[]> {
  const data = await get<{ items: TokenTransfer[] }>(`/addresses/${address}/token-transfers`);
  return data.items ?? [];
}
