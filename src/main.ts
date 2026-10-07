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
  chainIconSvg,
  reverseIconSvg,
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
import { msg, getLang, setLang, LANGS, LANG_CODE, type Lang, countWord, onLangChange } from './i18n';
import { getAddress } from 'viem';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const el = {
  form: $('#lookup-form') as HTMLFormElement,
  address: $('#address') as HTMLInputElement,
  chain: $('#chain') as HTMLSelectElement,
  result: $('#result'),
  status: $('#status'),
  flash: $('#flash'),
  bubbleBtn: $('#bubble-btn') as HTMLButtonElement,
  searchRow: $('.search-row'),
  networkSelect: $('#network-select'),
  networkTrigger: $('#network-trigger') as HTMLButtonElement,
  networkIcon: $('#network-icon'),
  networkLabel: $('#network-label'),
  networkList: $('#network-list'),
  langSwitch: $('#lang-switch'),
  logo: $('#logo'),
  heroTitle: $('#hero-title'),
  heroLede: $('#hero-lede'),
  footerText: $('#footer-text'),
  metaDescription: $('#meta-description') as HTMLMetaElement,
};

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

// Native <select id="chain"> stays in the DOM (hidden) purely as the single
// source of truth for "which origin chain is picked" — run()/onChainChange()
// read el.chain.value exactly as before. The visible control is the custom
// dropdown below, which only ever writes to the hidden select and re-renders
// its own trigger; nothing else in the app needs to know it exists.
function buildChainOptions() {
  el.chain.innerHTML = '';
  for (const c of ORIGIN_CHAINS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    el.chain.appendChild(opt);
  }
  const rev = document.createElement('option');
  rev.value = REVERSE_ID;
  rev.textContent = msg().network.reverseOption;
  el.chain.appendChild(rev);
}

function networkIconHtml(id: string): string {
  if (id === REVERSE_ID) return reverseIconSvg();
  const def = findChain(id);
  return def ? chainIconSvg(def.icon) : '';
}

function networkLabelText(id: string): string {
  if (id === REVERSE_ID) return msg().network.reverseOption;
  return findChain(id)?.label ?? id;
}

function buildNetworkDropdown() {
  el.networkList.innerHTML = '';
  const rows = [...ORIGIN_CHAINS.map((c) => c.id), REVERSE_ID];
  for (const id of rows) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.id = id;
    li.tabIndex = -1;
    li.className = id === REVERSE_ID ? 'network-option network-option-reverse' : 'network-option';
    li.innerHTML = `${networkIconHtml(id)}<span>${escapeHtml(networkLabelText(id))}</span>`;
    el.networkList.appendChild(li);
  }
  syncNetworkTrigger();
}

function syncNetworkTrigger() {
  const id = el.chain.value;
  el.networkIcon.innerHTML = networkIconHtml(id);
  el.networkLabel.textContent = networkLabelText(id);
  el.networkTrigger.setAttribute('aria-label', msg().network.aria);
  el.networkList.querySelectorAll('.network-option').forEach((li) => {
    li.setAttribute('aria-selected', String((li as HTMLElement).dataset.id === id));
  });
}

function closeNetworkDropdown() {
  el.networkList.hidden = true;
  el.networkTrigger.setAttribute('aria-expanded', 'false');
}

function openNetworkDropdown() {
  el.networkList.hidden = false;
  el.networkTrigger.setAttribute('aria-expanded', 'true');
  const current = el.networkList.querySelector<HTMLElement>(`[data-id="${el.chain.value}"]`);
  (current ?? el.networkList.querySelector<HTMLElement>('.network-option'))?.focus();
}

function selectNetwork(id: string) {
  if (el.chain.value !== id) {
    el.chain.value = id;
    el.chain.dispatchEvent(new Event('change'));
  }
  syncNetworkTrigger();
  closeNetworkDropdown();
  el.networkTrigger.focus();
}

