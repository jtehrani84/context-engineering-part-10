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

    // R4: elapsed <= 0 means the clock stalled or moved backwards relative
    // to our high-water mark. Treat elapsed as 0 — add nothing, and do NOT
    // advance the high-water mark, so a later/correct forward reading is
    // still measured from the last known-good instant (never double-counted,
    // never shortchanged, and tokens can't be corrupted).
    if (elapsedMs <= 0) return;

    const accrued = (elapsedMs / 1000) * this.refillPerSec;
    // R3/R8: clamp to capacity on every refill — handles huge idle gaps and
    // huge/fractional refillPerSec without ever exceeding capacity or
    // producing NaN (accrued is always finite: elapsedMs > 0 here and
    // refillPerSec was validated finite/non-negative in the constructor).
    this.tokens = Math.min(this.capacity, this.tokens + accrued);
    this._lastRefillMs = nowMs;
  }
}
