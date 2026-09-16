// quotes/tests/money.test.mjs — exact satang arithmetic contracts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSatang, satangToDecimal, lineSubtotal, vatOf, whtOf, fxToThb,
  formatMoney, addDaysBkk, formatThaiDate, formatEnDate,
} from '../lib/money.mjs';

describe('parsing', () => {
  test('decimal strings parse exactly to satang', () => {
    assert.equal(parseSatang('0'), 0);
    assert.equal(parseSatang('1250.5'), 125050);
    assert.equal(parseSatang('1250.55'), 125055);
    assert.equal(parseSatang('999999999.99'), 99999999999);
  });
  test('floats, negatives, junk and >2dp are refused', () => {
    assert.throws(() => parseSatang(1250.55), /invalid money/);
    assert.throws(() => parseSatang('-1'), /invalid money/);
    assert.throws(() => parseSatang('1.999'), /invalid money/);
    assert.throws(() => parseSatang('12,50'), /invalid money/);
    assert.throws(() => parseSatang(''), /invalid money/);
    assert.throws(() => parseSatang('abc'), /invalid money/);
  });
  test('round-trip decimal <-> satang', () => {
    for (const s of ['0.00', '0.01', '7.00', '36.50', '123456789.12']) {
      assert.equal(satangToDecimal(parseSatang(s)), s);
    }
  });
});

describe('line subtotal', () => {
  test('whole quantities are exact', () => {
    assert.equal(lineSubtotal(1000, 500000), 500000);       // 1 day @ 5,000 THB
    assert.equal(lineSubtotal(3000, 123456), 370368);       // 3 days
  });
  test('half-day rounds once at the satang boundary, HALF-UP', () => {
    assert.equal(lineSubtotal(500, 100001), 50001);         // 0.5 x 1000.01 = 500.005 -> 50001
    assert.equal(lineSubtotal(500, 100003), 50002);         // 500.015 -> 50002
  });
  test('refuses zero/negative qty or negative price', () => {
    assert.throws(() => lineSubtotal(0, 100), /invalid quantity/);
    assert.throws(() => lineSubtotal(-500, 100), /invalid quantity/);
    assert.throws(() => lineSubtotal(1000, -1), /invalid unit price/);
  });
});

describe('percentages', () => {
  test('VAT 7% halves-up on odd satang', () => {
    assert.equal(vatOf(10000, '7'), 700);
    assert.equal(vatOf(101, '7'), 8);      // 7.07 -> 707 satang? no: 101*0.07=7.07 -> 7
    assert.equal(vatOf(101, '7'), 7);
  });
  test('VAT handles fractional percent strings', () => {
    assert.equal(vatOf(10000, '7.5'), 750);
    assert.equal(vatOf(9999, '7'), 700);   // 699.93 -> 700
  });
  test('WHT 3% on net (pre-VAT)', () => {
    assert.equal(whtOf(10700, '3'), 321);  // on net 10700, not on grand
    assert.equal(whtOf(1, '3'), 0);        // 0.03 -> 0
    assert.equal(whtOf(100, '3'), 3);
  });
  test('refuses junk rates', () => {
    assert.throws(() => vatOf(100, 'seven'), /invalid rate/);
    assert.throws(() => whtOf(100, '-3'), /invalid rate/);
  });
});

describe('fx', () => {
  test('USD quote converts to THB at the exact settings rate', () => {
    assert.equal(fxToThb(100000, '36.5'), 3650000);   // 1,000.00 USD
    assert.equal(fxToThb(100001, '36.5'), 3650037);   // rounds once at boundary
    assert.equal(fxToThb(50000, '36.505'), 1825250);  // 4dp rate scale
  });
  test('refuses junk fx', () => {
    assert.throws(() => fxToThb(100, ''), /invalid fx rate/);
    assert.throws(() => fxToThb(100, 'x'), /invalid fx rate/);
  });
});

describe('formatting + dates', () => {
  test('money display groups thousands with the symbol from settings', () => {
    assert.equal(formatMoney(12505500), '฿125,055.00');
    assert.equal(formatMoney(5, { symbol: '฿' }), '฿0.05');
    assert.equal(formatMoney(100000, { code: 'USD' }), '1,000.00 USD');
  });
  test('validity date arithmetic', () => {
    assert.equal(addDaysBkk('2026-09-16', 15), '2026-10-01');
    assert.equal(addDaysBkk('2026-01-31', 1), '2026-02-01');
  });
  test('bilingual dates: Buddhist era for TH', () => {
    assert.equal(formatEnDate('2026-09-16'), '16 September 2026');
    assert.equal(formatThaiDate('2026-09-16'), '16 กันยายน 2569');
  });
});