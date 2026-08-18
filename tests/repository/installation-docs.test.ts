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
  ])('%s replaces only its four installed skill directories when updating', async (id, projectPath) => {
    const guide = await readRepositoryFile(`docs/installation/${id}.md`);
    expect(guide).toContain(`Before copying, remove exactly these four directories from the current project's \`${projectPath}\`: \`post-vibe-clarity\`, \`project-discovery\`, \`secret-exposure\`, and \`launch-essentials\`.`);
  });
});
