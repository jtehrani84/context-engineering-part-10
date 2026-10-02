# Adversarial audit — Gemini (Google)   ·   governed: egress ok · voice CLEAN

Here is the adversarial audit of the `RateLimiter` implementation:

**[Major] R4/R8 — Injected clock returning `NaN` bypasses the monotonic guard and poisons state**
- **Scenario:** The injected `now()` function returns `NaN` (or a value that coerces to `NaN`, like `undefined`). `elapsedMs` evaluates to `NaN`. Because `NaN <= 0` evaluates to `false` in JavaScript, the `if (elapsedMs <= 0) return;` guard is bypassed. `accrued` becomes `NaN`, and `this.tokens = Math.min(capacity, this.tokens + NaN)` becomes `NaN`. 
- **Expected:** Treat as 0 elapsed / fail-safe; never corrupt state (R4), stay finite and correct (R8).
- **Actual:** The monotonic guard fails open. `this.tokens` is permanently corrupted to `NaN`, causing all subsequent `tryRemove` calls to fail. *(Fix: Use `if (!(elapsedMs > 0)) return;` to safely catch `NaN`).*

**[Major] R8 — Huge elapsed gap (`Infinity`) combined with `0` refill rate evaluates to `NaN`**
- **Scenario:** `capacity = 10`, `refillPerSec = 0`. The injected clock returns `Infinity` (representing an arbitrarily huge elapsed gap). `elapsedMs` becomes `Infinity`. The accrual calculation is `(Infinity / 1000) * 0`, which evaluates to `NaN` in JavaScript. `Math.min(10, NaN)` evaluates to `NaN`.
- **Expected:** Tokens remain `10`, staying finite and correct (R8).
- **Actual:** Tokens become `NaN`, permanently corrupting the rate limiter state. 

**[Minor] R2/R8 — IEEE 754 precision loss breaks exact fractional token removal**
- **Scenario:** `capacity = 1`, `refillPerSec = 0.3`, starting with `tokens = 0`. Wait exactly 3 seconds in three 1-second steps (e.g., triggering `_refill` each second). `accrued` adds `0.3` three times. Due to JavaScript floating-point math, `0.3 + 0.3 + 0.3 = 0.8999999999999999`. A subsequent call to `tryRemove(0.9)` is made.
- **Expected:** Returns `true` (exactly 0.9 tokens were accrued over 3 seconds, so `tokens >= n`).
- **Actual:** Returns `false` because `0.8999999999999999 >= 0.9` is false. Fractional accumulation strictly fails exact domain-logic checks due to the lack of an epsilon boundary or integer scaling.
