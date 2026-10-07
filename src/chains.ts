import { CHAIN, chainMeta } from './uea';
import {
  CHAIN_INFO,
  UNIVERSAL_GATEWAY_ADDRESSES,
  VAULT_ADDRESSES,
} from '@pushchain/core/src/lib/constants/chain';

export type VmKind = 'evm' | 'svm';

/** Special <select> value: the input is already a UEA on Push Chain and we
 * resolve its origin wallet/chain (reverse lookup). */
export const REVERSE_ID = 'reverse';

export interface OriginChain {
  /** Stable id used in the ?chain= URL param and the <select>. */
  id: string;
  /** The SDK CHAIN enum value this maps to. */
  chain: CHAIN;
  label: string;
  vm: VmKind;
  /** Mini network-icon colours for the custom dropdown: a letter on a flat or
   * gradient circle — no external images, just inline SVG. */
  icon: { letter: string; from: string; to?: string };
}

// Only origin chains that Push maps to the Donut testnet are offered here.
export const ORIGIN_CHAINS: OriginChain[] = [
  {
    id: 'eth-sepolia',
    chain: CHAIN.ETHEREUM_SEPOLIA,
    label: 'Ethereum Sepolia',
    vm: 'evm',
    icon: { letter: 'E', from: '#627eea', to: '#8da3f7' },
  },
  {
    id: 'bnb-testnet',
    chain: CHAIN.BNB_TESTNET,
    label: 'BNB Smart Chain testnet',
    vm: 'evm',
    icon: { letter: 'B', from: '#f0b90b', to: '#f8d12f' },
  },
  {
    id: 'base-sepolia',
    chain: CHAIN.BASE_SEPOLIA,
    label: 'Base Sepolia',
    vm: 'evm',
    icon: { letter: 'b', from: '#0052ff', to: '#3b7bff' },
  },
  {
    id: 'arbitrum-sepolia',
    chain: CHAIN.ARBITRUM_SEPOLIA,
    label: 'Arbitrum Sepolia',
    vm: 'evm',
    icon: { letter: 'A', from: '#28a0f0', to: '#1b4add' },
  },
  {
    id: 'push',
    chain: CHAIN.PUSH_TESTNET_DONUT,
    label: 'Push Chain (Donut, native)',
    vm: 'evm',
    icon: { letter: 'P', from: '#d548ec', to: '#8b5cf6' },
  },
  {
    id: 'solana-devnet',
    chain: CHAIN.SOLANA_DEVNET,
    label: 'Solana Devnet',
    vm: 'svm',
    icon: { letter: 'S', from: '#9945ff', to: '#14f195' },
  },
];

let iconGradientSeq = 0;

/** A small inline-SVG circle with a letter — the dropdown's network icon. No
 * external images, so it works offline and needs no extra request. */
export function chainIconSvg(icon: { letter: string; from: string; to?: string }): string {
  const id = `ni-${iconGradientSeq++}`;
  const fill = icon.to ? `url(#${id})` : icon.from;
  const defs = icon.to
    ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${icon.from}"/><stop offset="1" stop-color="${icon.to}"/></linearGradient></defs>`
    : '';
  return `<svg class="network-icon-svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">${defs}<circle cx="10" cy="10" r="10" fill="${fill}"/><text x="10" y="14" text-anchor="middle" font-size="10" font-weight="700" font-family="ui-sans-serif,system-ui" fill="#fff">${icon.letter}</text></svg>`;
}

/** Neutral icon for the "this is a UEA, find its origin" reverse-lookup row. */
export function reverseIconSvg(): string {
  return `<svg class="network-icon-svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#352447"/><text x="10" y="14" text-anchor="middle" font-size="10" font-family="ui-sans-serif,system-ui" fill="#d548ec">↩</text></svg>`;
}

export function findChain(id: string | null): OriginChain | undefined {
  if (!id) return undefined;
  return ORIGIN_CHAINS.find((c) => c.id === id);
}

/** Map a CAIP namespace + chain id (as returned by the factory's
 * getOriginForUEA) back to a known origin chain, for labelling a reverse
 * lookup. Returns undefined when the origin chain is not one we list. */
export function findChainByCaip(namespace: string, chainId: string): OriginChain | undefined {
  return ORIGIN_CHAINS.find((c) => {
    const m = chainMeta(c.chain);
    return m.namespace === namespace && m.chainId === chainId;
  });
}

/** Turn a CAIP-2 chain namespace (e.g. "eip155:421614") into a readable label.
 * Uses our known origin-chain labels when the chain is one we list; otherwise
 * returns the raw CAIP string (honest — never guessed). */
export function chainLabelFromNamespace(ns: string): string {
  const i = ns.lastIndexOf(':');
  if (i < 0) return ns;
  const namespace = ns.slice(0, i);
  const chainId = ns.slice(i + 1);
  return findChainByCaip(namespace, chainId)?.label ?? ns;
}

