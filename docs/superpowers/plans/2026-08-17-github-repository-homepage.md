# GitHub Repository Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a guided-adoption repository homepage and community surface that helps vibe coders install PostVibeClarity, understand its production-preparation evidence, and contribute without mistaking it for a production-readiness or security guarantee.

**Architecture:** Treat repository content as a tested interface. Small Vitest suites validate the homepage contract, compatibility evidence, sample report, community files, GitHub forms, workflow configuration, and social-preview asset; public GitHub mutations run only after the local branch is reviewed, merged, and green on `main`.

**Tech Stack:** Markdown, YAML, TypeScript 5.9, Vitest 4, Node.js 24, pnpm 9.12.0, GitHub Actions, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-17-github-repository-homepage-design.md`

## Global Constraints

- Repository owner: the user's authenticated personal GitHub account.
- Repository name: `post-vibe-clarity`.
- Presentation: `v0.1 · Stable foundation` describes the tested foundation, not complete readiness coverage.
- Primary CTA: install with a coding agent.
- Do not use emojis in repository presentation, examples, issue forms, or the social preview.
- Do not claim certification, guaranteed production readiness, complete security hardening, compliance, or defect-free operation.
- Do not calculate or display an overall readiness score or readiness percentage.
- Compatibility labels are exactly `Tested`, `Documented`, `Format compatible`, or `Not verified`.
- No agent may be labeled `Tested` from documentation alone.
- Installation is project-scoped by default; global installation requires an explicit user choice.
- The review invoked from installation instructions is read-only by default.
- `docs/foundation-coverage.md` remains the source of truth for implemented coverage.
- GitHub Pages, paid support, sponsorship, and universal marketplace packages are out of scope.
- Public repository creation and release publication each require explicit user approval at their external-state gate. After creation, repository settings, security controls, branch protection, and manual social-preview upload each require their own separate target/effect preview and explicit user approval; none inherits repository-creation approval.
- Expected repository owner: `Kyle332506`, resolved from the authenticated GitHub account on 2026-08-17. Reconfirm it before external mutations; committed URLs use this literal login.

---

## File Map

### Repository-facing content

- Modify `README.md` — guided-adoption homepage and primary installation CTA.
- Create `DISCLAIMER.md` — full readiness, security, legal, and operational boundary.
- Create `ROADMAP.md` — outcome-based roadmap without dates or unsupported claims.
- Create `CONTRIBUTING.md` — contribution workflow and local verification.
- Create `SECURITY.md` — private vulnerability reporting and disclosure expectations.
- Create `CODE_OF_CONDUCT.md` — contributor behavior and private conduct reporting.
- Create `SUPPORT.md` — route usage questions, defects, security reports, and conduct concerns.
- Create `docs/examples/sample-report.md` — schema-backed renderer output.
- Create `docs/installation/compatibility.yaml` — machine-readable compatibility evidence.
- Create `docs/installation/codex.md` — Codex project installation and invocation.
- Create `docs/installation/claude-code.md` — Claude Code project installation and invocation.
- Create `docs/installation/cursor.md` — Cursor project installation and invocation.
- Create `docs/installation/windsurf.md` — Windsurf project installation and invocation.
- Create `docs/installation/agent-skills.md` — manual Agent Skills fallback.
- Create `docs/releases/v0.1.0.md` — stable-foundation release notes and limitations.
- Create `docs/repository-settings.md` — exact public repository settings and audit runbook.
- Create `assets/social-preview.png` — 1280 by 640 repository social preview.

### GitHub metadata

- Create `.github/ISSUE_TEMPLATE/bug-report.yml` — structured defects.
- Create `.github/ISSUE_TEMPLATE/agent-compatibility.yml` — runtime compatibility evidence.
- Create `.github/ISSUE_TEMPLATE/new-check-proposal.yml` — production-check proposals.
- Create `.github/ISSUE_TEMPLATE/config.yml` — disable blank issues and route security/support.
- Create `.github/PULL_REQUEST_TEMPLATE.md` — evidence-oriented pull request checklist.
- Create `.github/dependabot.yml` — weekly npm and Actions updates.
- Create `.github/workflows/ci.yml` — Node 24 foundation verification.
- Create `.github/branch-protection.json` — reviewable protection payload for `main`.
- Modify `package.json` — declare `pnpm@9.12.0` for repeatable CI.

### Tests

- Create `tests/repository/repository-docs.ts` — shared file, heading, link, and emoji assertions.
- Create `tests/repository/homepage.test.ts` — hero, disclaimers, information order, and internal links.
- Create `tests/repository/installation-docs.test.ts` — guide structure and compatibility evidence.
- Create `tests/repository/sample-report.test.ts` — renderer-backed sample report.
- Create `tests/repository/community-health.test.ts` — community files and routing boundaries.
- Create `tests/repository/github-metadata.test.ts` — issue forms, CI, Dependabot, and protection payload.
- Create `tests/repository/social-preview.test.ts` — PNG dimensions and size.
- Create `tests/repository/repository-settings.test.ts` — external-state gates and complete settings audit contract.
- Create `tests/fixtures/sample-readiness-report.ts` — typed report fixture shared by renderer and repository tests.
- Modify `tests/report/render-report.test.ts` — import the shared sample fixture.

---

### Task 1: Homepage Contract and Disclaimer

**Files:**
- Create: `tests/repository/repository-docs.ts`
- Create: `tests/repository/homepage.test.ts`
- Modify: `README.md`
- Create: `DISCLAIMER.md`

**Interfaces:**
- Consumes: Existing `README.md`, `docs/foundation-coverage.md`, and the report disclaimer in `src/orchestrator/run-review.ts`.
- Produces: `readRepositoryFile(path): Promise<string>`, `headingPosition(source, heading): number`, `localMarkdownLinks(source): string[]`, and `expectNoEmoji(source, label): void` for later repository tests.

- [ ] **Step 1: Add shared repository-document helpers**

Create `tests/repository/repository-docs.ts`:

```ts
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function repositoryPath(path: string): string {
  return resolve(repositoryRoot, path);
}

export async function readRepositoryFile(path: string): Promise<string> {
  return readFile(repositoryPath(path), 'utf8');
}

export function headingPosition(source: string, heading: string): number {
  return source.indexOf(`\n## ${heading}\n`);
}

