// exact.js — exact money arithmetic for the TCO calculator (SPEC §3.5).
//
// Two types, one rule: IEEE-754 never touches a money path.
//   Decimal — BigInt coefficient × 10^-scale, for values that ARE decimals:
//             feed prices, sums, products (tariff × token count is exact).
//   Rational — BigInt n/d reduced by gcd ON CONSTRUCTION, for every QUOTIENT:
//             cost-per-1M, hourly amortization, utilization, breakeven.
//             Reduction on construct is load-bearing: distinct rationals that
//             compare equal must serialize identically (SPEC 10.1), and 1/3
//             must stay strictly greater than any decimal below it — rounding
//             BEFORE comparison loses ordering.
//
// formatHalfUp is the ONLY rounding API, applied at display/export boundaries.
// JS `number` arguments are rejected on every money entry point: quantities
// (token counts, hours) may arrive as numbers, money never does.

const throwOnNumber = (v, label) => {
  if (typeof v === "number") throw new TypeError(`${label}: IEEE-754 number on a money path is rejected — pass a decimal string, BigInt, Dec or Rat`);
  return v;
};

const CZ = 0n;

function gcd(a, b) {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a < 0n ? -a : a;
}

export class Dec {
  constructor(c, s) {
    if (typeof c !== "bigint" || typeof s !== "bigint") throw new TypeError("Dec: coefficient and scale must be BigInt");
    if (s < CZ) throw new TypeError("Dec: scale must be >= 0");
    // Canonical form: strip trailing zeros so equal values are byte-identical (SPEC 10.1).
    while (s > CZ && c % 10n === CZ) {
      c /= 10n;
      s -= 1n;
    }
    if (c === CZ) s = CZ; // no -0
    this.c = c;
    this.s = s;
    Object.freeze(this);
  }

  static from(v) {
    throwOnNumber(v, "Dec.from");
    if (v instanceof Dec) return v;
    if (typeof v === "bigint") return new Dec(v, CZ);
    if (typeof v === "string") return decFromString(v);
    if (v instanceof Rat) throw new TypeError("Dec.from: a non-terminating Rational cannot become a Decimal — use formatHalfUp for display");
    throw new TypeError(`Dec.from: unsupported value ${typeof v}`);
  }

  add(o) {
    const d = Dec.from(o);
    const s = this.s > d.s ? this.s : d.s;
    return new Dec(scale(this.c, this.s, s) + scale(d.c, d.s, s), s);
  }

  sub(o) {
    const d = Dec.from(o);
    const s = this.s > d.s ? this.s : d.s;
    return new Dec(scale(this.c, this.s, s) - scale(d.c, d.s, s), s);
  }

  mul(o) {
    const d = Dec.from(o);
    return new Dec(this.c * d.c, this.s + d.s);
  }

  // Exact decimal division; throws on non-terminating quotients — for those, use Rat.div.
  div(o) {
    const d = Dec.from(o);
    if (d.c === CZ) throw new RangeError("Dec.div: division by zero — guard the zero domain at the call site");
    const n = this.c * pow10(d.s);
    let q = n / d.c;
    if (q * d.c !== n) throw new RangeError("Dec.div: non-terminating quotient — use Rat for quotients");
    let s = this.s - d.s;
    while (s < CZ) {
      q *= 10n;
      s += 1n;
    }
    return new Dec(q, s);
  }

  neg() { return new Dec(-this.c, this.s); }
  abs() { return this.c < CZ ? this.neg() : this; }
  isZero() { return this.c === CZ; }
  sign() { return this.c < CZ ? -1 : this.c === CZ ? 0 : 1; }

  cmp(o) { return cmpMoney(this, o); }
  eq(o) { return this.cmp(o) === 0; }
  lt(o) { return this.cmp(o) < 0; }
  le(o) { return this.cmp(o) <= 0; }
  gt(o) { return this.cmp(o) > 0; }
  ge(o) { return this.cmp(o) >= 0; }

  // Canonical plain decimal string — the JSON form of every money value.
  toString() {
    if (this.s === CZ) return this.c.toString();
    const digits = this.c.toString();
    const neg = digits.startsWith("-");
    const mag = neg ? digits.slice(1) : digits;
    if (BigInt(mag.length) <= this.s) {
      const padded = "0".repeat(Number(this.s - BigInt(mag.length))) + mag;
      return (neg ? "-0." : "0.") + padded;
    }
    const cut = mag.length - Number(this.s);
    return (neg ? "-" : "") + mag.slice(0, cut) + "." + mag.slice(cut);
  }

  toJSON() { return this.toString(); }
}

export class Rat {
  constructor(n, d) {
    if (typeof n !== "bigint" || typeof d !== "bigint") throw new TypeError("Rat: numerator and denominator must be BigInt");
    if (d === CZ) throw new RangeError("Rat: zero denominator — guard the zero domain at the call site");
    if (d < CZ) { n = -n; d = -d; }
    const g = gcd(n, d); // reduce ON CONSTRUCTION — load-bearing for identity (SPEC 10.1)
    if (g > 1n) { n /= g; d /= g; }
    this.n = n;
    this.d = d;
    Object.freeze(this);
  }

  static of(n, d) { return new Rat(BigInt(n), BigInt(d)); }

  static from(v) {
    throwOnNumber(v, "Rat.from");
    if (v instanceof Rat) return v;
    if (v instanceof Dec) return new Rat(v.c, pow10(v.s));
    if (typeof v === "bigint") return new Rat(v, 1n);
    if (typeof v === "string") return Rat.from(Dec.from(v));
    throw new TypeError(`Rat.from: unsupported value ${typeof v}`);
  }

  add(o) { const r = Rat.from(o); return new Rat(this.n * r.d + r.n * this.d, this.d * r.d); }
  sub(o) { const r = Rat.from(o); return new Rat(this.n * r.d - r.n * this.d, this.d * r.d); }
  mul(o) { const r = Rat.from(o); return new Rat(this.n * r.n, this.d * r.d); }

  div(o) {
    const r = Rat.from(o);
    if (r.n === CZ) throw new RangeError("Rat.div: division by zero — guard the zero domain at the call site");
    return new Rat(this.n * r.d, this.d * r.n);
  }

  neg() { return new Rat(-this.n, this.d); }
  abs() { return this.n < CZ ? this.neg() : this; }
  isZero() { return this.n === CZ; }
  sign() { return this.n < CZ ? -1 : this.n === CZ ? 0 : 1; }

  cmp(o) { return cmpMoney(this, o); }
  eq(o) { return this.cmp(o) === 0; }
  lt(o) { return this.cmp(o) < 0; }
  le(o) { return this.cmp(o) <= 0; }
  gt(o) { return this.cmp(o) > 0; }
  ge(o) { return this.cmp(o) >= 0; }

  toString() { return `${this.n}/${this.d}`; } // provenance form; display goes through formatHalfUp
  toJSON() { return this.toString(); }
}