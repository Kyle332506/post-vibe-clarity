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

const javaScriptEvidenceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

function maskSourceFragment(fragment: string): string {
  return fragment.replace(/[^\n]/gu, ' ');
}

function canStartJavaScriptRegex(codeTail: string): boolean {
  const trimmed = codeTail.trimEnd();
  if (trimmed === '') return true;
  if (/[({\[=,:;!?&|+\-*%^~<>]$/u.test(trimmed)) return true;
  return /(?:^|[^\p{L}\p{N}_$])(?:return|throw|case|delete|void|typeof|instanceof|in|of|yield|await)$/u.test(trimmed);
}

function javaScriptRegexEnd(source: string, start: number): number | undefined {
  let characterClass = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '\n') return undefined;
    if (character === '\\') {
      index += 1;
      if (index >= source.length || source[index] === '\n') return undefined;
      continue;
    }
    if (character === '[') characterClass = true;
    else if (character === ']') characterClass = false;
    else if (character === '/' && !characterClass) {
      let end = index + 1;
      while (end < source.length && /[\p{L}]/u.test(source[end]!)) end += 1;
      return end;
    }
  }

  return undefined;
}

function javaScriptStringEnd(source: string, start: number, quote: "'" | '"'): number | undefined {
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '\\') {
      index += 1;
      if (index >= source.length) return undefined;
      continue;
    }
    if (character === quote) return index + 1;
    if (character === '\n') return undefined;
  }
  return undefined;
}

function javaScriptTemplateEnd(source: string, start: number): number | undefined {
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '\\') {
      index += 1;
      if (index >= source.length) return undefined;
      continue;
    }
    if (character === '$' && source[index + 1] === '{') return undefined;
    if (character === '`') return index + 1;
  }
  return undefined;
}

function scanJavaScriptSourceEvidence(content: string): SourceEvidence | undefined {
  const source = content.replace(/\r\n?/gu, '\n');
  const executable: string[] = [];
  const descriptions: string[] = [];
  let codeTail = '';

  const appendExecutable = (fragment: string): void => {
    executable.push(fragment);
    codeTail = (codeTail + fragment).slice(-160);
  };
  const appendMasked = (fragment: string): void => {
    appendExecutable(maskSourceFragment(fragment));
  };

  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    const next = source[index + 1];

    if (character === '/' && next === '/') {
      const lineEnd = source.indexOf('\n', index + 2);
      const end = lineEnd === -1 ? source.length : lineEnd;
      descriptions.push(source.slice(index + 2, end));
      appendMasked(source.slice(index, end));
      index = end;
      continue;
    }

    if (character === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close === -1) return undefined;
      descriptions.push(source.slice(index + 2, close));
      const end = close + 2;
      appendMasked(source.slice(index, end));
      index = end;
      continue;
    }

    if (character === "'" || character === '"') {
      const end = javaScriptStringEnd(source, index, character);
      if (end === undefined) return undefined;
      appendExecutable(source.slice(index, end).replace(/\\\n/gu, '  '));
      index = end;
      continue;
    }

    if (character === '`') {
      const end = javaScriptTemplateEnd(source, index);
      if (end === undefined) return undefined;
      appendMasked(source.slice(index, end));
      index = end;
      continue;
    }

    const jsxClosingTag = character === '/'
      && codeTail.trimEnd().endsWith('<')
      && next !== undefined
      && /[A-Za-z_$>]/u.test(next);
    if (character === '/' && !jsxClosingTag && canStartJavaScriptRegex(codeTail)) {
      const end = javaScriptRegexEnd(source, index);
      if (end === undefined) return undefined;
      appendMasked(source.slice(index, end));
      index = end;
      continue;
    }

    appendExecutable(character);
    index += 1;
  }

  return {
    executable: executable.join(''),
    descriptions: descriptions.join('\n'),
  };
}

function scanLineOrientedSourceEvidence(content: string, extension: string): SourceEvidence | undefined {

  const hashComments = new Set(['.py', '.rb']).has(extension);
  const executableLines: string[] = [];
  const descriptionLines: string[] = [];
  let blockComment = false;
  let docstring: '"""' | "'''" | undefined;
  let rubyDocumentation = false;

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
    if (line.trim() !== '') executableLines.push(line);
  }

  if (blockComment || docstring || rubyDocumentation) return undefined;
  return {
    executable: executableLines.join('\n'),
    descriptions: descriptionLines.join('\n'),
  };
}