function wireNetworkDropdown() {
  el.networkTrigger.addEventListener('click', () => {
    if (el.networkList.hidden) openNetworkDropdown();
    else closeNetworkDropdown();
  });
  el.networkList.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.network-option');
    if (li?.dataset.id) selectNetwork(li.dataset.id);
  });
  el.networkList.addEventListener('keydown', (e) => {
    const items = [...el.networkList.querySelectorAll<HTMLElement>('.network-option')];
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNetworkDropdown();
      el.networkTrigger.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[Math.min(items.length - 1, idx + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.max(0, idx - 1)]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const id = items[idx]?.dataset.id;
      if (id) selectNetwork(id);
    }
  });
  document.addEventListener('click', (e) => {
    if (!el.networkSelect.contains(e.target as Node)) closeNetworkDropdown();
  });
  el.networkTrigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openNetworkDropdown();
    }
  });
}

function onChainChange() {
  const reverse = el.chain.value === REVERSE_ID;
  el.address.placeholder = reverse ? msg().address.placeholderReverse : msg().address.placeholderForward;
  syncNetworkTrigger();
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
function copyBtn(text: string, title = msg().copy.generic): string {
  return `<button type="button" class="copy-btn" data-copy="${escapeHtml(text)}" title="${escapeHtml(
    title
  )}" aria-label="${escapeHtml(title)}">⧉</button>`;
}

function donutTokenUrl(address: string): string {
  return `${DONUT.explorer}/token/${address}`;
}

/** A metric number that counts up from 0 on render instead of just appearing —
 * `finalText` is the exact already-formatted string (with grouping/decimals),
 * shown immediately as a safe fallback and restored exactly once the count
 * finishes, so the animation can never leave a rounding artefact behind. */
function countSpan(target: number, finalText: string, decimals = 0): string {
  return `<span class="countup" data-target="${target}" data-decimals="${decimals}" data-final="${escapeHtml(
    finalText
  )}">${escapeHtml(finalText)}</span>`;
}

/** Animate every `.countup` span inside `root` from 0 to its target. A no-op
 * under prefers-reduced-motion — the span's initial text is already the exact
 * final value, so skipping the animation loses nothing. */
function animateCountUps(root: ParentNode) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const spans = root.querySelectorAll<HTMLElement>('.countup');
  spans.forEach((span) => {
    const target = Number(span.dataset.target);
    const decimals = Number(span.dataset.decimals || '0');
    const final = span.dataset.final ?? '';
    if (!Number.isFinite(target)) return;
    const duration = 650;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t >= 1) {
        span.textContent = final;
        return;
      }
      const val = target * eased;
      span.textContent = decimals ? val.toFixed(decimals) : String(Math.round(val));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** How many digits sit after the decimal point in an already-formatted amount
 * (e.g. "12.3456" → 4, "0" → 0) — so a count-up animation knows how many
 * decimals to show while it runs. */
function decimalsOfText(s: string): number {
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

// ---- Rank: a simple, honest verdict computed only from the metrics shown
// above (never anything not already on the page) ----
interface Rank {
  key: string;
  label: string;
  emoji: string;
  reason: string;
  next: string | null;
}

/** Four tiers, each a strictly higher bar than the last. The exact thresholds
 * are also spelled out in the UI's "how is it calculated" fold, so nothing
 * here is hidden from the person reading their own result. */
function computeRank(deployed: boolean, txCountNum: number, realAppsCount: number, xcActionsCount: number): Rank {
  const r = msg().rank;
  if (!deployed && txCountNum === 0) {
    return { key: 'none', label: r.labels.none, emoji: '🔘', reason: r.noneReason, next: r.noneNext };
  }
  if (xcActionsCount > 0) {
    return {
      key: 'native',
      label: r.labels.native,
      emoji: '🟣',
      reason: r.nativeReason(xcActionsCount),
      next: null,
    };
  }
  if (txCountNum >= 5 && realAppsCount >= 2) {
    return {
      key: 'builder',
      label: r.labels.builder,
      emoji: '🔵',
      reason: r.builderReason(txCountNum, realAppsCount),
      next: r.builderNext,
    };
  }
  return {
    key: 'explorer',
    label: r.labels.explorer,
    emoji: '🟢',
    reason: r.explorerReason(txCountNum),
    next: r.explorerNext,
  };
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

function renderLoading(step: number) {
  delete el.result.dataset.paintedFor; // a new lookup animates its first paint again
  const steps = msg().loading.steps;
  el.result.innerHTML = `
    <div class="card loading-card">
      <ol class="loading-steps">
        ${steps.map((s, i) => {
          const cls = i < step ? 'done' : i === step ? 'active' : '';
          const icon =
            i < step
              ? '✓'
              : i === step
              ? '<span class="loading-spin" aria-hidden="true"></span>'
              : '';
          return `<li class="loading-step ${cls}"><span class="loading-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(
            s
          )}…</span></li>`;
        }).join('')}
      </ol>
      <div class="skeleton-metrics">
        ${Array.from({ length: 4 })
          .map(() => '<div class="skeleton-box"></div>')
          .join('')}
      </div>
      <div class="skeleton-rows">
        ${Array.from({ length: 4 })
          .map(() => '<div class="skeleton-row"></div>')
          .join('')}
      </div>
    </div>`;
}

// ---- Search animation: bubble pop → row shake while loading → page flash
// right before the result lands. Only runs once per submit (not on the many
// background re-renders that follow), so later data landing never "blinks". ----
function popBubble() {
  el.bubbleBtn.classList.remove('popping');
  // restart the animation even if the button is still mid-pop from a fast re-submit
  void el.bubbleBtn.offsetWidth;
  el.bubbleBtn.classList.add('popping');
  for (let i = 0; i < 2; i++) {
    const ring = document.createElement('span');
    ring.className = 'bubble-ring';
    ring.style.animationDelay = `${i * 90}ms`;
    el.bubbleBtn.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
  }
  setTimeout(() => el.bubbleBtn.classList.remove('popping'), 500);
}

function startRowShake() {
  el.searchRow.classList.add('shaking');
}

function stopRowShakeAndFlash() {
  el.searchRow.classList.remove('shaking');
  el.flash.classList.remove('flashing');
  void el.flash.offsetWidth;
  el.flash.classList.add('flashing');
  setTimeout(() => el.flash.classList.remove('flashing'), 700);
}

// ---- Core lookup ----
async function run() {
  const rawInput = el.address.value.trim();
  const reverse = el.chain.value === REVERSE_ID;
  if (!rawInput) {
    setStatus(msg().errors.emptyAddress, 'error');
    return;
  }
  syncUrl(rawInput, el.chain.value);
  setStatus('', 'muted');
  popBubble();
  startRowShake();
  renderLoading(0);

  let uea: string;
  let originLabel: string;
  let originAddress: string;
  let caip = '';
  let native = false;
  let reverseNote: string | null = null;
  let verifyChain: CHAIN | null = null;

  if (reverse) {
    // Reverse: the input IS a UEA on Push Chain; ask the factory for its origin.
    try {
      uea = getAddress(rawInput as `0x${string}`);
    } catch {
      el.result.innerHTML = '';
      setStatus(msg().errors.invalidReverseAddress, 'error');
      el.searchRow.classList.remove('shaking');
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
        reverseNote = msg().mapping.noOriginNote;
      }
    } catch (e) {
      el.result.innerHTML = '';
      setStatus(msg().errors.reverseLookupFailed((e as Error).message), 'error');
      el.searchRow.classList.remove('shaking');
      return;
    }
  } else {
    const chainDef = findChain(el.chain.value);
    if (!chainDef) {
      el.result.innerHTML = '';
      setStatus(msg().errors.chooseChain, 'error');
      el.searchRow.classList.remove('shaking');
      return;
    }
    try {
      uea = deriveUea(chainDef.chain, rawInput);
      caip = toCaip(chainDef.chain, rawInput);
    } catch (e) {
      el.result.innerHTML = '';
      setStatus(msg().errors.deriveUea((e as Error).message), 'error');
      el.searchRow.classList.remove('shaking');
      return;
    }
    native = isPushChain(chainDef.chain);
    originLabel = native ? msg().chain.nativeLabel : chainDef.label;
    originAddress = rawInput;
    if (!native) verifyChain = chainDef.chain;
  }

  renderLoading(1);

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
    warnings.push(`${msg().warnings.balance}: ${(infoRes.reason as Error).message}`);
  }
  if (countersRes.status === 'fulfilled') {
    txCount = countersRes.value.transactions_count ?? '0';
    tokenXferCount = countersRes.value.token_transfers_count ?? '0';
  } else if (!isNotFound(countersRes.reason)) {
    warnings.push(`${msg().warnings.counters}: ${(countersRes.reason as Error).message}`);
  }
  if (txRes.status === 'fulfilled') {
    txs = txRes.value.items;
    txNext = txRes.value.next_page_params;
  } else if (!isNotFound(txRes.reason)) {
    warnings.push(`${msg().warnings.transactions}: ${(txRes.reason as Error).message}`);
  }
  if (tokenRes.status === 'fulfilled') {
    tokenTransfers = tokenRes.value.items;
    tokNext = tokenRes.value.next_page_params;
  } else if (!isNotFound(tokenRes.reason)) {
    warnings.push(`${msg().warnings.tokenTransfers}: ${(tokenRes.reason as Error).message}`);
  }
  if (balRes.status === 'fulfilled') {
    holdings = balRes.value;
  } else if (!isNotFound(balRes.reason)) {
    warnings.push(`${msg().warnings.tokenBalances}: ${(balRes.reason as Error).message}`);
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

  renderLoading(2);
  await resolveNames();
  stopRowShakeAndFlash();
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
        const chain = c.crossChain.exactChain ?? c.crossChain.chain ?? msg().chain.unknown;
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
          const sym = c.crossChain.tokenSymbol ?? msg().token.generic;
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
    ? `<span class="badge badge-ok">${escapeHtml(msg().badge.deployed)}</span>`
    : `<span class="badge badge-pending">${escapeHtml(msg().badge.pending)}</span>`;

  const balance = formatUnits(m.balanceWei, DONUT.nativeDecimals, 4);

  // ---- mapping ----
  const originNodeInner = m.reverse && m.reverseNote
    ? `<div class="map-addr map-muted">${escapeHtml(msg().mapping.unknown)}</div>
       <div class="map-caip">${escapeHtml(msg().mapping.noOriginShort)}</div>`
    : `<div class="map-addr-row">
         <div class="map-addr" title="${escapeHtml(m.originAddress)}">${escapeHtml(
        shortAddr(m.originAddress, 10, 8)
      )}</div>
         ${copyBtn(m.originAddress, msg().copy.copyOriginAddress)}
       </div>
       <div class="map-caip">${escapeHtml(m.caip)}</div>`;

  const mapping = `
    <div class="mapping">
      <div class="map-node">
        <div class="map-label">${m.reverse ? escapeHtml(msg().mapping.originFoundLabel) : escapeHtml(msg().mapping.originLabel(m.originLabel))}</div>
        ${originNodeInner}
      </div>
      <div class="map-arrow">${m.reverse ? msg().mapping.arrowReverse : msg().mapping.arrowForward}</div>
      <div class="map-node map-node-uea">
        <div class="map-label">${escapeHtml(msg().mapping.ueaLabel)}</div>
        <div class="map-addr-row">
          <a class="map-addr" href="${donutAddressUrl(m.uea)}" target="_blank" rel="noopener" title="${escapeHtml(
    m.uea
  )}">${escapeHtml(shortAddr(m.uea, 12, 10))} ↗</a>
          ${copyBtn(m.uea, msg().copy.copyUeaAddress)}
        </div>
      </div>
    </div>`;

  // On-chain verification of the derived UEA (forward lookups only).
  const verifyHtml =
    m.verify === 'ok'
      ? `<p class="hint verify-ok">${msg().verify.ok}</p>`
      : m.verify === 'pending'
      ? `<p class="hint">${escapeHtml(msg().verify.pending)}</p>`
      : m.verify === 'mismatch'
      ? `<p class="hint hint-warn">${msg().verify.mismatch}</p>`
      : m.verify === 'unavailable'
      ? `<p class="hint">${escapeHtml(msg().verify.unavailable)}</p>`
      : '';

  const reverseNoteHtml = m.reverseNote
    ? `<p class="hint hint-warn">${escapeHtml(m.reverseNote)}</p>`
    : '';

  const sdkNote =
    m.deployed || m.reverse
      ? ''
      : `<p class="hint">${escapeHtml(msg().hints.lazyDeploy)}</p>`;

  const txCountNum = Number(m.txCount) || 0;
  const tokenXferNum = Number(m.tokenXferCount) || 0;
  const balanceNum = Number(balance.replace(/\s/g, '')) || 0;

  // ---- verdict: a simple rank from the metrics above, rules shown in full ----
  const realAppsCount = appList.filter((p) => !p.crossChain).length;
  const xcActionsCount = appList.filter((p) => p.crossChain).reduce((s, p) => s + p.actions, 0);
  const rank = computeRank(m.deployed, txCountNum, realAppsCount, xcActionsCount);

  const metrics = `
    <div class="metrics">
      <div class="metric">
        <div class="metric-value">${countSpan(balanceNum, balance, decimalsOfText(balance))} <span class="unit">PC</span></div>
        <div class="metric-label">${escapeHtml(msg().metrics.balance)}</div>
      </div>
      <div class="metric">
        <div class="metric-value">${countSpan(txCountNum, formatInt(m.txCount))}</div>
        <div class="metric-label">${escapeHtml(msg().metrics.txTotal)}</div>
      </div>
      <div class="metric">
        <div class="metric-value">${countSpan(tokenXferNum, formatInt(m.tokenXferCount))}</div>
        <div class="metric-label">${escapeHtml(msg().metrics.tokenTransfers)}</div>
      </div>
      <div class="metric">
        <div class="metric-value">${countSpan(appList.length, String(appList.length))}</div>
        <div class="metric-label">${escapeHtml(m.autoLoading ? msg().metrics.appsCounting : msg().metrics.apps)}</div>
      </div>
      <div class="metric metric-rank">
        <div class="metric-value metric-rank-value"><span class="verdict-emoji" aria-hidden="true">${rank.emoji}</span> ${escapeHtml(rank.label)}</div>
        <div class="metric-label">${escapeHtml(msg().metrics.rank)}</div>
      </div>
    </div>`;

  const verdict = `
    <div class="verdict verdict-${rank.key}">
      <div class="verdict-top">
        <span class="verdict-badge"><span class="verdict-emoji" aria-hidden="true">${rank.emoji}</span>${escapeHtml(
    rank.label
  )}</span>
        <details class="verdict-rules">
          <summary>${escapeHtml(msg().rank.rulesSummary)}</summary>
          <ul>
            ${msg().rank.rules.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>
          <p>${escapeHtml(msg().rank.footnote(m.autoLoading))}</p>
        </details>
      </div>
      <p class="verdict-reason">${escapeHtml(rank.reason)}</p>
      ${
        rank.next
          ? `<p class="verdict-next">${escapeHtml(msg().rank.nextLevelPrefix)}${escapeHtml(rank.next)}</p>`
          : `<p class="verdict-next verdict-max">${escapeHtml(msg().rank.maxLevel)}</p>`
      }
    </div>`;

  // ---- universal actions ----
  const actionsHtml = actions.length
    ? `<section class="block">
        <h3>${escapeHtml(msg().actions.title)} <span class="count-badge">${actions.length}</span></h3>
        <p class="hint">${msg().actions.hint}${
          m.deliveryActive ? ` <span class="muted">${escapeHtml(msg().actions.checking)}</span>` : ''
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
        <h3>${escapeHtml(msg().apps.title)} <span class="count-badge">${appList.length}</span></h3>
        <p class="hint">${escapeHtml(msg().apps.hint)}</p>
        <ul class="apps">
          ${appList
            .slice(0, 30)
            .map((p) => {
              const nums: string[] = [];
              if (p.actions) nums.push(countWord(p.actions, msg().words.action));
              if (p.tokens) nums.push(countWord(p.tokens, msg().words.token));
              if (p.pcWei > 0n) nums.push(`${formatUnits(p.pcWei.toString(), DONUT.nativeDecimals, 4)} PC`);
              if (p.crossChain) {
                const bridged = [...p.bridged.entries()]
                  .map(
                    ([addr, b]) =>
                      `${formatUnits(b.amount.toString(), decimalsOf(addr), 4)} ${escapeHtml(b.symbol)}`
                  )
                  .join(', ');
                const rescuedNote = p.rescued
                  ? `<span class="st st-rescued" title="${escapeHtml(msg().apps.rescuedTitle)}">${escapeHtml(msg().apps.rescuedNote(p.rescued))}</span>`
                  : '';
                return `<li class="app app-xc">
                  <span class="app-name"><span class="xc-badge">${escapeHtml(msg().apps.xcBadge)}</span> ${escapeHtml(p.label)} ${rescuedNote}</span>
                  <span class="app-nums">${nums.join(' · ')}${
                  bridged ? ` · ${escapeHtml(msg().apps.bridgePrefix)} ${bridged}` : ''
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
                  ${info.isContract ? `<span class="tag">${escapeHtml(msg().apps.contractTag)}</span>` : ''}
                </span>
                <span class="app-nums">${nums.join(' · ')}</span>
              </li>`;
            })
            .join('')}
        </ul>
      </section>`
    : '';

  // ---- relayer note ----
  // folded: an active account can have hundreds of relayers — a wall of addresses buried the rest of the page
  const relayerHtml = m.relayers.size
    ? `<details class="hint relayers">
        <summary>${escapeHtml(msg().relayers.summary(m.relayers.size))}</summary>
        <p>${[...m.relayers]
          .map(
            (r) =>
              `<a href="${donutAddressUrl(r)}" target="_blank" rel="noopener">${escapeHtml(
                shortAddr(r, 6, 4)
              )}</a>`
          )
          .join(', ')}</p>
      </details>`
    : '';

  // ---- tokens ----
  const tokenHtml = m.tokenTransfers.length
    ? `<section class="block">
        <h3>${escapeHtml(msg().tokens.title)}</h3>
        <div class="tx-list">
          ${m.tokenTransfers
            .slice(0, 30)
            .map((tt) => {
              const out = tt.from?.hash?.toLowerCase() === ueaLc;
              const counter = out ? tt.to?.hash : tt.from?.hash;
              const sym = tt.token?.symbol || tt.token?.name || msg().token.generic;
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
        <p class="hint">${escapeHtml(msg().tokens.summary(tokenSet.size))}</p>
      </section>`
    : '';

  const gasHtml =
    gasWei !== '0'
      ? `<p class="hint">${escapeHtml(msg().hints.gasPaid(formatUnits(gasWei, DONUT.nativeDecimals, 6), outgoing.length))}</p>`
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
        symbol: h.token?.symbol || h.token?.name || (isNft ? msg().holdings.nftTag : msg().token.generic),
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
        <h3>${escapeHtml(msg().holdings.title)} <span class="count-badge">${heldTokens.length}</span></h3>
        <p class="hint">${escapeHtml(msg().holdings.hint)}</p>
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
                  ${t.isNft ? `<span class="tag">${escapeHtml(msg().holdings.nftTag)}</span>` : ''}
                </span>
                <span class="app-nums">${escapeHtml(t.amount)}${t.isNft ? ` ${escapeHtml(msg().holdings.nftUnit)}` : ` ${escapeHtml(t.symbol)}`}</span>
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
        <h3>${escapeHtml(msg().tx.title)}</h3>
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
        <h3>${escapeHtml(msg().tx.emptyTitle)}</h3>
        <p>${escapeHtml(msg().tx.emptyBody)}</p>
      </section>`;

  // ---- pagination: background progress + manual fallback ----
  const hasMore = !!(m.txNext || m.tokNext);
  const loaded = msg().pagination.loadedText(m.txs.length, m.tokenTransfers.length);
  let loadMoreHtml = '';
  if (m.autoLoading) {
    // Indeterminate progress while we pull the rest of the history in the back.
    loadMoreHtml = `<div class="loadmore">
      <div class="progress"><div class="progress-bar"></div></div>
      <p class="hint">${escapeHtml(msg().pagination.autoLoading(m.autoPages + 1, loaded))}
        <button type="button" class="load-btn ghost" id="load-stop">${escapeHtml(msg().pagination.stopBtn)}</button>
      </p>
    </div>`;
  } else if (m.loadingMore) {
    loadMoreHtml = `<div class="loadmore"><button type="button" class="load-btn" disabled>${escapeHtml(msg().pagination.loadingBtn)}</button></div>`;
  } else if (hasActivity && hasMore) {
    // Auto-load stopped at the page cap but more remains.
    const cappedNote = m.autoStopped ? msg().pagination.cappedNote(PAGE_CAP) : '';
    loadMoreHtml = `<div class="loadmore">
      <p class="hint">${escapeHtml(msg().pagination.hasMoreText(loaded, cappedNote))}</p>
      <button type="button" class="load-btn" id="load-more">${escapeHtml(msg().pagination.loadMoreBtn)}</button>
      <button type="button" class="load-btn secondary" id="load-all">${escapeHtml(msg().pagination.loadAllBtn)}</button>
    </div>`;
  } else if (hasActivity) {
    loadMoreHtml = `<p class="hint">${escapeHtml(msg().pagination.doneAllText(loaded))}</p>`;
  }

  const warningsHtml = m.warnings.length
    ? `<section class="block warn">
        <h3>${escapeHtml(msg().warnings.title)}</h3>
        <ul>${m.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      </section>`
    : '';

  // the result is re-rendered as each piece of data lands (~10 times per lookup): only the FIRST paint for an
  // account animates; later ones swap the content quietly (no fade-in, no count-up from 0) and keep open <details>
  const repaint = el.result.dataset.paintedFor === m.uea;
  const openDetails = repaint ? [...el.result.querySelectorAll<HTMLDetailsElement>('details')].map((d) => d.open) : [];
  el.result.classList.toggle('quiet', repaint);
  el.result.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>Push Universal ID</h2>
        <div class="card-head-right">
          <button type="button" class="copy-btn copy-link" data-copy="${escapeHtml(
            window.location.href
          )}" title="${escapeHtml(msg().copy.shareLinkTitle)}">${escapeHtml(msg().copy.shareLinkLabel)}</button>
          ${statusBadge}
        </div>
      </div>
      ${mapping}
      ${verifyHtml}
      ${reverseNoteHtml}
      ${sdkNote}
      ${metrics}
      ${verdict}
      ${relayerHtml}
      ${gasHtml}
      ${holdingsHtml}
      ${actionsHtml}
      ${appsHtml}
      ${tokenHtml}
      ${txHtml}
      ${loadMoreHtml}
      ${warningsHtml}
      <p class="source">${escapeHtml(msg().source.footerLine(DONUT.explorer))}${nowUtc()}</p>
    </div>`;

  if (repaint) {
    el.result.querySelectorAll<HTMLDetailsElement>('details').forEach((d, i) => { if (openDetails[i]) d.open = true; });
  } else {
    animateCountUps(el.result);
    el.result.dataset.paintedFor = m.uea;
  }

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
      <span class="tx-method">${escapeHtml(a.isMulticall ? msg().actions.multicallLabel : msg().actions.universalTxLabel)}</span>
      <span class="tx-counter">${escapeHtml(msg().actions.targetNotDecoded)}</span>
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
    const chain = x.exactChain ?? x.chain ?? msg().chain.unknown;
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
      ? `${escapeHtml(msg().actions.xcCallLabel)}${methodName ? ` · ${escapeHtml(methodName)}()${innerTxt}` : ''}`
      : escapeHtml(msg().actions.xcTransferLabel);
    const chainTitle = exact ? msg().actions.xcChainTitleExact : msg().actions.xcChainTitleGuess;
    const bridged =
      x.amount > 0n
        ? `${formatUnits(x.amount.toString(), decimalsOf(x.token), 4)} ${escapeHtml(
            x.tokenSymbol ?? msg().token.generic
          )}`
        : x.tokenSymbol
        ? escapeHtml(x.tokenSymbol)
        : '';

    // Decoded arguments of the destination method (recipient + amount for the
    // standard ERC-20 calls) — "what exactly it does on the destination", not
    // just the selector. Only shown when we could decode them unambiguously.
    let callDetail = '';
    if (dc && dc.recipient) {
      const who = dc.selector === '0x095ea7b3' ? msg().actions.spenderWord : msg().actions.recipientWord;
      const amt =
        dc.amount == null
          ? ''
          : ` · ${isUnlimited(dc.amount) ? '∞' : formatUnits(dc.amount.toString(), decimalsOf(x.token), 4)} ${escapeHtml(
              x.tokenSymbol ?? msg().token.generic
            )}`;
      callDetail = `<span class="xc-call" title="${escapeHtml(msg().actions.xcCallDetailArgsTitle)}">${escapeHtml(
        dc.method || dc.selector
      )} · ${escapeHtml(who)} ${escapeHtml(shortAddr(dc.recipient, 8, 6))}${amt}</span>`;
    } else if (dc && dc.inner && dc.inner.length) {
      // A batched call we could not decode to a single recipient/amount — show the
      // inner methods instead, so a swap/multicall still reads as what it does.
      callDetail = `<span class="xc-call" title="${escapeHtml(msg().actions.xcCallDetailBatchTitle)}">${escapeHtml(
        dc.method || msg().actions.multicallLabel
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
        ? msg().bridge.time(formatDuration(delivered.bridgeSeconds))
        : '';
    const S = msg().status;
    const st =
      delivered && delivered.ok
        ? { cls: 'st-delivered', text: S.delivered.text(delivered.chainLabel, bridgeTxt), title: S.delivered.title(delivered.chainLabel, bridgeTxt) }
        : delivered && !delivered.ok
        ? { cls: 'st-fail', text: S.failDest.text(delivered.chainLabel), title: S.failDest.title(delivered.chainLabel) }
        : !a.ok
        ? { cls: 'st-fail', text: S.failPush.text, title: S.failPush.title }
        : x.rescued
        ? { cls: 'st-rescued', text: S.rescued.text, title: S.rescued.title }
        : { cls: 'st-sent', text: S.sent.text, title: S.sent.title };

    // The link: to the actual settling tx on the destination chain when we have
    // it (the real end of the bridge), else to the recipient address there.
    const addrLink = destExplorerUrl(x.exactNamespace ?? x.caip, x.recipient);
    const destLink =
      delivered && delivered.destTxUrl
        ? `<a class="xc-dest" href="${delivered.destTxUrl}" target="_blank" rel="noopener" title="${escapeHtml(
            msg().bridge.txTitle(delivered.chainLabel)
          )}">${escapeHtml(msg().bridge.endTx(delivered.chainLabel))}</a>`
        : addrLink
        ? `<a class="xc-dest" href="${addrLink.url}" target="_blank" rel="noopener" title="${escapeHtml(
            msg().bridge.addrTitle(addrLink.label)
          )}">${escapeHtml(msg().bridge.endAddr(addrLink.label))}</a>`
        : '';

    return `<div class="tx-xc-wrap">
      <a class="tx tx-xc" href="${donutTxUrl(a.txHash)}" target="_blank" rel="noopener" title="${escapeHtml(
      msg().bridge.gatewayTitle(chain, chainTitle, x.recipient)
    )}">
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
  return `<a class="tx" href="${donutTxUrl(a.txHash)}" target="_blank" rel="noopener" title="${escapeHtml(
    msg().actions.targetTitle(c.to)
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
      btn.innerHTML = btn.classList.contains('copy-link') ? escapeHtml(msg().copy.copiedLink) : '✓';
    } catch {
      btn.innerHTML = '✗';
    }
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 1400);
  });
}

