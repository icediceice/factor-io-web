// quotes/lib/money.mjs — exact money arithmetic in integer minor units (satang).
//
// No float ever enters arithmetic. Amounts arrive as decimal STRINGS from the
// API/UI ("1250.50"), are parsed into satang integers, and every derived
// number is rounded once, at the satang boundary, HALF-UP (Thai commercial
// practice). Quantities are milli-units (1 day = 1000) so 0.5-day lines stay
// exact; the line subtotal rounds qtyMilli*unitSatang/1000 half-up once.

export const MAX_SAFE_SATANG = Number.MAX_SAFE_INTEGER;

/** Parse a decimal money string ("1250.5", "1250.55") into satang.
 *  Numbers are deliberately refused: money enters as strings or integers,
 *  never as a JS float — a number here is exactly how 0.30000000000000004
 *  bugs are born. */
export function parseSatang(value) {
  if (typeof value === 'number') {
    throw new Error(`invalid money amount: ${value} (send a decimal string, not a number)`);
  }
  const s = String(value ?? '').trim();
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(s)) {
    throw new Error(`invalid money amount: ${JSON.stringify(String(str))} (expected decimal with up to 2 places)`);
  }
  const [major, minor = ''] = s.split('.');
  return Number(major) * 100 + Number((minor + '00').slice(0, 2));
}

/** satang -> "1250.55" (major-unit decimal string, no symbol). */
export function satangToDecimal(satang) {
  const neg = satang < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(satang));
  return `${neg}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Round to nearest satang, halves UP (non-negative money only). */
export function roundSatang(x) {
  return Math.round(x);
}

/** qtyMilli (1000 = one unit) x unitSatang -> line subtotal, rounded once. */
export function lineSubtotal(qtyMilli, unitSatang) {
  const qty = Number(qtyMilli);
  const unit = Number(unitSatang);
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error(`invalid quantity milli-units: ${qtyMilli}`);
  if (!Number.isSafeInteger(unit) || unit < 0) throw new Error(`invalid unit price: ${unitSatang}`);
  const raw = (qty * unit) / 1000; // qtyMilli <= 1e6 & unit <= 5e8 stays safe
  if (!Number.isSafeInteger(Math.ceil(raw * 1000))) throw new Error('line amount overflows safe integer');
  return roundSatang(raw);
}

/** net -> VAT satang at ratePercent (decimal string or number, e.g. "7"). */
export function vatOf(netSatang, ratePercent) {
  return pctOf(netSatang, ratePercent);
}

/** net -> withholding-tax satang at ratePercent (e.g. "3"). */
export function whtOf(netSatang, ratePercent) {
  return pctOf(netSatang, ratePercent);
}

function pctOf(baseSatang, ratePercent) {
  const rate = String(ratePercent ?? '0').trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate)) throw new Error(`invalid rate percent: ${JSON.stringify(String(ratePercent))}`);
  const [whole, frac = ''] = rate.split('.');
  const hundredths = Number(whole) * 100 + Number((frac + '00').slice(0, 2)); // 7 -> 700
  return roundSatang((baseSatang * hundredths) / 10000);
}

/** Convert satang of the quote currency into THB at an exact decimal rate
 *  ("36.50" THB per 1 base). Rate arrives from settings (fx.rate); as_of date
 *  travels alongside and is stamped onto the quotation at creation. */
export function fxToThb(satang, rateStr) {
  const rate = String(rateStr ?? '').trim();
  if (!/^\d{1,8}(\.\d{1,4})?$/.test(rate)) throw new Error(`invalid fx rate: ${JSON.stringify(String(rateStr))}`);
  const [whole, frac = ''] = rate.split('.');
  const scale = 10 ** frac.length;
  const numer = satang * (Number(whole) * scale + Number(frac || '0'));
  return roundSatang(numer / scale);
}

/** "1250.55" + currency display -> "฿1,250.55" (grouping, symbol first). */
export function formatMoney(satang, { symbol = '฿', code = 'THB' } = {}) {
  const s = satangToDecimal(satang);
  const [major, minor] = s.split('.');
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return code === 'THB' ? `${symbol}${grouped}.${minor}` : `${grouped}.${minor} ${code}`;
}

/** Date formatting helpers used by numbering and validity. All Asia/Bangkok. */
export function todayBkk(nowMs = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(nowMs)); // YYYY-MM-DD
}

export function addDaysBkk(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatThaiDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return `${d} ${thMonths[m - 1]} ${y + 543}`;
}

export function formatEnDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const enMonths = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d} ${enMonths[m - 1]} ${y}`;
}