export function localMarkdownLinks(source: string): string[] {
  return [...source.matchAll(/\[[^\]]+\]\((?!https?:|#|mailto:)([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => value.split('#', 1)[0] ?? value)
    .filter((value) => value.length > 0);
}

export async function expectLocalLinksResolve(sourcePath: string, source: string): Promise<void> {
  for (const link of localMarkdownLinks(source)) {
    await expect(access(resolve(repositoryRoot, dirname(sourcePath), link))).resolves.toBeUndefined();
  }
}

export function expectNoEmoji(source: string, label: string): void {
  expect(source, `${label} contains an emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
}
```

- [ ] **Step 2: Write the failing homepage contract tests**

Create `tests/repository/homepage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  expectLocalLinksResolve,
  expectNoEmoji,
  headingPosition,
  readRepositoryFile,
} from './repository-docs.js';

const fullDisclaimer = 'PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready.';

describe('repository homepage', () => {
  it('leads from production preparation to agent installation', async () => {
    const readme = await readRepositoryFile('README.md');
    expect(readme).toContain('Prepare vibe-coded projects for production with evidence—not guesswork.');
    expect(readme).toContain('## Install with your coding agent');
    expect(headingPosition(readme, 'Install with your coding agent')).toBeGreaterThan(0);
    expect(headingPosition(readme, 'Install with your coding agent')).toBeLessThan(headingPosition(readme, 'How it works'));
    expect(readme).toContain('v0.1 · Stable foundation');
    expect(readme).toContain('[Install](#install-with-your-coding-agent)');
    expect(readme).toContain('[Example report](docs/examples/sample-report.md)');
    expect(readme).toContain('[Current coverage](docs/foundation-coverage.md)');
  });

  it('puts the guide table directly after the prompt and the roadmap before community links', async () => {
    const readme = await readRepositoryFile('README.md');
    const prompt = readme.indexOf('> Install PostVibeClarity');
    const table = readme.indexOf('| Agent | Project path | Invocation | Evidence label |');
    expect(table).toBeGreaterThan(prompt);
    expect(table).toBeLessThan(headingPosition(readme, 'Important limitation'));
    expect(table).toBeLessThan(headingPosition(readme, 'How it works'));
    expect(headingPosition(readme, 'Roadmap')).toBeLessThan(headingPosition(readme, 'Community and project policies'));
  });

  it('states the readiness and security boundary without burying it', async () => {
    const [readme, disclaimer] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('DISCLAIMER.md'),
    ]);
    for (const source of [readme, disclaimer]) {
      expect(source).toContain(fullDisclaimer);
      expect(source).toContain('does not guarantee that a project is production-ready');
      expect(source).toContain('cannot find every vulnerability');
      expect(source).toContain('prove that security is fully hardened');
    }
    expect(readme.toLowerCase()).not.toContain('certified production ready');
  });

  it('uses no emojis and resolves local links', async () => {
    const readme = await readRepositoryFile('README.md');
    expectNoEmoji(readme, 'README.md');
    await expectLocalLinksResolve('README.md', readme);
  });
});
```

- [ ] **Step 3: Run the tests to verify RED**

Run: `pnpm test tests/repository/homepage.test.ts`

Expected: FAIL because `DISCLAIMER.md`, the approved hero, and the agent-install heading do not exist.

- [ ] **Step 4: Rewrite the README opening and add the disclaimer**

Resolve the repository login before editing:

```bash
gh auth status
PVC_OWNER="$(gh api user --jq .login)"
```

If authentication or login resolution fails, or if `PVC_OWNER` is not `Kyle332506`, stop and ask the user before continuing. Use `apply_patch` to make the README begin with:

```markdown
# PostVibeClarity

## Prepare vibe-coded projects for production with evidence—not guesswork.

PostVibeClarity discovers your project's shape, applies relevant launch-review skills, and reports risks, missing essentials, and unverified areas before you ship.

`v0.1 · Stable foundation` · [Apache-2.0](LICENSE)

[Install](#install-with-your-coding-agent) · [Example report](docs/examples/sample-report.md) · [Current coverage](docs/foundation-coverage.md)

PostVibeClarity provides evidence and next actions. It does not certify that a project is production-ready, secure, compliant, or defect-free.

## Install with your coding agent

Paste this into your coding agent:

> Install PostVibeClarity for this project from `github.com/Kyle332506/post-vibe-clarity`. Use the instructions for this agent, install the skills only inside the current project, verify all four skills are available, and then run a read-only launch review. Do not change project files during the review.

Immediately below this prompt, render the five-row host-guide table from Task 2. Keep it before the full limitation, architecture, and development material. Add a concise `Roadmap` section before community links once `ROADMAP.md` exists.

## Important limitation

**Important:** PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready. It cannot find every vulnerability, prove that security is fully hardened, ensure legal or regulatory compliance, or eliminate operational failures. A report only describes the checks performed, the evidence found, and the areas that remain unverified.

Read the complete [disclaimer](DISCLAIMER.md) before relying on a report.
```

Keep the existing development commands and Apache-2.0 license section. Add `How it works` with the current discovery-to-report pipeline from the design spec. Do not add empty future sections: Tasks 2–4 add `Example review`, `Current coverage`, `Project shapes`, `Agent compatibility`, `Roadmap`, and `Contributing and support` only when their linked content exists. Task 2 adds the installation-document link only after its target file exists.

Create `DISCLAIMER.md` with the full approved disclaimer, then state:

```markdown
## What a report means

A report records only the checks performed, available evidence, limitations, and unverified areas. A report with no findings is not evidence that no production, security, privacy, legal, accessibility, reliability, or operational problem exists.

## Human review

PostVibeClarity does not replace qualified security, privacy, legal, accessibility, financial, operations, or domain review. Users remain responsible for deciding what evidence and review their project requires before launch and while operating it.
```

- [ ] **Step 5: Run the homepage tests to verify GREEN**

Run: `pnpm test tests/repository/homepage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md DISCLAIMER.md tests/repository/repository-docs.ts tests/repository/homepage.test.ts
git commit -m "docs: add guided repository homepage"
```

---

### Task 2: Agent Installation and Compatibility Evidence

**Files:**
- Create: `docs/installation/compatibility.yaml`
- Create: `docs/installation/codex.md`
- Create: `docs/installation/claude-code.md`
- Create: `docs/installation/cursor.md`
- Create: `docs/installation/windsurf.md`
- Create: `docs/installation/agent-skills.md`
- Create: `tests/repository/installation-docs.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Four canonical directories under `skills/` and helpers from `tests/repository/repository-docs.ts`.
- Produces: `docs/installation/compatibility.yaml` as the source for homepage compatibility labels.

- [ ] **Step 1: Write the compatibility manifest**

Create `docs/installation/compatibility.yaml` with documentation-backed labels only:

```yaml
schemaVersion: "0.1"
agents:
  - id: codex
    name: Codex
    label: documented
    projectPath: .agents/skills
    invocation: $post-vibe-clarity
    evidenceUrl: https://developers.openai.com/codex/skills
    runtimeVersion: null
    runtimeTestedAt: null
  - id: claude-code
    name: Claude Code
    label: documented
    projectPath: .claude/skills
    invocation: /post-vibe-clarity
    evidenceUrl: https://code.claude.com/docs/en/slash-commands
    runtimeVersion: null
    runtimeTestedAt: null
  - id: cursor
    name: Cursor
    label: documented
    projectPath: .agents/skills
    invocation: /post-vibe-clarity
    evidenceUrl: https://cursor.com/docs/skills
    runtimeVersion: null
    runtimeTestedAt: null
  - id: windsurf
    name: Windsurf
    label: documented
    projectPath: .agents/skills
    invocation: @post-vibe-clarity
    evidenceUrl: https://docs.windsurf.com/windsurf/cascade/skills
    runtimeVersion: null
    runtimeTestedAt: null
  - id: agent-skills
    name: Other Agent Skills hosts
    label: format-compatible
    projectPath: host-defined
    invocation: host-defined
    evidenceUrl: https://agentskills.io/specification
    runtimeVersion: null
    runtimeTestedAt: null
```

- [ ] **Step 2: Write failing installation-document tests**

Create `tests/repository/installation-docs.test.ts`:

```ts
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { expectLocalLinksResolve, expectNoEmoji, readRepositoryFile } from './repository-docs.js';

interface AgentEntry {
  id: string;
  name: string;
  label: 'tested' | 'documented' | 'format-compatible' | 'not-verified';
  projectPath: string;
  invocation: string;
  evidenceUrl: string;
  runtimeVersion: string | null;
  runtimeTestedAt: string | null;
}

describe('agent installation documentation', () => {
  it('requires evidence before stronger compatibility labels', async () => {
    const source = await readRepositoryFile('docs/installation/compatibility.yaml');
    const manifest = parse(source) as { schemaVersion: string; agents: AgentEntry[] };
    expect(manifest.schemaVersion).toBe('0.1');
    expect(manifest.agents.map(({ id }) => id)).toEqual(['codex', 'claude-code', 'cursor', 'windsurf', 'agent-skills']);
    for (const agent of manifest.agents) {
      expect(agent.evidenceUrl).toMatch(/^https:\/\//);
      if (agent.label === 'tested') {
        expect(agent.runtimeVersion).toEqual(expect.any(String));
        expect(agent.runtimeTestedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } else {
        expect(agent.runtimeVersion).toBeNull();
        expect(agent.runtimeTestedAt).toBeNull();
      }
    }
  });

  it.each(['codex', 'claude-code', 'cursor', 'windsurf', 'agent-skills'])('%s guide is complete', async (id) => {
    const path = `docs/installation/${id}.md`;
    const guide = await readRepositoryFile(path);
    for (const heading of ['Install', 'Verify', 'Run a review', 'Update', 'Uninstall', 'Compatibility evidence']) {
      expect(guide).toContain(`## ${heading}`);
    }
    expect(guide).toContain('project');
    expect(guide).toContain('read-only');
    expect(guide).toContain('PVC_VERSION="v0.1.0"');
    expect(guide).toContain('.postvibeclarity-revision');
    expect(guide).toContain('diff -qr');
    expect(guide).toContain('.postvibeclarity-backups');
    expectNoEmoji(guide, path);
    await expectLocalLinksResolve(path, guide);
  });
});
```

- [ ] **Step 3: Run the tests to verify RED**

Run: `pnpm test tests/repository/installation-docs.test.ts`

Expected: FAIL because the five guide files do not exist.

- [ ] **Step 4: Write the shared project-scoped copy procedure**

Every host guide installs exactly these directories:

```text
skills/post-vibe-clarity
skills/project-discovery
skills/secret-exposure
skills/launch-essentials
```

For Codex, Cursor, and Windsurf, use `.agents/skills`; Claude Code uses `.claude/skills`. Every guide starts from a version-pinned source and records the resolved commit:

```bash
PVC_REPO_URL="https://github.com/Kyle332506/post-vibe-clarity.git"
PVC_VERSION="v0.1.0"
PVC_WORK="$(mktemp -d)"
PVC_SOURCE="$PVC_WORK/post-vibe-clarity"
git clone --branch "$PVC_VERSION" --depth 1 --single-branch "$PVC_REPO_URL" "$PVC_SOURCE"
PVC_REVISION="$(git -C "$PVC_SOURCE" rev-parse HEAD)"
```

Use fail-fast shell handling. Stage exactly the four named skill directories in a unique project-local staging directory, and validate that all four staged directories exist before changing any live destination. Before installation or update, inspect the four exact destination directories. Compare staged and existing directories with path-only `diff -qr`, move each existing exact directory into a unique bounded `.postvibeclarity-backups/update.XXXXXX` directory, and only then move its staged replacement into place. Never delete existing skill directories as an update step. Record `version=v0.1.0` and `commit=$PVC_REVISION` in the destination's `.postvibeclarity-revision`, preserving the prior marker in the same backup. The fallback guide uses equivalent fail-fast pin, revision, completed-stage validation, diff, and bounded-backup semantics for its host-defined project scope.

Explain that the unique temporary source is disposable after verification, but do not include a broad or unresolved destructive command.

Each guide's verification step lists the four exact skill names and uses the host invocation from `compatibility.yaml`. If the host does not discover a newly created top-level skill directory, instruct the user to restart that host; do not promise hot reload across all versions.

- [ ] **Step 5: Write host-specific guides and the fallback guide**

Use these exact host facts:

```text
Codex:       .agents/skills      invoke $post-vibe-clarity
Claude Code: .claude/skills      invoke /post-vibe-clarity
Cursor:      .agents/skills      invoke /post-vibe-clarity
Windsurf:    .agents/skills      invoke @post-vibe-clarity
```

The fallback guide instructs the agent to inspect its current first-party skill documentation, copy the four directories into that host's project scope, verify discovery, and retain the `Format compatible` label until runtime acceptance is recorded.

Every guide links to its exact `evidenceUrl` and states: `Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.`

- [ ] **Step 6: Populate the README installation and compatibility sections**

Add links for each host and render this table from the manifest values:

```markdown
| Agent | Project path | Invocation | Evidence label |
| --- | --- | --- | --- |
| [Codex](docs/installation/codex.md) | `.agents/skills` | `$post-vibe-clarity` | Documented |
| [Claude Code](docs/installation/claude-code.md) | `.claude/skills` | `/post-vibe-clarity` | Documented |
| [Cursor](docs/installation/cursor.md) | `.agents/skills` | `/post-vibe-clarity` | Documented |
| [Windsurf](docs/installation/windsurf.md) | `.agents/skills` | `@post-vibe-clarity` | Documented |
| [Other Agent Skills hosts](docs/installation/agent-skills.md) | Host-defined | Host-defined | Format compatible |
```

Define all four evidence labels below the table and link to `compatibility.yaml`.

- [ ] **Step 7: Run installation and homepage tests**

Run: `pnpm test tests/repository/installation-docs.test.ts tests/repository/homepage.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/installation tests/repository/installation-docs.test.ts
git commit -m "docs: add agent installation guides"
```

---

### Task 3: Example Report, Coverage, and Roadmap

**Files:**
- Create: `tests/fixtures/sample-readiness-report.ts`
- Modify: `tests/report/render-report.test.ts`
- Create: `tests/repository/sample-report.test.ts`
- Create: `docs/examples/sample-report.md`
- Create: `ROADMAP.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ReadinessReport`, `summarizeReport(...)`, and `derivePartial(...)` from `src/model/report.ts`; `validateReadinessReport(input)` from `src/validation/report-schema.ts`; and `renderMarkdown(report)` from `src/report/render-markdown.ts`.
- Produces: `sampleReadinessReport: ReadinessReport` as the canonical documentation fixture.

- [ ] **Step 1: Extract the canonical sample report fixture**

Move the existing typed `report` object from `tests/report/render-report.test.ts` into `tests/fixtures/sample-readiness-report.ts`, export it as:

```ts
import {
  derivePartial,
  readinessDomains,
  summarizeReport,
  type CheckExecution,
  type CoverageGap,
  type ReadinessReport,
} from '../../src/model/report.js';

export const sampleControlledCredential = 'pvc_fixture_credential_not_for_output';

const findings: ReadinessReport['findings'] = [
  {
    id: 'secret-exposure.fixture-secret',
    checkId: 'secret-exposure.scan',
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['security-privacy'],
    actionLevel: 'stop-before-launch',
    outcome: 'failed',
    title: 'Potential credential in source',
    impact: 'A credential committed to source may be copied or abused.',
    evidence: [{ kind: 'file', summary: 'Private key marker detected', location: 'src/config.ts:2' }],
    evidenceConfidence: 'confirmed',
    applicability: 'The project contains source files.',
    recommendation: 'Remove and rotate the credential outside this review.',
    verification: 'Scan the repository again after removal.',
    humanReviewRequired: false,
  },
  {
    id: 'launch-essentials.privacy-unverified',
    checkId: 'launch-essentials.privacy-notice',
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials'],
    actionLevel: 'human-review-needed',
    outcome: 'unverified',
    title: 'Privacy notice could not be verified',
    impact: 'Users may not understand how their information is handled.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    applicability: 'Personal-data collection was detected.',
    recommendation: 'Review the data inventory and applicable requirements.',
    verification: 'Provide reviewed policy text and confirm it is linked.',
    humanReviewRequired: true,
    unverifiedBoundaries: ['Legal accuracy requires human review.'],
  },
];

const checkExecutions: CheckExecution[] = [
  { checkId: 'launch-essentials.privacy-notice', checkVersion: '0.1.0', skillId: 'launch-essentials', skillVersion: '0.1.0', domains: ['policy-business-essentials'], status: 'unverified', findingIds: ['launch-essentials.privacy-unverified'] },
  { checkId: 'secret-exposure.scan', checkVersion: '0.1.0', skillId: 'secret-exposure', skillVersion: '0.1.0', domains: ['security-privacy'], status: 'completed', findingIds: ['secret-exposure.fixture-secret'] },
];
const routedDomains = new Set(checkExecutions.flatMap(({ domains }) => domains));
const coverageGaps: CoverageGap[] = [
  { id: 'check.launch-essentials.privacy-notice', checkId: 'launch-essentials.privacy-notice', skillId: 'launch-essentials', status: 'unverified', domains: ['policy-business-essentials'], reason: 'Legal accuracy requires human review.' },
  ...readinessDomains.filter((domain) => !routedDomains.has(domain)).map((domain) => ({ id: `domain.${domain}`, status: 'unverified' as const, domains: [domain], reason: 'No routed check covers this domain in the current review.' })),
];

export const sampleReadinessReport: ReadinessReport = {
  schemaVersion: '0.1',
  runId: 'pvc-20260817',
  generatedAt: '2026-08-17T12:00:00.000Z',
  toolkitVersion: '0.1.0',
  manifest: {
    schemaVersion: '0.1',
    projectRoot: '/example/project',
    generatedAt: '2026-08-17T12:00:00.000Z',
    artifacts: [{ value: 'web', confidence: 'confirmed', evidence: [{ kind: 'file', summary: 'Web manifest found', location: 'package.json' }] }],
    frameworks: [],
    services: [],
    capabilities: [{ value: 'collects-personal-data', confidence: 'likely', evidence: [{ kind: 'file', summary: 'Account-related source references an email field', location: 'src/register.ts' }] }],
  },
  checkExecutions,
  coverageGaps,
  findings,
  summary: summarizeReport(findings, checkExecutions, coverageGaps),
  partial: derivePartial(checkExecutions, coverageGaps),
  disclaimer: 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.',
};
```

Update `tests/report/render-report.test.ts` to import both exports and replace its local `fakeCredential` and `report` constants with `sampleControlledCredential` and `sampleReadinessReport`.

- [ ] **Step 2: Write the failing sample-document test**

Create `tests/repository/sample-report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sampleControlledCredential, sampleReadinessReport } from '../fixtures/sample-readiness-report.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';
import { validateReadinessReport } from '../../src/validation/report-schema.js';
import { expectNoEmoji, readRepositoryFile } from './repository-docs.js';

describe('sample report documentation', () => {
  it('is exactly the current renderer output for the typed sample report', async () => {
    const sample = await readRepositoryFile('docs/examples/sample-report.md');
    expect(await validateReadinessReport(sampleReadinessReport)).toEqual({ ok: true });
    expect(sample).toBe(renderMarkdown(sampleReadinessReport));
    expect(sample).not.toContain(sampleControlledCredential);
    expect(sample).toContain('Stop before launch');
    expect(sample).toContain('Unverified');
    expect(sample).toContain(sampleReadinessReport.disclaimer);
    expectNoEmoji(sample, 'docs/examples/sample-report.md');
  });
});
```

- [ ] **Step 3: Run the sample test to verify RED**

Run: `pnpm test tests/repository/sample-report.test.ts tests/report/render-report.test.ts`

Expected: FAIL because `docs/examples/sample-report.md` does not exist; renderer tests still pass after the fixture extraction.

- [ ] **Step 4: Create the renderer-backed sample report**

Run this one-off local command:

```bash
pnpm exec tsx -e "import { sampleReadinessReport } from './tests/fixtures/sample-readiness-report.ts'; import { renderMarkdown } from './src/report/render-markdown.ts'; process.stdout.write(renderMarkdown(sampleReadinessReport));"
```

First run `validateReadinessReport(sampleReadinessReport)` and require `{ ok: true }`. Inspect the renderer output for controlled values, then add that exact output to `docs/examples/sample-report.md` with `apply_patch`. Do not hand-author additional findings outside the typed, computed, semantically validated fixture.

- [ ] **Step 5: Complete README explanation and coverage**

Add the ASCII review flow from the spec, a concise excerpt using the labels `Stop before launch`, `Human review needed`, `Unverified`, and `Evidence recorded`, and the exact interpretation:

```markdown
> No overall readiness score is calculated. “No findings” does not mean “production-ready”; it means only that the checks performed did not produce findings from the available evidence.
```

Add the six-row current-coverage table verbatim from the design spec and link to both `docs/foundation-coverage.md` and `docs/examples/sample-report.md`. Add the ten project-shape bullets and explicitly state that representation does not imply equivalent deterministic coverage.

- [ ] **Step 6: Create the outcome-based roadmap**

Create `ROADMAP.md` with:

```markdown
# PostVibeClarity roadmap

The roadmap communicates direction, not promised release dates. Items remain unimplemented coverage until their checks, evidence contracts, documentation, and acceptance tests land.

## Near-term foundation work

- Versioned agent compatibility evidence and repeatable runtime acceptance.
- Additional launch-essential checks with explicit applicability and human-review boundaries.
- Framework and provider adapters that preserve the framework-agnostic core.

## Broader production preparation

- Deployment and operational verification.
- Reliability, recovery, performance, maintainability, accessibility, and release workflows.
- Deeper artifact and evidence packs.

## Later distribution and remediation

- Host-native packages or plugins where evidence supports them.
- Approval-gated remediation and fresh rechecks.

See [current foundation coverage](docs/foundation-coverage.md) for what exists today.
```

- [ ] **Step 7: Run focused tests**

Run: `pnpm test tests/repository/sample-report.test.ts tests/repository/homepage.test.ts tests/report/render-report.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add README.md ROADMAP.md docs/examples/sample-report.md tests/fixtures/sample-readiness-report.ts tests/report/render-report.test.ts tests/repository/sample-report.test.ts
git commit -m "docs: explain evidence and current coverage"
```

---

### Task 4: Community Health and Reporting Boundaries

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SUPPORT.md`
- Create: `tests/repository/community-health.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `pnpm verify:foundation`, the full disclaimer, and GitHub private vulnerability reporting.
- Produces: Stable destinations for contribution, support, security, and conduct links.

- [ ] **Step 1: Write failing community-health tests**

Create `tests/repository/community-health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectLocalLinksResolve, expectNoEmoji, readRepositoryFile } from './repository-docs.js';

const files = ['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md'] as const;

describe('community health files', () => {
  it.each(files)('%s exists, has no emojis, and resolves local links', async (path) => {
    const source = await readRepositoryFile(path);
    expect(source.length).toBeGreaterThan(200);
    expectNoEmoji(source, path);
    await expectLocalLinksResolve(path, source);
  });

  it('routes vulnerabilities privately and avoids security guarantees', async () => {
    const security = await readRepositoryFile('SECURITY.md');
    expect(security).toContain('Report a vulnerability');
    expect(security).toContain('Security');
    expect(security).toContain('privately');
    expect(security.toLowerCase()).not.toContain('fully secure');
    expect(security.toLowerCase()).not.toContain('no vulnerabilities');
  });

  it('requires evidence and verification from contributors', async () => {
    const contributing = await readRepositoryFile('CONTRIBUTING.md');
    expect(contributing).toContain('pnpm verify:foundation');
    expect(contributing).toContain('Evidence');
    expect(contributing).toContain('No certification claims');
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm test tests/repository/community-health.test.ts`

Expected: FAIL because all four files are missing.

- [ ] **Step 3: Create contribution and support guides**

`CONTRIBUTING.md` must include `Ways to contribute`, `Development setup`, `Evidence requirements`, `Adding or changing a check`, `Agent compatibility reports`, `Pull requests`, and `No certification claims`. The development gate is exactly:

```bash
pnpm install --frozen-lockfile
pnpm verify:foundation
```

`SUPPORT.md` must route:

```text
Usage question              -> GitHub issue using the bug form only when behavior is defective; otherwise read installation guides first
Product defect              -> Bug report form
Agent compatibility result  -> Agent compatibility form
Security vulnerability      -> Private vulnerability report; never a public issue
Conduct concern             -> Private contact method listed on the maintainer's GitHub profile
```

- [ ] **Step 4: Create security and conduct policies**

`SECURITY.md` supports the current `0.1.x` line, asks reporters to use the repository Security tab's private vulnerability-reporting flow, prohibits including secrets in a report, and asks for affected versions, impact, safe reproduction, and suggested mitigation. It promises no fixed response SLA and makes no complete-security claim.

`CODE_OF_CONDUCT.md` uses Contributor Covenant 2.1, retains its attribution, removes decorative icons, and directs confidential enforcement reports to the private contact method on the maintainer's GitHub profile. Do not invent an email address.

- [ ] **Step 5: Link community files from the README**

The final README section links `CONTRIBUTING.md`, `SUPPORT.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`, `DISCLAIMER.md`, and `LICENSE` with a one-sentence purpose for each.

- [ ] **Step 6: Run focused tests**

Run: `pnpm test tests/repository/community-health.test.ts tests/repository/homepage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md SUPPORT.md tests/repository/community-health.test.ts
git commit -m "docs: add community health policies"
```

---

### Task 5: GitHub Forms, CI, and Dependency Updates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/agent-compatibility.yml`
- Create: `.github/ISSUE_TEMPLATE/new-check-proposal.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/ci.yml`
- Create: `.github/branch-protection.json`
- Modify: `package.json`
- Create: `tests/repository/github-metadata.test.ts`

**Interfaces:**
- Consumes: `pnpm verify:foundation`, Node.js `>=24`, and pnpm lockfile format 9.
- Produces: Required status check named `verify` and protection payload context `verify`.

- [ ] **Step 1: Write failing GitHub metadata tests**

Create `tests/repository/github-metadata.test.ts`:

```ts
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { expectNoEmoji, readRepositoryFile } from './repository-docs.js';

const issueForms = ['bug-report', 'agent-compatibility', 'new-check-proposal'] as const;

describe('GitHub repository metadata', () => {
  it.each(issueForms)('%s issue form is structured and emoji-free', async (name) => {
    const path = `.github/ISSUE_TEMPLATE/${name}.yml`;
    const source = await readRepositoryFile(path);
    const form = parse(source) as { name?: string; description?: string; body?: unknown[] };
    expect(form.name).toEqual(expect.any(String));
    expect(form.description).toEqual(expect.any(String));
    expect(form.body?.length).toBeGreaterThan(2);
    expectNoEmoji(source, path);
  });

  it('runs the full read-only foundation gate with least privilege', async () => {
    const source = await readRepositoryFile('.github/workflows/ci.yml');
    const workflow = parse(source) as Record<string, unknown>;
    expect(workflow).toBeTypeOf('object');
    expect(source).toContain('permissions:\n  contents: read');
    expect(source).toContain('actions/checkout@v6');
    expect(source).toContain('actions/setup-node@v6');
    expect(source).toContain('pnpm/action-setup@v4');
    expect(source).toContain('node-version: 24');
    expect(source).toContain('pnpm install --frozen-lockfile');
    expect(source).toContain('pnpm verify:foundation');
  });

  it('keeps protection and CI status-check names aligned', async () => {
    const protection = JSON.parse(await readRepositoryFile('.github/branch-protection.json')) as {
      required_status_checks: { contexts: string[] };
      allow_force_pushes: boolean;
      allow_deletions: boolean;
    };
    expect(protection.required_status_checks.contexts).toEqual(['verify']);
    expect(protection.allow_force_pushes).toBe(false);
    expect(protection.allow_deletions).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm test tests/repository/github-metadata.test.ts`

Expected: FAIL because the metadata files do not exist.

- [ ] **Step 3: Add package-manager identity and CI**

Add to `package.json`:

```json
"packageManager": "pnpm@9.12.0"
```

Create `.github/workflows/ci.yml`:

```yaml
name: Foundation CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Verify foundation
        run: pnpm verify:foundation
```

- [ ] **Step 4: Add Dependabot configuration**

Create `.github/dependabot.yml` with weekly `npm` and `github-actions` ecosystems, a limit of five open pull requests per ecosystem, and labels `dependencies` plus `javascript` or `github-actions` respectively.

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    labels:
      - dependencies
      - javascript
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    labels:
      - dependencies
      - github-actions
```

- [ ] **Step 5: Add issue forms and pull request template**

Create `.github/ISSUE_TEMPLATE/bug-report.yml`:

```yaml
name: Bug report
description: Report reproducible incorrect behavior in PostVibeClarity.
title: "[Bug] "
labels:
  - bug
  - triage
body:
  - type: markdown
    attributes:
      value: Do not include credentials, private keys, personal data, or other sensitive values.
  - type: input
    id: version
    attributes:
      label: PostVibeClarity version
    validations:
      required: true
  - type: dropdown
    id: project-shape
    attributes:
      label: Project shape
      options:
        - Web
        - Native mobile
        - Desktop
        - CLI
        - Backend or API
        - Worker or scheduled job
        - Library or SDK
        - Browser extension
        - AI agent
        - Infrastructure
        - Monorepo
        - Other
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Safe reproduction steps
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
  - type: textarea
    id: evidence
    attributes:
      label: Redacted evidence
      description: Include locations and rule IDs, never secret values.
  - type: checkboxes
    id: safety
    attributes:
      label: Safety confirmation
      options:
        - label: I removed secrets and personal data from this report.
          required: true
```

Create `.github/ISSUE_TEMPLATE/agent-compatibility.yml`:

```yaml
name: Agent compatibility report
description: Submit evidence from an agent installation and read-only review.
title: "[Agent compatibility] "
labels:
  - agent-compatibility
  - triage
body:
  - type: input
    id: agent
    attributes:
      label: Agent and exact version
    validations:
      required: true
  - type: input
    id: operating-system
    attributes:
      label: Operating system
    validations:
      required: true
  - type: input
    id: install-path
    attributes:
      label: Project-scoped installation path
    validations:
      required: true
  - type: dropdown
    id: discovery
    attributes:
      label: Were all four skills discovered?
      options:
        - "Yes"
        - "No"
    validations:
      required: true
  - type: input
    id: invocation
    attributes:
      label: Invocation used
    validations:
      required: true
  - type: textarea
    id: result
    attributes:
      label: Read-only review result
      description: Describe behavior and provide redacted evidence only.
    validations:
      required: true
  - type: checkboxes
    id: safety
    attributes:
      label: Safety confirmation
      options:
        - label: The review was read-only and this report contains no sensitive values.
          required: true
```

Create `.github/ISSUE_TEMPLATE/new-check-proposal.yml`:

```yaml
name: New check proposal
description: Propose an evidence-backed production-preparation check.
title: "[Check proposal] "
labels:
  - check-proposal
  - triage
body:
  - type: input
    id: domain
    attributes:
      label: Readiness domain
    validations:
      required: true
  - type: textarea
    id: applicability
    attributes:
      label: Applicability rule
      description: State which project evidence makes this check applicable.
    validations:
      required: true
  - type: textarea
    id: evidence
    attributes:
      label: Evidence source
      description: State what can be inspected without exposing sensitive values.
    validations:
      required: true
  - type: dropdown
    id: action-level
    attributes:
      label: Maximum proposed action level
      options:
        - Stop before launch
        - Resolve before launch
        - Plan soon
        - Improve when appropriate
        - Human review needed
    validations:
      required: true
  - type: textarea
    id: error-boundaries
    attributes:
      label: False-positive and false-negative boundaries
    validations:
      required: true
  - type: dropdown
    id: human-review
    attributes:
      label: Is human review required?
      options:
        - "Yes"
        - "No"
    validations:
      required: true
```

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Support guidance
    url: https://github.com/Kyle332506/post-vibe-clarity/blob/main/SUPPORT.md
    about: Choose the right support or issue path before filing.
  - name: Private security reporting
    url: https://github.com/Kyle332506/post-vibe-clarity/security/advisories/new
    about: Report suspected vulnerabilities privately and omit secret values.
```

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Scope

Describe the bounded change and why it belongs in PostVibeClarity.

## Evidence

List the evidence, applicability rule, and known limitations.

## Verification

- [ ] `pnpm verify:foundation` passes.
- [ ] New or changed behavior has regression coverage.
- [ ] Documentation and current coverage are accurate.
- [ ] Output, fixtures, and issue text contain no secret or personal values.
- [ ] The change adds no certification, production-readiness guarantee, or complete-security claim.

## Rollback

Describe how to revert or disable the change if its evidence model is wrong.
```

The forms collect the following evidence:

```text
bug-report: reproduction, expected behavior, actual behavior, toolkit version, project shape, redacted evidence
agent-compatibility: agent name/version, OS, install path, discovery result, invocation result, representative read-only review result
new-check-proposal: domain, applicability rule, evidence source, action level, false-positive risk, false-negative boundary, human-review requirement
```

Create `config.yml` with `blank_issues_enabled: false` and contact links to `SUPPORT.md` and `SECURITY.md`. The pull request template requires scope, evidence, tests, documentation, redaction confirmation, disclaimer/claim review, and rollback notes.

- [ ] **Step 6: Add branch-protection payload**

Create `.github/branch-protection.json`:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["verify"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
```

- [ ] **Step 7: Run focused tests and lockfile validation**

Run: `pnpm install --lockfile-only`

Expected: exit 0 with no dependency changes beyond package-manager metadata.

Run: `pnpm test tests/repository/github-metadata.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .github tests/repository/github-metadata.test.ts
git commit -m "ci: add repository contribution gates"
```

---

### Task 6: Social Preview, Release Notes, and Settings Runbook

**Files:**
- Create: `assets/social-preview.png`
- Create: `tests/repository/social-preview.test.ts`
- Create: `tests/repository/repository-settings.test.ts`
- Create: `docs/releases/v0.1.0.md`
- Create: `docs/repository-settings.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Approved hero copy, full disclaimer, repository description, topics, and `.github/branch-protection.json`.
- Produces: Upload-ready 1280 by 640 PNG and operator-reviewed release/settings artifacts.

- [ ] **Step 1: Write the failing social-preview test**

Create `tests/repository/social-preview.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { repositoryPath } from './repository-docs.js';

describe('repository social preview', () => {
  it('is an upload-ready 1280 by 640 PNG under 1 MB', async () => {
    const image = await readFile(repositoryPath('assets/social-preview.png'));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(1280);
    expect(image.readUInt32BE(20)).toBe(640);
    expect(image.byteLength).toBeLessThan(1_000_000);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm test tests/repository/social-preview.test.ts`

Expected: FAIL because `assets/social-preview.png` does not exist.

- [ ] **Step 3: Generate and visually inspect the social preview**

Use the image-generation workflow with this prompt:

```text
Create a 1280 by 640 GitHub repository social preview for an open-source developer tool. Restrained typography-first layout, dark neutral background, high contrast, generous whitespace. Exact text: “PostVibeClarity” and “Prepare vibe-coded projects for production with evidence—not guesswork.” No emojis, mascots, shields, security seals, certification marks, readiness seals, framework logos, gradients that reduce readability, or extra text.
```

Inspect the output at full size. Reject any asset with misspelled text, extra symbols, badge-like seals, illegible contrast, or altered wording. Save the accepted PNG at `assets/social-preview.png` and optimize it below 1 MB without changing dimensions.

- [ ] **Step 4: Write release notes**

Create `docs/releases/v0.1.0.md` with `Foundation`, `Included checks`, `Installation`, `Known limitations`, `Compatibility evidence`, `Verification`, and `Disclaimer` sections. State that v0.1.0 is the stable foundation release and link to `docs/foundation-coverage.md`, the five installation guides, `DISCLAIMER.md`, and `SECURITY.md`. Do not call applications production-ready or fully secured.

- [ ] **Step 5: Test and write the repository-settings runbook**

First create `tests/repository/repository-settings.test.ts` and run it RED. Require four distinct approval-gate headings; exactly four `Target`, `Effect`, and explicit-wait statements; the vulnerability-alert enablement call; and audit sections/commands for topics, merge methods, Projects, all security controls, private vulnerability reporting, branch protection, CI, and manual social preview.

Create `docs/repository-settings.md` with the approved description, eight topics, feature toggles, merge policy, security controls, branch protection, social-preview upload, complete state audit, and release gate. Before commands for each mutation class, include a separate heading and show `Target`, `Effect`, exact preview values, and `Wait for explicit user approval before continuing.` for: repository settings; security controls; branch protection; and manual social-preview upload. Repository-creation approval does not satisfy any of these gates.

Include these exact commands, with `PVC_OWNER` resolved from `gh api user --jq .login`:

```bash
gh repo edit "$PVC_OWNER/post-vibe-clarity" \
  --description "Evidence-backed production preparation for vibe-coded apps and projects." \
  --enable-issues=true \
  --enable-discussions=false \
  --enable-wiki=false \
  --enable-projects=false \
  --enable-squash-merge=true \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --delete-branch-on-merge
```

Add one `gh repo edit --add-topic` command containing all eight topics. Add:

```bash
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/vulnerability-alerts"
gh repo edit "$PVC_OWNER/post-vibe-clarity" --enable-secret-scanning=true
gh repo edit "$PVC_OWNER/post-vibe-clarity" --enable-secret-scanning-push-protection=true
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/private-vulnerability-reporting"
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/branches/main/protection" --input .github/branch-protection.json
```

After approved changes, audit repository identity/features, topics, merge methods, Projects, vulnerability alerts, secret scanning, push protection, private vulnerability reporting, branch protection, CI, and the manual social preview. Use read-only `gh api`/`gh repo view` calls for API-visible settings and record the social-preview asset hash, reviewer, date, and visible state manually. State that every control is recorded as configured, unavailable with response/date, or not approved; never silently claim an unsupported control. Social-preview upload remains a documented Settings-page action because GitHub does not expose it through the chosen CLI workflow.

- [ ] **Step 6: Link release and settings documentation**

Add a maintainer-only link to `docs/repository-settings.md` in `CONTRIBUTING.md`. Do not put an unreleased `v0.1.0` badge or release link in the README before publication.

- [ ] **Step 7: Run focused tests**

Run: `pnpm test tests/repository/social-preview.test.ts tests/repository/repository-settings.test.ts tests/repository/homepage.test.ts tests/repository/community-health.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add README.md CONTRIBUTING.md assets/social-preview.png docs/releases/v0.1.0.md docs/repository-settings.md tests/repository/social-preview.test.ts tests/repository/repository-settings.test.ts
git commit -m "docs: prepare stable foundation release"
```

---

### Task 7: Full Verification and Public GitHub Setup

**Files:**
- Verify all files from Tasks 1–6.
- No new local files unless verification exposes a documented defect.

**Interfaces:**
- Consumes: A clean, reviewed implementation branch; `main`; authenticated `gh`; all repository artifacts; the `verify` workflow.
- Produces: Public `Kyle332506/post-vibe-clarity`, configured repository controls, and optional `v0.1.0` release after a separate publication approval.

- [ ] **Step 1: Run the complete local gate**

Run: `pnpm verify:foundation`

Expected: build succeeds, all tests pass, and the example CLI review emits a redacted report.

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: no output.

- [ ] **Step 2: Review repository-facing claims**

Run:

```bash
rg -n -i "certified production ready|100% secure|fully secure|no vulnerabilities|guaranteed compliant|safe to launch" README.md DISCLAIMER.md ROADMAP.md CONTRIBUTING.md SECURITY.md SUPPORT.md CODE_OF_CONDUCT.md docs .github
```

Expected: no positive guarantee. Any matches must be negations, prohibitions, or disclaimer language and must be manually inspected.

Run:

```bash
rg -n -P "\p{Extended_Pictographic}" README.md DISCLAIMER.md ROADMAP.md CONTRIBUTING.md SECURITY.md SUPPORT.md CODE_OF_CONDUCT.md docs .github
```

Expected: no output.

- [ ] **Step 3: Complete the implementation branch review and integration choice**

Use the required final code-review and verification workflow. Present the user with the branch-finishing choices; do not merge, push, or discard without their selection. Public setup continues only after the implementation is on local `main` and `pnpm verify:foundation` passes there.

- [ ] **Step 4: Preflight GitHub identity without mutating remote state**

Run:

```bash
gh auth status
gh api user --jq .login
gh repo view "$(gh api user --jq .login)/post-vibe-clarity"
```

Expected: authentication succeeds. The final command should report that the repository does not exist; if it exists, stop and inspect it instead of overwriting or repurposing it.

Also verify that the login output is exactly `Kyle332506`; otherwise stop and ask the user to reconcile the active GitHub account.

- [ ] **Step 5: Obtain explicit approval for public repository creation**

Show the user:

```text
Owner: authenticated GitHub login
Repository: post-vibe-clarity
Visibility: public
Source: verified local main branch
Initial push: main and complete history
```

Do not continue without explicit approval.

- [ ] **Step 6: Create and push the public repository**

From the verified main repository root:

```bash
PVC_OWNER="$(gh api user --jq .login)"
PVC_MAIN_ROOT="$(git rev-parse --show-toplevel)"
gh repo create "$PVC_OWNER/post-vibe-clarity" \
  --public \
  --source "$PVC_MAIN_ROOT" \
  --remote origin \
  --push \
  --description "Evidence-backed production preparation for vibe-coded apps and projects."
```

Expected: GitHub returns the new repository URL and `main` is the default branch. If an `origin` remote already exists, stop and reconcile it with the user before running `gh repo create`.

- [ ] **Step 7: Obtain approval for repository settings, then apply only that class**

Show the exact target `$PVC_OWNER/post-vibe-clarity` and the effect on description, topics, Issues, Discussions, wiki, Projects, merge methods, and delete-on-merge. Wait for explicit user approval that is separate from repository creation. Only then run the repository-settings commands in `docs/repository-settings.md`; do not change security, branch protection, or social preview in this step.

- [ ] **Step 8: Obtain approval for security controls, then apply only that class**

Show the exact repository target and the effect of enabling vulnerability alerts, secret scanning, push protection, and private vulnerability reporting. Wait for a new explicit user approval. Only then run the four reviewed security commands, including `PUT repos/$PVC_OWNER/post-vibe-clarity/vulnerability-alerts`. Record each result independently as configured, unavailable with response/date, or not approved.

- [ ] **Step 9: Obtain approval for branch protection, then apply only that class**

Show the exact `main` branch target and preview `.github/branch-protection.json`, including the required `verify` check, strict mode, linear history, conversation resolution, and force-push/deletion prohibitions. Wait for a new explicit user approval. Only then apply the payload.

- [ ] **Step 10: Obtain approval for manual social-preview upload, then apply only that class**

Show the exact repository Settings target and preview `assets/social-preview.png`, explaining that it becomes the public social preview. Wait for a new explicit user approval. Only then perform the manual upload and record the asset hash, reviewer, date, and visible result.

- [ ] **Step 11: Audit every requested repository state**

Follow the complete read-only audit in `docs/repository-settings.md`: identity/features, all eight topics, merge methods, Projects, vulnerability alerts, secret scanning, push protection, private vulnerability reporting, branch protection, Foundation CI, and manual social preview. Every item must be recorded as configured, unavailable with the observed response/date, or not approved. Do not infer success from a mutation command's exit code.

Expected: the audit record corresponds exactly to the approvals and observed state; any unavailable or unapproved item remains explicit before a release decision.

- [ ] **Step 12: Obtain separate approval to publish v0.1.0**

Show the user the default-branch CI result, known limitations, compatibility labels, release notes, and disclaimer. Do not create a tag or release without explicit approval.

- [ ] **Step 13: Publish and verify the stable foundation release**

After approval:

```bash
gh release create v0.1.0 \
  --repo "$PVC_OWNER/post-vibe-clarity" \
  --target main \
  --title "PostVibeClarity v0.1.0 - Stable foundation" \
  --notes-file docs/releases/v0.1.0.md
gh release view v0.1.0 --repo "$PVC_OWNER/post-vibe-clarity"
```

Expected: the release is public, points to the verified `main` commit, and displays the approved limitations and disclaimer.