const DOCS_UTILITY_FN_URL = 'https://push.org/docs/chain/build/utility-functions/';

// All text outside the result card (header, placeholders, the custom dropdown,
// the footer) gets re-applied here — on boot, and again every time the
// language switcher picks a new language, so nothing needs a page reload.
function applyStaticI18n() {
  const m = msg();
  document.documentElement.lang = getLang();
  document.title = m.docTitle;
  el.metaDescription.content = m.docDescription;
  el.logo.textContent = m.logo;
  el.heroTitle.textContent = m.heroTitle;
  el.heroLede.innerHTML = m.heroLedeHtml;
  el.footerText.innerHTML = m.footerHtml(DOCS_UTILITY_FN_URL, DONUT.explorer);
  el.address.setAttribute('aria-label', m.address.aria);
  el.bubbleBtn.setAttribute('aria-label', m.search.aria);
  wireRepoLink();
  buildChainOptions();
  buildNetworkDropdown();
  onChainChange();
  renderLangSwitch();
  if (state) render();
}

function renderLangSwitch() {
  el.langSwitch.innerHTML = LANGS.map(
    (l) =>
      `<button type="button" class="lang-btn${l === getLang() ? ' active' : ''}" data-lang="${l}" aria-pressed="${
        l === getLang()
      }">${LANG_CODE[l]}</button>`
  ).join('');
}

function wireLangSwitch() {
  el.langSwitch.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.lang-btn');
    const lang = btn?.dataset.lang as Lang | undefined;
    if (lang) {
      setLang(lang);
      applyStaticI18n();
    }
  });
}

function boot() {
  onLangChange(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('lang', getLang());
    history.replaceState(null, '', u.toString());
  });
  wireRepoLink();
  wireCopy();
  wireNetworkDropdown();
  wireLangSwitch();
  applyStaticI18n();
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
