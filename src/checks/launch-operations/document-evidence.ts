import { lstat, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml, parseDocument as parseYamlDocument } from 'yaml';
import { listProjectFiles } from '../../discovery/file-index.js';
import { compareOrdinal } from '../../ordinal.js';
import type { Evidence } from '../../model/finding.js';
import type {
  DocumentEvidenceProfile,
  DocumentEvidenceResult,
  EvidenceRequirement,
} from './types.js';

export const MAX_OPERATIONS_EVIDENCE_BYTES = 131_072;

export const supportedOperationsEvidenceExtensions = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
]);

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

type BoundedCandidate =
  | { ok: true; value: string }
  | { ok: false; boundary: string };

function testPattern(pattern: RegExp, value: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(value);
}

function isStructuredEvidenceLocation(location: string): boolean {
  return new Set(['.json', '.yaml', '.yml', '.toml']).has(extname(location).toLowerCase());
}

type StructuredRecord = Record<string, unknown>;

function isStructuredRecord(value: unknown): value is StructuredRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  return [];
}

function valuesForTopLevelStructuredFields(value: unknown, fields: ReadonlySet<string>): string[] {
  if (!isStructuredRecord(value)) return [];
  const matchingFields = Object.entries(value)
    .filter(([key]) => fields.has(key.toLowerCase()));
  return matchingFields.length === 1 ? scalarValues(matchingFields[0]![1]) : [];
}

function structuredFieldValues(content: string, location: string, fieldNames: readonly string[]): string[] {
  const fields = new Set(fieldNames.map((field) => field.toLowerCase()));
  const extension = extname(location).toLowerCase();

  try {
    if (extension === '.json') {
      const value = JSON.parse(content);
      const document = parseYamlDocument(content, { schema: 'json', uniqueKeys: true });
      return document.errors.length === 0 ? valuesForTopLevelStructuredFields(value, fields) : [];
    }
    if (extension === '.yaml' || extension === '.yml') {
      return valuesForTopLevelStructuredFields(parseYaml(content), fields);
    }
    if (extension === '.toml') return valuesForTopLevelStructuredFields(parseToml(content), fields);
  } catch {
    return [];
  }

  return [];
}

export function structuredFieldMatcher(
  fieldNames: readonly string[],
  pattern: RegExp,
): (content: string, location: string) => boolean {
  return (content, location) => structuredFieldValues(content, location, fieldNames)
    .some((value) => testPattern(pattern, value));
}

function isSupportedEvidenceLocation(location: string, profile: DocumentEvidenceProfile): boolean {
  if (supportedOperationsEvidenceExtensions.has(extname(location).toLowerCase())) return true;
  return extname(location) === ''
    && profile.extensionlessCandidatePaths?.some((pattern) => testPattern(pattern, location)) === true;
}

async function readBoundedCandidate(root: string, location: string): Promise<BoundedCandidate> {
  const path = join(root, location);

  try {
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink()) {
      return { ok: false, boundary: `${location} is not a regular file.` };
    }
    if (details.size > MAX_OPERATIONS_EVIDENCE_BYTES) {
      return {
        ok: false,
        boundary: `${location} exceeds the ${MAX_OPERATIONS_EVIDENCE_BYTES}-byte operations evidence limit.`,
      };
    }

    const bytes = await readFile(path);
    if (bytes.includes(0)) {
      return { ok: false, boundary: `${location} contains unsupported binary content.` };
    }
    try {
      return { ok: true, value: strictUtf8Decoder.decode(bytes) };
    } catch {
      return { ok: false, boundary: `${location} contains unsupported binary content.` };
    }
  } catch {
    return { ok: false, boundary: `${location} could not be safely read as operations evidence.` };
  }
}

function matchedRequirements(
  content: string,
  location: string,
  requirements: readonly EvidenceRequirement[],
): EvidenceRequirement[] {
  const structured = isStructuredEvidenceLocation(location);
  return requirements.filter(({ patterns, textOnlyPatterns, matches }) =>
    ((!textOnlyPatterns || !structured) && patterns.some((pattern) => testPattern(pattern, content)))
      || matches?.(content, location) === true);
}

function compareEvidence(left: Evidence, right: Evidence): number {
  const locationOrder = compareOrdinal(left.location ?? '', right.location ?? '');
  return locationOrder === 0 ? compareOrdinal(left.summary, right.summary) : locationOrder;
}

export async function evaluateDocumentEvidence(
  root: string,
  excludedArtifactPaths: readonly string[],
  profile: DocumentEvidenceProfile,
): Promise<DocumentEvidenceResult> {
  const candidates = (await listProjectFiles(root, excludedArtifactPaths))
    .filter((location) => isSupportedEvidenceLocation(location, profile))
    .filter((location) => profile.candidatePaths.some((pattern) => testPattern(pattern, location)));

  const matched = new Set<string>();
  const boundaries = new Set<string>();
  const evidence: Evidence[] = [];
  const riskEvidence: Evidence[] = [];

  for (const location of candidates) {
    const content = await readBoundedCandidate(root, location);
    if (!content.ok) {
      boundaries.add(content.boundary);
      continue;
    }

    const requirementMatches = matchedRequirements(content.value, location, profile.requirements);
    for (const requirement of requirementMatches) matched.add(requirement.id);
    if (requirementMatches.length > 0) {
      evidence.push({
        kind: 'file',
        location,
        summary: 'Repository operations evidence matched the versioned content profile.',
      });
    }
    if (profile.riskPatterns.some((pattern) => testPattern(pattern, content.value))) {
      riskEvidence.push({
        kind: 'file',
        location,
        summary: 'Repository text explicitly describes the check-specific risky condition.',
      });
    }
  }

  const matchedRequirementIds = [...matched].sort(compareOrdinal);
  const missingRequirementIds = profile.requirements
    .map(({ id }) => id)
    .filter((id) => !matched.has(id))
    .sort(compareOrdinal);

  return {
    status: candidates.length === 0 ? 'missing' : missingRequirementIds.length === 0 ? 'usable' : 'insufficient',
    evidence: evidence.sort(compareEvidence),
    riskEvidence: riskEvidence.sort(compareEvidence),
    matchedRequirementIds,
    missingRequirementIds,
    unverifiedBoundaries: [...boundaries].sort(compareOrdinal),
  };
}
