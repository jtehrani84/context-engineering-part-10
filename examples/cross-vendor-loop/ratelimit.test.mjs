// The ORACLE — the token bucket's test suite. Starter: happy-path only. The cross-vendor audit will
// surface uncovered edges; each real finding becomes a new failing test HERE before any fix is written.
import { RateLimiter } from './ratelimit.mjs';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); } else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}`); } };
// injectable, controllable clock (ms)
const clock = (t = 0) => { const o = { t }; o.now = () => o.t; o.set = (v) => { o.t = v; }; return o; };

console.log('RateLimiter — oracle');

// R1 — starts full
{ const c = clock(0); const rl = new RateLimiter({ capacity: 5, refillPerSec: 1, now: c.now });
  ok('R1 starts full: five 1-token removes succeed', [1,1,1,1,1].every(() => rl.tryRemove(1)));
  ok('R1 sixth remove denied when empty', rl.tryRemove(1) === false); }

// basic refill after time
{ const c = clock(0); const rl = new RateLimiter({ capacity: 10, refillPerSec: 2, now: c.now });
  for (let i = 0; i < 10; i++) rl.tryRemove(1);           // drain
  c.set(1000);                                            // +1s → +2 tokens
  ok('refill: 2 tokens after 1s', rl.tryRemove(2) === true);
  ok('refill: no 3rd token', rl.tryRemove(1) === false); }

// R3 — refill caps at capacity
{ const c = clock(0); const rl = new RateLimiter({ capacity: 3, refillPerSec: 100, now: c.now });
  rl.tryRemove(3); c.set(100000);                         // huge idle gap
  ok('R3 caps at capacity (3 available, not more)', rl.tryRemove(3) === true && rl.tryRemove(1) === false); }

console.log(`\n${fail === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
