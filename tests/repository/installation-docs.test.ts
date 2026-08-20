import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { expectLocalLinksResolve, expectNoEmoji, readRepositoryFile } from './repository-docs.js';

const temporaryRoots: string[] = [];
const skillNames = [
  'post-vibe-clarity',
  'project-discovery',
  'secret-exposure',
  'launch-essentials',
  'universal-verification',
] as const;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

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
    const manifest = parse(source) as {
      schemaVersion: string;
      releaseVersion: string;
      canonicalSkills: string[];
      agents: AgentEntry[];
    };
    expect(manifest.schemaVersion).toBe('0.1');
    expect(manifest.releaseVersion).toBe('v0.2.0');
    expect(manifest.canonicalSkills).toEqual([...skillNames]);
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
    expect(guide).toContain('universal-verification');
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
    expect(guide).toContain('PVC_VERSION="v0.2.0"');
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

  it.each([
    ['codex', '.agents/skills'],
    ['claude-code', '.claude/skills'],
    ['cursor', '.agents/skills'],
    ['windsurf', '.agents/skills'],
  ])('%s leaves the live installation untouched when staging is incomplete', async (id, projectPath) => {
    const guide = await readRepositoryFile(`docs/installation/${id}.md`);
    const installBlock = /```bash\n([\s\S]*?)\n```/.exec(guide)?.[1];
    expect(installBlock).toBeDefined();

    const directory = await mkdtemp(join(tmpdir(), 'postvibe-install-failure-'));
    temporaryRoots.push(directory);
    const fakeBin = join(directory, 'fake-bin');
    const installRoot = join(directory, projectPath);
    await mkdir(fakeBin, { recursive: true });
    for (const skillName of skillNames) {
      const skillDirectory = join(installRoot, skillName);
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(join(skillDirectory, 'sentinel.txt'), `original-${skillName}\n`, 'utf8');
    }

    const fakeGit = join(fakeBin, 'git');
    await writeFile(fakeGit, [
      '#!/bin/sh',
      'if [ "$1" = "clone" ]; then',
      '  for PVC_ARGUMENT in "$@"; do PVC_DESTINATION="$PVC_ARGUMENT"; done',
      '  for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials; do',
      '    mkdir -p "$PVC_DESTINATION/skills/$PVC_SKILL"',
      '    printf "staged-%s\\n" "$PVC_SKILL" > "$PVC_DESTINATION/skills/$PVC_SKILL/SKILL.md"',
      '  done',
      '  exit 0',
      'fi',
      'if [ "$1" = "-C" ]; then',
      '  printf "0123456789abcdef0123456789abcdef01234567\\n"',
      '  exit 0',
      'fi',
      'exit 2',
      '',
    ].join('\n'), 'utf8');
    await chmod(fakeGit, 0o755);

    const scriptPath = join(directory, 'install.sh');
    await writeFile(scriptPath, `${installBlock}\n`, 'utf8');
    const result = spawnSync('/bin/sh', [scriptPath], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    });

    expect(result.status).not.toBe(0);
    for (const skillName of skillNames) {
      await expect(readFile(join(installRoot, skillName, 'sentinel.txt'), 'utf8'))
        .resolves.toBe(`original-${skillName}\n`);
    }
  });

  it('gives the fallback guide equivalent pinned provenance and preservation semantics', async () => {
    const guide = await readRepositoryFile('docs/installation/agent-skills.md');
    expect(guide).toContain('PVC_VERSION="v0.2.0"');
    expect(guide).toContain('PVC_INSTALL_ROOT="<host-project-skill-directory>"');
    expect(guide).toContain('.postvibeclarity-revision');
    expect(guide).toContain('.postvibeclarity-backups');
    expect(guide).toContain('stage the five pinned skill directories');
    expect(guide).toContain('compare each existing destination with the staged copy');
    expect(guide).toContain('move every existing destination into the bounded backup directory before replacement');
  });
});
