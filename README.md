# PostVibeClarity

## Prepare vibe-coded projects for production with evidence—not guesswork.

PostVibeClarity discovers your project's shape, applies relevant launch-review skills, and reports risks, missing essentials, and unverified areas before you ship.

`v0.1 · Stable foundation` · [Apache-2.0](LICENSE)

PostVibeClarity provides evidence and next actions. It does not certify that a project is production-ready, secure, compliant, or defect-free.

## Install with your coding agent

Paste this into your coding agent:

> Install PostVibeClarity for this project from `github.com/Kyle332506/post-vibe-clarity`. Use the instructions for this agent, install the skills only inside the current project, verify all four skills are available, and then run a read-only launch review. Do not change project files during the review.

## Important limitation

**Important:** PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready. It cannot find every vulnerability, prove that security is fully hardened, ensure legal or regulatory compliance, or eliminate operational failures. A report only describes the checks performed, the evidence found, and the areas that remain unverified.

Read the complete [disclaimer](DISCLAIMER.md) before relying on a report.

## How it works

PostVibeClarity follows this discovery-to-report pipeline:

```text
Project -> read-only discovery -> capability manifest -> skill routing
        -> deterministic or guided checks -> evidence-backed report
```

It is designed to represent web, mobile, desktop, CLI, backend, worker, library, extension, AI-agent, infrastructure, and monorepo projects. Automation depth varies by shape in this foundation: deterministic discovery confirms only the documented Node/static signals, React alone does not imply web, and the portable discovery skill guides classification of other or ambiguous shapes. Apart from the packaged secret-exposure and privacy-notice manual fallbacks, the remaining domain lists are taxonomy-only omitted audits until specialist skills and checks are added.

## Foundation scope

The v0.1 foundation currently provides:

- Read-only Node-project discovery for evidence-backed web, mobile, library, CLI, framework, and likely account-email signals.
- Capability-driven skill routing through validated `readiness.yaml` sidecars with catalog identity and ownership checks.
- Redacted inspection for private-key markers and quoted credential assignments, including syntax-aware JavaScript/TypeScript scanning and explicit environment/key text-file coverage.
- Privacy-notice candidate inspection when account-related personal-data collection is detected.
- Evidence-backed Markdown and JSON reports with explicit unverified coverage.
- Portable orchestrator, discovery, secret-exposure, and launch-essential Agent Skills with manual fallbacks.

The foundation does not yet implement a remediation engine, a complete nine-domain check catalog, deep artifact packs, framework/provider adapters, deployed-environment verification, or cross-agent runtime acceptance.

Runtime states are intentionally distinct:

- The portable discovery skill provides guided classification for project shapes the deterministic detector does not cover; it does not provide a readiness audit for those shapes.
- Readiness concerns present only in the design taxonomy are omitted audit coverage and are documented gaps, not per-run findings or passes.
- A successfully loaded and routed sidecar check with no registered implementation becomes an `unverified` finding and makes the report partial.
- An unsupported or unregistered domain has no synthetic per-run finding; its absence is documented in the [foundation coverage map](docs/foundation-coverage.md).
- Unreadable or invalid project/catalog input is fatal before a report is created. The CLI emits only a sanitized failure message, or sanitized diagnostics in debug mode.

## Requirements

Deterministic tooling requires:

- Node.js 24 or newer
- pnpm

The `SKILL.md` manual workflows remain usable by compatible agents when the local CLI cannot run.

## Development

Install dependencies, then run the build and test gates:

```bash
pnpm install
pnpm build
pnpm test
pnpm check
```

Run a local review from this repository:

```bash
pnpm review fixtures/web-missing-basics --skills skills --format markdown
pnpm review fixtures/cli-clean --skills skills --format json
```

The CLI contract is:

```text
postvibe review [project-path] --skills <skills-path> --format <markdown|json> [--output <directory>]
```

## Project-scoped skill installation

Choose the guide for the coding agent used in your project. Each guide installs the four canonical skills into that project's supported skill location.

| Agent | Project path | Invocation | Evidence label |
| --- | --- | --- | --- |
| [Codex](docs/installation/codex.md) | `.agents/skills` | `$post-vibe-clarity` | Documented |
| [Claude Code](docs/installation/claude-code.md) | `.claude/skills` | `/post-vibe-clarity` | Documented |
| [Cursor](docs/installation/cursor.md) | `.agents/skills` | `/post-vibe-clarity` | Documented |
| [Windsurf](docs/installation/windsurf.md) | `.agents/skills` | `@post-vibe-clarity` | Documented |
| [Other Agent Skills hosts](docs/installation/agent-skills.md) | Host-defined | Host-defined | Format compatible |

The [compatibility manifest](docs/installation/compatibility.yaml) is the source for these labels.

- Tested: runtime acceptance was recorded with a host version and date.
- Documented: the host documents the required skill format or location.
- Format compatible: the Agent Skills format is documented, but host runtime acceptance is not recorded.
- Not verified: neither documentation evidence nor runtime acceptance is recorded.

## License

PostVibeClarity is available under the [Apache License 2.0](LICENSE).
