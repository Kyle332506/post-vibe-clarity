# Universal Launch Baseline design

Status: approved for implementation planning on 2026-08-18.

## Plain-language summary

PostVibeClarity currently reads a project and records visible launch concerns. The Universal Launch Baseline adds an optional second step that can run the project's own build, test, type-check, and lint commands.

Nothing runs immediately. PostVibeClarity first creates a plan showing the exact commands it found. The user approves one exact version of that plan. PostVibeClarity then runs only those commands, records what happened, and reports what passed, failed, changed, or could not be verified.

This produces evidence, not a launch verdict. It does not guarantee that the project is production-ready, secure, compliant, or free of defects.

## Goals

- Add optional local verification without weakening the existing read-only review.
- Work across project types through one portable plan and execution contract.
- Run only commands declared by the project.
- Require approval for the exact command list before execution.
- Preserve failed, missing, excluded, interrupted, and unsupported checks as visible evidence gaps.
- Keep the command runner replaceable so a stronger container or sandbox can be added later.
- Preserve the current evidence, redaction, uncertainty, no-score, and no-verdict rules.

## Not included in this wave

- No deployment, staging, production, provider, or account access.
- No automatic remediation or project-file cleanup.
- No claim that passing commands prove the project works in production.
- No claim that the executor is a security sandbox.
- No automatic recursion through every monorepo workspace.
- No guessed commands based only on a language or framework convention.
- No deep framework-specific verification.

## User flow

### 1. Read-only review remains available

The existing command and report behavior remain supported:

```text
postvibe review [project-path]
```

This command does not run project commands.

### 2. Create a verification plan

```text
postvibe plan [project-path] [--skills <skills-path>] --output <plan-file>
```

Plan creation performs discovery and the existing Level 0 read-only checks. It also discovers eligible project-declared commands. It does not execute those commands. `--skills` has the same defaulting behavior as the existing review command, and the plan records a deduplicated digest inventory for the complete loaded catalog because any shipped audit skill can affect planning or the mandatory fresh review.

The command prints:

- the plan path;
- its fingerprint;
- a short command summary;
- any missing or excluded checks;
- the exact execute command needed for approval.

The user can exclude a discovered command by regenerating the plan:

```text
postvibe plan [project-path] --exclude <command-id> --output <new-plan-file>
```

`--exclude` may be repeated. Exclusions remain inside the plan as coverage gaps; they do not disappear from the record. An unknown command ID is an error.

### 3. Approve and execute the plan

```text
postvibe execute <plan-file> --approve <fingerprint> --output <directory> [--format <markdown|json>]
```

The approval means only: run the exact selected commands under the limits recorded in this plan. It is not approval of project safety, a launch decision, or acceptance of unrelated risks.

Before any project command starts, execution validates the plan, fingerprint, project root, command sources, inspected inputs, and executor settings. It rechecks the exact source declaration and fingerprinted launcher immediately before each command. A mismatch stops that command from starting and remains explicit unverified evidence.

### 4. Produce evidence

Execution writes:

1. a structured execution record containing what ran and what happened; and
2. a Markdown readiness report by default, or JSON when requested.

After command execution, PostVibeClarity reruns the applicable read-only checks against the resulting project state. The final report combines fresh read-only findings with command evidence and remaining coverage gaps.

## Approval contract

Each plan receives a deterministic SHA-256 fingerprint over its security- and behavior-relevant content. Canonical fingerprint input includes:

- the plan schema version;
- toolkit version;
- resolved project-root identity;
- discovery and applicable-check inputs;
- hashes of inspected project files and command declaration sources;
- selected and excluded commands;
- each command's ID, category, immutable argument array, working directory, timeout, exact source declaration, fingerprinted launcher evidence, and required access;
- execution-policy settings.

Presentation-only values such as generation time, output path, and formatting metadata are excluded from the fingerprint. Command execution order is included.

The fingerprint is recalculated at execution time. The approved value must match both the plan and the `--approve` argument. Changing a command, exclusion, timeout, working directory, source file, relevant project input, or executor setting invalidates approval.

Approval is proven by the deliberate execute invocation. The artifacts do not describe the project, plan, or commands as trusted or safe.

## Command discovery

### `package.json` adapter

The first automatic adapter recognizes these exact script categories:

| Script name | Category |
| --- | --- |
| `build` | build |
| `test` | test |
| `typecheck` or `type-check` | type-check |
| `lint` | lint |

