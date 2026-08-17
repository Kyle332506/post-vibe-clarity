import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ArtifactType } from '../model/capability.js';
import type { Domain } from '../model/finding.js';
import { validateReadinessManifest } from '../validation/readiness-schema.js';

export interface SkillDescriptor {
  schemaVersion: '0.1';
  id: string;
  domains: Domain[];
  appliesTo?: { anyArtifacts?: ArtifactType[]; allCapabilities?: string[] };
  modes: Array<'audit' | 'propose' | 'remediate' | 'verify'>;
  maxActionLevel: 0 | 1 | 2 | 3 | 4;
  checks: string[];
  directory: string;
}

export async function loadSkillCatalog(root: string): Promise<SkillDescriptor[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const skills: SkillDescriptor[] = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = join(root, entry.name);
    let readiness: string;

    try {
      readiness = await readFile(join(directory, 'readiness.yaml'), 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) continue;
      throw error;
    }

    await readFile(join(directory, 'SKILL.md'), 'utf8');
    const input = parse(readiness) as unknown;
    const validation = await validateReadinessManifest(input);
    if (!validation.ok) throw new Error(`${entry.name}/readiness.yaml: ${validation.errors.join('; ')}`);
    skills.push({ ...(input as Omit<SkillDescriptor, 'directory'>), directory });
  }

  return skills;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
