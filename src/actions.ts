import { decodeFunctionData, decodeAbiParameters, getAddress } from 'viem';
import type { Tx } from './blockscout';

// Decodes what a UEA actually did on Push Chain. The relayer submits a tx that
// calls `executeUniversalTx(payload, signature)` on the UEA; the real target app
// is inside `payload` — either `payload.to` directly, or, when the UEA batches /
// routes through the gateway, inside a UEA multicall carried in `payload.data`.
// A plain block explorer shows only the relayer and the UEA, never this target.

/** Selector of executeUniversalTx((address,uint256,bytes,uint256,uint256,uint256,uint256,uint256,uint8),bytes). */
export const EXECUTE_UNIVERSAL_TX_SELECTOR = '0xa84813a4';

/** bytes4(keccak256("UEA_MULTICALL")) — marks a UEA multicall in payload.data.
 * Source: @pushchain/core selectors (UEA_MULTICALL_SELECTOR). */
const UEA_MULTICALL_SELECTOR = '0x2cc2842d';

const ZERO = '0x0000000000000000000000000000000000000000';

const EXEC_ABI = [
  {
    type: 'function',
    name: 'executeUniversalTx',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'payload',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'gasLimit', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'vType', type: 'uint8' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const MULTICALL_ABI = [
  {
    type: 'tuple[]',
    components: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
] as const;

export interface InnerCall {
  /** The real target contract this universal action called on Push Chain. */
  to: string;
  value: bigint;
  /** 4-byte selector of the inner calldata (method on the target), or ''. */
  selector: string;
}

export interface UniversalAction {
  txHash: string;
  timestamp: string | null;
  ok: boolean;
  /** payload.value — PC moved by the action (wei). */
  value: bigint;
  /** true when payload.data was a UEA multicall wrapping several inner calls. */
  isMulticall: boolean;
  calls: InnerCall[];
}

function selOf(data: string | undefined | null): string {
  return data && data.length >= 10 ? data.slice(0, 10).toLowerCase() : '';
}

/**
 * Decode a UEA's universal action from a relayer tx. Returns null when the tx is
 * not an executeUniversalTx call or cannot be decoded (left out, never guessed).
 */
export function decodeUniversalAction(tx: Tx): UniversalAction | null {
  const input = tx.raw_input;
  if (!input || !input.toLowerCase().startsWith(EXECUTE_UNIVERSAL_TX_SELECTOR)) return null;

  let to: string;
  let value: bigint;
  let data: string;
  try {
    const decoded = decodeFunctionData({ abi: EXEC_ABI, data: input as `0x${string}` });
    const payload = decoded.args[0] as { to: string; value: bigint; data: string };
    to = payload.to;
    value = payload.value;
    data = payload.data;
  } catch {
    return null;
  }

  const calls: InnerCall[] = [];
  let isMulticall = false;

  if (selOf(data) === UEA_MULTICALL_SELECTOR) {
    isMulticall = true;
    try {
      const [arr] = decodeAbiParameters(MULTICALL_ABI, ('0x' + data.slice(10)) as `0x${string}`);
      for (const c of arr as Array<{ to: string; value: bigint; data: string }>) {
        calls.push({ to: safeAddr(c.to), value: c.value, selector: selOf(c.data) });
      }
    } catch {
      // Keep the action but with no decoded inner calls rather than inventing.
    }
  } else if (to && to.toLowerCase() !== ZERO) {
    calls.push({ to: safeAddr(to), value, selector: selOf(data) });
  }

  return { txHash: tx.hash, timestamp: tx.timestamp, ok: tx.status !== 'error', value, isMulticall, calls };
}

function safeAddr(a: string): string {
  try {
    return getAddress(a as `0x${string}`);
  } catch {
    return a;
  }
}

// A few well-known inner-call selectors so the action list reads in plain words.
// Only ones whose signature is unambiguous and standard — never guessed.
const KNOWN_SELECTORS: Record<string, string> = {
  '0xa9059cbb': 'transfer',
  '0x23b872dd': 'transferFrom',
  '0x095ea7b3': 'approve',
  '0x2e1a7d4d': 'withdraw',
  '0xd0e30db0': 'deposit',
  '0x2cc2842d': 'UEA multicall',
};

export function selectorLabel(selector: string): string | null {
  if (!selector) return null;
  return KNOWN_SELECTORS[selector.toLowerCase()] ?? null;
}
