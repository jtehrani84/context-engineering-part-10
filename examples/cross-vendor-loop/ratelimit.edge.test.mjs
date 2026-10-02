// Audit-derived oracle — each test encodes ONE real finding from the cross-vendor audit, written to FAIL
// against v1 and pass only once the verified fix lands. The oracle decides truth, not the auditor's say-so.
import { RateLimiter } from './ratelimit.mjs';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); } else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}`); } };
const clock = (t = 0) => { const o = { t }; o.now = () => o.t; o.set = (v) => { o.t = v; }; return o; };

console.log('RateLimiter — audit-derived edge oracle');

// Sol #3 [R8] — Infinity elapsed × refillPerSec 0 = NaN must not poison tokens.
{ const times = [-Number.MAX_VALUE, Number.MAX_VALUE]; let i = 0; const now = () => times[Math.min(i++, 1)];
  const rl = new RateLimiter({ capacity: 1, refillPerSec: 0, now });
  ok('Sol#3 R8: no NaN from Infinity*0 refill (still removes the initial token)', rl.tryRemove(1) === true); }

// Sol #2 [R2] — sub-epsilon accrual must accumulate, not be silently discarded when the clock advances.
{ const c = clock(0); const rl = new RateLimiter({ capacity: 2, refillPerSec: 1e-16, now: c.now });
  rl.tryRemove(1);                                          // tokens = 1.0
  for (let k = 1; k <= 10; k++) { c.set(k * 1000); rl.tryRemove(0); }  // ten 1s steps, each accrues 1e-16
  ok('Sol#2 R2: sub-epsilon refill accumulated across steps (tokens rose above 1)', rl.tokens > 1); }

// Sol #1 [R8/R6] — a capacity beyond safe-integer precision can't be counted, so it must be rejected.
{ let threw = false; try { new RateLimiter({ capacity: 1e16, refillPerSec: 0, now: () => 0 }); } catch { threw = true; }
  ok('Sol#1 R8: capacity beyond MAX_SAFE_INTEGER is rejected as uncountable', threw === true); }

// Gemini #1 [R4/R8] — a NaN clock reading must not bypass the monotonic guard (NaN<=0 is false → fails open).
{ const times = [0, NaN]; let i = 0; const now = () => times[Math.min(i++, 1)];
  const rl = new RateLimiter({ capacity: 3, refillPerSec: 1, now });
  ok('Gemini#1 R4: NaN clock does not poison tokens (removal still works)', rl.tryRemove(1) === true); }

console.log(`\n${fail === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
