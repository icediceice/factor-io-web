import { test } from "node:test";
import assert from "node:assert/strict";
import { Dec, Rat, formatHalfUp, cmpMoney, parseJSONExact, sumMoney, minMoney, ZERO } from "../exact.js";

// F10 — Decimal exactness (SPEC 12.4): canonical money battery; zero IEEE-754 artifacts.
test("F10: 0.1 + 0.2 equals exactly 0.3", () => {
  assert.equal(Dec.from("0.1").add(Dec.from("0.2")).toString(), "0.3");
  assert.ok(Dec.from("0.1").add(Dec.from("0.2")).eq(Dec.from("0.3")));
});

test("F10: token-count x per-token price at scale is exact", () => {
  // 3,365-entry feeds carry 8dp prices; a 1B-token month must not drift.
  const total = Dec.from("0.00000022").mul(BigInt("1000000000"));
  assert.equal(total.toString(), "220");
  const tiny = Dec.from("0.0000000075").mul(BigInt("987654321"));
  assert.equal(tiny.toString(), "7.4074074075");
});

test("F10: repeated addition accumulates with zero drift", () => {
  let acc = ZERO;
  for (let i = 0; i < 1000; i++) acc = acc.add(Dec.from("0.1"));
  assert.equal(acc.toString(), "100");
});

test("F10: canonical serialization — 0.10 and 0.1 are byte-identical", () => {
  assert.equal(Dec.from("0.10").toString(), Dec.from("0.1").toString());
  assert.equal(Dec.from("2.50").toString(), "2.5");
  assert.equal(JSON.stringify({ m: Dec.from("12.50") }), '{"m":"12.5"}');
});

test("F10: exponent-notation feed literals parse exactly", () => {
  assert.equal(Dec.from("5e-8").toString(), "0.00000005");
  assert.equal(Dec.from("2.5e-7").toString(), "0.00000025");
  assert.equal(Dec.from("1e-7").toString(), "0.0000001");
});

test("money paths reject IEEE-754 numbers outright", () => {
  assert.throws(() => Dec.from(0.1), TypeError);
  assert.throws(() => Rat.from(0.3), TypeError);
  assert.throws(() => formatHalfUp(0.1, 2), TypeError);
});

// The peer review's load-bearing case: Rational 1/3 must compare strictly
// GREATER than decimal 0.333333331 even though both round to 0.33333333 at 8dp.
test("Rational ordering survives where rounded decimals would tie", () => {
  const third = Rat.of(1n, 3n);
  const below = Dec.from("0.333333331");
  assert.equal(third.gt(below), true, "1/3 must be strictly greater than 0.333333331");
  assert.equal(formatHalfUp(third, 8), "0.33333333");
  assert.equal(formatHalfUp(below, 8), "0.33333333"); // same display — different number
  assert.equal(cmpMoney(third, below), 1);
});

test("Rational reduces on construction — identity is canonical", () => {
  assert.equal(Rat.of(2n, 6n).toString(), "1/3");
  assert.equal(Rat.of(10n, 4n).toString(), "5/2");
  assert.ok(Rat.of(2n, 6n).eq(Rat.of(1n, 3n)));
  assert.equal(Rat.of(-3n, -6n).toString(), "1/2"); // negative/negative, reduced
});

test("Rational arithmetic stays exact through quotients", () => {
  // Lane C: $1/hr at 3 tok/hr amortizes to exactly 1/3 $/tok.
  const perTok = Rat.from(Dec.from("1")).div(Dec.from("3"));
  assert.equal(perTok.toString(), "1/3");
  // Breakeven: 10000 fixed / 0.01 per tok / 1M = 1B tok... 10000/0.01 = 1,000,000.
  const be = Rat.from(Dec.from("10000")).div(Dec.from("0.01"));
  assert.equal(be.toString(), "1000000/1"); // reduced canonical form of the exact integer
  assert.ok(be.eq(Rat.of(1000000n, 1n)));
});

test("formatHalfUp is half-away-from-zero and is the only rounding API", () => {
  assert.equal(formatHalfUp(Dec.from("2.675"), 2), "2.68");
  assert.equal(formatHalfUp(Dec.from("2.674"), 2), "2.67");
  assert.equal(formatHalfUp(Dec.from("2.5"), 0), "3");
  assert.equal(formatHalfUp(Dec.from("3.5"), 0), "4");
  assert.equal(formatHalfUp(Dec.from("-2.5"), 0), "-3");
  assert.equal(formatHalfUp(Dec.from("-0.125"), 2), "-0.13");
  assert.equal(formatHalfUp(Rat.of(1n, 3n), 2), "0.33");
  assert.equal(formatHalfUp(Rat.of(2n, 3n), 2), "0.67");
  assert.equal(formatHalfUp(Dec.from("5"), 4), "5.0000");
  assert.equal(formatHalfUp(ZERO, 2), "0.00");
});