import { ORIGIN_CHAINS, findChain, DONUT, donutAddressUrl, donutTxUrl, type OriginChain } from './chains';
import { deriveUea, toCaip, isPushChain } from './uea';
import {
  getAddressInfo,
  getCounters,
  getTransactions,
  getTokenTransfers,
  isNotFound,
  type Tx,
  type TokenTransfer,
} from './blockscout';
import { shortAddr, formatUnits, formatInt, sumGasWei, timeAgo, nowUtc } from './format';
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

function buildChainOptions() {
  for (const c of ORIGIN_CHAINS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    el.chain.appendChild(opt);
  }
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
      run();
    });
    el.examples.appendChild(b);
  }
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

// ---- Core lookup ----
async function run() {
  const address = el.address.value.trim();
  const chainDef = findChain(el.chain.value);
  if (!address || !chainDef) {
    setStatus('Введіть адресу та оберіть origin-чейн.', 'error');
    return;
  }
  syncUrl(address, chainDef.id);
  el.result.innerHTML = '';
  setStatus('Обчислюю Universal Executor Account…', 'info');

  // Step 1 — derive the UEA deterministically from the origin account (offchain).
  let uea: string;
  let caip: string;
  try {
    uea = deriveUea(chainDef.chain, address);
    caip = toCaip(chainDef.chain, address);
  } catch (e) {
    setStatus(
      `Не вдалося обчислити UEA: ${(e as Error).message} Перевірте, що адреса валідна для обраного чейна.`,
      'error'
    );
    return;
  }

  setStatus('Читаю активність UEA з Push Chain (Donut)…', 'info');

  // Step 2 — pull on-chain activity for the UEA from Blockscout.
  let balanceWei: string | null = null;
  let isContract = false;
  let txCount = '0';
  let tokenXferCount = '0';
  let txs: Tx[] = [];
  let tokenTransfers: TokenTransfer[] = [];
  const warnings: string[] = [];
  let seenByExplorer = true;

  const [infoRes, countersRes, txRes, tokenRes] = await Promise.allSettled([
    getAddressInfo(uea),
    getCounters(uea),
    getTransactions(uea),
    getTokenTransfers(uea),
  ]);

  if (infoRes.status === 'fulfilled') {
    balanceWei = infoRes.value.coin_balance;
    isContract = !!infoRes.value.is_contract;
  } else if (isNotFound(infoRes.reason)) {
    seenByExplorer = false;
  } else {
    warnings.push(`Баланс: ${(infoRes.reason as Error).message}`);
  }

  if (countersRes.status === 'fulfilled') {
    txCount = countersRes.value.transactions_count ?? '0';
    tokenXferCount = countersRes.value.token_transfers_count ?? '0';
  } else if (!isNotFound(countersRes.reason)) {
    warnings.push(`Лічильники: ${(countersRes.reason as Error).message}`);
  }

  if (txRes.status === 'fulfilled') {
    txs = txRes.value;
  } else if (!isNotFound(txRes.reason)) {
    warnings.push(`Транзакції: ${(txRes.reason as Error).message}`);
  }

  if (tokenRes.status === 'fulfilled') {
    tokenTransfers = tokenRes.value;
  } else if (!isNotFound(tokenRes.reason)) {
    warnings.push(`Токен-трансфери: ${(tokenRes.reason as Error).message}`);
  }

  // A deployed UEA is a contract on Push Chain. Activity (balance / txs) is a
  // second, independent signal.
  const deployed = isContract;
  const hasActivity =
    txs.length > 0 ||
    tokenTransfers.length > 0 ||
    (txCount !== '0' && txCount !== '') ||
    (tokenXferCount !== '0' && tokenXferCount !== '') ||
    (balanceWei != null && balanceWei !== '0');

  setStatus('', 'muted');
  renderResult({
    origin: chainDef,
    originAddress: address,
    caip,
    uea,
    deployed,
    hasActivity,
    seenByExplorer,
    balanceWei,
    txCount,
    tokenXferCount,
    txs,
    tokenTransfers,
    warnings,
  });
}

