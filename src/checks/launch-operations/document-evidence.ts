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

const sourceEvidenceExtensions = new Set([
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

function isSourceEvidenceLocation(location: string): boolean {
  return sourceEvidenceExtensions.has(extname(location).toLowerCase());
}

type SourceEvidence = {
  executable: string;
  descriptions: string;
};

function scanSourceEvidence(content: string, location: string): SourceEvidence | undefined {
  if (!isSourceEvidenceLocation(location)) return undefined;

  const extension = extname(location).toLowerCase();
  const hashComments = new Set(['.py', '.rb']).has(extension);
  const templateLiterals = new Set(['.js', '.jsx', '.ts', '.tsx']).has(extension);
  const executableLines: string[] = [];
  const descriptionLines: string[] = [];
  let blockComment = false;
  let docstring: '"""' | "'''" | undefined;
  let rubyDocumentation = false;
  let templateLiteral = false;

  for (const sourceLine of content.replace(/\r\n?/gu, '\n').split('\n')) {
    let line = sourceLine;

    if (rubyDocumentation) {
      if (/^[\t ]*=end\b/u.test(line)) rubyDocumentation = false;
      continue;
    }
    if (extension === '.rb' && /^[\t ]*=begin\b/u.test(line)) {
      rubyDocumentation = true;
      continue;
    }

    if (templateLiteral) {
      if (/(?<!\\)`/u.test(line)) templateLiteral = false;
      continue;
    }

    if (docstring) {
      const close = line.indexOf(docstring);
      if (close === -1) continue;
      line = line.slice(close + docstring.length);
      docstring = undefined;
    }

    if (blockComment) {
      const close = line.indexOf('*/');
      if (close === -1) {
        descriptionLines.push(line);
        continue;
      }
      descriptionLines.push(line.slice(0, close));
      line = line.slice(close + 2);
      blockComment = false;
    }

    let commentStart = line.indexOf('/*');
    while (commentStart !== -1) {
      const commentEnd = line.indexOf('*/', commentStart + 2);
      if (commentEnd === -1) {
        descriptionLines.push(line.slice(commentStart + 2));
        line = line.slice(0, commentStart);
        blockComment = true;
        break;
      }
      descriptionLines.push(line.slice(commentStart + 2, commentEnd));
      line = `${line.slice(0, commentStart)} ${line.slice(commentEnd + 2)}`;
      commentStart = line.indexOf('/*');
    }

    const trimmed = line.trimStart();
    const docstringMatch = /^("""|''')/u.exec(trimmed);
    if (docstringMatch) {
      const marker = docstringMatch[1] as '"""' | "'''";
      const remainder = trimmed.slice(marker.length);
      const close = remainder.indexOf(marker);
      if (close === -1) docstring = marker;
      line = close === -1 ? '' : remainder.slice(close + marker.length);
    }

    const slashComment = line.indexOf('//');
    const hashComment = hashComments ? line.indexOf('#') : -1;
    const lineComment = [slashComment, hashComment]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];
    if (lineComment !== undefined) {
      const markerLength = line.startsWith('//', lineComment) ? 2 : 1;
      descriptionLines.push(line.slice(lineComment + markerLength));
      line = line.slice(0, lineComment);
    }
    if (templateLiterals) {
      const backticks = [...line.matchAll(/(?<!\\)`/gu)];
      if (backticks.length % 2 === 1) {
        line = line.slice(0, backticks[0]?.index ?? 0);
        templateLiteral = true;
      }
    }
    if (line.trim() !== '') executableLines.push(line);
  }

  if (blockComment || docstring || rubyDocumentation || templateLiteral) return undefined;
  return {
    executable: executableLines.join('\n'),
    descriptions: descriptionLines.join('\n'),
  };
}

export function executableSourceEvidence(content: string, location: string): string | undefined {
  return scanSourceEvidence(content, location)?.executable;
}

export function descriptiveSourceEvidence(content: string, location: string): string | undefined {
  return scanSourceEvidence(content, location)?.descriptions;
}

function visualIndentation(line: string): number {
  let columns = 0;
  for (const character of line) {
    if (character === ' ') columns += 1;
    else if (character === '\t') columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

function markdownBoundary(line: string): boolean {
  return /^[\t ]{0,3}(?:#{1,6}[\t ]|(?:[-+*]|\d+[.)])[\t ]|`{3,}|~{3,}|<pre\b)/iu.test(line);
}

function sanitizeProseRiskContent(content: string, location: string): string {
  const markdown = new Set(['.md', '.mdx']).has(extname(location).toLowerCase());
  let fence: { marker: '`' | '~'; length: number } | undefined;
  let blockquote = false;
  let quotation: '"' | "'" | '“' | '‘' | undefined;
  let preformatted = false;
  const sanitized: string[] = [];

  for (const line of content.replace(/\r\n?/gu, '\n').split('\n')) {
    const trimmed = line.trim();
    if (markdown) {
      if (preformatted) {
        if (/<\/pre[\t ]*>/iu.test(line)) preformatted = false;
        sanitized.push('');
        continue;
      }
      if (/<pre\b/iu.test(line)) {
        preformatted = !/<\/pre[\t ]*>/iu.test(line);
        sanitized.push('');
        continue;
      }

      const fenceMatch = /^[\t ]{0,3}(`{3,}|~{3,})/u.exec(line);
      if (fenceMatch) {
        const delimiter = fenceMatch[1]!;
        const marker = delimiter[0] as '`' | '~';
        if (!fence) fence = { marker, length: delimiter.length };
        else if (fence.marker === marker && delimiter.length >= fence.length) fence = undefined;
        sanitized.push('');
        continue;
      }
      if (fence) {
        sanitized.push('');
        continue;
      }
      if (trimmed === '') blockquote = false;
      else if (/^[\t ]{0,3}>/u.test(line)) blockquote = true;
      else if (blockquote && markdownBoundary(line)) blockquote = false;
      if (blockquote || visualIndentation(line) >= 4) {
        sanitized.push('');
        continue;
      }
    }

    if (quotation) {
      const closing = quotation === '“' ? '”' : quotation === '‘' ? '’' : quotation;
      if (line.includes(closing)) quotation = undefined;
      sanitized.push('');
      continue;
    }
    const quotationMatch = /(["“‘])|^[\t ]{0,3}(')/u.exec(line);
    if (quotationMatch) {
      const opening = (quotationMatch[1] ?? quotationMatch[2]) as '"' | "'" | '“' | '‘';
      const closing = opening === '“' ? '”' : opening === '‘' ? '’' : opening;
      const openingIndex = line.indexOf(opening, quotationMatch.index);
      const afterOpening = line.slice(openingIndex + opening.length);
      if (!afterOpening.includes(closing)) quotation = opening;
      sanitized.push('');
      continue;
    }
    sanitized.push(line.includes('?') ? '' : line);
  }

  return sanitized.join('\n');
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
  return structuredFieldValueMatcher(fieldNames, (value) => testPattern(pattern, value));
}

export function structuredFieldValueMatcher(
  fieldNames: readonly string[],
  predicate: (value: string) => boolean,
): (content: string, location: string) => boolean {
  return (content, location) => structuredFieldValues(content, location, fieldNames)
    .some(predicate);
}

export function normalizeEvidenceValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/[\t ]+/gu, ' ').replace(/[.!;,]+$/gu, '').toLowerCase();
}

export function hasNegativeEvidenceAssertion(value: string, allowed: readonly RegExp[] = []): boolean {
  let normalized = normalizeEvidenceValue(value);
  for (const pattern of allowed) normalized = normalized.replace(new RegExp(pattern.source, pattern.flags), ' ');
  return /\b(?:no|not|none|never|disabled|unknown|unavailable|missing|pending|n\/a|tbd|todo)\b/iu.test(normalized);
}

export function evidenceWordCount(value: string): number {
  return normalizeEvidenceValue(value).match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
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
  const executableContent = executableSourceEvidence(content, location);
  const patternContent = isSourceEvidenceLocation(location) ? executableContent ?? '' : content;
  return requirements.filter(({ patterns, textOnlyPatterns, matches }) =>
    ((!textOnlyPatterns || !structured) && patterns.some((pattern) => testPattern(pattern, patternContent)))
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
    const riskContent = isStructuredEvidenceLocation(location)
      ? undefined
      : sanitizeProseRiskContent(content.value, location);
    if (riskContent !== undefined && profile.riskPatterns.some((pattern) => testPattern(pattern, riskContent))) {
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
