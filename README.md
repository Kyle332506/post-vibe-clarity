# PostVibeClarity

> **Know what's ready, what's risky, and what's missing before you launch.**

PostVibeClarity is an open-source, cross-agent toolkit for evidence-backed launch reviews of vibe-coded projects. It discovers a project's shape, routes applicable Agent Skills, records findings and unknowns, and produces Markdown or JSON reports.

PostVibeClarity provides evidence, not certification. This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects. The toolkit does not replace qualified legal, security, privacy, accessibility, financial, or domain review, and it does not produce an overall numeric readiness score.

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

## Architecture and project shapes

The architecture follows this pipeline:

```text
Project -> read-only discovery -> capability manifest -> skill routing
        -> deterministic or guided checks -> evidence-backed report
```

It is designed to represent web, mobile, desktop, CLI, backend, worker, library, extension, AI-agent, infrastructure, and monorepo projects. Automation depth varies by shape in this foundation: deterministic discovery confirms only the documented Node/static signals, React alone does not imply web, and the portable discovery skill guides classification of other or ambiguous shapes. Apart from the packaged secret-exposure and privacy-notice manual fallbacks, the remaining domain lists are taxonomy-only omitted audits until specialist skills and checks are added.

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

Inspect the skill contents, then manually copy the four canonical directories into the target project's `.agents/skills` directory:

```bash
mkdir -p /path/to/project/.agents/skills
cp -R skills/post-vibe-clarity /path/to/project/.agents/skills/
cp -R skills/project-discovery /path/to/project/.agents/skills/
cp -R skills/secret-exposure /path/to/project/.agents/skills/
cp -R skills/launch-essentials /path/to/project/.agents/skills/
```

Start a new agent session after installation if the host discovers skills only at startup. Host-specific installation automation, metadata overlays, verification, updates, and uninstall behavior belong to a separate agent-distribution implementation plan; they are intentionally not part of this foundation.

## License

PostVibeClarity is available under the [Apache License 2.0](LICENSE).
