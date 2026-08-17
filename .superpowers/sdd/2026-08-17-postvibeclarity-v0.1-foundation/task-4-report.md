# Task 4 report: Load and route the portable skill catalog

## Outcome

Implemented deterministic loading of readiness-sidecar skills and routing by detected artifacts/capabilities.

The controller ruling is implemented: `readiness.yaml` is optional automation metadata. Directories without it are skipped, so instruction-only Agent Skills remain independently useful. Directories with a sidecar still require a readable `SKILL.md` and a schema-valid sidecar.

## Files

- `src/catalog/load-catalog.ts`
- `src/catalog/route-skills.ts`
- `tests/catalog/catalog.test.ts`
- `tests/fixtures/skills/secret-exposure/SKILL.md`
- `tests/fixtures/skills/secret-exposure/readiness.yaml`
- `tests/fixtures/skills/launch-essentials/SKILL.md`
- `tests/fixtures/skills/launch-essentials/readiness.yaml`
- `tests/fixtures/skills/instruction-only/SKILL.md`

## TDD evidence

Before writing the test, named the protected breaks:

- Removing the sidecar-optional branch would make the instruction-only fixture fail loading.
- Ignoring `allCapabilities` would route `launch-essentials` for the base manifest.
- Failing to preserve deterministic directory sorting would change the loaded/routed ID order.

### RED

Command:

```bash
pnpm test tests/catalog/catalog.test.ts
```

Result: failed as expected before production modules existed, with `Cannot find module '../../src/catalog/load-catalog.js'`.

### GREEN

Commands:

```bash
pnpm test tests/catalog/catalog.test.ts
pnpm build
```

Results: catalog suite passed (3 tests); TypeScript build passed.

## Final verification

Commands:

```bash
pnpm test tests/catalog/catalog.test.ts
pnpm build
pnpm test
git diff --check
```

Results:

- Focused catalog suite: 1 file, 3 tests passed.
- Build: passed.
- Full suite: 4 files, 9 tests passed.
- Diff check: passed with no whitespace errors.

## Self-review

- Loader sorts skill directories lexicographically for deterministic output.
- It only suppresses `ENOENT` for `readiness.yaml`; other sidecar read failures propagate.
- A present sidecar causes `SKILL.md` to be read and the sidecar to be parsed and schema-validated before producing a descriptor.
- Router requires every declared capability and at least one declared artifact, while skills without constraints are universal.

## Concerns

None. The loader deliberately does not parse `SKILL.md`; its readable presence is the catalog contract, while instruction semantics remain independently consumable.