/** That chain's own block explorer base URL (from the SDK's CHAIN_INFO), or null
 * when we do not have one. */
function explorerBase(chain: CHAIN): string | null {
  const url = CHAIN_INFO[chain]?.explorerUrl;
  return url && /^https?:\/\//.test(url) ? url.replace(/\/+$/, '') : null;
}

/**
 * Build a direct link to a recipient address on the *destination* chain's own
 * explorer (Arbiscan / Basescan / Etherscan / BscScan / Solana Explorer), so the
 * user can see the end of the bridge — not just the Push side. `caip` is the
 * destination CAIP-2 ("eip155:421614" or "solana:…"), `recipient` the checksummed
 * EVM address or base58 Solana pubkey. Returns null when the chain is unknown to
 * us, has no explorer, or there is no recipient (never a guessed link).
 */
export function destExplorerUrl(caip: string | null | undefined, recipient: string | null): { url: string; label: string } | null {
  if (!caip || !recipient) return null;
  const i = caip.lastIndexOf(':');
  if (i < 0) return null;
  const def = findChainByCaip(caip.slice(0, i), caip.slice(i + 1));
  if (!def) return null;
  const base = explorerBase(def.chain);
  if (!base) return null;
  // Solana Explorer needs the cluster for a testnet/devnet pubkey.
  const url = def.vm === 'svm' ? `${base}/address/${recipient}?cluster=devnet` : `${base}/address/${recipient}`;
  return { url, label: def.label };
}

// Destination-chain Blockscout instances verified live (2026-10-07) to answer
// read-only from a browser (CORS: *) with no API key. We confirm a cross-chain
// delivery against the destination Blockscout rather than the chain's raw public
// RPC: Blockscout is CORS-friendly and does not cap the log range the way the raw
// public RPCs do (which usually blocks CORS or returns an error page), so the
// "✓ delivered" confirmation actually appears. Only chains verified to work are
// listed — Arbitrum Sepolia's Blockscout sits behind a Cloudflare bot-challenge
// (403 from the browser) and BNB testnet has no public Blockscout, so a delivery
// there stays an honest "sent (Push)" instead of a fabricated confirmation.
const DEST_BLOCKSCOUT: Record<string, string> = {
  'eip155:11155111': 'https://eth-sepolia.blockscout.com', // Ethereum Sepolia
  'eip155:84532': 'https://base-sepolia.blockscout.com', // Base Sepolia
};

/** A destination chain whose Blockscout we can read to confirm delivery. Returns
 * null for a chain without a verified CORS-friendly Blockscout (caller then keeps
 * the Push-side signal) or a non-EVM one. */
export interface DestBlockscout {
  label: string;
  base: string;
  /** The gateway + vault addresses whose settlement events we query; the vault is
   * first because most deliveries finalize there. Either may be absent. */
  contracts: string[];
  /** Link to the settling tx on the destination chain's own explorer. */
  txUrl: (hash: string) => string | null;
}

export function destBlockscout(caip: string | null | undefined): DestBlockscout | null {
  if (!caip) return null;
  const i = caip.lastIndexOf(':');
  if (i < 0) return null;
  const namespace = caip.slice(0, i);
  const chainId = caip.slice(i + 1);
  const key = `${namespace}:${chainId}`;
  const base = DEST_BLOCKSCOUT[key];
  if (!base) return null;
  const def = findChainByCaip(namespace, chainId);
  if (!def) return null;
  const contracts = [
    (VAULT_ADDRESSES as Record<string, string>)[key],
    (UNIVERSAL_GATEWAY_ADDRESSES as Record<string, string>)[key],
  ].filter((a): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a));
  if (!contracts.length) return null;
  const expBase = explorerBase(def.chain);
  return {
    label: def.label,
    base,
    contracts,
    txUrl: (hash: string) => (expBase ? `${expBase}/tx/${hash}` : null),
  };
}

// ---- Donut testnet facts (from the SDK's own constants) ----
export const DONUT = {
  chainId: 42101,
  rpc: 'https://evm.donut.rpc.push.org/',
  // Blockscout's JSON-RPC proxy — unlike the raw EVM RPC it sends CORS headers,
  // so the browser can make read-only eth_call / eth_getLogs here with no key.
  ethRpc: 'https://donut.push.network/api/eth-rpc',
  explorer: 'https://donut.push.network',
  blockscoutApi: 'https://donut.push.network/api/v2',
  nativeSymbol: 'PC',
  nativeDecimals: 18,
};

export function donutAddressUrl(address: string): string {
  return `${DONUT.explorer}/address/${address}`;
}

export function donutTxUrl(hash: string): string {
  return `${DONUT.explorer}/tx/${hash}`;
}