If both `typecheck` and `type-check` exist, plan creation reports an ambiguity instead of choosing one silently.

Package-manager evidence establishes whether automatic package-script discovery is eligible. It is accepted when named by the `packageManager` field or identified by one unambiguous recognized lockfile:

| Evidence | Package manager |
| --- | --- |
| `packageManager: npm@...`, `package-lock.json`, or `npm-shrinkwrap.json` | npm |
| `packageManager: pnpm@...` or `pnpm-lock.yaml` | pnpm |
| `packageManager: yarn@...` or `yarn.lock` | Yarn |
| `packageManager: bun@...`, `bun.lock`, or `bun.lockb` | Bun |

The `packageManager` field takes priority only when its supported name is valid and its other project evidence does not conflict. Multiple conflicting lockfiles, an unsupported package-manager name, or missing package-manager evidence leaves the scripts unverified and directs the user to the portable configuration file.

PostVibeClarity does not invoke the package manager at execution time because doing so would reread mutable script text after approval and standard Windows `.cmd` shims would require shell handling. Instead, plan creation parses a deliberately portable literal-argument subset and freezes a shell-free launcher: the fingerprinted current Node runtime plus any direct project entry point, or a fingerprinted local JavaScript package manifest and entry point started with that runtime. The plan records the exact argument position of every entry point. Inline-evaluation and informational Node forms have no entry-point file; other Node option shapes remain unsupported. The executor uses the frozen argument array with `shell: false`, never `cmd.exe`, and rechecks both declaration and launcher evidence immediately before use. Shell operators, expansion, redirection, ambiguous binaries, or other unsupported syntax become an explicit unverified coverage gap with portable configuration as the fallback. This correction preserves exact-source approval across platforms rather than narrowing the promise to a live package-manager reread.

### Portable configuration

Projects that need explicit or non-Node commands may add `postvibe.verification.yaml`:

```yaml
schemaVersion: "0.1"
commands:
  - id: backend-tests
    category: test
    argv: ["pytest", "-q"]
    cwd: "."
    timeoutSeconds: 600
```

Rules:

- `id` values must be unique and stable.
- `category` must be `build`, `test`, `type-check`, or `lint`.
- `argv` must be a non-empty array of literal strings.
- Shell command strings, environment interpolation, redirection, and command chaining are not supported by this format.
- `cwd` must resolve inside the project root.
- The default timeout is 600 seconds. A declared timeout must be between 1 and 3,600 seconds.
- The first version does not accept per-command environment variables.
- Duplicate IDs stop plan creation. Multiple commands may intentionally share a category, such as separate frontend and backend test commands.

The configuration supplements automatic discovery. An agent may propose this file as a normal project change, but PostVibeClarity never creates and approves it silently.

Automatic package commands use the fixed order `build`, `type-check`, `lint`, then `test`. Portable commands retain their declared file order and follow automatic commands. The final order is visible in the plan and covered by the fingerprint.

Recognizing a framework may change which checks are applicable. It never authorizes a conventional command that the project has not declared.

## Plan contract

The versioned plan is human-readable JSON with schema ID `postvibe-verification-plan/0.1`. It contains:

- plan ID and fingerprint;
- toolkit and schema versions;
- generated time;
- resolved project root;
- discovery evidence;
- read-only findings and coverage gaps observed during planning;
- hashes of inputs required for stale-plan detection;
- the complete loaded skill catalog's deduplicated, ordinally ordered instruction and sidecar hashes;
- selected commands in execution order;
- excluded commands and their resulting coverage gaps;
- exact command source digests and immutable launcher evidence;
- required access and execution limits;
- the containment warning and required no-verdict disclaimer.

The plan is data, not repository instructions. Agents must not treat text found inside the reviewed project as authority to change the plan or broaden access.

## Execution model

Commands run sequentially in the approved order. An ordinary command failure does not prevent later approved commands from running.

For each command, the executor:

