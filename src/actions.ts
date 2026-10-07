import { decodeFunctionData, decodeAbiParameters, decodeEventLog, encodeEventTopics, getAddress } from 'viem';
import bs58 from 'bs58';
import type { Tx, RpcLog } from './blockscout';
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
  /** CAIP-2 of the destination chain derived from the bridged token (e.g.
   * "eip155:421614"), used to build a destination-explorer link when the
   * authoritative event namespace is not available. */
  caip?: string | null;
  /** 4-byte selector of the method this action calls on the destination
   * contract, decoded from the outbound `payload`. '' for a plain transfer. */
  destSelector?: string;
  /** Exact destination chain label, taken from the gateway's UniversalTxOutbound
   * event (authoritative). Set after the event logs are fetched; null until then
   * or when no matching event exists, in which case the UI falls back to `chain`
   * (derived from the bridged token). */
  exactChain?: string | null;
  /** CAIP-2 destination namespace from the gateway event (authoritative), set
   * alongside `exactChain`. Preferred over `caip` for the explorer link. */
  exactNamespace?: string | null;
  /** True when the gateway later emitted RescueFundsOnSourceChain for this UEA on
   * this token+destination — the bridged funds came back to Push, i.e. the
   * cross-chain delivery did not complete. Matched by direction (sender+token+
   * chain), not by a shared id, so it flags the direction, not one exact tx. */
  rescued?: boolean;
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
    const hasPayload = !!req.payload && req.payload.length > 2;
    return {
      chain: meta?.chain ?? null,
      tokenSymbol: meta?.symbol ?? null,
      token: safeAddr(req.token),
      amount: req.amount,
      recipient: decodeRecipient(req.recipient),
      hasPayload,
      caip: meta?.caip ?? null,
      destSelector: hasPayload ? selOf(req.payload) : '',
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

// ---- Cross-chain destination from the gateway's own event ----
// The outbound calldata (decodeOutbound above) only names the bridged token, so
// the chain had to be *inferred* from it. The UniversalGatewayPC emits a
// `UniversalTxOutbound` event that carries the exact destination `chainNamespace`
// (a CAIP-2 string, e.g. "eip155:421614"). Reading that log via eth_getLogs gives
// the authoritative destination chain instead of a token-based guess. ABI copied
// verbatim from @pushchain/core (constants/abi/universalGatewayPC.evm).

const OUTBOUND_EVENT_ABI = [
  {
    type: 'event',
    name: 'UniversalTxOutbound',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'subTxId', type: 'bytes32' },
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'chainNamespace', type: 'string' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'recipient', type: 'bytes' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'gasToken', type: 'address' },
      { indexed: false, name: 'gasFee', type: 'uint256' },
      { indexed: false, name: 'gasLimit', type: 'uint256' },
      { indexed: false, name: 'payload', type: 'bytes' },
      { indexed: false, name: 'protocolFee', type: 'uint256' },
      { indexed: false, name: 'revertRecipient', type: 'address' },
      { indexed: false, name: 'txType', type: 'uint8' },
      { indexed: false, name: 'gasPrice', type: 'uint256' },
    ],
  },
] as const;

/** keccak256 topic0 of UniversalTxOutbound — the only topic this node filters on
 * reliably (positional null placeholders are ignored), so callers match sender /
 * token client-side. */
export const OUTBOUND_EVENT_TOPIC0 = encodeEventTopics({
  abi: OUTBOUND_EVENT_ABI,
  eventName: 'UniversalTxOutbound',
})[0] as string;

/** A decoded cross-chain outbound event: the exact destination chain plus the
 * token/amount, keyed back to its transaction so it can enrich an InnerCall. */
export interface OutboundEvent {
  txHash: string;
  logIndex: number;
  /** The UEA that sent the outbound (event `sender`). */
  sender: string;
  /** Exact destination chain as CAIP-2, e.g. "eip155:421614". */
  chainNamespace: string;
  token: string;
  amount: bigint;
  recipient: string | null;
  /** The gateway's unique id for this outbound (indexed topic). */
  subTxId: string;
  /** 4-byte selector of the method invoked on the destination contract, decoded
   * from the event's `payload`. '' when the payload is empty (a plain transfer). */
  destSelector: string;
}

/** Decode a raw UniversalTxOutbound log, or null if it is not one / malformed. */
export function decodeOutboundEvent(log: RpcLog): OutboundEvent | null {
  try {
    const d = decodeEventLog({
      abi: OUTBOUND_EVENT_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    const a = d.args as unknown as {
      subTxId: string;
      sender: string;
      chainNamespace: string;
      token: string;
      amount: bigint;
      recipient: string;
      payload: string;
    };
    if (!a.chainNamespace) return null;
    return {
      txHash: log.transactionHash,
      logIndex: Number.parseInt(log.logIndex, 16),
      sender: safeAddr(a.sender),
      chainNamespace: a.chainNamespace,
      token: safeAddr(a.token),
      amount: typeof a.amount === 'bigint' ? a.amount : BigInt(a.amount ?? 0),
      recipient: decodeRecipient(a.recipient),
      subTxId: a.subTxId ?? '',
      destSelector: a.payload && a.payload.length > 2 ? selOf(a.payload) : '',
    };
  } catch {
    return null;
  }
}

// ---- Rescue (revert) signal on Push ----
// When a cross-chain delivery fails, the gateway returns the bridged funds to the
// UEA on Push and emits `RescueFundsOnSourceChain`. Detecting it tells us a
// cross-chain action's funds came back — i.e. it did not complete at the
// destination. ABI copied verbatim from @pushchain/core (universalGatewayPC.evm).

const RESCUE_EVENT_ABI = [
  {
    type: 'event',
    name: 'RescueFundsOnSourceChain',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'universalTxId', type: 'bytes32' },
      { indexed: true, name: 'prc20', type: 'address' },
      { indexed: false, name: 'chainNamespace', type: 'string' },
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'txType', type: 'uint8' },
      { indexed: false, name: 'gasFee', type: 'uint256' },
      { indexed: false, name: 'gasPrice', type: 'uint256' },
      { indexed: false, name: 'gasLimit', type: 'uint256' },
    ],
  },
] as const;

export const RESCUE_EVENT_TOPIC0 = encodeEventTopics({
  abi: RESCUE_EVENT_ABI,
  eventName: 'RescueFundsOnSourceChain',
})[0] as string;

/** A decoded RescueFundsOnSourceChain: funds for a failed cross-chain tx that the
 * gateway returned to `sender` (the UEA) on Push. */
export interface RescueEvent {
  txHash: string;
  logIndex: number;
  block: number;
  sender: string;
  token: string;
  chainNamespace: string;
}

/** Decode a raw RescueFundsOnSourceChain log, or null if not one / malformed. */
export function decodeRescueEvent(log: RpcLog): RescueEvent | null {
  try {
    const d = decodeEventLog({
      abi: RESCUE_EVENT_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    const a = d.args as unknown as {
      sender: string;
      prc20: string;
      chainNamespace: string;
    };
    return {
      txHash: log.transactionHash,
      logIndex: Number.parseInt(log.logIndex, 16),
      block: Number.parseInt(log.blockNumber, 16),
      sender: safeAddr(a.sender),
      token: safeAddr(a.prc20),
      chainNamespace: a.chainNamespace ?? '',
    };
  } catch {
    return null;
  }
}
