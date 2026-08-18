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
    expectNoEmoji(guide, path);
    await expectLocalLinksResolve(path, guide);
  });

  it.each([
    ['codex', '.agents/skills'],
    ['claude-code', '.claude/skills'],
    ['cursor', '.agents/skills'],
    ['windsurf', '.agents/skills'],
  ])('%s pins provenance and preserves existing skill directories before replacement', async (id, projectPath) => {
    const guide = await readRepositoryFile(`docs/installation/${id}.md`);
    expect(guide).toContain('PVC_VERSION="v0.1.0"');
    expect(guide).toContain('git clone --branch "$PVC_VERSION" --depth 1 --single-branch "$PVC_REPO_URL" "$PVC_SOURCE"');
    expect(guide).toContain('PVC_REVISION="$(git -C "$PVC_SOURCE" rev-parse HEAD)"');
    expect(guide).toContain(`PVC_INSTALL_ROOT="${projectPath}"`);
    expect(guide).toContain('.postvibeclarity-revision');
    expect(guide).toContain('.postvibeclarity-backups');
    expect(guide).toContain('.postvibeclarity-stage.XXXXXX');
    expect(guide).toContain('diff -qr "$PVC_INSTALL_ROOT/$PVC_SKILL" "$PVC_STAGE/$PVC_SKILL"');
    expect(guide).toContain('mv "$PVC_INSTALL_ROOT/$PVC_SKILL" "$PVC_BACKUP_ROOT/$PVC_SKILL"');
    expect(guide).not.toContain('Before copying, remove exactly');
  });

  it('gives the fallback guide equivalent pinned provenance and preservation semantics', async () => {
    const guide = await readRepositoryFile('docs/installation/agent-skills.md');
    expect(guide).toContain('PVC_VERSION="v0.1.0"');
    expect(guide).toContain('PVC_INSTALL_ROOT="<host-project-skill-directory>"');
    expect(guide).toContain('.postvibeclarity-revision');
    expect(guide).toContain('.postvibeclarity-backups');
    expect(guide).toContain('stage the four pinned skill directories');
    expect(guide).toContain('compare each existing destination with the staged copy');
    expect(guide).toContain('move every existing destination into the bounded backup directory before replacement');
  });
});
