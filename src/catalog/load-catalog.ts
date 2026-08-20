import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ArtifactType } from '../model/capability.js';
import type { Domain } from '../model/finding.js';
import { compareOrdinal } from '../ordinal.js';
import { validateReadinessManifest } from '../validation/readiness-schema.js';

export interface SkillDescriptor {
  schemaVersion: '0.1';
  id: string;
  skillVersion: string;
  domains: Domain[];
  appliesTo?: { anyArtifacts?: ArtifactType[]; allCapabilities?: string[] };
  modes: Array<'audit' | 'propose' | 'remediate' | 'verify'>;
  maxActionLevel: 0 | 1 | 2 | 3 | 4;
  checks: string[];
  directory: string;
}

interface CatalogCandidate {
  descriptor: SkillDescriptor;
  directoryName: string;
  skillName: string;
}

export async function loadSkillCatalog(root: string): Promise<SkillDescriptor[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const candidates: CatalogCandidate[] = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => compareOrdinal(a.name, b.name))) {
    const directory = join(root, entry.name);
    let readiness: string;

    try {
      readiness = await readFile(join(directory, 'readiness.yaml'), 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) continue;
      throw error;
    }

    const skillSource = await readFile(join(directory, 'SKILL.md'), 'utf8');
    const skillName = parseSkillName(skillSource, entry.name);
    const input = parse(readiness) as unknown;
    const validation = await validateReadinessManifest(input);
    if (!validation.ok) throw new Error(`${entry.name}/readiness.yaml: ${validation.errors.join('; ')}`);
    candidates.push({
      descriptor: { ...(input as Omit<SkillDescriptor, 'directory'>), directory },
      directoryName: entry.name,
      skillName,
    });
  }

  validateUniqueOwnership(candidates);
  for (const { descriptor, directoryName, skillName } of candidates) {
    if (skillName !== directoryName) {
      throw new Error(`${directoryName}/SKILL.md name must match directory name "${directoryName}"`);
    }
    if (descriptor.id !== directoryName) {
      throw new Error(`${directoryName}/readiness.yaml id must match directory name "${directoryName}"`);
    }
  }

  return candidates.map(({ descriptor }) => descriptor);
}

function parseSkillName(source: string, directoryName: string): string {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match?.[1]) throw new Error(`${directoryName}/SKILL.md must contain YAML frontmatter`);
  const frontmatter = parse(match[1]) as unknown;
  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
    throw new Error(`${directoryName}/SKILL.md frontmatter must be a mapping`);
  }
  const name: unknown = Reflect.get(frontmatter, 'name');
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${directoryName}/SKILL.md frontmatter must contain a name`);
  }
  return name;
}

function validateUniqueOwnership(candidates: CatalogCandidate[]): void {
  const skillOwners = new Map<string, string>();
  const checkOwners = new Map<string, string>();

  for (const { descriptor, directoryName } of candidates) {
    const skillOwner = skillOwners.get(descriptor.id);
    if (skillOwner) {
      throw new Error(`Duplicate skill id "${descriptor.id}" is owned by ${skillOwner} and ${directoryName}`);
    }
    skillOwners.set(descriptor.id, directoryName);

    for (const check of descriptor.checks) {
      const checkOwner = checkOwners.get(check);
      if (checkOwner) {
        throw new Error(`Duplicate check id "${check}" is owned by ${checkOwner} and ${directoryName}`);
      }
      checkOwners.set(check, directoryName);
    }
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
