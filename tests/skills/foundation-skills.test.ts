import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateReadinessManifest } from '../../src/validation/readiness-schema.js';

const skillsRoot = new URL('../../skills/', import.meta.url);
const expectedSkills = [
  'launch-essentials',
  'post-vibe-clarity',
  'project-discovery',
  'secret-exposure',
] as const;
const skillsWithSidecars = new Set(['launch-essentials', 'secret-exposure']);

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  metadata?: unknown;
}

interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  source: string;
}

async function loadSkill(skillName: string): Promise<ParsedSkill> {
  const source = await readFile(new URL(`${skillName}/SKILL.md`, skillsRoot), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(source);
  expect(match, `${skillName}/SKILL.md must contain YAML frontmatter and a body`).not.toBeNull();
  if (!match) throw new Error(`Invalid frontmatter in ${skillName}/SKILL.md`);
  const frontmatterSource = match[1];
  const body = match[2];
  if (frontmatterSource === undefined || body === undefined) {
    throw new Error(`Incomplete frontmatter in ${skillName}/SKILL.md`);
  }

  return {
    frontmatter: parse(frontmatterSource) as SkillFrontmatter,
    body: body.trim(),
    source,
  };
}

describe('foundation skill packages', () => {
  it('contains the canonical foundation skill directories', async () => {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toEqual([...expectedSkills]);
  });

  for (const skillName of expectedSkills) {
    describe(skillName, () => {
      it(`${skillName}: has portable, discoverable frontmatter`, async () => {
        const { frontmatter, body } = await loadSkill(skillName);
        expect(frontmatter.name).toBe(skillName);
        expect(frontmatter.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(frontmatter.description).toEqual(expect.any(String));
        expect(frontmatter.description).toMatch(/^Use when\b/);
        expect((frontmatter.description as string).split(/\s+/).length).toBeGreaterThanOrEqual(8);
        expect((frontmatter.description as string).length).toBeLessThanOrEqual(1024);
        expect(frontmatter.license).toBe('Apache-2.0');
        expect(body.length).toBeGreaterThan(0);
      });

      it(`${skillName}: avoids unconditional prohibited verdicts`, async () => {
        const { source } = await loadSkill(skillName);
        const prohibitedVerdicts = [
          'certified production ready',
          '100% secure',
          'safe to launch',
          'no vulnerabilities',
          'all issues resolved',
          'guaranteed compliant',
        ];
        const normalizedSource = source.toLowerCase();

        for (const verdict of prohibitedVerdicts) {
          expect(normalizedSource, `${skillName} contains the prohibited verdict phrase "${verdict}"`).not.toContain(verdict);
        }
      });

      if (skillsWithSidecars.has(skillName)) {
        it(`${skillName}: has a valid, matching readiness sidecar`, async () => {
          const input = parse(await readFile(new URL(`${skillName}/readiness.yaml`, skillsRoot), 'utf8')) as { id?: unknown };
          expect(await validateReadinessManifest(input)).toEqual({ ok: true });
          expect(input.id).toBe(skillName);
        });

        it(`${skillName}: provides deterministic and manual verification paths`, async () => {
          const { body } = await loadSkill(skillName);
          expect(body).toMatch(/^## Deterministic path$/m);
          expect(body).toMatch(/^## Manual fallback$/m);
        });
      }
    });
  }

  it('post-vibe-clarity: defines the complete, ordered review lifecycle and safety gates', async () => {
    const { frontmatter, body } = await loadSkill('post-vibe-clarity');
    const metadata = frontmatter.metadata as Record<string, unknown>;
    expect(metadata).toBeTypeOf('object');
    expect(metadata['postvibeclarity.dev/role']).toBe('orchestrator');

    const lifecycleHeadings = [...body.matchAll(/^## \d+\. (Discover|Preview|Audit|Approve changes|Recheck|Report)$/gm)]
      .map((match) => match[1]);
    expect(lifecycleHeadings).toEqual(['Discover', 'Preview', 'Audit', 'Approve changes', 'Recheck', 'Report']);
    expect(body).toMatch(/read-only/i);
    expect(body).toMatch(/selected checks/i);
    expect(body).toMatch(/required access/i);
    expect(body).toContain('postvibe review');
    expect(body).toMatch(/tooling is unavailable/i);
    expect(body).toMatch(/instruction-only|manual fallback/i);
    expect(body).toMatch(/Level 2[\s\S]*separate[\s\S]*approval/i);
    expect(body).toMatch(/Level 3[\s\S]*separate[\s\S]*approval/i);
    expect(body).toMatch(/Level 4[\s\S]*prohibit/i);
    expect(body).toMatch(/recheck[\s\S]*resolved/i);
    expect(body).toContain('This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.');
  });

  it('project-discovery: structures a read-only capability inventory', async () => {
    const { body } = await loadSkill('project-discovery');
    expect(body).toMatch(/read-only/i);
    expect(body).toMatch(/^## Discovery inventory$/m);
    expect(body).toMatch(/artifact types/i);
    expect(body).toMatch(/runtimes/i);
    expect(body).toMatch(/frameworks/i);
    expect(body).toMatch(/services/i);
    expect(body).toMatch(/sensitive capabilities/i);
    expect(body).toMatch(/verification environments/i);
  });
});