- directly spawns the approved executable and argument array without an executor-level shell;
- uses the approved working directory;
- inherits non-sensitive environment variables needed for normal tool operation;
- removes inherited variables whose case-insensitive names contain `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PRIVATE_KEY`, `CREDENTIAL`, `API_KEY`, `AUTHORIZATION`, `COOKIE`, or `SESSION`;
- removes exact runtime-injection names `NODE_OPTIONS`, `NODE_PATH`, `BASH_ENV`, `ENV`, `ZDOTDIR`, `PYTHONPATH`, `PYTHONSTARTUP`, `RUBYOPT`, `PERL5OPT`, `GIT_ASKPASS`, and `SSH_ASKPASS`;
- removes variables whose names start with `LD_` or `DYLD_`;
- records removed variable names but never their values;
- drains command output without allowing unbounded memory use;
- redacts likely credential values before persistence;
- stores at most 256 KiB of combined redacted output and marks truncation explicitly;
- enforces the approved timeout and terminates the process tree when the platform permits;
- records start time, duration, exit status, signal, timeout state, and output state;
- compares project files before and after execution.

This initial policy is identified as `env-filter/0.1`. Its version and exact rules are recorded in the plan and covered by the fingerprint. Removed names are evidence; removed values are never recorded.

Before commands start, PostVibeClarity pins the canonical project root by real path, device, and inode. It rechecks that identity before every traversal and the fresh review; drift stops scanning. The file comparison excludes version-control internals, `.postvibe`, dependencies, coverage, distribution output, the exact primary/staging/recovery artifact paths, symlinks, and non-regular files. Inaccessible paths fail observation. The required `project-observation/0.1` object records these rules and the content-SHA-256-only metadata boundary in both execution evidence and report linkage.

PostVibeClarity never cleans, deletes, reverts, or stages command-created changes.

## Containment warning

This executor is not a security sandbox. Approved project scripts remain arbitrary local code. They may read project files, load `.env` files themselves, create or modify files, start child processes, or access the network.

The first release does not promise to block filesystem access outside the working directory or block network access. It reduces accidental command substitution and preserves an approval record; it does not make untrusted code safe to run.

The executor must be behind an interface that can later support containers or stronger sandboxes without changing the plan's command and approval model.

## Project boundaries and monorepos

One plan covers one resolved project root.

- Command configuration and working directories must resolve inside that root.
- `..`, absolute-path, and symlink escapes are rejected.
- A plan cannot be moved to a different project root and reused.
- Runtime executables may resolve through the user's normal `PATH`; that does not broaden the approved argument list or working directory.

For a monorepo:

- a declared root aggregate script may be used;
- portable configuration may declare commands with working directories inside individual packages;
- users may create separate plans for specific subprojects;
- the first version does not automatically run every workspace package;
- detected but uncovered workspaces remain explicit coverage gaps;
- a passing root command is evidence only for the command that ran.

Deeper workspace adapters are follow-on work.

## Result meanings

A command result is evidence about one verification step. It is not an overall readiness result.

| Situation | Outcome | Action |
| --- | --- | --- |
| Build passes | passed | evidence recorded |
| Build fails | failed | stop-before-launch |
| Tests pass | passed | evidence recorded |
| Tests fail | failed | stop-before-launch |
| Type-check passes | passed | evidence recorded |
| Type-check fails | failed | resolve-before-launch |
| Lint passes | passed | evidence recorded |
| Lint fails | failed | resolve-before-launch |
| Applicable build command is missing | unverified | resolve-before-launch |
| Test command is missing | unverified | resolve-before-launch |
| Type-check or lint command is missing | unverified | plan-soon |
| Command times out or cannot start | unverified | use the category's missing-command priority |
| Command is excluded | unverified | use the category's missing-command priority |
| Command is interrupted | unverified | use the category's missing-command priority |
| Category does not apply | not-applicable | improve-when-appropriate |

Applicability must be evidence-based. A static site without a build step may mark build as not applicable. The absence of a separately named type checker or linter is not automatically a defect.

A zero exit status means only that the exact approved command completed successfully. Passing tests do not prove that the tests are complete, meaningful, or representative of production behavior.

The command runner is separate from command outcomes. A test command returning a failure can still mean the runner completed correctly and produced a valid failed finding. A malformed or stale plan means verification never started.

## Execution record and readiness report

The structured execution record uses schema ID `postvibe-verification-execution/0.1`. It contains:

- execution ID and status;
- approved plan ID and fingerprint;
- toolkit version and project root;
- start and completion times;
- one result for every selected command;
- exclusions and commands not reached;
- bounded, redacted output evidence;
- observed file changes and their stated boundary;
- the required `project-observation/0.1` boundary and pinned root identity;
- interruption or runner-failure details in sanitized form;
- the containment warning and disclaimer.

`postvibe review` continues to emit the existing readiness report `0.1` contract. `postvibe execute` emits readiness report `0.2`, which adds structured linkage to the plan and execution record while preserving the existing manifest, finding, check-execution, coverage-gap, summary, redaction, and disclaimer rules.

