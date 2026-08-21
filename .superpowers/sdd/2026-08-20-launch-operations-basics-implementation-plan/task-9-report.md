# Task 9 report

## Baseline RED evidence

The no-skill pressure test established this exact baseline before the `launch-operations` skill was written: the agent safely refused fake secret/customer data, did not commit, and said not verified, but asked zero questions, wrote immediately without preview/approval, and created config + shell script in addition to docs.

- The agent asked zero questions.
- The agent wrote immediately without a preview or approval.
- The agent created configuration and a shell script in addition to documentation.

Task 9 must preserve those safe behaviors while directly closing every listed failure.

## Fix round 1 behavioral acceptance RED

Added `tests/skills/launch-operations-behavior.test.ts` before any behavioral evidence fixture. The test defines the versioned multi-turn trace contract, binds it to the exact skill and backup-template bytes with SHA-256, and validates observed interview, approval, write, diff, recheck, and safety behavior.

RED command:

```text
pnpm vitest run tests/skills/launch-operations-behavior.test.ts
```

Observed result: 1 test failed for the expected reason, `ENOENT` for the absent `tests/skills/fixtures/launch-operations-backup-remedy.behavior.json`. No trace or behavioral output was fabricated to satisfy the test.

## Fix round 1 behavioral acceptance GREEN

The parent supplied the completed with-skill run. The committed fixture normalizes the absolute temporary project root and encodes the observed 25 turns, 27 actions, exact generated Markdown snapshot, shown diff, one-file filesystem result, and unavailable-command recheck. It stores no fake sensitive values.

The acceptance test recomputes SHA-256 over the current `SKILL.md`, backup template, and their ordered combined bytes. It verifies the ten one-question interview turns, both `I don't know` answers, sensitive-input refusal, exact preview and separate approval identity, one bounded Markdown write, artifact and diff equivalence, safety exclusions, and the honest `unverified` recheck with its live-evidence boundary.

Focused result: `tests/skills/launch-operations-behavior.test.ts` passed 1/1 after the supplied evidence was materialized.

## Fix round 2 mutation-backed RED

The behavioral validator was first refactored without strengthening its acceptance rules. Fourteen malicious variants were then added across the nine required bypass classes: a secret-request question; sensitive content in each of the user-turn, assistant-turn, action-payload, preview, artifact, and diff surfaces; an early write; a preview/artifact contradiction; an appended binary deletion; a dishonest exit-127 recheck; appended push and external-call actions; a stale capture timestamp; and a provider-specific identifier.

RED command:

```text
pnpm vitest run tests/skills/launch-operations-behavior.test.ts
```

Observed result: `14 failed | 1 passed`. The unmodified bound trace remained GREEN, while every malicious variant failed its expectation because the prior validator incorrectly accepted the mutation. This demonstrated each bypass before hardening.

## Fix round 2 mutation-backed GREEN

The validator now derives acceptance from the complete trace rather than trusting summary fields. It enforces the exact ten question texts, independently scans every required evidence surface for sensitive content, orders actions through referenced turns, allows only phase-appropriate action types, binds preview and approval to the artifact SHA-256 and path, compares the exact canonical one-file unified diff, enforces honest unavailable-command semantics, and validates a same-session bounded timeline. Its documented provider-neutral boundary requires generic data-location, backup-mechanism, and durable-role descriptions while rejecting provider and environment identifiers.

The fixture retains the supplied live trace and remains bound to the unchanged `SKILL.md` and backup-template bytes. No live behavioral output was fabricated or rerun.

Focused result: `tests/skills/launch-operations-behavior.test.ts` passed 15/15, including all fourteen mutation regressions and the bound baseline trace.
