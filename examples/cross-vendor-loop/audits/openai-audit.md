# Adversarial audit — Sol (OpenAI)   ·   governed: egress ok · voice CLEAN

1. [critical] R8 — capacity=1e16, refillPerSec=0, tryRemove(1) repeatedly: `1e16 - 1` rounds back to
   `1e16` in IEEE-754, so tokens never decrement — requests succeed forever without consuming.
2. [major] R2 — capacity=2, refillPerSec=1e-16: each refill adds a sub-epsilon amount that rounds away
   at the current token magnitude, but `_lastRefillMs` still advances — so the accrual is permanently
   discarded instead of accumulating (R2 says sub-token refill must persist + add up).
3. [major] R5/R8 — refillPerSec=0 with an Infinity elapsed (pathological clock): accrued = Infinity * 0
   = NaN, poisoning `tokens` → NaN, every call returns false. R8 says no NaN.
4. [minor] R8 — denormal refillPerSec (1e-323): same root cause as #2 — each increment underflows to 0
   and is discarded when the timestamp advances.

Spec ambiguities:
- R4: "last observed time" reads as "update after every clock reading"; the impl keeps a high-water mark.
  The high-water behavior is likely intended (avoids double-counting) — clarify wording to "last accepted forward time."
- R8: exact correctness for every finite JS number is impossible in IEEE-754; the spec needs magnitude/precision bounds.
