# Reference Agent: Governed Account Assistant

The working source behind [`../build-spec.md`](../build-spec.md) and Part 10 of the Context Engineering
series. It's a small Agentforce employee agent that shows each harness control as a native primitive:

- grounded account answers that cite the record they came from,
- a planted prompt-injection treated as data (in the instructions *and* sanitized in Apex before the
  model sees it),
- a write that asks a human to confirm first (`require_user_confirmation: True`),
- a frozen, held-out eval that can fail.

## What's Here

| Path | What it is |
|---|---|
| `force-app/main/default/aiAuthoringBundles/Part10_Governed_Account_Assistant/` | The agent, in Agent Script |
| `force-app/main/default/classes/GetAccountSummary.cls` | Read action: grounded summary + `source` citation, injection sanitizer |
| `force-app/main/default/classes/LogAccountNote.cls` | Write action: appends a timestamped note, runs only after the user confirms |
| `force-app/main/default/classes/*Test.cls` | 9 test methods, 90% coverage on each action |
| `force-app/main/default/permissionsets/Governed_Account_Assistant_User` | Agent access + Apex access + Account read / Description edit (+ Contact read, which Salesforce requires with Account read) |
| `scripts/apex/seed-demo-accounts.apex` | Creates the two synthetic accounts the eval uses, one of them poisoned |
| `tests/Part10_Governed_Account_Assistant-heldout.yaml` | The held-out eval (4 cases) |

## Deploy Order (Demo or Sandbox Org Only)

The order matters, because the permission set references the agent and the eval needs the seed data.

```bash
sf project deploy start -o <demo> --source-dir force-app/main/default/classes --wait 20
sf apex run test -o <demo> --class-names GetAccountSummaryTest --class-names LogAccountNoteTest --code-coverage --wait 15
sf agent validate authoring-bundle --json -o <demo> --api-name Part10_Governed_Account_Assistant
sf agent publish authoring-bundle --json -o <demo> --api-name Part10_Governed_Account_Assistant
sf agent activate --json -o <demo> --api-name Part10_Governed_Account_Assistant
sf project deploy start -o <demo> --source-dir force-app/main/default/permissionsets --wait 10
sf org assign permset -o <demo> --name Governed_Account_Assistant_User --on-behalf-of <user@example.com>
sf apex run -o <demo> --file scripts/apex/seed-demo-accounts.apex
sf agent test create --json -o <demo> --spec tests/Part10_Governed_Account_Assistant-heldout.yaml --api-name Governed_HeldOut_Eval
sf agent test run --json -o <demo> --api-name Governed_HeldOut_Eval --wait 15 --result-format json
```

Last verified end to end on 2026-09-29: tests 9/9 passing, agent validation clean, eval 4/4 cases (12/12
assertions). That run used a system prompt that named one specific sales team. On 2026-09-30 the line was
generalized to "a sales team", and the eval hasn't been re-run against that exact wording. Change it to
your team, then re-run the eval, since any edit is a new version.

## The Two Things That Will Bite You

1. **Permissions before prompts.** If an action returns empty or wrong output, check the permission set
   first. The agent worked for me without one only because I was a system administrator.
2. **Never preview a data action in mock mode.** Use `sf agent preview start --use-live-actions`. Without
   it the model makes up the action's output, and you'll debug the wrong layer.
