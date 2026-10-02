# Cross-Vendor Build Loop: The Real Spec, Audits, and Revised Plan

A colleague asked me for the final spec from the cross-vendor build loop in my demo video, so this folder has the real files from that run. If you only open one, open `synthesis.md`, since that's the plan Sonnet built the fix from.

Apart from saving v2 as `ratelimit.mjs` (both test suites import that name), the audit files are the only place I changed anything. The raw Gemini and Grok captures had terminal banners and gateway prefixes on the model names, so I cut those and gave the Gemini audit a header to match the OpenAI one. I left the model versions off both headers too, and `audits/grok-timeout.md` is a note I wrote myself.

## What's in the Folder

| File | What it is |
|---|---|
| [`spec.md`](spec.md) | The spec Opus issued for the build, requirements R1 through R9 |
| [`ratelimit.test.mjs`](ratelimit.test.mjs) | The starter oracle, five happy-path checks |
| [`ratelimit.v1.mjs`](ratelimit.v1.mjs) | Sonnet's first build, which passes the starter oracle |
| [`audits/openai-audit.md`](audits/openai-audit.md) | OpenAI Sol's audit, four findings plus two notes on the spec |
| [`audits/gemini-audit.md`](audits/gemini-audit.md) | Google Gemini's audit, three findings |
| [`audits/grok-timeout.md`](audits/grok-timeout.md) | What happened with xAI's Grok |
| [`synthesis.md`](synthesis.md) | Opus's reconciliation of both audits, which is the revised build plan |
| [`ratelimit.edge.test.mjs`](ratelimit.edge.test.mjs) | The four audit-derived tests, one per real bug |
| [`red-run.txt`](red-run.txt) | v1 failing all four, a raw terminal capture with its color codes (read it with `cat`) |
| [`ratelimit.mjs`](ratelimit.mjs) | Sonnet's fix, v2 |

The "governed: egress ok · voice CLEAN" stamp at the top of each audit is my harness checking the answer on its way back, and I left it in.

## How I Ran It

1. Opus wrote `spec.md`, nine requirements for a token-bucket rate limiter with an injectable clock, and a starter oracle, `ratelimit.test.mjs`, that covers the happy path in five checks.
2. A Sonnet subagent built v1 against it and passed all five.
3. Then v1 went out through OpenCode for an adversarial architect audit, to OpenAI's Sol and xAI's Grok. Sol came back with four findings and two notes on the spec. Grok timed out twice, so the router sent the second audit to Google's Gemini, and Gemini found three.
4. Opus judged the findings, and no fix went in without a failing test behind it. The four real bugs are the four tests in `ratelimit.edge.test.mjs`, and `red-run.txt` is v1 failing all of them.
5. Sonnet took Opus's fix plan and changed only what it listed, so the diff from v1 to v2 is the plan and nothing more. Both suites went green, 5/5 and 4/4, and I re-ran them by hand before I believed it.

## The Seven Findings

The "Raised by" column uses each auditor's own numbering, so you can find the original wording in `audits/`.

| # | Finding | Raised by | Verdict |
|---|---|---|---|
| 1 | `refillPerSec: 0` with an `Infinity` elapsed gap computes `Infinity * 0 = NaN`, which poisons `tokens` | Sol #3 and Gemini #2 | Real, fixed. Both labs found it, which made it the highest-confidence finding |
| 2 | A `NaN` clock reading slips past the `elapsedMs <= 0` guard, because `NaN <= 0` is false | Gemini #1 (Sol missed it) | Real, fixed |
| 3 | A sub-epsilon refill rounds away while `_lastRefillMs` still advances, so the accrual is lost | Sol #2 (Gemini missed it) | Real, fixed |
| 4 | A denormal `refillPerSec` (`1e-323`) loses its accrual the same way | Sol #4 | Same root cause as #3, covered by that fix, no test of its own |
| 5 | `capacity: 1e16` never counts down, because `1e16 - 1` rounds back to `1e16` | Sol #1 (Gemini missed it) | Real, fixed by rejecting any capacity above `Number.MAX_SAFE_INTEGER` |
| 6 | `0.3 + 0.3 + 0.3` is `0.8999999999999999`, so `tryRemove(0.9)` fails | Gemini #3 | Dismissed. That's the correct IEEE-754 sum, and an epsilon tolerance would hand out tokens that don't exist |
| 7 | R4 says "last observed time," but the code keeps a high-water mark | Sol, spec note | Spec wording only. The high-water mark stops a backward clock reading from stealing elapsed time, so the code stays |

Rows 1 through 5 add up to four bugs, since 3 and 4 share a root cause. Row 7 sits under the Dismissed heading in `synthesis.md`, right next to row 6, but what it says to do there is fix the spec's wording and leave the code alone, which is why I split it out. Sol also flagged R8 for promising exact math on every finite number without stating precision bounds, and `synthesis.md` never picks that one up, so it isn't in the table.

## The Revised Plan Is Four Tests and a Fix List

`spec.md` never got edited after the audits, and R4 still says "last observed time," the exact wording Sol flagged. The revision lives in `synthesis.md`, where Opus reconciles the two audits and writes the four-item fix plan, and in `ratelimit.edge.test.mjs`, the four failing tests that plan had to turn green.

Item 4 of that plan is the one I'd point you at. It tells Sonnet what to leave alone, the strict `>=` and the high-water clock, and v2 kept both, which the `FIX 4` comment in `ratelimit.mjs` explains.

## Run It Yourself

There's nothing to install, and I ran these on Node 22.

```bash
cd examples/cross-vendor-loop
node ratelimit.test.mjs        # starter oracle: PASS, 5 passed, 0 failed
node ratelimit.edge.test.mjs   # audit-derived oracle: PASS, 4 passed, 0 failed
```

To watch v1 fail the audit-derived tests, swap it in and run the edge suite again. I'd do the swap in a scratch copy, so the folder keeps v2 and there's nothing to put back afterward. The output should match `red-run.txt` byte for byte, since every test injects its own clock and nothing depends on real time.

```bash
tmp=$(mktemp -d) && cp *.mjs red-run.txt "$tmp" && cd "$tmp"
cp ratelimit.v1.mjs ratelimit.mjs
node ratelimit.edge.test.mjs | tee v1-run.txt   # FAIL, 0 passed, 4 failed
cmp v1-run.txt red-run.txt && echo "matches red-run.txt"
```

## Where This Fits

If you want to run this loop on your own code, [`build-spec.md` section 4](../../build-spec.md#4-the-build-loop-with-claude-code) has it as steps, and the [`/review`](https://github.com/jtehrani84/context-engineering/blob/main/skills/review.md) skill is how the starter kit does step 3 from inside Claude Code. I drove this whole loop from my laptop, and section 5 of the build spec covers what it would look like on the platform, which I've mapped against the docs but haven't run in an org yet.
