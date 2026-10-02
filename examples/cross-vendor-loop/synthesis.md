# Reconciliation — Opus, over the Sol + Gemini audits

Two independent labs (OpenAI · Google) audited Sonnet's v1. I reconcile them, and I verify every finding
against the oracle (a failing test) before it earns a fix. Findings I judge NOT bugs are dismissed, not obeyed.

## Verified real → fixed  (each has a RED test in ratelimit.edge.test.mjs)
- **CORROBORATED — Inf×0 → NaN**  (Sol #3 + Gemini #2, both labs): `refillPerSec=0` with an Infinity/huge
  elapsed → `accrued = Inf*0 = NaN` → tokens poisoned. Two labs, same bug → highest confidence.
- **NaN clock bypasses the guard**  (Gemini #1; Sol missed): `now()` returning NaN → `NaN <= 0` is false
  → the monotonic guard fails open → NaN poisoning.
- **Sub-epsilon accrual discarded**  (Sol #2; Gemini missed): a refill smaller than float-epsilon at the
  current token magnitude rounds away, yet `_lastRefillMs` still advances → the accrual is lost instead of
  accumulating (R2 says it must persist + add up).
- **Uncountable capacity**  (Sol #1; Gemini missed): `capacity > 2^53` can't be decremented in IEEE-754 →
  the bucket never drains. Reject it at construction.

## Dismissed — correct behavior, not bugs  (judgment over the auditor)
- **R4 "high-water vs last-observed clock"**  (Sol): the high-water mark is *correct* — it stops a backward
  reading from stealing elapsed time. Clarify the spec wording; do NOT change the code.
- **0.3+0.3+0.3 ≠ 0.9 exact**  (Gemini #3): that IS the correct IEEE-754 sum, and a strict `>=` is right.
  An epsilon tolerance would *over-grant* — hand out a token you don't have. Inherent float, not an impl bug.

## Fix plan for Sonnet  (apply ONLY these; do not touch the dismissed items)
1. In `_refill`, change the guard to `if (!(elapsedMs > 0)) return;` (catches NaN AND <= 0), and short-circuit
   `if (this.refillPerSec === 0) return;` (or guard a non-finite `accrued`) so `Inf*0` can never yield NaN.
2. Advance `_lastRefillMs` ONLY when tokens actually increased (skip the advance when the clamped new value
   equals the old), so sub-epsilon elapsed keeps accumulating until it is representable.
3. In the constructor, reject `capacity > Number.MAX_SAFE_INTEGER` with a `RangeError` (uncountable).
4. Keep the strict `tokens >= n` comparison — do NOT add an epsilon. Keep the high-water clock.

Both `ratelimit.test.mjs` (starter) and `ratelimit.edge.test.mjs` (audit-derived) must pass.