interface ResultModel {
  origin: OriginChain;
  originAddress: string;
  caip: string;
  uea: string;
  deployed: boolean;
  hasActivity: boolean;
  seenByExplorer: boolean;
  balanceWei: string | null;
  txCount: string;
  tokenXferCount: string;
  txs: Tx[];
  tokenTransfers: TokenTransfer[];
  warnings: string[];
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

function renderResult(m: ResultModel) {
  const native = isPushChain(m.origin.chain);
  const ueaLc = m.uea.toLowerCase();
  const outgoing = m.txs.filter((t) => t.from?.hash?.toLowerCase() === ueaLc);
  // Gas the UEA paid on its OWN outgoing transactions. Most UEAs are funded by
  // a relayer, so this is often 0 — we only surface it when it is real.
  const gasWei = sumGasWei(
    outgoing.map((t) => ({ gasUsed: t.gas_used, gasPrice: t.gas_price, fee: t.fee?.value }))
  );

  // Counterparties this UEA exchanged value or tokens with — the "apps" it
  // touched. Built from both normal txs and token transfers; the zero address
  // (mint/burn) and the UEA itself are dropped.
  interface Party {
    addr: string;
    name: string | null;
    isContract: boolean;
    txs: number;
    tokens: number;
  }
  const parties = new Map<string, Party>();
  const touch = (p: { hash?: string; name?: string | null; is_contract?: boolean } | null, kind: 'tx' | 'token') => {
    if (!p || !p.hash) return;
    const lc = p.hash.toLowerCase();
    if (lc === ueaLc || lc === ZERO_ADDR) return;
    const prev = parties.get(lc) ?? { addr: p.hash, name: p.name ?? null, isContract: !!p.is_contract, txs: 0, tokens: 0 };
    if (p.name) prev.name = p.name;
    if (p.is_contract) prev.isContract = true;
    if (kind === 'tx') prev.txs += 1;
    else prev.tokens += 1;
    parties.set(lc, prev);
  };
  for (const t of m.txs) touch(t.from?.hash?.toLowerCase() === ueaLc ? t.to : t.from, 'tx');
  for (const tt of m.tokenTransfers) touch(tt.from?.hash?.toLowerCase() === ueaLc ? tt.to : tt.from, 'token');
  const contacts = [...parties.values()].sort((a, b) => b.txs + b.tokens - (a.txs + a.tokens));

  // Distinct tokens seen flowing through the UEA.
  const tokenSet = new Set(
    m.tokenTransfers.map((tt) => tt.token?.address?.toLowerCase()).filter(Boolean) as string[]
  );

  const statusBadge = m.deployed
    ? `<span class="badge badge-ok">UEA задеплоєний</span>`
    : `<span class="badge badge-pending">UEA ще не задеплоєний</span>`;

  const sdkNote = m.deployed
    ? ''
    : `<p class="hint">Акаунт розгортається «ліниво» — при першій Universal-транзакції з гаманця-власника. Адреса вже зарезервована детерміновано (CREATE2), тож вона не зміниться.</p>`;

  const balance = formatUnits(m.balanceWei, DONUT.nativeDecimals, 4);

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
        <div class="metric-value">${contacts.length}</div>
        <div class="metric-label">Контрагентів/застосунків</div>
      </div>
    </div>`;

  const originLabel = native ? 'Origin = Push Chain (вже тут)' : `Origin (${escapeHtml(m.origin.label)})`;
  const mapping = `
    <div class="mapping">
      <div class="map-node">
        <div class="map-label">${originLabel}</div>
        <div class="map-addr" title="${escapeHtml(m.originAddress)}">${escapeHtml(
    shortAddr(m.originAddress, 10, 8)
  )}</div>
        <div class="map-caip">${escapeHtml(m.caip)}</div>
      </div>
      <div class="map-arrow">→ UEA →</div>
      <div class="map-node map-node-uea">
        <div class="map-label">Universal Executor Account · Push Chain Donut</div>
        <a class="map-addr" href="${donutAddressUrl(m.uea)}" target="_blank" rel="noopener" title="${escapeHtml(
    m.uea
  )}">${escapeHtml(shortAddr(m.uea, 12, 10))} ↗</a>
      </div>
    </div>`;

  const contactsHtml = contacts.length
    ? `<section class="block">
        <h3>Контрагенти та застосунки, з якими взаємодіяв UEA</h3>
        <ul class="contacts">
          ${contacts
            .slice(0, 20)
            .map((p) => {
              const parts: string[] = [];
              if (p.txs) parts.push(`${p.txs} tx`);
              if (p.tokens) parts.push(`${p.tokens} токен`);
              return `<li>
                <a href="${donutAddressUrl(p.addr)}" target="_blank" rel="noopener">${escapeHtml(
                p.name || shortAddr(p.addr, 10, 8)
              )} ↗</a>
                ${p.isContract ? '<span class="tag">контракт</span>' : ''}
                <span class="count">${parts.join(' · ')}</span>
              </li>`;
            })
            .join('')}
        </ul>
        <p class="hint">Пораховано з останніх завантажених транзакцій і токен-трансферів (до 50 кожного).</p>
      </section>`
    : '';

  const tokenHtml = m.tokenTransfers.length
    ? `<section class="block">
        <h3>Токени, що проходили через UEA</h3>
        <div class="tx-list">
          ${m.tokenTransfers
            .slice(0, 20)
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
      } · показано до 20 останніх трансферів.</p>
      </section>`
    : '';

  const gasHtml =
    gasWei !== '0'
      ? `<p class="hint">Газ, сплачений власними транзакціями UEA: ${formatUnits(
          gasWei,
          DONUT.nativeDecimals,
          6
        )} PC (за ${outgoing.length} вихідних tx). UEA зазвичай фінансує релеєр, тож часто це 0.</p>`
      : '';

  const txHtml = m.txs.length
    ? `<section class="block">
        <h3>Останні транзакції UEA</h3>
        <div class="tx-list">
          ${m.txs
            .slice(0, 25)
            .map((t) => {
              const out = t.from?.hash?.toLowerCase() === m.uea.toLowerCase();
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
    : m.hasActivity
    ? ''
    : `<section class="block empty">
        <h3>Поки немає активності на Donut</h3>
        <p>Blockscout не бачить транзакцій цього UEA. Для зовнішнього гаманця це нормально: UEA
        з'явиться при першій Universal-транзакції. Адреса вже обчислена й зарезервована.</p>
      </section>`;

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
      ${sdkNote}
      ${metrics}
      ${gasHtml}
      ${contactsHtml}
      ${tokenHtml}
      ${txHtml}
      ${warningsHtml}
      <p class="source">Адреса UEA — offchain CREATE2 (алгоритм @pushchain/core) · активність з Blockscout (${escapeHtml(
        DONUT.explorer
      )}) · ${nowUtc()}</p>
    </div>`;
}

// On GitHub Pages the repo link can be derived from the URL
// (<user>.github.io/<repo>/). Locally there is no repo, so we just leave the
// label as plain text instead of a dangling "#".
function wireRepoLink() {
  const a = document.getElementById('repo-link') as HTMLAnchorElement | null;
  if (!a) return;
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (m && repo) {
    a.href = `https://github.com/${m[1]}/${repo}`;
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
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });

  const { address, chain } = readUrl();
  if (address) {
    el.address.value = address;
    if (chain && findChain(chain)) el.chain.value = chain;
    run();
  } else {
    el.chain.value = 'eth-sepolia';
  }
}

boot();
