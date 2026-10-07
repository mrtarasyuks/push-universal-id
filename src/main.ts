import {
  ORIGIN_CHAINS,
  findChain,
  findChainByCaip,
  chainLabelFromNamespace,
  destExplorerUrl,
  destBlockscout,
  REVERSE_ID,
  DONUT,
  donutAddressUrl,
  donutTxUrl,
} from './chains';
import { deriveUea, toCaip, isPushChain, resolveOrigin, verifyUeaOnchain, CHAIN } from './uea';
import {
  getAddressInfo,
  getCounters,
  getTransactions,
  getTokenTransfers,
  getTokenBalances,
  getLogs,
  getDestSettlementLogs,
  isNotFound,
  type Tx,
  type TokenTransfer,
  type TokenBalance,
  type PageParams,
} from './blockscout';
import {
  decodeUniversalAction,
  decodeOutboundEvent,
  decodeRescueEvent,
  classifyDelivery,
  pcUniversalTxId,
  selectorLabel,
  OUTBOUND_EVENT_TOPIC0,
  RESCUE_EVENT_TOPIC0,
  type UniversalAction,
  type InnerCall,
  type OutboundEvent,
  type RescueEvent,
} from './actions';
import { knownAddr, isInfra, tokenMeta, GATEWAY_PC_ADDRESS } from './known';
import { shortAddr, formatUnits, formatInt, sumGasWei, timeAgo, nowUtc, formatDuration } from './format';
import { getAddress } from 'viem';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const el = {
  form: $('#lookup-form') as HTMLFormElement,
  address: $('#address') as HTMLInputElement,
  chain: $('#chain') as HTMLSelectElement,
  examples: $('#examples'),
  result: $('#result'),
  status: $('#status'),
};

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

function buildChainOptions() {
  for (const c of ORIGIN_CHAINS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    el.chain.appendChild(opt);
  }
  const rev = document.createElement('option');
  rev.value = REVERSE_ID;
  rev.textContent = '↩︎ Це UEA на Push Chain (знайти origin)';
  el.chain.appendChild(rev);
}

function buildExamples() {
  el.examples.innerHTML = '';
  for (const c of ORIGIN_CHAINS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'example';
    b.innerHTML = `<span class="example-chain">${c.label}</span><span class="example-addr">${shortAddr(
      c.example,
      8,
      6
    )}</span>`;
    b.title = c.exampleNote;
    b.addEventListener('click', () => {
      el.address.value = c.example;
      el.chain.value = c.id;
      onChainChange();
      run();
    });
    el.examples.appendChild(b);
  }
  // A reverse-lookup example: the UEA we know maps back to the ETH Sepolia owner.
  const rb = document.createElement('button');
  rb.type = 'button';
  rb.className = 'example example-reverse';
  rb.innerHTML = `<span class="example-chain">↩︎ UEA → origin</span><span class="example-addr">${shortAddr(
    '0x99Ea0aC8f7F7CbBBaf7ca61644Eef591d290ca4B',
    8,
    6
  )}</span>`;
  rb.title = 'Вставити UEA на Push Chain і знайти його origin-гаманець';
  rb.addEventListener('click', () => {
    el.address.value = '0x99Ea0aC8f7F7CbBBaf7ca61644Eef591d290ca4B';
    el.chain.value = REVERSE_ID;
    onChainChange();
    run();
  });
  el.examples.appendChild(rb);
}

function onChainChange() {
  const reverse = el.chain.value === REVERSE_ID;
  el.address.placeholder = reverse
    ? 'UEA-адреса на Push Chain (0x…)'
    : '0x… або Solana-адреса';
}

