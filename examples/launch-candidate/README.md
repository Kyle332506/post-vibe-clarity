# Before-and-after launch candidate

This dependency-free web example shows how specific evidence changes after two fixes. The `before` and `after` directories are versions of the same small signup app.

The comparison reduces uncertainty; it does not show that the after project is production-ready or completely secure. Deployment, authorization, durable data handling, abuse prevention, monitoring, recovery, accessibility, performance, legal sufficiency, and operational ownership remain unknown.

## Prepare a fresh checkout

From the PostVibeClarity repository root, install the pinned dependency graph and build the compiled CLI used below:

```bash
pnpm install --frozen-lockfile
pnpm build
```

The build creates `dist/src/cli.js`. Run these prerequisites before the walkthrough in a fresh checkout or after removing `dist`.

## Read-only comparison

From the PostVibeClarity repository root, review the before project:

```bash
pnpm review examples/launch-candidate/before --skills skills --format markdown
```

It records a credential-like source value, a missing privacy-notice candidate, and uncovered production domains. The credential-like value is synthetic test data and is not usable with any service.

Review the after project:

```bash
pnpm review examples/launch-candidate/after --skills skills --format markdown
```

The after project reads its optional service token from the environment and links an example privacy notice. Those two findings improve, but the report remains partial and keeps the same uncovered production domains.

## Optional command evidence

Both projects declare bounded `build`, `typecheck`, `lint`, and `test` scripts. The first three check JavaScript syntax. The test checks for the privacy-notice file, so it fails before the fix and passes after it.

Create a plan for the before project:

```bash
node dist/src/cli.js plan examples/launch-candidate/before --skills skills --output .postvibe/launch-before-plan.json
```

Inspect the command list and warning. Approve the exact printed fingerprint, then run only that unchanged plan:

```bash
node dist/src/cli.js execute .postvibe/launch-before-plan.json --approve <exact-fingerprint> --output .postvibe/launch-before --format markdown
```

Repeat with new paths for the after project:

```bash
node dist/src/cli.js plan examples/launch-candidate/after --skills skills --output .postvibe/launch-after-plan.json
node dist/src/cli.js execute .postvibe/launch-after-plan.json --approve <exact-fingerprint> --output .postvibe/launch-after --format markdown
```

Command evidence improves in the after run: its declared test passes after the privacy-notice fix. The read-only credential and privacy findings also improve. Unknown production areas remain unknown in both reports.

The executor is not a security sandbox. These example commands are deliberately bounded, but approved local scripts may read files, load `.env`, change files, start processes, or use the network. Passing them proves only that the exact declared commands completed. `.postvibe/` is optional and is never added to `.gitignore` automatically.

## Run either project

The projects require Node.js 24 or newer and have no package dependencies. Start one version at a time:

```bash
node examples/launch-candidate/before/src/server.js
```

or:

```bash
EXAMPLE_SERVICE_TOKEN="replace-with-a-local-test-value" node examples/launch-candidate/after/src/server.js
```

Open `http://localhost:3000`. The demonstration validates submitted name and email values in memory, returns a confirmation, and does not persist or transmit them.

## Remaining boundary

The after project changes only the evidence points covered here. It does not provide deployment configuration, production operations, performance evidence, a legal-sufficiency conclusion, deep shape coverage, or strong sandboxing. Do not use either version as a production template.
