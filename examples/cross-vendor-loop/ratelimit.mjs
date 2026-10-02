// ratelimit.mjs — Token-bucket rate limiter with an injectable clock.
//
// Design notes on the timing math (R2, R3, R4, R8):
//   - `tokens` is stored as a floating-point number and NEVER floored between
//     calls, so sub-token refill amounts accumulate correctly across many
//     small time steps (R2 — fractional refill must persist and add up).
//   - `_lastRefillMs` is a "high-water mark": it only ever moves FORWARD.
//     Every refill computes `elapsedMs = now() - _lastRefillMs`. If that is
//     <= 0 (clock stalled or went backwards), we add zero tokens and leave
//     `_lastRefillMs` untouched — so a backward/stalled reading can never
//     "steal" elapsed time from a later, correct forward reading, and can
//     never corrupt state or drive tokens negative (R4).
//   - The accrued amount is clamped with Math.min(capacity, ...) on every
//     refill, so an arbitrarily long idle gap (or a huge refillPerSec) can
//     never push tokens past capacity, and stays finite (R3, R8).

export class RateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.capacity - max tokens (the burst ceiling), >= 0.
   * @param {number} opts.refillPerSec - tokens added per second, >= 0 (fractional OK).
   * @param {() => number} [opts.now] - clock returning milliseconds. Defaults to Date.now.
   *   ALL timing derives from this — no reliance on real wall-clock time.
   */
  constructor({ capacity, refillPerSec, now = Date.now } = {}) {
    if (!Number.isFinite(capacity) || capacity < 0) {
      throw new RangeError(`capacity must be a finite number >= 0, got ${capacity}`);
    }
    // FIX 3 (Sol#1 — uncountable capacity): beyond Number.MAX_SAFE_INTEGER,
    // IEEE-754 doubles can't represent every integer, so `tokens -= n` can
    // silently fail to decrement and the bucket never drains. Reject it here
    // instead of letting it corrupt state later.
    if (capacity > Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`capacity must be <= Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}) — beyond that it is uncountable in IEEE-754, got ${capacity}`);
    }
    if (!Number.isFinite(refillPerSec) || refillPerSec < 0) {
      throw new RangeError(`refillPerSec must be a finite number >= 0, got ${refillPerSec}`);
    }
    if (typeof now !== 'function') {
      throw new TypeError('now must be a function returning milliseconds');
    }

    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this._now = now;

    // R1 — a fresh limiter starts with exactly `capacity` tokens.
    this.tokens = capacity;
    // High-water mark for the last instant we successfully accrued tokens.
    this._lastRefillMs = now();
  }

  /**
   * Attempt to remove `n` tokens. Refills first (based on elapsed time since
   * the last refill), then checks availability. No partial consumption: it
   * either removes all `n` tokens and returns true, or removes nothing and
   * returns false.
   *
   * @param {number} [n=1] - tokens to remove, >= 0.
   * @returns {boolean} true if `n` tokens were available and were removed.
   */
  tryRemove(n = 1) {
    // Defensive guard: NaN/Infinity/negative `n` are not valid removal
    // amounts. The spec only promises "does not throw for valid numeric
    // inputs," so for anything else we fail closed — return false without
    // touching state — rather than throw. This also guards a real
    // correctness bug: without it, a negative `n` would pass the
    // `tokens >= n` check below and then `tokens -= n` would ADD tokens,
    // silently violating the capacity invariant (R3/R6).
    if (!Number.isFinite(n) || n < 0) return false;

    this._refill();

    // R6: n > capacity is unsatisfiable because tokens can never exceed
    // capacity (enforced in _refill's clamp), so no special case is needed
    // — the comparison below already covers it, and tokens never goes
    // negative since we only subtract when tokens >= n.
    // R7: n === 0 falls through the same path: tokens is always >= 0, so
    // `tokens >= 0` is trivially true and subtracting 0 is a no-op.
    //
    // FIX 4 (dismissed findings — Sol's high-water-mark critique + Gemini#3's
    // 0.3+0.3+0.3 float-sum): both audits flagged this strict `>=` and the
    // high-water clock in _refill as suspect. Reconciliation judged both
    // correct behavior, not bugs — an epsilon tolerance here would OVER-GRANT
    // (hand out a token that isn't actually available), so the comparison
    // stays exactly as strict as it was.
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /**
   * Refill tokens based on elapsed time since the last refill. Internal —
   * not part of the public API.
   */
  _refill() {
    const nowMs = this._now();
    const elapsedMs = nowMs - this._lastRefillMs;

    // R4 + FIX 1 (Gemini#1 — NaN clock bypasses the guard): the original
    // `elapsedMs <= 0` check let a NaN reading slip through, because
    // `NaN <= 0` is false — the guard failed OPEN instead of closed.
    // `!(elapsedMs > 0)` catches <= 0 AND NaN in a single guard: a NaN
    // elapsed (from a NaN clock reading) is now treated exactly like a
    // stalled/backward clock — add nothing, do not advance the high-water
    // mark, so a later/correct forward reading is still measured from the
    // last known-good instant.
    if (!(elapsedMs > 0)) return;

    // FIX 1 (Sol#3 + Gemini#2 — Inf×0 = NaN, corroborated by both audits):
    // with refillPerSec === 0, no elapsed time — however large, even an
    // overflowed/Infinity gap — can ever add a token. Short-circuit before
    // the multiply so `Infinity * 0` never gets a chance to produce NaN and
    // poison `tokens`.
    if (this.refillPerSec === 0) return;

    const accrued = (elapsedMs / 1000) * this.refillPerSec;
    // R3/R8: clamp to capacity on every refill — handles huge idle gaps and
    // huge/fractional refillPerSec without ever exceeding capacity or
    // producing NaN (accrued is always finite: elapsedMs > 0 here and
    // refillPerSec was validated finite/non-negative and non-zero above).
    const nextTokens = Math.min(this.capacity, this.tokens + accrued);

    // FIX 2 (Sol#2 — sub-epsilon accrual discarded): only advance the
    // high-water mark when tokens actually changed value. If `accrued` was
    // too small to move `tokens` at its current float magnitude, leave
    // `_lastRefillMs` where it was — the NEXT refill's `elapsedMs` then
    // still includes this interval, so the accrual keeps accumulating
    // across calls instead of being silently lost.
    if (nextTokens === this.tokens) return;

    this.tokens = nextTokens;
    this._lastRefillMs = nowMs;
  }
}
