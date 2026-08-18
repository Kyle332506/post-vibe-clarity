# Before-and-after launch candidate

This dependency-free web example shows how two specific PostVibeClarity findings change when evidence changes. The `before` and `after` directories contain recognizable versions of the same small signup app.

The comparison does not show that the second project is production-ready or fully secured. Both reviews remain partial because most production-readiness domains are not automated in v0.1.

## Review the before project

From the PostVibeClarity repository root, run:

```bash
pnpm review examples/launch-candidate/before --skills skills --format markdown
```

The review records:

- A stop-before-launch finding for a credential-like value stored in source.
- A human-review-needed finding because account-related email collection is detected without a privacy-notice candidate.
- Coverage gaps for the production domains that v0.1 does not inspect.

The credential-like value is synthetic test data. It is not usable with any service.

## Review the after project

Run:

```bash
pnpm review examples/launch-candidate/after --skills skills --format markdown
```

The second project reads its optional service token from the environment and includes an example privacy notice linked from the signup form. The secret-exposure check produces no finding, and the privacy-notice check records that a candidate was found while still requiring review of its accuracy.

The report remains partial and retains the same uncovered production domains. Resolving these findings is evidence of a narrower improvement, not a launch verdict.

## What the after project does not establish

The after project changes only the two evidence points covered by this walkthrough. It does not demonstrate authentication, authorization, durable data handling, abuse prevention, deployment configuration, monitoring, recovery, accessibility, performance, legal sufficiency, or operational ownership. Do not use either version as a production template.

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
