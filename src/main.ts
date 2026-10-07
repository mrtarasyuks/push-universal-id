import {
  ORIGIN_CHAINS,
  findChain,
  findChainByCaip,
  REVERSE_ID,
  DONUT,
  donutAddressUrl,
  donutTxUrl,
} from './chains';
import { deriveUea, toCaip, isPushChain, resolveOrigin } from './uea';
import {
  getAddressInfo,
  getCounters,
  getTransactions,
  getTokenTransfers,
  isNotFound,
  type Tx,
  type TokenTransfer,
  type PageParams,
} from './blockscout';
import { decodeUniversalAction, selectorLabel, type UniversalAction, type InnerCall } from './actions';
import { knownAddr, isInfra } from './known';
import { shortAddr, formatUnits, formatInt, sumGasWei, timeAgo, nowUtc } from './format';
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
  // Activity.
  deployed: boolean;
  balanceWei: string | null;
  txCount: string;
  tokenXferCount: string;
  txs: Tx[];
  tokenTransfers: TokenTransfer[];
  txNext: PageParams;
  tokNext: PageParams;
  names: Map<string, NameInfo>;
  relayers: Set<string>;
  warnings: string[];
  loadingMore: boolean;
  // Background auto-pagination (so gas / top apps cover the whole history).
  autoLoading: boolean;
  autoPages: number;
  autoStopped: boolean; // user hit "stop" or the page cap was reached
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
  }

  setStatus('Читаю активність UEA з Push Chain (Donut)…', 'info');

  const warnings: string[] = [];
  let balanceWei: string | null = null;
  let deployed = false;
  let txCount = '0';
  let tokenXferCount = '0';
  let txs: Tx[] = [];
  let tokenTransfers: TokenTransfer[] = [];
  let txNext: PageParams = null;
  let tokNext: PageParams = null;

  const [infoRes, countersRes, txRes, tokenRes] = await Promise.allSettled([
    getAddressInfo(uea),
    getCounters(uea),
    getTransactions(uea),
    getTokenTransfers(uea),
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

  state = {
    uea,
    originLabel,
    originAddress,
    caip,
    native,
    reverse,
    reverseNote,
    deployed,
    balanceWei,
    txCount,
    tokenXferCount,
    txs,
    tokenTransfers,
    txNext,
    tokNext,
    names: new Map(),
    relayers: new Set(),
    warnings,
    loadingMore: false,
    autoLoading: false,
    autoPages: 0,
    autoStopped: false,
  };

  setStatus('', 'muted');
  await resolveNames();
  render();

  // Fetch the rest of the history in the background so gas and the top-apps
  // summary reflect the whole account, not just the first ~50 items.
  if (state.txNext || state.tokNext) void autoLoad();
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
      render();
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
  } finally {
    state.loadingMore = false;
    render();
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
      };
      apps.set(key, a);
    }
    return a;
  };

  for (const a of actions) {
    for (const c of a.calls) {
      if (c.crossChain) {
        // Group by destination chain (the real "where did it go").
        const chain = c.crossChain.chain ?? 'інший чейн';
        const app = ensure(`xc:${chain}`, {
          label: `→ ${chain}`,
          chain,
          crossChain: true,
        });
        app.actions += 1;
        app.pcWei += c.value;
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
    : `<div class="map-addr" title="${escapeHtml(m.originAddress)}">${escapeHtml(
        shortAddr(m.originAddress, 10, 8)
      )}</div>
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
        <a class="map-addr" href="${donutAddressUrl(m.uea)}" target="_blank" rel="noopener" title="${escapeHtml(
    m.uea
  )}">${escapeHtml(shortAddr(m.uea, 12, 10))} ↗</a>
      </div>
    </div>`;

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
        <p class="hint">Декодовано з <code>executeUniversalTx</code> — справжній цільовий застосунок кожної дії, а не релеєр. Крос-чейн дії через шлюз показують чейн і контракт призначення (з даних <code>sendUniversalTxOutbound</code>).</p>
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
        <p class="hint">Згруповано за застосунком: скільки дій і скільки PC припало на кожен. Крос-чейн дії зведені за чейном призначення.</p>
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
                return `<li class="app app-xc">
                  <span class="app-name"><span class="xc-badge">крос-чейн</span> ${escapeHtml(p.label)}</span>
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
        ${statusBadge}
      </div>
      ${mapping}
      ${reverseNoteHtml}
      ${sdkNote}
      ${metrics}
      ${relayerHtml}
      ${gasHtml}
      ${actionsHtml}
      ${appsHtml}
      ${tokenHtml}
      ${txHtml}
      ${loadMoreHtml}
      ${warningsHtml}
      <p class="source">Origin↔UEA — фабрика Push (${escapeHtml(
        DONUT.explorer
      )}) та offchain CREATE2 (@pushchain/core) · активність і декодування з Blockscout · ${nowUtc()}</p>
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
    const chain = x.chain ?? 'інший чейн';
    const dest = x.recipient ? ` · ${escapeHtml(shortAddr(x.recipient, 8, 6))}` : '';
    const kind = x.hasPayload ? 'крос-чейн виклик' : 'крос-чейн переказ';
    const bridged =
      x.amount > 0n
        ? `${formatUnits(x.amount.toString(), decimalsOf(x.token), 4)} ${escapeHtml(
            x.tokenSymbol ?? 'токен'
          )}`
        : x.tokenSymbol
        ? escapeHtml(x.tokenSymbol)
        : '';
    return `<a class="tx tx-xc" href="${donutTxUrl(a.txHash)}" target="_blank" rel="noopener" title="Шлюз → ${escapeHtml(
      chain
    )}${x.recipient ? ` · отримувач ${escapeHtml(x.recipient)}` : ''}">
      <span class="tx-dir xc">⇄ CC</span>
      <span class="tx-method">${kind}${tag}</span>
      <span class="tx-counter">→ ${escapeHtml(chain)}${dest}</span>
      <span class="tx-val">${bridged}</span>
      <span class="tx-time">${status}${time}</span>
    </a>`;
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
function boot() {
  buildChainOptions();
  buildExamples();
  wireRepoLink();
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
