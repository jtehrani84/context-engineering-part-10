# Context Engineering, Part 10

Part 10 of the Context Engineering series, published at
[jtehrani84.github.io/context-engineering-part-10](https://jtehrani84.github.io/context-engineering-part-10/).
The page is `index.html`, and the build spec ships in three formats: `build-spec.md`, `build-spec.html`,
and `build-spec.pdf`.

## The Code Behind the Page

The code Part 10 and the build spec point at lives in this repo, so the article and its source move together.

| Folder | What it is |
|---|---|
| [`reference-agent/`](reference-agent/) | The governed account assistant the build spec walks through: the Agent Script bundle, two Apex actions with their tests, the permission set, a seed script for the two synthetic accounts (one with a planted prompt injection), and the held-out eval. Deploy it to a demo or sandbox org only, in the order its README gives. |
| [`examples/cross-vendor-loop/`](examples/cross-vendor-loop/) | The real files from the cross-vendor build loop in section 4 of the build spec: the spec, both audits, the synthesis that became the fix plan, the four audit-derived tests, and both versions of the rate limiter. It needs only Node, and its README has the commands to re-run both suites and watch v1 fail. |

Both folders used to sit in the starter kit repo and moved here on 2026-10-01. Nothing in them depends
on the kit, and no org IDs, usernames, or local CLI state (`.sfdx/`, `.sf/`) came with them.