function setStatus(msg: string, kind: 'info' | 'error' | 'muted' = 'info') {
  el.status.textContent = msg;
  el.status.className = `status status-${kind}`;
  el.status.hidden = !msg;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** A small "copy to clipboard" button carrying its payload in a data attribute;
 * a single delegated handler (wired after render) does the actual copy. */
function copyBtn(text: string, title = 'Скопіювати'): string {
  return `<button type="button" class="copy-btn" data-copy="${escapeHtml(text)}" title="${escapeHtml(
    title
  )}" aria-label="${escapeHtml(title)}">⧉</button>`;
}

function donutTokenUrl(address: string): string {
  return `${DONUT.explorer}/token/${address}`;
}

// Ukrainian plural: 1 → one, 2–4 → few, else many (ignoring the teens).
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// ---- URL state ----
function syncUrl(address: string, chainId: string) {
  const u = new URL(window.location.href);
  u.searchParams.set('address', address);
  u.searchParams.set('chain', chainId);
  history.replaceState(null, '', u.toString());
}

function readUrl(): { address: string | null; chain: string | null } {
  const u = new URL(window.location.href);
  return { address: u.searchParams.get('address'), chain: u.searchParams.get('chain') };
}

// ---- Lookup state (kept so "load more" can append pages and re-render) ----
interface NameInfo {
  name: string | null;
  isContract: boolean;
}

interface LookupState {
  uea: string;
  // Origin side of the mapping.
  originLabel: string;
  originAddress: string;
  caip: string;
  native: boolean; // origin already on Push Chain
  reverse: boolean;
  reverseNote: string | null; // message when a reverse lookup found no UEA
  // On-chain verification of the derived UEA against the factory's computeUEA.
  verify: 'off' | 'pending' | 'ok' | 'mismatch' | 'unavailable';
  // Activity.
  deployed: boolean;
  balanceWei: string | null;
  txCount: string;
  tokenXferCount: string;
  txs: Tx[];
  tokenTransfers: TokenTransfer[];
  holdings: TokenBalance[];
  txNext: PageParams;
  tokNext: PageParams;
  names: Map<string, NameInfo>;
  relayers: Set<string>;
  // Cross-chain outbound events (UniversalTxOutbound) per tx hash, giving the
  // exact destination chain; `outboundFetched` tracks which tx hashes we have
  // already looked up so pagination does not re-query them.
  outbound: Map<string, OutboundEvent[]>;
  outboundFetched: Set<string>;
  // RescueFundsOnSourceChain events for this UEA (funds returned to Push after a
  // failed cross-chain delivery), collected alongside the outbound events; used
  // to flag a cross-chain direction as "reverted / funds rescued".
  rescues: RescueEvent[];
  rescueKeys: Set<string>;
  // Destination-chain delivery confirmation, keyed by a cross-chain sub-tx's
  // subTxId. Present only when positively confirmed from the destination chain's
  // own Blockscout (its UniversalTxExecuted/Finalized → delivered, Reverted/Rescued
  // → bounced); absent means "not confirmed from the destination" (still in flight,
  // or that chain has no CORS-friendly Blockscout we can read). `deliveryChecked`
  // tracks subTxIds already queried so we never re-query one.
  delivery: Map<string, DeliveryStatus>;
  deliveryChecked: Set<string>;
  deliveryActive: boolean; // a background confirmation pass is running
  warnings: string[];
  loadingMore: boolean;
  // Background auto-pagination (so gas / top apps cover the whole history).
  autoLoading: boolean;
  autoPages: number;
  autoStopped: boolean; // user hit "stop" or the page cap was reached
}

/** A confirmed destination-chain outcome for one cross-chain sub-tx. */
interface DeliveryStatus {
  ok: boolean; // true = arrived (Executed/Finalized), false = bounced (Reverted/Rescued)
  destTxHash: string | null; // the settling tx hash on the destination chain, when given
  destTxUrl: string | null; // link to that tx on the destination chain's explorer
  chainLabel: string;
  // Bridge time: seconds between the Push-side outbound and the destination-chain
  // settlement, when both block timestamps are known. null otherwise.
  bridgeSeconds: number | null;
}

let state: LookupState | null = null;
let autoCancel = false;
// Real decimals per PRC-20 address, learned from Blockscout token-transfer data,
// so a bridged amount is formatted correctly (USDC/USDT are 6, pETH is 18).
let tokenDecimals = new Map<string, number>();

function decimalsOf(addr: string | null | undefined): number {
  if (!addr) return 18;
  return tokenDecimals.get(addr.toLowerCase()) ?? 18;
}

// A near-max uint256 (any value ≥ 2^255) is an "infinite" approval in practice;
// show it as ∞ rather than a 77-digit number.
function isUnlimited(n: bigint): boolean {
  return n >= 1n << 255n;
}

const PAGE_CAP = 12; // safety cap for auto / "load all", ~600 items

// ---- Core lookup ----
async function run() {
  const rawInput = el.address.value.trim();
  const reverse = el.chain.value === REVERSE_ID;
  if (!rawInput) {
    setStatus('Введіть адресу.', 'error');
    return;
  }
  syncUrl(rawInput, el.chain.value);
  el.result.innerHTML = '';

  let uea: string;
  let originLabel: string;
  let originAddress: string;
  let caip = '';
  let native = false;
  let reverseNote: string | null = null;
  let verifyChain: CHAIN | null = null;

  if (reverse) {
    // Reverse: the input IS a UEA on Push Chain; ask the factory for its origin.
    setStatus('Шукаю origin-гаманець цього UEA через фабрику Push…', 'info');
    try {
      uea = getAddress(rawInput as `0x${string}`);
    } catch {
      setStatus('Для зворотного пошуку введіть валідну EVM-адресу UEA на Push Chain (0x…).', 'error');
      return;
    }
    try {
      const origin = await resolveOrigin(uea);
      if (origin.isUEA) {
        const def = findChainByCaip(origin.namespace, origin.chainId);
        originLabel = def ? def.label : `${origin.namespace}:${origin.chainId}`;
        originAddress = origin.owner;
        caip = `${origin.namespace}:${origin.chainId}:${origin.owner}`;
      } else {
        originLabel = '—';
        originAddress = '—';
        reverseNote =
          'Фабрика Push не знає цієї адреси як UEA. Це або звичайний гаманець на Push Chain, або UEA, який ще не задеплоєний. Активність нижче — для самої введеної адреси.';
      }
    } catch (e) {
      setStatus(`Не вдалося зробити зворотний пошук: ${(e as Error).message}`, 'error');
      return;
    }
  } else {
    const chainDef = findChain(el.chain.value);
    if (!chainDef) {
      setStatus('Оберіть origin-чейн.', 'error');
      return;
    }
    setStatus('Обчислюю Universal Executor Account…', 'info');
    try {
      uea = deriveUea(chainDef.chain, rawInput);
      caip = toCaip(chainDef.chain, rawInput);
    } catch (e) {
      setStatus(
        `Не вдалося обчислити UEA: ${(e as Error).message} Перевірте, що адреса валідна для обраного чейна.`,
        'error'
      );
      return;
    }
    native = isPushChain(chainDef.chain);
    originLabel = native ? 'Push Chain (вже тут)' : chainDef.label;
    originAddress = rawInput;
    if (!native) verifyChain = chainDef.chain;
  }

  setStatus('Читаю активність UEA з Push Chain (Donut)…', 'info');

  const warnings: string[] = [];
  let balanceWei: string | null = null;
  let deployed = false;
  let txCount = '0';
  let tokenXferCount = '0';
  let txs: Tx[] = [];
  let tokenTransfers: TokenTransfer[] = [];
  let holdings: TokenBalance[] = [];
  let txNext: PageParams = null;
  let tokNext: PageParams = null;

  const [infoRes, countersRes, txRes, tokenRes, balRes] = await Promise.allSettled([
    getAddressInfo(uea),
    getCounters(uea),
    getTransactions(uea),
    getTokenTransfers(uea),
    getTokenBalances(uea),
  ]);

  if (infoRes.status === 'fulfilled') {
    balanceWei = infoRes.value.coin_balance;
    deployed = !!infoRes.value.is_contract;
  } else if (!isNotFound(infoRes.reason)) {
    warnings.push(`Баланс: ${(infoRes.reason as Error).message}`);
  }
  if (countersRes.status === 'fulfilled') {
    txCount = countersRes.value.transactions_count ?? '0';
    tokenXferCount = countersRes.value.token_transfers_count ?? '0';
  } else if (!isNotFound(countersRes.reason)) {
    warnings.push(`Лічильники: ${(countersRes.reason as Error).message}`);
  }
  if (txRes.status === 'fulfilled') {
    txs = txRes.value.items;
    txNext = txRes.value.next_page_params;
  } else if (!isNotFound(txRes.reason)) {
    warnings.push(`Транзакції: ${(txRes.reason as Error).message}`);
  }
  if (tokenRes.status === 'fulfilled') {
    tokenTransfers = tokenRes.value.items;
    tokNext = tokenRes.value.next_page_params;
  } else if (!isNotFound(tokenRes.reason)) {
    warnings.push(`Токен-трансфери: ${(tokenRes.reason as Error).message}`);
  }
  if (balRes.status === 'fulfilled') {
    holdings = balRes.value;
  } else if (!isNotFound(balRes.reason)) {
    warnings.push(`Баланси токенів: ${(balRes.reason as Error).message}`);
  }

  state = {
    uea,
    originLabel,
    originAddress,
    caip,
    native,
    reverse,
    reverseNote,
    verify: verifyChain ? 'pending' : 'off',
    deployed,
    balanceWei,
    txCount,
    tokenXferCount,
    txs,
    tokenTransfers,
    holdings,
    txNext,
    tokNext,
    names: new Map(),
    relayers: new Set(),
    outbound: new Map(),
    outboundFetched: new Set(),
    rescues: [],
    rescueKeys: new Set(),
    delivery: new Map(),
    deliveryChecked: new Set(),
    deliveryActive: false,
    warnings,
    loadingMore: false,
    autoLoading: false,
    autoPages: 0,
    autoStopped: false,
  };

  setStatus('', 'muted');
  await resolveNames();
  render();

  // Confirm the offchain-derived UEA against the factory's own computeUEA, in
  // the background — the chain validating our CREATE2 math for the reviewer.
  if (verifyChain) void verifyUea(verifyChain, originAddress, uea);

  // Resolve the exact destination chain of each cross-chain action from the
  // gateway's own UniversalTxOutbound events, in the background (the page first
  // shows the token-derived chain, then upgrades it to the authoritative one).
  void refreshOutbound();

  // Fetch the rest of the history in the background so gas and the top-apps
  // summary reflect the whole account, not just the first ~50 items.
  if (state.txNext || state.tokNext) void autoLoad();
}

/** Background on-chain verification of the derived UEA. */
async function verifyUea(chain: CHAIN, address: string, derived: string) {
  const target = state;
  if (!target) return;
  const factoryUea = await verifyUeaOnchain(chain, address);
  // A later lookup may have replaced state while we waited — ignore if so.
  if (state !== target) return;
  if (!factoryUea) target.verify = 'unavailable';
  else target.verify = factoryUea.toLowerCase() === derived.toLowerCase() ? 'ok' : 'mismatch';
  render();
}

// Collect the real targets (universal-action targets + token counterparties) and
// resolve their names from Blockscout so the UI can label apps, not just show
// hex. Capped, de-duplicated, and only for addresses we have not seen yet.
async function resolveNames() {
  if (!state) return;
  const ueaLc = state.uea.toLowerCase();
  const wanted = new Set<string>();

  for (const tx of state.txs) {
    const action = decodeUniversalAction(tx);
    if (action) {
      // The submitter of an executeUniversalTx is the relayer (infrastructure).
      if (tx.from?.hash && tx.to?.hash?.toLowerCase() === ueaLc) {
        state.relayers.add(getAddr(tx.from.hash));
      }
      for (const c of action.calls) {
        if (c.to && c.to.toLowerCase() !== ueaLc && c.to.toLowerCase() !== ZERO_ADDR) wanted.add(c.to);
      }
    }
  }
  for (const tt of state.tokenTransfers) {
    const other = tt.from?.hash?.toLowerCase() === ueaLc ? tt.to?.hash : tt.from?.hash;
    if (other && other.toLowerCase() !== ueaLc && other.toLowerCase() !== ZERO_ADDR) wanted.add(getAddr(other));
  }

  // Skip addresses we already have an authoritative SDK label for — no need to
  // ask the explorer for those.
  const toFetch = [...wanted]
    .filter((a) => !state!.names.has(a.toLowerCase()) && !knownAddr(a))
    .slice(0, 60);
  const results = await Promise.allSettled(toFetch.map((a) => getAddressInfo(a)));
  results.forEach((r, i) => {
    const addr = toFetch[i].toLowerCase();
    if (r.status === 'fulfilled') {
      const name = r.value.name || r.value.implementations?.[0]?.name || null;
      state!.names.set(addr, { name, isContract: !!r.value.is_contract });
    } else {
      state!.names.set(addr, { name: null, isContract: false });
    }
  });
}

function getAddr(a: string): string {
  try {
    return getAddress(a as `0x${string}`);
  } catch {
    return a;
  }
}

function nameOf(addr: string): NameInfo {
  // Authoritative SDK label wins over whatever the explorer happens to show.
  const k = knownAddr(addr);
  if (k) return { name: k.name, isContract: true };
  return state?.names.get(addr.toLowerCase()) ?? { name: null, isContract: false };
}

// ---- Exact cross-chain destination from gateway events ----
// Block window per eth_getLogs query (the proxy handles ~100k blocks / up to its
// result cap; we stay well under) and a cap on windows so a UEA whose history
// spans a very wide range cannot fan out into unbounded calls.
const OUTBOUND_WINDOW = 40000;
const OUTBOUND_WINDOW_CAP = 20;
const toHexBlock = (n: number) => `0x${n.toString(16)}`;

// Serialize resolution: concurrent callers (initial lookup + background
// pagination) queue behind one another, and each pass only fetches tx hashes not
// already covered (outboundFetched), so nothing is queried twice.
let outboundQueue: Promise<void> = Promise.resolve();

function resolveOutboundChains(): Promise<void> {
  outboundQueue = outboundQueue.then(doResolveOutbound).catch(() => {});
  return outboundQueue;
}

/** Re-render after resolving (used for the background initial pass), then confirm
 * each cross-chain delivery on its destination chain. */
async function refreshOutbound(): Promise<void> {
  await resolveOutboundChains();
  render();
  void runDeliveries();
}

async function doResolveOutbound(): Promise<void> {
  const m = state;
  if (!m) return;
  const ueaLc = m.uea.toLowerCase();

  // Which loaded txs carry a cross-chain action and have not been looked up yet?
  const pending: { hash: string; block: number }[] = [];
  for (const tx of m.txs) {
    const hl = tx.hash.toLowerCase();
    if (m.outboundFetched.has(hl)) continue;
    const a = decodeUniversalAction(tx);
    const hasXc = a?.calls.some((c) => c.crossChain) ?? false;
    if (hasXc && tx.block_number != null) {
      pending.push({ hash: hl, block: tx.block_number });
    } else {
      // Not cross-chain (or no block height) — mark done so we never rescan it.
      m.outboundFetched.add(hl);
    }
  }
  if (!pending.length) return;

  const minB = Math.min(...pending.map((p) => p.block));
  const maxB = Math.max(...pending.map((p) => p.block));
  const wanted = new Set(pending.map((p) => p.hash));

  // Fetch the gateway's outbound events over the span the cross-chain txs cover,
  // in bounded windows, and filter to this UEA client-side (the node ignores
  // positional topic filters). Match each event back to its tx by hash.
  let from = minB;
  let windows = 0;
  while (from <= maxB && windows < OUTBOUND_WINDOW_CAP) {
    const to = Math.min(from + OUTBOUND_WINDOW, maxB);
    // Outbound (destination chain / method) and rescue (revert) events share the
    // gateway and block range, so fetch both over the same window.
    const [logs, rescueLogs] = await Promise.all([
      getLogs({
        address: GATEWAY_PC_ADDRESS,
        topic0: OUTBOUND_EVENT_TOPIC0,
        fromBlock: toHexBlock(from),
        toBlock: toHexBlock(to),
      }),
      getLogs({
        address: GATEWAY_PC_ADDRESS,
        topic0: RESCUE_EVENT_TOPIC0,
        fromBlock: toHexBlock(from),
        toBlock: toHexBlock(to),
      }),
    ]);
    if (state !== m) return; // a newer lookup replaced us — drop stale work
    for (const lg of logs) {
      const ev = decodeOutboundEvent(lg);
      if (!ev || ev.sender.toLowerCase() !== ueaLc) continue;
      const hl = ev.txHash.toLowerCase();
      if (!wanted.has(hl)) continue;
      const arr = m.outbound.get(hl) ?? [];
      if (!arr.some((e) => e.logIndex === ev.logIndex)) {
        arr.push(ev);
        arr.sort((a, b) => a.logIndex - b.logIndex);
        m.outbound.set(hl, arr);
      }
    }
    for (const lg of rescueLogs) {
      const rv = decodeRescueEvent(lg);
      if (!rv || rv.sender.toLowerCase() !== ueaLc) continue;
      const key = `${rv.txHash.toLowerCase()}:${rv.logIndex}`;
      if (m.rescueKeys.has(key)) continue;
      m.rescueKeys.add(key);
      m.rescues.push(rv);
    }
    from = to + 1;
    windows += 1;
  }

  // Mark every pending tx as looked up (even those with no event found, e.g. a
  // reverted outbound) so pagination does not re-query them.
  for (const p of pending) m.outboundFetched.add(p.hash);
}

// ---- Destination-chain delivery confirmation ----
// The Push side proves only that an outbound was *sent*. The authoritative "it
// arrived" is on the destination chain: its UniversalGateway/Vault emit
// UniversalTxExecuted / UniversalTxFinalized (arrived) or UniversalTxReverted /
// FundsRescued (bounced), each carrying the SAME subTxId as our Push-side
// outbound event. We confirm a sub-tx by reading the destination chain's own
// Blockscout (`/addresses/{contract}/logs?topic=<subTxId>`) rather than its raw
// public RPC: Blockscout is CORS-friendly and does not cap the log range the way
// the raw RPCs do, so "✓ доставлено" actually shows up. Best-effort — a chain with
// no CORS-friendly Blockscout stays "not confirmed" and keeps the Push-side signal.
const DELIVERY_CAP = 24; // bound the external calls a single lookup makes
const ZERO_BYTES32 = '0x' + '0'.repeat(64);

let deliveryQueue: Promise<void> = Promise.resolve();

function runDeliveries(): Promise<void> {
  deliveryQueue = deliveryQueue
    .then(async () => {
      const m = state;
      if (!m) return;
      m.deliveryActive = true;
      render();
      try {
        await confirmDeliveries();
      } finally {
        if (state === m) {
          m.deliveryActive = false;
          render();
        }
      }
    })
    .catch(() => {});
  return deliveryQueue;
}

async function confirmDeliveries(): Promise<void> {
  const m = state;
  if (!m) return;

  // Push-side send time per tx hash, so we can measure the bridge delay.
  const pushTs = new Map<string, string>();
  for (const tx of m.txs) {
    if (tx.timestamp) pushTs.set(tx.hash.toLowerCase(), tx.timestamp);
  }

  // Distinct, not-yet-checked cross-chain sub-txs, with the destination chain the
  // gateway event named and the Push-side send time. An outbound event only exists
  // for a successful send, so its presence already means "sent" — we need only its
  // destination fate.
  const targets: { subTxId: string; caip: string; sentIso: string | null }[] = [];
  for (const arr of m.outbound.values()) {
    for (const ev of arr) {
      const sid = ev.subTxId?.toLowerCase();
      if (!sid || sid === ZERO_BYTES32) continue;
      if (m.deliveryChecked.has(sid) || m.delivery.has(sid)) continue;
      if (targets.some((t) => t.subTxId === sid)) continue;
      targets.push({ subTxId: sid, caip: ev.chainNamespace, sentIso: pushTs.get(ev.txHash.toLowerCase()) ?? null });
    }
  }
  if (!targets.length) return;

  for (const t of targets.slice(0, DELIVERY_CAP)) {
    if (state !== m) return; // a newer lookup replaced us
    const dst = destBlockscout(t.caip);
    m.deliveryChecked.add(t.subTxId); // do not re-query, success or not
    if (!dst) continue; // no CORS-friendly Blockscout for this chain — keep Push signal

    // Read the destination Blockscout for a settlement log carrying this subTxId
    // (an indexed topic). Blockscout decodes the event itself, so we classify by
    // its name rather than a hardcoded topic0. Query each settling contract (vault,
    // then gateway) until one returns a classifiable log.
    let chosen: { ok: boolean; txHash: string | null; iso: string | null } | null = null;
    for (const contract of dst.contracts) {
      if (state !== m) return;
      const logs = await getDestSettlementLogs(dst.base, contract, t.subTxId);
      if (logs === null) continue; // could not query this contract
      for (const lg of logs) {
        const cls = classifyDelivery(lg.eventName);
        if (!cls) continue;
        // A success (Executed/Finalized) is the terminal truth; prefer it.
        if (!chosen || (cls === 'ok' && !chosen.ok)) {
          chosen = { ok: cls === 'ok', txHash: lg.txHash, iso: lg.timestamp };
        }
      }
      if (chosen?.ok) break; // confirmed arrived — no need to check the other contract
    }
    if (chosen) {
      let bridgeSeconds: number | null = null;
      if (t.sentIso && chosen.iso) {
        const sent = new Date(t.sentIso).getTime();
        const settled = new Date(chosen.iso).getTime();
        if (!Number.isNaN(sent) && !Number.isNaN(settled) && settled >= sent) {
          bridgeSeconds = (settled - sent) / 1000;
        }
      }
      m.delivery.set(t.subTxId, {
        ok: chosen.ok,
        destTxHash: chosen.txHash,
        destTxUrl: chosen.txHash ? dst.txUrl(chosen.txHash) : null,
        chainLabel: dst.label,
        bridgeSeconds,
      });
    }
  }
}

/** Stamp each cross-chain inner call with its exact destination chain, the exact
 * CAIP namespace, the destination method (selector + decoded args) and the
 * outbound `subTxId` — all from the gateway's own UniversalTxOutbound event —
 * plus a "rescued" flag. Within a tx, events are matched to calls by token first,
 * then in log order, so several bridges in one tx map correctly.
 *
 * Rescue binding is by shared id, not by direction: the action's own universalTxId
 * is sha256("<pushCaip>:<pushTxHash>") (the chain's GetPcUniversalTxKey), and the
 * gateway's RescueFundsOnSourceChain indexes that exact universalTxId — so the
 * "повернуто" flag lands on the specific action that bounced, together with a
 * token+chain check, instead of smearing across every action to that chain. */
function attachExactChains(actions: UniversalAction[]): void {
  if (!state) return;
  for (const a of actions) {
    const events = state.outbound.get(a.txHash.toLowerCase());
    if (events && events.length) {
      const used = new Array<boolean>(events.length).fill(false);
      for (const c of a.calls) {
        if (!c.crossChain) continue;
        const tok = c.crossChain.token.toLowerCase();
        let idx = events.findIndex((e, i) => !used[i] && e.token.toLowerCase() === tok);
        if (idx < 0) idx = used.findIndex((u) => !u);
        if (idx < 0) break;
        used[idx] = true;
        const ev = events[idx];
        c.crossChain.exactChain = chainLabelFromNamespace(ev.chainNamespace);
        c.crossChain.exactNamespace = ev.chainNamespace;
        c.crossChain.subTxId = ev.subTxId;
        // The event's payload decode is authoritative; prefer it over the one
        // decoded from calldata (identical bytes, but this ties to the ✓ chain).
        if (ev.destCall) c.crossChain.destCall = ev.destCall;
      }
    }
    // Bind rescue to this exact action by its universalTxId (deterministic from
    // the action's own tx hash), narrowed further by token + destination chain.
    if (state.rescues.length) {
      const uid = pcUniversalTxId(a.txHash).toLowerCase();
      const matched = state.rescues.filter((r) => r.universalTxId === uid);
      if (matched.length) {
        for (const c of a.calls) {
          if (!c.crossChain) continue;
          const tok = c.crossChain.token.toLowerCase();
          const label = c.crossChain.exactChain ?? c.crossChain.chain ?? null;
          c.crossChain.rescued = matched.some(
            (r) =>
              r.token.toLowerCase() === tok &&
              (!label || chainLabelFromNamespace(r.chainNamespace) === label)
          );
        }
      }
    }
  }
}

// ---- Pagination ----
/** Fetch the next page of txs and token-transfers (whichever still has one). */
async function fetchNextPage(): Promise<void> {
  if (!state) return;
  const jobs: Promise<void>[] = [];
  if (state.txNext) {
    const p = state.txNext;
    jobs.push(
      getTransactions(state.uea, p).then((r) => {
        state!.txs.push(...r.items);
        state!.txNext = r.next_page_params;
      })
    );
  }
  if (state.tokNext) {
    const p = state.tokNext;
    jobs.push(
      getTokenTransfers(state.uea, p).then((r) => {
        state!.tokenTransfers.push(...r.items);
        state!.tokNext = r.next_page_params;
      })
    );
  }
  await Promise.allSettled(jobs);
}

/** Background loader: pulls the rest of the history page by page, re-rendering
 * after each so the metrics, gas and top-apps summary update live. Stops at the
 * page cap or when the user hits "stop". */
async function autoLoad() {
  if (!state || state.loadingMore) return;
  autoCancel = false;
  state.autoPages = 0;
  state.loadingMore = true;
  state.autoLoading = true;
  render();
  try {
    while ((state.txNext || state.tokNext) && state.autoPages < PAGE_CAP && !autoCancel) {
      await fetchNextPage();
      state.autoPages += 1;
      await resolveNames();
      await resolveOutboundChains();
      render();
      void runDeliveries();
    }
  } finally {
    const capped = !!(state.txNext || state.tokNext);
    state.autoStopped = capped; // more remains only if we stopped early / hit cap
    state.loadingMore = false;
    state.autoLoading = false;
    render();
  }
}

/** Manual single-page "load more" (used after auto stopped at the cap). */
async function loadMore() {
  if (!state || state.loadingMore) return;
  state.loadingMore = true;
  render();
  try {
    await fetchNextPage();
    await resolveNames();
    await resolveOutboundChains();
  } finally {
    state.loadingMore = false;
    render();
    void runDeliveries();
  }
}

// ---- Render ----
function render() {
  if (!state) return;
  const m = state;
  const ueaLc = m.uea.toLowerCase();

  // Universal actions decoded from executeUniversalTx — the heart of the tool.
  const actions: UniversalAction[] = [];
  for (const tx of m.txs) {
    const a = decodeUniversalAction(tx);
    if (a) actions.push(a);
  }
  // Upgrade each cross-chain action's destination from the token-derived guess to
  // the exact chain carried by the gateway's UniversalTxOutbound event, when we
  // have fetched it.
  attachExactChains(actions);

  // Learn each PRC-20's real decimals from token-transfer rows (Blockscout).
  for (const tt of m.tokenTransfers) {
    const addr = tt.token?.address?.toLowerCase();
    const dec = tt.token?.decimals ?? tt.total?.decimals;
    if (addr && dec != null && /^\d+$/.test(String(dec))) tokenDecimals.set(addr, Number(dec));
  }

  // Apps the wallet actually used = targets of universal actions + token
  // counterparties, grouped and summed. A cross-chain (gateway) action is
  // grouped by its destination chain, not by the gateway precompile, so the
  // summary shows "where the wallet bridged to", not the plumbing. Protocol
  // infrastructure (precompiles, relayer) is left out — it is not an app.
  interface App {
    key: string;
    label: string;
    addr: string | null; // explorer link target; null for a cross-chain group
    chain: string | null; // cross-chain destination chain
    crossChain: boolean;
    actions: number;
    tokens: number;
    pcWei: bigint;
    bridged: Map<string, { symbol: string; amount: bigint }>; // token addr → bridged
    rescued: number; // cross-chain actions in this direction that were rescued back
  }
  const apps = new Map<string, App>();
  const ensure = (key: string, seed: Partial<App>): App => {
    let a = apps.get(key);
    if (!a) {
      a = {
        key,
        label: seed.label ?? key,
        addr: seed.addr ?? null,
        chain: seed.chain ?? null,
        crossChain: !!seed.crossChain,
        actions: 0,
        tokens: 0,
        pcWei: 0n,
        bridged: new Map(),
        rescued: 0,
      };
      apps.set(key, a);
    }
    return a;
  };

  for (const a of actions) {
    for (const c of a.calls) {
      if (c.crossChain) {
        // Group by destination chain (the real "where did it go") — the exact
        // chain from the gateway event when known, else the token-derived guess.
        const chain = c.crossChain.exactChain ?? c.crossChain.chain ?? 'інший чейн';
        const app = ensure(`xc:${chain}`, {
          label: `→ ${chain}`,
          chain,
          crossChain: true,
        });
        app.actions += 1;
        app.pcWei += c.value;
        if (c.crossChain.rescued) app.rescued += 1;
        if (c.crossChain.amount > 0n) {
          const key = c.crossChain.token.toLowerCase();
          const sym = c.crossChain.tokenSymbol ?? 'токен';
          const prev = app.bridged.get(key) ?? { symbol: sym, amount: 0n };
          prev.amount += c.crossChain.amount;
          app.bridged.set(key, prev);
        }
        continue;
      }
      const lc = c.to.toLowerCase();
      if (lc === ueaLc || lc === ZERO_ADDR || isInfra(c.to) || m.relayers.has(getAddr(c.to))) continue;
      const app = ensure(lc, { addr: getAddr(c.to) });
      app.actions += 1;
      app.pcWei += c.value;
    }
  }
  for (const tt of m.tokenTransfers) {
    const other = tt.from?.hash?.toLowerCase() === ueaLc ? tt.to?.hash : tt.from?.hash;
    if (!other) continue;
    const lc = other.toLowerCase();
    if (lc === ueaLc || lc === ZERO_ADDR || isInfra(other) || m.relayers.has(getAddr(other))) continue;
    ensure(lc, { addr: getAddr(other) }).tokens += 1;
  }
  const appList = [...apps.values()].sort(
    (a, b) => b.actions + b.tokens - (a.actions + a.tokens)
  );

  const tokenSet = new Set(
    m.tokenTransfers.map((tt) => tt.token?.address?.toLowerCase()).filter(Boolean) as string[]
  );

  // Gas the UEA itself paid (relayer-funded UEAs show 0 — we surface it honestly).
  const outgoing = m.txs.filter((t) => t.from?.hash?.toLowerCase() === ueaLc);
  const gasWei = sumGasWei(
    outgoing.map((t) => ({ gasUsed: t.gas_used, gasPrice: t.gas_price, fee: t.fee?.value }))
  );

  const statusBadge = m.deployed
    ? `<span class="badge badge-ok">UEA задеплоєний</span>`
    : `<span class="badge badge-pending">UEA ще не задеплоєний</span>`;

  const balance = formatUnits(m.balanceWei, DONUT.nativeDecimals, 4);

  // ---- mapping ----
  const originNodeInner = m.reverse && m.reverseNote
    ? `<div class="map-addr map-muted">невідомо</div>
       <div class="map-caip">фабрика не має origin для цього UEA</div>`
    : `<div class="map-addr-row">
         <div class="map-addr" title="${escapeHtml(m.originAddress)}">${escapeHtml(
        shortAddr(m.originAddress, 10, 8)
      )}</div>
         ${copyBtn(m.originAddress, 'Скопіювати origin-адресу')}
       </div>
       <div class="map-caip">${escapeHtml(m.caip)}</div>`;

  const mapping = `
    <div class="mapping">
      <div class="map-node">
        <div class="map-label">Origin${m.reverse ? ' (знайдено за UEA)' : ` (${escapeHtml(m.originLabel)})`}</div>
        ${originNodeInner}
      </div>
      <div class="map-arrow">${m.reverse ? '← UEA ←' : '→ UEA →'}</div>
      <div class="map-node map-node-uea">
        <div class="map-label">Universal Executor Account · Push Chain Donut</div>
        <div class="map-addr-row">
          <a class="map-addr" href="${donutAddressUrl(m.uea)}" target="_blank" rel="noopener" title="${escapeHtml(
    m.uea
  )}">${escapeHtml(shortAddr(m.uea, 12, 10))} ↗</a>
          ${copyBtn(m.uea, 'Скопіювати адресу UEA')}
        </div>
      </div>
    </div>`;

  // On-chain verification of the derived UEA (forward lookups only).
  const verifyHtml =
    m.verify === 'ok'
      ? `<p class="hint verify-ok">✓ Адресу UEA підтверджено <strong>на самій фабриці Push</strong> (<code>computeUEA</code>, read-only) — не лише обчислено офчейн.</p>`
      : m.verify === 'pending'
      ? `<p class="hint">Перевіряю адресу на фабриці Push on-chain…</p>`
      : m.verify === 'mismatch'
      ? `<p class="hint hint-warn">⚠ Офчейн-обчислення (CREATE2) не збіглося з <code>computeUEA</code> фабрики. Показую офчейн-результат — звірте вручну в експлорері.</p>`
      : m.verify === 'unavailable'
      ? `<p class="hint">Фабрика зараз недоступна для on-chain перевірки — адресу обчислено офчейн (CREATE2, ідентично SDK).</p>`
      : '';

  const reverseNoteHtml = m.reverseNote
    ? `<p class="hint hint-warn">${escapeHtml(m.reverseNote)}</p>`
    : '';

  const sdkNote =
    m.deployed || m.reverse
      ? ''
      : `<p class="hint">Акаунт розгортається «ліниво» — при першій Universal-транзакції з гаманця-власника. Адреса вже зарезервована детерміновано (CREATE2), тож вона не зміниться.</p>`;

  const metrics = `
    <div class="metrics">
      <div class="metric">
        <div class="metric-value">${escapeHtml(balance)} <span class="unit">PC</span></div>
        <div class="metric-label">Баланс UEA</div>
      </div>
      <div class="metric">
        <div class="metric-value">${formatInt(m.txCount)}</div>
        <div class="metric-label">Транзакцій усього</div>
      </div>
      <div class="metric">
        <div class="metric-value">${formatInt(m.tokenXferCount)}</div>
        <div class="metric-label">Токен-трансферів</div>
      </div>
      <div class="metric">
        <div class="metric-value">${appList.length}</div>
        <div class="metric-label">Застосунків${m.autoLoading ? ' (рахую…)' : ''}</div>
      </div>
    </div>`;

  // ---- universal actions ----
  const actionsHtml = actions.length
    ? `<section class="block">
        <h3>Універсальні дії <span class="count-badge">${actions.length}</span></h3>
        <p class="hint">Декодовано з <code>executeUniversalTx</code> — справжній цільовий застосунок кожної дії, а не релеєр. Крос-чейн дії через шлюз показують чейн, метод і аргументи виклику на призначенні, статус доставки та пряме посилання на експлорер чейна-призначення («кінець мосту»). Доставку <strong>підтверджуємо на самому чейні призначення</strong> (через його Blockscout API): подія <code>UniversalTxExecuted/Finalized</code> з тим самим <code>subTxId</code> = ✓ доставлено, з часом мосту.${
          m.deliveryActive ? ' <span class="muted">Перевіряю доставку на чейнах призначення…</span>' : ''
        }</p>
        <div class="tx-list">
          ${actions
            .slice(0, 50)
            .map((a) => renderAction(a))
            .join('')}
        </div>
      </section>`
    : '';

  // ---- top apps summary (grouped, with per-app totals) ----
  const appsHtml = appList.length
    ? `<section class="block">
        <h3>Топ-застосунки UEA <span class="count-badge">${appList.length}</span></h3>
        <p class="hint">Згруповано за застосунком: скільки дій і скільки PC припало на кожен. Крос-чейн дії зведені за точним чейном призначення (з події шлюзу UniversalTxOutbound).</p>
        <ul class="apps">
          ${appList
            .slice(0, 30)
            .map((p) => {
              const nums: string[] = [];
              if (p.actions) nums.push(`${p.actions} ${plural(p.actions, 'дія', 'дії', 'дій')}`);
              if (p.tokens) nums.push(`${p.tokens} ${plural(p.tokens, 'токен', 'токени', 'токенів')}`);
              if (p.pcWei > 0n) nums.push(`${formatUnits(p.pcWei.toString(), DONUT.nativeDecimals, 4)} PC`);
              if (p.crossChain) {
                const bridged = [...p.bridged.entries()]
                  .map(
                    ([addr, b]) =>
                      `${formatUnits(b.amount.toString(), decimalsOf(addr), 4)} ${escapeHtml(b.symbol)}`
                  )
                  .join(', ');
                const rescuedNote = p.rescued
                  ? `<span class="st st-rescued" title="Для цього напрямку шлюз повернув кошти на Push (RescueFundsOnSourceChain) — доставка не завершилась. Збіг за напрямком.">↩ ${p.rescued} ${plural(
                      p.rescued,
                      'повернення',
                      'повернення',
                      'повернень'
                    )}</span>`
                  : '';
                return `<li class="app app-xc">
                  <span class="app-name"><span class="xc-badge">крос-чейн</span> ${escapeHtml(p.label)} ${rescuedNote}</span>
                  <span class="app-nums">${nums.join(' · ')}${
                  bridged ? ` · міст: ${bridged}` : ''
                }</span>
                </li>`;
              }
              const info = nameOf(p.addr!);
              const label = info.name || shortAddr(p.addr!, 10, 8);
              return `<li class="app">
                <span class="app-name">
                  <a href="${donutAddressUrl(p.addr!)}" target="_blank" rel="noopener">${escapeHtml(
                    label
                  )} ↗</a>
                  ${info.isContract ? '<span class="tag">контракт</span>' : ''}
                </span>
                <span class="app-nums">${nums.join(' · ')}</span>
              </li>`;
            })
            .join('')}
        </ul>
      </section>`
    : '';

  // ---- relayer note ----
  const relayerHtml = m.relayers.size
    ? `<p class="hint">Транзакції подавав ${
        m.relayers.size === 1 ? 'релеєр' : 'релеєри'
      } (інфраструктура Push, не застосунок): ${[...m.relayers]
        .map(
          (r) =>
            `<a href="${donutAddressUrl(r)}" target="_blank" rel="noopener">${escapeHtml(
              shortAddr(r, 6, 4)
            )}</a>`
        )
        .join(', ')} — вони ж сплачують газ за UEA.</p>`
    : '';

  // ---- tokens ----
  const tokenHtml = m.tokenTransfers.length
    ? `<section class="block">
        <h3>Токени, що проходили через UEA</h3>
        <div class="tx-list">
          ${m.tokenTransfers
            .slice(0, 30)
            .map((tt) => {
              const out = tt.from?.hash?.toLowerCase() === ueaLc;
              const counter = out ? tt.to?.hash : tt.from?.hash;
              const sym = tt.token?.symbol || tt.token?.name || 'токен';
              const dec = tt.total?.decimals ? Number(tt.total.decimals) : 18;
              const amount = tt.total?.value ? formatUnits(tt.total.value, dec, 4) : '—';
              const hash = tt.tx_hash || tt.transaction_hash || '';
              const row = `<span class="tx-dir ${out ? 'out' : 'in'}">${out ? 'OUT' : 'IN'}</span>
                <span class="tx-method">${escapeHtml(tt.method || 'transfer')}</span>
                <span class="tx-counter">${counter ? escapeHtml(shortAddr(counter, 6, 4)) : '—'}</span>
                <span class="tx-val">${escapeHtml(amount)} ${escapeHtml(sym)}</span>
                <span class="tx-time">${timeAgo(tt.timestamp)}</span>`;
              return hash
                ? `<a class="tx" href="${donutTxUrl(hash)}" target="_blank" rel="noopener">${row}</a>`
                : `<div class="tx">${row}</div>`;
            })
            .join('')}
        </div>
        <p class="hint">${tokenSet.size} ${
        tokenSet.size === 1 ? 'унікальний токен' : 'унікальних токенів'
      } · показано до 30 трансферів із завантажених.</p>
      </section>`
    : '';

  const gasHtml =
    gasWei !== '0'
      ? `<p class="hint">Газ, сплачений власними транзакціями UEA: ${formatUnits(
          gasWei,
          DONUT.nativeDecimals,
          6
        )} PC (за ${outgoing.length} вихідних tx).</p>`
      : '';

  // ---- current token holdings (portfolio the UEA holds right now) ----
  // Learn decimals from here too, so amounts elsewhere format correctly.
  for (const h of m.holdings) {
    const addr = h.token?.address?.toLowerCase();
    const dec = h.token?.decimals;
    if (addr && dec != null && /^\d+$/.test(String(dec))) tokenDecimals.set(addr, Number(dec));
  }
  const heldTokens = m.holdings
    .filter((h) => h.value && /^\d+$/.test(h.value) && h.value !== '0' && h.token?.address)
    .map((h) => {
      const addr = h.token!.address;
      const meta = tokenMeta(addr) ?? (knownAddr(addr)?.chain ? { symbol: '', chain: knownAddr(addr)!.chain! } : null);
      const isNft = h.token?.type === 'ERC-721' || h.token?.type === 'ERC-1155';
      const dec = isNft ? 0 : h.token?.decimals && /^\d+$/.test(h.token.decimals) ? Number(h.token.decimals) : 18;
      return {
        addr,
        symbol: h.token?.symbol || h.token?.name || (isNft ? 'NFT' : 'токен'),
        chain: meta?.chain ?? null,
        value: BigInt(h.value!),
        amount: formatUnits(h.value!, dec, 4),
        isNft,
      };
    })
    .sort((a, b) => {
      // Synthetic / known-chain tokens first; then by raw value descending.
      if (!!a.chain !== !!b.chain) return a.chain ? -1 : 1;
      return a.value > b.value ? -1 : a.value < b.value ? 1 : 0;
    });

  const holdingsHtml = heldTokens.length
    ? `<section class="block">
        <h3>Токени на балансі UEA <span class="count-badge">${heldTokens.length}</span></h3>
        <p class="hint">Що UEA тримає на Push Chain зараз (поточні баланси з Blockscout). Для бриджених активів показано, який зовнішній чейн вони представляють.</p>
        <ul class="apps">
          ${heldTokens
            .slice(0, 30)
            .map(
              (t) => `<li class="app">
                <span class="app-name">
                  <a href="${donutTokenUrl(t.addr)}" target="_blank" rel="noopener">${escapeHtml(
                t.symbol
              )} ↗</a>
                  ${t.chain ? `<span class="tag">${escapeHtml(t.chain)}</span>` : ''}
                  ${t.isNft ? '<span class="tag">NFT</span>' : ''}
                </span>
                <span class="app-nums">${escapeHtml(t.amount)}${t.isNft ? ' шт' : ` ${escapeHtml(t.symbol)}`}</span>
              </li>`
            )
            .join('')}
        </ul>
      </section>`
    : '';

  // ---- raw tx list ----
  const hasActivity =
    m.txs.length > 0 ||
    m.tokenTransfers.length > 0 ||
    (m.txCount !== '0' && m.txCount !== '') ||
    (m.balanceWei != null && m.balanceWei !== '0');

  const txHtml = m.txs.length
    ? `<section class="block">
        <h3>Транзакції UEA</h3>
        <div class="tx-list">
          ${m.txs
            .slice(0, 40)
            .map((t) => {
              const out = t.from?.hash?.toLowerCase() === ueaLc;
              const counter = out ? t.to?.hash : t.from?.hash;
              return `<a class="tx" href="${donutTxUrl(t.hash)}" target="_blank" rel="noopener">
                <span class="tx-dir ${out ? 'out' : 'in'}">${out ? 'OUT' : 'IN'}</span>
                <span class="tx-method">${escapeHtml(t.method || 'transfer')}</span>
                <span class="tx-counter">${counter ? escapeHtml(shortAddr(counter, 6, 4)) : '—'}</span>
                <span class="tx-val">${formatUnits(t.value, DONUT.nativeDecimals, 4)} PC</span>
                <span class="tx-time">${timeAgo(t.timestamp)}</span>
              </a>`;
            })
            .join('')}
        </div>
      </section>`
    : hasActivity
    ? ''
    : `<section class="block empty">
        <h3>Поки немає активності на Donut</h3>
        <p>Blockscout не бачить транзакцій цього UEA. Для зовнішнього гаманця це нормально: UEA
        з'явиться при першій Universal-транзакції. Адреса вже обчислена й зарезервована.</p>
      </section>`;

  // ---- pagination: background progress + manual fallback ----
  const hasMore = !!(m.txNext || m.tokNext);
  const loaded = `${m.txs.length} ${plural(m.txs.length, 'транзакція', 'транзакції', 'транзакцій')} і ${
    m.tokenTransfers.length
  } ${plural(m.tokenTransfers.length, 'токен-трансфер', 'токен-трансфери', 'токен-трансферів')}`;
  let loadMoreHtml = '';
  if (m.autoLoading) {
    // Indeterminate progress while we pull the rest of the history in the back.
    loadMoreHtml = `<div class="loadmore">
      <div class="progress"><div class="progress-bar"></div></div>
      <p class="hint">Фоново завантажую всю історію… сторінка ${m.autoPages + 1}, уже ${loaded}. Газ і топ-застосунки оновлюються наживо.
        <button type="button" class="load-btn ghost" id="load-stop">Зупинити</button>
      </p>
    </div>`;
  } else if (m.loadingMore) {
    loadMoreHtml = `<div class="loadmore"><button type="button" class="load-btn" disabled>Завантажую…</button></div>`;
  } else if (hasActivity && hasMore) {
    // Auto-load stopped at the page cap but more remains.
    loadMoreHtml = `<div class="loadmore">
      <p class="hint">Показано перші ${loaded}${
      m.autoStopped ? ` (ліміт автозавантаження — ${PAGE_CAP} сторінок)` : ''
    }. Є ще — підвантажити?</p>
      <button type="button" class="load-btn" id="load-more">Завантажити ще сторінку</button>
      <button type="button" class="load-btn secondary" id="load-all">Завантажити все, що лишилось</button>
    </div>`;
  } else if (hasActivity) {
    loadMoreHtml = `<p class="hint">Пораховано за всю історію: ${loaded} (усе, що є в експлорера).</p>`;
  }

  const warningsHtml = m.warnings.length
    ? `<section class="block warn">
        <h3>Частина даних недоступна</h3>
        <ul>${m.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      </section>`
    : '';

  el.result.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>Push Universal ID</h2>
        <div class="card-head-right">
          <button type="button" class="copy-btn copy-link" data-copy="${escapeHtml(
            window.location.href
          )}" title="Скопіювати посилання на цей результат">🔗 Посилання</button>
          ${statusBadge}
        </div>
      </div>
      ${mapping}
      ${verifyHtml}
      ${reverseNoteHtml}
      ${sdkNote}
      ${metrics}
      ${relayerHtml}
      ${gasHtml}
      ${holdingsHtml}
      ${actionsHtml}
      ${appsHtml}
      ${tokenHtml}
      ${txHtml}
      ${loadMoreHtml}
      ${warningsHtml}
      <p class="source">Origin↔UEA — фабрика Push (${escapeHtml(
        DONUT.explorer
      )}) та offchain CREATE2 (@pushchain/core) · активність і декодування з Blockscout · крос-чейн напрямок, метод і статус — події UniversalTxOutbound / RescueFundsOnSourceChain через eth_getLogs · ${nowUtc()}</p>
    </div>`;

  const more = document.getElementById('load-more');
  if (more) more.addEventListener('click', () => loadMore());
  const allBtn = document.getElementById('load-all');
  if (allBtn) allBtn.addEventListener('click', () => autoLoad());
  const stopBtn = document.getElementById('load-stop');
  if (stopBtn) stopBtn.addEventListener('click', () => {
    autoCancel = true;
  });
}

function renderAction(a: UniversalAction): string {
  const time = timeAgo(a.timestamp);
  const status = a.ok ? '' : '<span class="tx-dir out">FAIL</span>';
  if (!a.calls.length) {
    return `<a class="tx" href="${donutTxUrl(a.txHash)}" target="_blank" rel="noopener">
      <span class="tx-dir out">ACT</span>
      <span class="tx-method">${a.isMulticall ? 'мультиколл' : 'universal tx'}</span>
      <span class="tx-counter">ціль не декодовано</span>
      <span class="tx-val"></span>
      <span class="tx-time">${time}</span>
    </a>`;
  }
  // One row per inner call (direct → single row; multicall → several).
  return a.calls
    .map((c, i) => renderCall(a, c, i, status, time))
    .join('');
}

function renderCall(
  a: UniversalAction,
  c: InnerCall,
  i: number,
  status: string,
  time: string
): string {
  const tag = a.isMulticall && a.calls.length > 1 ? `<span class="idx">${i + 1}/${a.calls.length}</span>` : '';

  // Cross-chain (gateway outbound): show where it actually went, not the gateway.
  if (c.crossChain) {
    const x = c.crossChain;
    // Prefer the exact chain from the UniversalTxOutbound event; fall back to the
    // token-derived guess. A ✓ marks a destination confirmed from the event.
    const exact = !!x.exactChain;
    const chain = x.exactChain ?? x.chain ?? 'інший чейн';
    const mark = exact ? '<span class="xc-exact" aria-hidden="true">✓</span>' : '';
    const dest = x.recipient ? ` · ${escapeHtml(shortAddr(x.recipient, 8, 6))}` : '';
    // The method this action invokes on the destination contract, decoded from
    // the outbound payload (empty payload = a plain transfer, so no method).
    const dc = x.destCall;
    const methodName = dc ? dc.method || dc.selector : '';
    // For a batch (router multicall / UEA multicall), spell out the inner calls so
    // the action reads as what it actually does, not a bare `multicall()`.
    const innerTxt =
      dc && dc.inner && dc.inner.length
        ? ` · ${dc.inner.map((n) => escapeHtml(n)).join(' → ')}`
        : '';
    const kind = x.hasPayload
      ? `крос-чейн виклик${methodName ? ` · ${escapeHtml(methodName)}()${innerTxt}` : ''}`
      : 'крос-чейн переказ';
    const chainTitle = exact
      ? `точний чейн призначення з події шлюзу UniversalTxOutbound`
      : `чейн виведено з бриджевого токена (подію шлюзу не знайдено)`;
    const bridged =
      x.amount > 0n
        ? `${formatUnits(x.amount.toString(), decimalsOf(x.token), 4)} ${escapeHtml(
            x.tokenSymbol ?? 'токен'
          )}`
        : x.tokenSymbol
        ? escapeHtml(x.tokenSymbol)
        : '';

    // Decoded arguments of the destination method (recipient + amount for the
    // standard ERC-20 calls) — "what exactly it does on the destination", not
    // just the selector. Only shown when we could decode them unambiguously.
    let callDetail = '';
    if (dc && dc.recipient) {
      const who = dc.selector === '0x095ea7b3' ? 'spender' : 'отримувач';
      const amt =
        dc.amount == null
          ? ''
          : ` · ${isUnlimited(dc.amount) ? '∞' : formatUnits(dc.amount.toString(), decimalsOf(x.token), 4)} ${escapeHtml(
              x.tokenSymbol ?? 'токен'
            )}`;
      callDetail = `<span class="xc-call" title="Декодовано з payload події шлюзу — аргументи методу на контракті призначення">${escapeHtml(
        dc.method || dc.selector
      )} · ${who} ${escapeHtml(shortAddr(dc.recipient, 8, 6))}${amt}</span>`;
    } else if (dc && dc.inner && dc.inner.length) {
      // A batched call we could not decode to a single recipient/amount — show the
      // inner methods instead, so a swap/multicall still reads as what it does.
      callDetail = `<span class="xc-call" title="Внутрішні виклики пакета (multicall), декодовані з payload події шлюзу через ABI адресної книги SDK">${escapeHtml(
        dc.method || 'multicall'
      )}: ${dc.inner.map((n) => escapeHtml(n)).join(' → ')}</span>`;
    }

    // Status, strongest evidence first:
    //  • destination chain's own RPC confirmed arrival (Executed/Finalized) or a
    //    bounce (Reverted/Rescued) — authoritative, by shared subTxId;
    //  • the Push executeUniversalTx itself reverted → nothing was sent;
    //  • the Push gateway rescued the funds back for THIS universal tx (id match);
    //  • otherwise: sent from Push, destination not yet confirmed from its RPC.
    const delivered = x.subTxId ? state?.delivery.get(x.subTxId.toLowerCase()) : undefined;
    // Bridge time: how long the hop took (Push send → destination settlement).
    const bridgeTxt =
      delivered && delivered.ok && delivered.bridgeSeconds != null
        ? ` · міст ${formatDuration(delivered.bridgeSeconds)}`
        : '';
    const st =
      delivered && delivered.ok
        ? { cls: 'st-delivered', text: `✓ доставлено на ${escapeHtml(delivered.chainLabel)}${bridgeTxt}`, title: `Підтверджено з Blockscout самого ${delivered.chainLabel}: його UniversalGateway/Vault емітив UniversalTxExecuted/Finalized із тим самим subTxId.${delivered.bridgeSeconds != null ? ` Час мосту — від виклику на Push до події доставки на призначенні — ${formatDuration(delivered.bridgeSeconds)}.` : ''}` }
        : delivered && !delivered.ok
        ? { cls: 'st-fail', text: `✗ відхилено на ${escapeHtml(delivered.chainLabel)}`, title: `Підтверджено з Blockscout ${delivered.chainLabel}: на призначенні емітовано UniversalTxReverted/FundsRescued із тим самим subTxId — доставка не відбулась.` }
        : !a.ok
        ? { cls: 'st-fail', text: '✗ не виконано (Push)', title: 'executeUniversalTx завершився помилкою на Push — крос-чейн дію не відправлено.' }
        : x.rescued
        ? { cls: 'st-rescued', text: '↩ повернуто (rescue)', title: 'Шлюз Push емітив RescueFundsOnSourceChain для цього самого universalTxId (sha256 від tx-хеша цієї дії) і цього токена/чейна: кошти повернулись на Push, доставка не завершилась.' }
        : { cls: 'st-sent', text: '↗ надіслано (Push)', title: 'Надіслано зі шлюзу Push. Доставку з Blockscout призначення поки не підтверджено (ще в дорозі, або в того чейна немає CORS-дружнього Blockscout). Можна перевірити вручну за посиланням.' };

    // The link: to the actual settling tx on the destination chain when we have
    // it (the real end of the bridge), else to the recipient address there.
    const addrLink = destExplorerUrl(x.exactNamespace ?? x.caip, x.recipient);
    const destLink =
      delivered && delivered.destTxUrl
        ? `<a class="xc-dest" href="${delivered.destTxUrl}" target="_blank" rel="noopener" title="Транзакція доставки на ${escapeHtml(
            delivered.chainLabel
          )}">кінець мосту: ${escapeHtml(delivered.chainLabel)} tx ↗</a>`
        : addrLink
        ? `<a class="xc-dest" href="${addrLink.url}" target="_blank" rel="noopener" title="Відкрити отримувача на ${escapeHtml(
            addrLink.label
          )} — кінець мосту">кінець мосту: ${escapeHtml(addrLink.label)} ↗</a>`
        : '';

    return `<div class="tx-xc-wrap">
      <a class="tx tx-xc" href="${donutTxUrl(a.txHash)}" target="_blank" rel="noopener" title="Шлюз → ${escapeHtml(
      chain
    )} — ${chainTitle}${x.recipient ? ` · отримувач ${escapeHtml(x.recipient)}` : ''}">
        <span class="tx-dir xc">⇄ CC</span>
        <span class="tx-method">${kind}${tag}</span>
        <span class="tx-counter">→ ${escapeHtml(chain)}${mark}${dest}</span>
        <span class="tx-val">${bridged}</span>
        <span class="tx-time">${time}</span>
      </a>
      <div class="xc-sub">
        <span class="st ${st.cls}" title="${escapeHtml(st.title)}">${st.text}</span>
        ${callDetail}
        ${destLink}
      </div>
    </div>`;
  }

  const info = nameOf(c.to);
  const label = info.name || shortAddr(c.to, 8, 6);
  const method = selectorLabel(c.selector) || (c.selector ? c.selector : '—');
  const pc = c.value > 0n ? `${formatUnits(c.value.toString(), DONUT.nativeDecimals, 4)} PC` : '';
  return `<a class="tx" href="${donutTxUrl(a.txHash)}" target="_blank" rel="noopener" title="Ціль: ${escapeHtml(
    c.to
  )}">
    <span class="tx-dir out">→APP</span>
    <span class="tx-method">${escapeHtml(method)}${tag}</span>
    <span class="tx-counter">${escapeHtml(label)}</span>
    <span class="tx-val">${pc}</span>
    <span class="tx-time">${status}${time}</span>
  </a>`;
}

