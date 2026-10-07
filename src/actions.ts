import { decodeFunctionData, decodeAbiParameters, getAddress } from 'viem';
import bs58 from 'bs58';
import type { Tx } from './blockscout';
import { tokenMeta } from './known';

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

/** Selector of UniversalGatewayPC.sendUniversalTxOutbound((bytes,address,uint256,
 * uint256,uint256,uint256,bytes,address)) — a cross-chain (outbound) call. The
 * `token` (a synthetic PRC-20) tells us the destination chain, and `recipient`
 * the destination contract/address on it. Source: @pushchain/core
 * constants/abi/universalGatewayPC.evm. */
const SEND_OUTBOUND_SELECTOR = '0x77b86bec';

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

const OUTBOUND_ABI = [
  {
    type: 'function',
    name: 'sendUniversalTxOutbound',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'req',
        type: 'tuple',
        components: [
          { name: 'recipient', type: 'bytes' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'gasLimit', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'maxPCForGas', type: 'uint256' },
          { name: 'payload', type: 'bytes' },
          { name: 'revertRecipient', type: 'address' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

/** Where a cross-chain (gateway) universal action actually went. */
export interface CrossChain {
  /** Destination chain, derived from the bridged PRC-20 token (SDK mapping). */
  chain: string | null;
  /** Human symbol of the bridged token, e.g. "USDC". */
  tokenSymbol: string | null;
  /** The PRC-20 token address on Push Chain. */
  token: string;
  /** Amount of the token bridged (raw units of that token). */
  amount: bigint;
  /** Destination contract/address on the target chain (checksummed EVM or
   * base58 Solana), or null when funds are routed to the caller's own account. */
  recipient: string | null;
  /** true when `payload` is non-empty — a cross-chain contract call, not a
   * plain funds transfer. */
  hasPayload: boolean;
}

export interface InnerCall {
  /** The real target contract this universal action called on Push Chain. */
  to: string;
  value: bigint;
  /** 4-byte selector of the inner calldata (method on the target), or ''. */
  selector: string;
  /** Present when `to` is the gateway and the call is a cross-chain outbound. */
  crossChain?: CrossChain;
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
        calls.push(makeCall(c.to, c.value, c.data));
      }
    } catch {
      // Keep the action but with no decoded inner calls rather than inventing.
    }
  } else if (to && to.toLowerCase() !== ZERO) {
    calls.push(makeCall(to, value, data));
  }

  return { txHash: tx.hash, timestamp: tx.timestamp, ok: tx.status !== 'error', value, isMulticall, calls };
}

/** Build an InnerCall, decoding a cross-chain destination when the call is a
 * gateway outbound (selector 0x77b86bec). */
function makeCall(to: string, value: bigint, data: string): InnerCall {
  const call: InnerCall = { to: safeAddr(to), value, selector: selOf(data) };
  if (call.selector === SEND_OUTBOUND_SELECTOR) {
    const cross = decodeOutbound(data);
    if (cross) call.crossChain = cross;
  }
  return call;
}

/** Decode sendUniversalTxOutbound calldata into a cross-chain destination:
 * destination chain (from the bridged PRC-20 token), recipient and amount.
 * Returns null when it cannot be decoded cleanly — never guessed. */
function decodeOutbound(data: string): CrossChain | null {
  try {
    const decoded = decodeFunctionData({ abi: OUTBOUND_ABI, data: data as `0x${string}` });
    const req = decoded.args[0] as {
      recipient: string;
      token: string;
      amount: bigint;
      payload: string;
    };
    const meta = tokenMeta(req.token);
    return {
      chain: meta?.chain ?? null,
      tokenSymbol: meta?.symbol ?? null,
      token: safeAddr(req.token),
      amount: req.amount,
      recipient: decodeRecipient(req.recipient),
      hasPayload: !!req.payload && req.payload.length > 2,
    };
  } catch {
    return null;
  }
}

// The gateway's `recipient` is raw bytes for the destination chain: 20 bytes for
// an EVM address, 32 bytes for a Solana pubkey (base58), or zero/empty when the
// protocol routes funds back to the caller's own account.
function decodeRecipient(recipient: string | undefined): string | null {
  if (!recipient || recipient === '0x') return null;
  const hex = recipient.toLowerCase().replace(/^0x/, '');
  if (/^0+$/.test(hex)) return null;
  const bytes = hex.length / 2;
  if (bytes === 20) return safeAddr('0x' + hex);
  if (bytes === 32) {
    try {
      return bs58.encode(Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))));
    } catch {
      return '0x' + hex;
    }
  }
  return '0x' + hex;
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