function scanSourceEvidence(content: string, location: string): SourceEvidence | undefined {
  if (!isSourceEvidenceLocation(location)) return undefined;
  const extension = extname(location).toLowerCase();
  return javaScriptEvidenceExtensions.has(extension)
    ? scanJavaScriptSourceEvidence(content)
    : scanLineOrientedSourceEvidence(content, extension);
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

type ProseQuotation = '"' | "'" | '“' | '‘';

function quotationClose(quotation: ProseQuotation): '"' | "'" | '”' | '’' {
  if (quotation === '“') return '”';
  if (quotation === '‘') return '’';
  return quotation;
}

function isEscapedDelimiter(line: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function isEvidenceWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}

function canOpenAsciiQuotation(line: string, index: number, quotation: '"' | "'"): boolean {
  const previous = line[index - 1];
  const next = line[index + 1];
  if (quotation === "'" && isEvidenceWordCharacter(previous) && isEvidenceWordCharacter(next)) return false;
  if (previous !== undefined && isEvidenceWordCharacter(previous)) return false;
  if (quotation === '"' || line.slice(index + 1).trim() === '') return true;

  for (let cursor = index + 1; cursor < line.length; cursor += 1) {
    if (line[cursor] !== "'" || isEscapedDelimiter(line, cursor)) continue;
    if (isEvidenceWordCharacter(line[cursor - 1]) && isEvidenceWordCharacter(line[cursor + 1])) continue;
    return true;
  }
  return false;
}

function scanProseQuotationLine(
  line: string,
  initial: ProseQuotation | undefined,
): { quotation: ProseQuotation | undefined; quoted: boolean } {
  let quotation = initial;
  let quoted = quotation !== undefined;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (isEscapedDelimiter(line, index)) continue;

    if (quotation) {
      if (character !== quotationClose(quotation)) continue;
      if (quotation === "'"
        && isEvidenceWordCharacter(line[index - 1])
        && isEvidenceWordCharacter(line[index + 1])) continue;
      quotation = undefined;
      quoted = true;
      continue;
    }

    if (character === '“' || character === '‘') {
      quotation = character;
      quoted = true;
      continue;
    }
    if ((character === '"' || character === "'")
      && canOpenAsciiQuotation(line, index, character)) {
      quotation = character;
      quoted = true;
    }
  }

  return { quotation, quoted };
}

function sanitizeProseRiskContent(content: string, location: string): string {
  const markdown = new Set(['.md', '.mdx']).has(extname(location).toLowerCase());
  let fence: { marker: '`' | '~'; length: number } | undefined;
  let blockquote = false;
  let quotation: ProseQuotation | undefined;
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

    const quotationResult = scanProseQuotationLine(line, quotation);
    quotation = quotationResult.quotation;
    if (quotationResult.quoted) {
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

const incompleteAssignmentPattern = /\b(?:(?:to[\t ]+be|await(?:ing|s)?|requires?|needs?)[\t ]+(?:(?:an?|the|owner|role|team|resource|mechanism)[\t ]+){0,2}(?:assign(?:ed|ment)|determin(?:ed|ation)|decid(?:ed|ision)|confirm(?:ed|ation)|document(?:ed|ation)|select(?:ed|ion)|defin(?:ed|ition)|provid(?:ed|ing))|yet[\t ]+to[\t ]+be[\t ]+(?:assigned|determined|decided|confirmed|documented|selected|defined|provided))\b/iu;
const incompleteStatePattern = /\b(?:no|not|none|never|disabled|unknown|unavailable|missing|pending|unassigned|unowned|undetermined|unspecified|undecided|unconfirmed|n\/a|todo)\b|\bt(?:[.\t _-]*)b(?:[.\t _-]*)(?:a|d)\b/iu;
const fieldEchoFunctionWords = new Set(['a', 'an', 'the', 'been', 'has', 'is']);
const fieldEchoStateWord = /^(?:approved|assigned|available|configured|current|defined|designated|documented|existing|identified|listed|maintained|named|present|provided|recorded|specified|stated)$/u;

export function hasIncompleteEvidenceState(value: string, allowed: readonly RegExp[] = []): boolean {
  let normalized = normalizeEvidenceValue(value);
  for (const pattern of allowed) normalized = normalized.replace(new RegExp(pattern.source, pattern.flags), ' ');
  return incompleteStatePattern.test(normalized) || incompleteAssignmentPattern.test(normalized);
}

export function evidenceWordCount(value: string): number {
  return normalizeEvidenceValue(value).match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

type EvidenceSubstanceOptions = {
  fieldLabels: readonly string[];
  minimumWords?: number;
  allowedIncompleteAssertions?: readonly RegExp[];
};

function fieldEchoWords(value: string): string[] {
  return normalizeEvidenceValue(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function isFieldLabelEcho(value: string, labels: readonly string[]): boolean {
  const words = fieldEchoWords(value);
  return labels.some((label) => {
    const labelWords = fieldEchoWords(label);
    if (labelWords.length === 0 || labelWords.length > words.length) return false;

    for (let start = 0; start <= words.length - labelWords.length; start += 1) {
      const matchesLabel = labelWords.every((word, offset) => words[start + offset] === word);
      if (!matchesLabel) continue;
      const surroundingWords = [...words.slice(0, start), ...words.slice(start + labelWords.length)];
      if (surroundingWords.length === 0
        || surroundingWords.some((word) => fieldEchoStateWord.test(word))
        || surroundingWords.every((word) => fieldEchoFunctionWords.has(word) || word.endsWith('ly'))) {
        return true;
      }
    }
    return false;
  });
}

export function hasEvidenceSubstance(value: string, options: EvidenceSubstanceOptions): boolean {
  const normalized = normalizeEvidenceValue(value);
  if (hasIncompleteEvidenceState(normalized, options.allowedIncompleteAssertions)) return false;
  if (evidenceWordCount(normalized) < (options.minimumWords ?? 1)) return false;

  return !isFieldLabelEcho(normalized, options.fieldLabels);
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