// On GitHub Pages the repo link can be derived from the URL
// (<user>.github.io/<repo>/). Locally there is no repo, so we just leave the
// label as plain text instead of a dangling "#".
function wireRepoLink() {
  const a = document.getElementById('repo-link') as HTMLAnchorElement | null;
  if (!a) return;
  const mm = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (mm && repo) {
    a.href = `https://github.com/${mm[1]}/${repo}`;
  } else {
    a.removeAttribute('href');
    a.style.opacity = '0.6';
  }
}

// ---- boot ----
// One delegated handler for every copy button in the result card.
function wireCopy() {
  el.result.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.copy-btn') as HTMLButtonElement | null;
    if (!btn) return;
    e.preventDefault();
    const text = btn.getAttribute('data-copy');
    if (!text) return;
    const original = btn.innerHTML;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      btn.innerHTML = btn.classList.contains('copy-link') ? '✓ Скопійовано' : '✓';
    } catch {
      btn.innerHTML = '✗';
    }
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 1400);
  });
}

function boot() {
  buildChainOptions();
  buildExamples();
  wireRepoLink();
  wireCopy();
  el.chain.addEventListener('change', onChainChange);
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });

  const { address, chain } = readUrl();
  if (address) {
    el.address.value = address;
    if (chain && (chain === REVERSE_ID || findChain(chain))) el.chain.value = chain;
    onChainChange();
    run();
  } else {
    el.chain.value = 'eth-sepolia';
    onChainChange();
  }
}

boot();
