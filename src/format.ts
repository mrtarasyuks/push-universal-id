// Small formatting helpers. All on-chain amounts are integer wei strings, so we
// format them by hand to avoid float rounding.

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return '';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Format an integer wei string into a human amount with `decimals` places. */
export function formatUnits(wei: string | null | undefined, decimals = 18, maxFrac = 4): string {
  if (wei == null || wei === '') return '0';
  let neg = false;
  let s = wei.trim();
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  if (!/^\d+$/.test(s)) return '0';
  s = s.padStart(decimals + 1, '0');
  const intPart = s.slice(0, s.length - decimals).replace(/^0+(?=\d)/, '');
  let frac = s.slice(s.length - decimals);
  frac = frac.slice(0, maxFrac).replace(/0+$/, '');
  const whole = groupThousands(intPart || '0');
  return (neg ? '-' : '') + (frac ? `${whole}.${frac}` : whole);
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatInt(n: string | number | null | undefined): string {
  if (n == null || n === '') return '0';
  const s = String(n);
  if (!/^\d+$/.test(s)) return s;
  return groupThousands(s);
}

/** Sum of (gas_used * gas_price) over txs, returned as a wei string. */
export function sumGasWei(pairs: Array<{ gasUsed?: string | null; gasPrice?: string | null; fee?: string | null }>): string {
  let total = 0n;
  for (const p of pairs) {
    if (p.fee && /^\d+$/.test(p.fee)) {
      total += BigInt(p.fee);
    } else if (p.gasUsed && p.gasPrice && /^\d+$/.test(p.gasUsed) && /^\d+$/.test(p.gasPrice)) {
      total += BigInt(p.gasUsed) * BigInt(p.gasPrice);
    }
  }
  return total.toString();
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} с тому`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} хв тому`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн тому`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function nowUtc(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** A short human duration in Ukrainian from a count of seconds (for the bridge
 * time between the Push-side send and the destination-chain settlement). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m} хв ${rem} с` : `${m} хв`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h} год ${mm} хв` : `${h} год`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d} дн ${hh} год` : `${d} дн`;
}
