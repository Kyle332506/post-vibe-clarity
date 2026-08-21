# TOML Monitoring Evidence Parser Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom TOML reader used by the monitoring-response check with a maintained parser that fails closed on malformed TOML while preserving exact top-level field evidence.

**Architecture:** Parse TOML with `smol-toml` and pass its root object through the same exact-alias, top-level-only value extraction already used for JSON and YAML. Parser errors return no structured evidence. Remove every custom TOML scanner, string parser, array parser, and assignment parser so TOML language correctness is owned by one maintained dependency rather than repository regexes.

**Tech Stack:** TypeScript 5.9, Node.js 24, pnpm 9.12, Vitest 4, `smol-toml` 1.8.x.

**Spec:** `docs/design/2026-08-20-launch-operations-basics-design.md`

**Plan location:** `docs/design/2026-08-21-toml-parser-correction-implementation-plan.md`

## Global Constraints

- Keep every automated check at Level 0 and repository-only; do not contact a network, provider, credential store, or live service while running a check.
- Missing, vague, ambiguous, unreadable, unsupported, or malformed evidence is `unverified`, never `passed` or `likely-issue`.
- Only exact approved top-level monitoring field aliases may contribute structured evidence; nested objects, unrelated tables, look-alike keys, comments, and adjacent fields must not contribute.
- Preserve Markdown/prose, JSON, and YAML behavior and every Task 6 rollback, applicability, domain, action-level, sanitation, and live-boundary behavior.
- Use `smol-toml` `^1.8.0`, which has zero runtime dependencies, built-in TypeScript declarations, Node.js 18+ support, and a BSD-3-Clause license. The project remains Apache-2.0.
- Catch TOML parser errors at the existing structured-evidence boundary and return no matched values; never render parser error content into a finding.
- Remove the complete custom TOML parsing implementation. Do not retain it as a fallback.
- Follow red-green-refactor and add no authorship attribution or emoji.

---

### Task 1: Replace Custom TOML Parsing With `smol-toml`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/checks/launch-operations/monitoring-response.ts`
- Modify: `tests/checks/launch-operations/runtime-checks.test.ts`

**Interfaces:**
- Consumes: `parse(content)` from `smol-toml`.
- Preserves: `structuredFieldValues(content, location, fieldNames): string[]` and all existing check exports.
- Produces: fail-closed TOML evidence extraction through `valuesForTopLevelStructuredFields`.

- [ ] **Step 1: Add failing malformed-TOML behavior tests**

Add complete monitoring documents whose five declared values contain malformed TOML basic-string escapes. At minimum include `\\q`, an incomplete Unicode escape such as `\\u12`, and an invalid Unicode scalar such as `\\uD800`. Assert each document returns:

```ts
expect(finding).toMatchObject({
  id: 'launch-operations.monitoring-response.unverified',
  outcome: 'unverified',
  actionLevel: 'resolve-before-launch',
  evidenceConfidence: 'insufficient',
});
```

Retain the existing malformed arrays, incomplete values, duplicate keys, comments, table scope, nested fields, adjacent fields, and look-alike key regressions.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/runtime-checks.test.ts
```

Expected: FAIL because the current custom TOML string parser accepts at least the `\\q` document as usable evidence.

- [ ] **Step 3: Add and validate the parser dependency**

Run:

```bash
pnpm add smol-toml@^1.8.0
```

Confirm `package.json` records `smol-toml` under `dependencies`, the lockfile pins its resolved package, it adds no transitive runtime package, and the installed metadata reports BSD-3-Clause with Node.js support compatible with the repository's `>=24` engine.

- [ ] **Step 4: Replace the custom TOML implementation**

Import the parser:

```ts
import { parse as parseToml } from 'smol-toml';
```

Delete `stripTomlComment`, `parseTomlString`, `parseTomlArray`, `parseTomlValue`, `tomlArrayState`, `isTomlTableHeader`, `isTomlAssignment`, `readTomlTopLevelValue`, and `tomlFieldValues` plus their private supporting types.

Route TOML through the existing root-only field extractor:

```ts
if (extension === '.toml') {
  return valuesForTopLevelStructuredFields(parseToml(content), fields);
}
```

Keep this inside the existing `try`/`catch`, returning `[]` for every parser error. Do not add a fallback scanner.

- [ ] **Step 5: Confirm valid and hostile TOML behavior**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/runtime-checks.test.ts
```

Expected: PASS. Mentally mutate the TOML branch back to returning values from the whole document; the nested/table/adjacent tests must fail. Mutate the catch to reuse raw text; malformed-escape tests must fail.

- [ ] **Step 6: Run broader verification**

Run:

```bash
pnpm vitest run tests/checks/launch-operations
pnpm build
pnpm check
```

Expected before Task 12: launch-operations tests and build pass. The full check may retain only the two restricted-sandbox loopback failures and the renderer sample mismatch already deferred to Task 12. Any other failure blocks completion.

- [ ] **Step 7: Review dependency and restricted-content boundaries**

Run:

```bash
pnpm audit --prod
rg -n -i 'generated by|co-authored-by|assisted by|artificial intelligence|chatgpt|claude|copilot' package.json pnpm-lock.yaml src/checks/launch-operations/monitoring-response.ts tests/checks/launch-operations/runtime-checks.test.ts
```

Expected: the production audit reports no known vulnerability and the attribution scan returns no matches. Record the exact audit result in the task report; do not claim the dependency or project is vulnerability-free.

- [ ] **Step 8: Commit**

```bash
git add -- package.json pnpm-lock.yaml src/checks/launch-operations/monitoring-response.ts tests/checks/launch-operations/runtime-checks.test.ts
git commit -m "fix: use a maintained TOML parser"
```
