import { getAddress } from 'viem';
import {
  SYNTHETIC_PUSH_ERC20,
  CHAIN_INFO,
  VM_NAMESPACE,
  UEA_PROXY,
  PUSH_BATCH_EXECUTOR_ADDRESS,
} from '@pushchain/core/src/lib/constants/chain';
import { CHAIN, PUSH_NETWORK } from '@pushchain/core/src/lib/constants/enums';

// Authoritative labels for well-known Push Chain (Donut) contracts, taken
// straight from @pushchain/core's own constants — not guessed. We use them to
// name the real target of a universal action and to map a bridged PRC-20 token
// to the origin/destination chain it represents. Blockscout name resolution
// still runs; these win when present because they carry chain context the
// explorer does not.

export type KnownKind = 'infra' | 'dex' | 'token';

export interface KnownAddr {
  name: string;
  kind: KnownKind;
  /** For a synthetic PRC-20: the external chain this asset lives on. */
  chain?: string;
}

/** The PRC-20 synthetic for an external asset + which chain it represents. */
export interface TokenMeta {
  symbol: string;
  chain: string;
  /** CAIP-2 of that chain (e.g. "eip155:421614"), for destination links. */
  caip?: string | null;
}

const NET = PUSH_NETWORK.TESTNET_DONUT;

// ---- precompiles / protocol contracts on Push Chain ----
// UniversalGatewayPC is a fixed precompile; the SDK hardcodes it in
// orchestrator/internals/helpers.ts (getUniversalGatewayPCAddress). UniversalCore
// and UniversalCallback are the genesis predeploys documented in constants/chain.
const GATEWAY_PC = '0x00000000000000000000000000000000000000C1';
const UNIVERSAL_CORE = '0x00000000000000000000000000000000000000C0';
const UNIVERSAL_CALLBACK = '0x00000000000000000000000000000000000000c2';
const UEA_FACTORY = '0x00000000000000000000000000000000000000eA';

/** The UniversalGatewayPC precompile — a universal action that targets it is a
 * cross-chain (outbound) call; we decode its destination separately. */
export const GATEWAY_PC_ADDRESS = GATEWAY_PC.toLowerCase();

// ---- chain label for a synthetic token's suffix ----
const CHAIN_BY_CODE: Record<string, string> = {
  ETH: 'Ethereum Sepolia',
  ARB: 'Arbitrum Sepolia',
  BASE: 'Base Sepolia',
  BNB: 'BNB testnet',
  BSC: 'BNB testnet',
  SOL: 'Solana Devnet',
};

// Each token-suffix code → the SDK CHAIN it represents, so we can read that
// chain's CAIP-2 (namespace:chainId) straight from the SDK's own constants and
// build a destination-explorer link without guessing.
const CHAIN_ENUM_BY_CODE: Record<string, CHAIN> = {
  ETH: CHAIN.ETHEREUM_SEPOLIA,
  ARB: CHAIN.ARBITRUM_SEPOLIA,
  BASE: CHAIN.BASE_SEPOLIA,
  BNB: CHAIN.BNB_TESTNET,
  BSC: CHAIN.BNB_TESTNET,
  SOL: CHAIN.SOLANA_DEVNET,
};

function caipOfCode(code: string): string | null {
  const chain = CHAIN_ENUM_BY_CODE[code];
  if (chain == null) return null;
  const info = CHAIN_INFO[chain];
  if (!info) return null;
  return `${VM_NAMESPACE[info.vm]}:${info.chainId}`;
}

// A synthetic key like `USDT_ARB` → symbol `USDT`, chain code `ARB`. Keys with
// no suffix are the chain's native asset: pETH→ETH, pBNB→BNB, pSOL→SOL.
function tokenMetaFromKey(key: string): TokenMeta {
  if (key.includes('_')) {
    const i = key.indexOf('_');
    const symbol = key.slice(0, i);
    const code = key.slice(i + 1);
    return { symbol, chain: CHAIN_BY_CODE[code] ?? code, caip: caipOfCode(code) };
  }
  const base: Record<string, string> = { pETH: 'ETH', pBNB: 'BNB', pSOL: 'SOL' };
  const code = base[key] ?? '';
  return { symbol: key, chain: CHAIN_BY_CODE[code] ?? 'Push Chain', caip: caipOfCode(code) };
}

const known = new Map<string, KnownAddr>();
const tokens = new Map<string, TokenMeta>();

function add(addr: string | undefined, entry: KnownAddr) {
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return;
  known.set(addr.toLowerCase(), entry);
}

// infra / precompiles
add(GATEWAY_PC, { name: 'UniversalGatewayPC', kind: 'infra' });
add(UNIVERSAL_CORE, { name: 'UniversalCore', kind: 'infra' });
add(UNIVERSAL_CALLBACK, { name: 'UniversalCallback', kind: 'infra' });
add(UEA_FACTORY, { name: 'UEAFactory', kind: 'infra' });
add(UEA_PROXY[NET], { name: 'UEA implementation', kind: 'infra' });
add(PUSH_BATCH_EXECUTOR_ADDRESS[CHAIN.PUSH_TESTNET_DONUT], {
  name: 'PushBatchExecutor',
  kind: 'infra',
});

// Push Chain DEX (Uniswap V3) on Donut
const dex = CHAIN_INFO[CHAIN.PUSH_TESTNET_DONUT].dex;
if (dex) {
  add(dex.uniV3SwapRouter, { name: 'Uniswap V3 SwapRouter', kind: 'dex' });
  add(dex.uniV3Factory, { name: 'Uniswap V3 Factory', kind: 'dex' });
  add(dex.uniV3QuoterV2, { name: 'Uniswap V3 QuoterV2', kind: 'dex' });
  add(dex.weth, { name: 'WPC (wrapped PC)', kind: 'dex' });
}

// synthetic PRC-20 tokens → symbol + the chain they bridge to/from
const syn = SYNTHETIC_PUSH_ERC20[NET] as Record<string, `0x${string}`>;
for (const [key, addr] of Object.entries(syn)) {
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) continue;
  const meta = tokenMetaFromKey(key);
  const lc = addr.toLowerCase();
  // First writer wins (USDT_BSC before its deprecated USDT_BNB alias).
  if (!tokens.has(lc)) tokens.set(lc, meta);
  if (!known.has(lc)) {
    known.set(lc, { name: `${meta.symbol} (${meta.chain})`, kind: 'token', chain: meta.chain });
  }
}

/** Authoritative SDK label for an address, or null if unknown. */
export function knownAddr(addr: string | null | undefined): KnownAddr | null {
  if (!addr) return null;
  return known.get(addr.toLowerCase()) ?? null;
}

/** Synthetic-token metadata (symbol + chain) for a PRC-20 address, or null. */
export function tokenMeta(addr: string | null | undefined): TokenMeta | null {
  if (!addr) return null;
  return tokens.get(addr.toLowerCase()) ?? null;
}

/** True for protocol infrastructure (precompiles, relayer-side contracts) that
 * should not be counted as an "app" the wallet chose to use. */
export function isInfra(addr: string | null | undefined): boolean {
  const k = knownAddr(addr);
  return k?.kind === 'infra';
}

export function checksum(addr: string): string {
  try {
    return getAddress(addr as `0x${string}`);
  } catch {
    return addr;
  }
}
