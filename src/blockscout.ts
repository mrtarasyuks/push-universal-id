import { DONUT } from './chains';

// Thin typed wrapper over the public Blockscout REST API v2 running on
// donut.push.network. No key, no backend — the browser calls it directly.

export interface Implementation {
  address: string;
  name: string | null;
}

export interface AddressInfo {
  hash: string;
  coin_balance: string | null; // wei string
  is_contract: boolean;
  creation_tx_hash?: string | null;
  implementations?: Implementation[];
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
  // Full calldata — we decode executeUniversalTx from this with viem to find the
  // real target app of each universal action (Blockscout's decoded_input is only
  // present for verified contracts, raw_input is always there).
  raw_input?: string | null;
}

/** Blockscout opaque cursor for the next page of a paginated list. */
export type PageParams = Record<string, unknown> | null;

export interface Page<T> {
  items: T[];
  next_page_params: PageParams;
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

export interface TokenBalance {
  token: TokenInfo | null;
  value: string | null; // raw units
  token_id?: string | null;
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

function pageQuery(params: PageParams): string {
  if (!params) return '';
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

export async function getTransactions(address: string, params: PageParams = null): Promise<Page<Tx>> {
  const data = await get<Page<Tx>>(`/addresses/${address}/transactions${pageQuery(params)}`);
  return { items: data.items ?? [], next_page_params: data.next_page_params ?? null };
}

export async function getTokenTransfers(
  address: string,
  params: PageParams = null
): Promise<Page<TokenTransfer>> {
  const data = await get<Page<TokenTransfer>>(
    `/addresses/${address}/token-transfers${pageQuery(params)}`
  );
  return { items: data.items ?? [], next_page_params: data.next_page_params ?? null };
}

/** Current token holdings of an address (not paginated — Blockscout returns the
 * whole list). Empty array when the address holds nothing / is unknown. */
export async function getTokenBalances(address: string): Promise<TokenBalance[]> {
  const data = await get<TokenBalance[]>(`/addresses/${address}/token-balances`);
  return Array.isArray(data) ? data : [];
}

/** A raw log as returned by eth_getLogs. */
export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  logIndex: string; // hex
  blockNumber: string; // hex
}

/**
 * Read-only eth_getLogs through the Blockscout JSON-RPC proxy (CORS-enabled).
 * We pass only topic0 (the event signature): this node does not honour
 * positional `null` placeholders in the topics array, so callers filter the
 * remaining indexed fields client-side. Never throws — returns [] on any error
 * (including the HTML the proxy emits when a block range is too wide), so a
 * failed enrichment degrades to the token-derived fallback instead of breaking
 * the page. Never signs or sends anything.
 */
export async function getLogs(opts: {
  address: string;
  topic0: string;
  fromBlock: string;
  toBlock: string;
}): Promise<RpcLog[]> {
  let res: Response;
  try {
    res = await fetch(DONUT.ethRpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [
          { address: opts.address, topics: [opts.topic0], fromBlock: opts.fromBlock, toBlock: opts.toBlock },
        ],
      }),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  let json: { result?: unknown; error?: unknown };
  try {
    json = (await res.json()) as { result?: unknown; error?: unknown };
  } catch {
    return []; // the proxy returns HTML (not JSON) when a query is too heavy
  }
  if (json.error || !Array.isArray(json.result)) return [];
  return json.result as RpcLog[];
}

/**
 * Read-only eth_call through Blockscout's JSON-RPC proxy (CORS-enabled). Used
 * for the reverse lookup (factory.getOriginForUEA). Returns the raw hex result;
 * never signs or sends anything.
 */
export async function ethCall(to: string, data: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(DONUT.ethRpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
  } catch (e) {
    throw new ApiError(
      `Не вдалося звернутись до RPC Push Chain (${(e as Error).message}).`
    );
  }
  if (!res.ok) throw new ApiError(`RPC відповів ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error) throw new ApiError(json.error.message || 'Помилка eth_call');
  if (typeof json.result !== 'string') throw new ApiError('Порожня відповідь eth_call');
  return json.result;
}