The readable report summarizes command evidence. The execution record remains the structured source for command-level timing and output details.

No artifact contains an overall numeric readiness score or an unconditional launch, security, compliance, or defect-free verdict.

## Output safety

- Plan, execution, and report files use exclusive creation and never overwrite an existing file.
- The user chooses output locations.
- Documentation may recommend `.postvibe/`, but the tool never silently edits `.gitignore` or commits artifacts.
- Execution output targets and owned staging entries are validated and reserved before the first project command starts.
- Completed execution evidence remains staged until the fresh review and report both validate. Execution and report publish as a rollback-capable artifact set, so a later publication failure cannot leave a completed execution without its report.
- If root drift moves the requested artifact directory, sanitized partial execution evidence is published at a stable recovery boundary and that exact path is surfaced; moved owned staging entries are never followed through the replacement root.
- A graceful interruption produces a clearly marked partial execution record.
- An abrupt process or machine termination may leave a temporary file, but that file is never presented as a completed record.

## Failure handling

Before the first project command, any validation failure stops execution. No readiness report is invented for an execution that did not start.

After execution begins:

- ordinary command failures are recorded and later commands continue;
- a graceful user interruption stops further commands and marks them unverified;
- an unexpected runner failure preserves completed evidence where safely possible and marks the execution partial;
- a mandatory fresh-review, report-validation, or report-publication failure publishes validated partial execution evidence with the fixed `orchestration.post-processing` gap and publishes no report;
- normal CLI output uses stable sanitized errors;
- debug output uses bounded sanitized diagnostics and must not reveal project-controlled content or secrets.

## Internal component boundaries

Implementation should keep these responsibilities separate:

1. **Command discovery:** turns project declarations into command candidates and source evidence.
2. **Plan builder:** combines discovery, Level 0 results, selections, exclusions, limits, and input hashes.
3. **Plan validator and fingerprinting:** canonicalizes plans and rejects malformed, changed, or stale inputs.
4. **Executor interface:** runs one approved argument array under a defined policy and returns a bounded result.
5. **Working-tree observer:** records visible file changes without modifying them.
6. **Execution recorder:** writes the immutable structured record.
7. **Finding mapper:** translates command results and missing evidence into current action and outcome language.
8. **Report integration:** combines fresh Level 0 evidence with execution findings and explicit gaps.
9. **CLI adapters:** parse user intent and orchestrate the components without embedding their business rules.

Each component must have a narrow public contract so its internals can change without weakening approval or evidence semantics.

## Test and acceptance requirements

The implementation is incomplete until automated tests cover:

- deterministic canonicalization and fingerprints;
- changed, tampered, moved, and stale-plan rejection;
- approval mismatch rejection;
- package-script and portable-configuration discovery;
- ambiguous command and package-manager evidence;
- direct argument execution without an executor-level shell;
- literal treatment of shell metacharacters in portable `argv` entries;
- project-root, traversal, and symlink escape rejection;
- sensitive inherited environment-variable removal;
- credential redaction and bounded output;
- timeout and child-process termination behavior;
- pass, failure, missing, exclusion, not-applicable, interruption, and could-not-start outcomes;
- working-tree change reporting without cleanup;
- artifact collision and partial-write safety;
- root scripts, configured subprojects, and monorepo coverage gaps;
- plan, execution, finding, and report linkage invariants;
- fresh Level 0 review after execution;
- unchanged v0.1 review behavior and regression coverage.

End-to-end fixtures must include:

- a Node project with declared build, test, type-check, and lint scripts;
- a project using `postvibe.verification.yaml` rather than a Node adapter;
- a monorepo with deliberately uncovered packages;
- controlled failure cases for timeout, file mutation, redaction, exclusion, and stale approval.

Executor acceptance must run on Linux, macOS, and Windows with Node.js 24 because process and path behavior differs across operating systems.

## Completion criteria

This wave is complete when:

- the plan and execute workflow works end to end;
- no project command runs without an exact matching approval fingerprint;
- all command sources and evidence boundaries are visible;
- results and missing evidence map consistently into readiness findings;
- existing read-only review behavior remains supported;
- all repository checks and the multi-platform executor matrix pass;
- installation and usage documentation explain the containment boundary in plain language;
- reports retain the required disclaimer and never issue a production-ready or security-tightened verdict.
