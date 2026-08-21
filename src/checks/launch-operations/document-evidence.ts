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
const jsxEvidenceExtensions = new Set(['.jsx', '.tsx']);
const tripleQuotedSourceExtensions = new Set(['.java', '.kt', '.swift']);
const blockCommentSourceExtensions = new Set(['.go', '.rs', '.java', '.kt', '.swift']);
const nestedBlockCommentSourceExtensions = new Set(['.rs', '.kt', '.swift']);

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

function isHealthRouteTemplate(template: string, codeTail: string): boolean {
  const value = template.slice(1, -1);
  if (!/^\/[\p{L}\p{N}._~!$&'()*+,;=:@%/-]*$/u.test(value)
    || !/(?:^|\/)(?:health|readiness|liveness)(?:\/|$)/iu.test(value)) {
    return false;
  }

  return /(?:^|[^\p{L}\p{N}_$])(?:[A-Za-z_$][\w$]*\.)*(?:get|head|route|handlefunc|mapget)[\t ]*\([\t ]*$/iu
    .test(codeTail);
}

function jsxElementEnd(source: string, start: number): number | undefined | null {
  const opening = /^<([\p{L}_$][\p{L}\p{N}_$:.-]*)(?=[\t\r\n />])/u.exec(source.slice(start));
  if (!opening) return null;

  const name = opening[1]!;
  let openingEnd = start + opening[0].length;
  let quote: "'" | '"' | undefined;
  for (; openingEnd < source.length; openingEnd += 1) {
    const character = source[openingEnd]!;
    if (quote) {
      if (character === '\\') openingEnd += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '{') return undefined;
    if (character === '>') break;
  }
  if (openingEnd >= source.length || quote) return undefined;

  const openingToken = source.slice(start, openingEnd + 1);
  if (/\/[\t ]*>$/u.test(openingToken)) return openingEnd + 1;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const tagPattern = new RegExp(String.raw`<\/?${escapedName}(?=[\t\r\n />])[^>]*>`, 'giu');
  tagPattern.lastIndex = openingEnd + 1;
  let depth = 1;
  for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
    const token = match[0];
    if (/[{}]/u.test(token)) return undefined;
    if (/^<\//u.test(token)) depth -= 1;
    else if (!/\/[\t ]*>$/u.test(token)) depth += 1;
    if (depth === 0) return tagPattern.lastIndex;
  }
  return undefined;
}

function scanJavaScriptSourceEvidence(content: string, extension: string): SourceEvidence | undefined {
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
      const template = source.slice(index, end);
      if (isHealthRouteTemplate(template, codeTail)) appendExecutable(template);
      else appendMasked(template);
      index = end;
      continue;
    }

    if (character === '<' && jsxEvidenceExtensions.has(extension)) {
      if (source.startsWith('<>', index) || source.startsWith('</>', index)) return undefined;
      const end = jsxElementEnd(source, index);
      if (end === undefined) return undefined;
      if (end !== null) {
        appendMasked(source.slice(index, end));
        index = end;
        continue;
      }
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

type LexicalString = { end: number; preserve: boolean };

function delimitedStringEnd(source: string, start: number, delimiter: string, multiline: boolean): number | undefined {
  for (let index = start + delimiter.length; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      if (index >= source.length) return undefined;
      continue;
    }
    if (source.startsWith(delimiter, index)) return index + delimiter.length;
    if (!multiline && source[index] === '\n') return undefined;
  }
  return undefined;
}

function rawDelimitedStringEnd(source: string, start: number, opening: string, closing: string): number | undefined {
  const close = source.indexOf(closing, start + opening.length);
  return close === -1 ? undefined : close + closing.length;
}

function pythonStringAt(source: string, index: number): LexicalString | undefined | null {
  const previous = source[index - 1];
  const match = /^(?:([rRuUbBfF]{1,3}))?("""|'''|"|')/u.exec(source.slice(index));
  if (!match) return null;
  const prefix = match[1] ?? '';
  if (prefix !== '' && previous !== undefined && /[\p{L}\p{N}_]/u.test(previous)) return null;
  if (/f/iu.test(prefix)) return undefined;

  const delimiter = match[2]!;
  const triple = delimiter.length === 3;
  const end = delimitedStringEnd(source, index + prefix.length, delimiter, triple);
  if (end === undefined) return undefined;
  return { end, preserve: !triple };
}

function rustRawStringAt(source: string, index: number): LexicalString | undefined | null {
  const previous = source[index - 1];
  if (previous !== undefined && /[\p{L}\p{N}_]/u.test(previous)) return null;
  const match = /^(?:br|r)(#*)"/u.exec(source.slice(index));
  if (!match) return null;
  const opening = match[0];
  const closing = `"${match[1] ?? ''}`;
  const end = rawDelimitedStringEnd(source, index, opening, closing);
  return end === undefined ? undefined : { end, preserve: false };
}

function sourceStringAt(source: string, index: number, extension: string): LexicalString | undefined | null {
  if (extension === '.py') return pythonStringAt(source, index);

  if (extension === '.go' && source[index] === '`') {
    const end = rawDelimitedStringEnd(source, index, '`', '`');
    return end === undefined ? undefined : { end, preserve: false };
  }

  if (extension === '.rs') {
    const raw = rustRawStringAt(source, index);
    if (raw !== null) return raw;
  }

  if (tripleQuotedSourceExtensions.has(extension) && source.startsWith('"""', index)) {
    const end = delimitedStringEnd(source, index, '"""', true);
    return end === undefined ? undefined : { end, preserve: false };
  }

  if (extension === '.swift' && source[index] === '#') {
    const match = /^(#+)"/u.exec(source.slice(index));
    if (match) {
      const end = rawDelimitedStringEnd(source, index, match[0], `"${match[1]}`);
      return end === undefined ? undefined : { end, preserve: false };
    }
  }

  const quote = source[index];
  if (quote !== "'" && quote !== '"') return null;
  const end = delimitedStringEnd(source, index, quote, false);
  return end === undefined ? undefined : { end, preserve: true };
}

function maskRubyDocumentation(content: string): string | undefined {
  let documentation = false;
  let dataSection = false;
  const masked: string[] = [];
  for (const line of content.replace(/\r\n?/gu, '\n').split(/(?<=\n)/u)) {
    const body = line.endsWith('\n') ? line.slice(0, -1) : line;
    if (!documentation && /^__END__[\t ]*$/u.test(body)) dataSection = true;
    if (dataSection) {
      masked.push(maskSourceFragment(line));
      continue;
    }
    if (!documentation && /^[\t ]*=begin\b/u.test(body)) documentation = true;
    if (documentation) {
      masked.push(maskSourceFragment(line));
      if (/^[\t ]*=end\b/u.test(body)) documentation = false;
    } else {
      masked.push(line);
    }
  }
  return documentation ? undefined : masked.join('');
}

function blockCommentEnd(source: string, start: number, nested: boolean): number | undefined {
  let depth = 1;
  for (let index = start + 2; index < source.length - 1; index += 1) {
    if (nested && source.startsWith('/*', index)) {
      depth += 1;
      index += 1;
    } else if (source.startsWith('*/', index)) {
      depth -= 1;
      if (depth === 0) return index + 2;
      index += 1;
    }
  }
  return undefined;
}

function scanLexicalSourceEvidence(content: string, extension: string): SourceEvidence | undefined {
  const normalized = content.replace(/\r\n?/gu, '\n');
  const source = extension === '.rb' ? maskRubyDocumentation(normalized) : normalized;
  if (source === undefined) return undefined;

  const hashComments = extension === '.py' || extension === '.rb';
  const slashComments = extension !== '.py' && extension !== '.rb';
  const blockComments = blockCommentSourceExtensions.has(extension);
  const nestedBlockComments = nestedBlockCommentSourceExtensions.has(extension);
  const executable: string[] = [];
  const descriptions: string[] = [];

  for (let index = 0; index < source.length;) {
    if (hashComments && source[index] === '#') {
      const lineEnd = source.indexOf('\n', index + 1);
      const end = lineEnd === -1 ? source.length : lineEnd;
      descriptions.push(source.slice(index + 1, end));
      executable.push(maskSourceFragment(source.slice(index, end)));
      index = end;
      continue;
    }
    if (slashComments && source.startsWith('//', index)) {
      const lineEnd = source.indexOf('\n', index + 2);
      const end = lineEnd === -1 ? source.length : lineEnd;
      descriptions.push(source.slice(index + 2, end));
      executable.push(maskSourceFragment(source.slice(index, end)));
      index = end;
      continue;
    }
    if (blockComments && source.startsWith('/*', index)) {
      const end = blockCommentEnd(source, index, nestedBlockComments);
      if (end === undefined) return undefined;
      descriptions.push(source.slice(index + 2, end - 2));
      executable.push(maskSourceFragment(source.slice(index, end)));
      index = end;
      continue;
    }

    const lexicalString = sourceStringAt(source, index, extension);
    if (lexicalString === undefined) return undefined;
    if (lexicalString !== null) {
      const token = source.slice(index, lexicalString.end);
      executable.push(lexicalString.preserve ? token.replace(/\\\n/gu, '  ') : maskSourceFragment(token));
      index = lexicalString.end;
      continue;
    }

    if (extension === '.rb'
      && (source.startsWith('<<', index) || /^%(?:[qQwWiIxrs])?[^\p{L}\p{N}\s]/u.test(source.slice(index)))) {
      return undefined;
    }
    if (extension === '.rb' && source[index] === '/') return undefined;

    executable.push(source[index]!);
    index += 1;
  }

  return { executable: executable.join(''), descriptions: descriptions.join('\n') };
}

function scanSourceEvidence(content: string, location: string): SourceEvidence | undefined {
  if (!isSourceEvidenceLocation(location)) return undefined;
  const extension = extname(location).toLowerCase();
  return javaScriptEvidenceExtensions.has(extension)
    ? scanJavaScriptSourceEvidence(content, extension)
    : scanLexicalSourceEvidence(content, extension);
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

type ProseQuotation = { opening: string; closing: string };

const proseQuotationPairs: readonly ProseQuotation[] = [
  { opening: '"', closing: '"' },
  { opening: "'", closing: "'" },
  { opening: '“', closing: '”' },
  { opening: '‘', closing: '’' },
  { opening: '«', closing: '»' },
  { opening: '‹', closing: '›' },
  { opening: '„', closing: '“' },
  { opening: '‚', closing: '‘' },
  { opening: '「', closing: '」' },
  { opening: '『', closing: '』' },
];

const proseQuotationByOpening = new Map(
  proseQuotationPairs.map((quotation) => [quotation.opening, quotation] as const),
);

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
  if (quotation === "'" && next !== undefined && /\p{N}/u.test(next)) return false;
  if (previous !== undefined && isEvidenceWordCharacter(previous)) return false;
  return true;
}

function isStrongStraightSingleClose(source: string, index: number): boolean {
  if (isEvidenceWordCharacter(source[index + 1])) return false;
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  if (source.slice(lineStart, index).trim() === '') return true;
  return /[.!?;:,)\]}»”’]$/u.test(source.slice(0, index));
}

function hasStrongStraightSingleClose(source: string, start: number): boolean {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] !== "'" || isEscapedDelimiter(source, index)) continue;
    if (isStrongStraightSingleClose(source, index)) return true;
  }
  return false;
}

function hasSameLineStraightSingleClose(source: string, start: number): boolean {
  const lineEnd = source.indexOf('\n', start + 1);
  const end = lineEnd === -1 ? source.length : lineEnd;
  for (let index = start + 1; index < end; index += 1) {
    if (source[index] !== "'" || isEscapedDelimiter(source, index)) continue;
    if (!isEvidenceWordCharacter(source[index + 1])) return true;
  }
  return false;
}

function hasQuotationClose(source: string, start: number, quotation: ProseQuotation): boolean {
  if (quotation.opening === "'") {
    return hasStrongStraightSingleClose(source, start)
      || hasSameLineStraightSingleClose(source, start);
  }

  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] !== quotation.closing || isEscapedDelimiter(source, index)) continue;
    return true;
  }
  return false;
}

function scanProseQuotationLine(
  line: string,
  initial: ProseQuotation | undefined,
  remainingContent: string,
): { quotation: ProseQuotation | undefined; quoted: boolean } {
  let quotation = initial;
  let quoted = quotation !== undefined;
  let openedOnThisLine = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (isEscapedDelimiter(line, index)) continue;

    if (quotation) {
      if (character !== quotation.closing) continue;
      if (quotation.opening === "'") {
        if (isEvidenceWordCharacter(line[index + 1])) continue;
        const strongClose = isStrongStraightSingleClose(remainingContent, index);
        if (!strongClose && (!openedOnThisLine
          || hasStrongStraightSingleClose(remainingContent, index))) continue;
      }
      quotation = undefined;
      quoted = true;
      openedOnThisLine = false;
      continue;
    }

    const opening = proseQuotationByOpening.get(character);
    if (!opening) continue;
    if ((character === '"' || character === "'")
      && !canOpenAsciiQuotation(line, index, character)) continue;
    if (!hasQuotationClose(remainingContent, index, opening)) continue;
    quotation = opening;
    openedOnThisLine = true;
    quoted = true;
  }

  return { quotation, quoted };
}

function sanitizeProseRiskContent(content: string, location: string): string {
  const markdown = new Set(['.md', '.mdx']).has(extname(location).toLowerCase());
  const lines = content.replace(/\r\n?/gu, '\n').split('\n');
  let fence: { marker: '`' | '~'; length: number } | undefined;
  let blockquote = false;
  let preformatted = false;
  const structurallySanitized: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (markdown) {
      if (preformatted) {
        if (/<\/pre[\t ]*>/iu.test(line)) preformatted = false;
        structurallySanitized.push('');
        continue;
      }
      if (/<pre\b/iu.test(line)) {
        preformatted = !/<\/pre[\t ]*>/iu.test(line);
        structurallySanitized.push('');
        continue;
      }

      const fenceMatch = /^[\t ]{0,3}(`{3,}|~{3,})/u.exec(line);
      if (fenceMatch) {
        const delimiter = fenceMatch[1]!;
        const marker = delimiter[0] as '`' | '~';
        if (!fence) fence = { marker, length: delimiter.length };
        else if (fence.marker === marker && delimiter.length >= fence.length) fence = undefined;
        structurallySanitized.push('');
        continue;
      }
      if (fence) {
        structurallySanitized.push('');
        continue;
      }
      if (trimmed === '') blockquote = false;
      else if (/^[\t ]{0,3}>/u.test(line)) blockquote = true;
      else if (blockquote && markdownBoundary(line)) blockquote = false;
      if (blockquote || visualIndentation(line) >= 4) {
        structurallySanitized.push('');
        continue;
      }
    }

    structurallySanitized.push(line);
  }

  const structurallySanitizedContent = structurallySanitized.join('\n');
  let quotation: ProseQuotation | undefined;
  let offset = 0;
  const sanitized: string[] = [];
  for (const line of structurallySanitized) {
    const quotationResult = scanProseQuotationLine(
      line,
      quotation,
      structurallySanitizedContent.slice(offset),
    );
    quotation = quotationResult.quotation;
    if (quotationResult.quoted) {
      sanitized.push('');
    } else {
      sanitized.push(line.includes('?') ? '' : line);
    }
    offset += line.length + 1;
  }

  return sanitized.join('\n');
}

type StructuredRecord = Record<string, unknown>;

function isStructuredRecord(value: unknown): value is StructuredRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarValues(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const values: string[] = [];
  for (const item of value) {
    const itemValues = scalarValues(item);
    if (itemValues === undefined) return undefined;
    values.push(...itemValues);
  }
  return values;
}

function valuesForTopLevelStructuredFields(
  value: unknown,
  fields: ReadonlySet<string>,
  foldedFields: ReadonlySet<string>,
): string[] {
  if (!isStructuredRecord(value)) return [];
  const entries = Object.entries(value);
  const matchingFields = entries.filter(([key]) => fields.has(key));
  const hasCaseLookalike = entries.some(([key]) => !fields.has(key) && foldedFields.has(key.toLowerCase()));
  if (matchingFields.length !== 1 || hasCaseLookalike) return [];
  const values = scalarValues(matchingFields[0]![1]);
  return values !== undefined && values.every((item) => item.trim() !== '') ? values : [];
}

function structuredFieldValues(content: string, location: string, fieldNames: readonly string[]): string[] {
  const fields = new Set(fieldNames);
  const foldedFields = new Set(fieldNames.map((field) => field.toLowerCase()));
  const extension = extname(location).toLowerCase();

  try {
    if (extension === '.json') {
      const value = JSON.parse(content);
      const document = parseYamlDocument(content, { schema: 'json', uniqueKeys: true });
      return document.errors.length === 0 ? valuesForTopLevelStructuredFields(value, fields, foldedFields) : [];
    }
    if (extension === '.yaml' || extension === '.yml') {
      return valuesForTopLevelStructuredFields(parseYaml(content), fields, foldedFields);
    }
    if (extension === '.toml') return valuesForTopLevelStructuredFields(parseToml(content), fields, foldedFields);
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
  return (content, location) => {
    const values = structuredFieldValues(content, location, fieldNames);
    return values.length > 0 && predicate(values.join('; '));
  };
}

export function normalizeEvidenceValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/[\t ]+/gu, ' ').replace(/[.!;,]+$/gu, '').toLowerCase();
}

const incompleteAssignmentPattern = /\b(?:(?:to[\t ]+be|await(?:ing|s)?|requires?|needs?)[\t ]+(?:(?:an?|the|owner|role|team|resource|mechanism|status)[\t ]+){0,2}(?:assign(?:ed|ment)|complet(?:ed|ion)|determin(?:ed|ation)|decid(?:ed|ision)|confirm(?:ed|ation)|document(?:ed|ation)|select(?:ed|ion)|defin(?:ed|ition)|provid(?:ed|ing)|resolv(?:ed|ution)|set)|(?:not[\t ]+)?yet[\t ]+to[\t ]+be[\t ]+(?:assigned|completed|determined|decided|confirmed|documented|selected|defined|provided|resolved|set))\b/iu;
const incompleteStatePattern = /\b(?:no|not|none|never|disabled|unknown|unavailable|missing|pending|unassigned|unowned|undetermined|unspecified|undecided|unconfirmed|unset|unresolved|incomplete|n\/a|todo)\b|\bt(?:[.\t _-]*)b(?:[.\t _-]*)(?:a|c|d)\b/iu;
const vagueTimingPattern = /\b(?:someday|eventually|at[\t ]+some[\t ]+point|(?:when|until|at)[\t ]+(?:a[\t ]+)?convenient[\t ]+time)\b/iu;

export function hasIncompleteEvidenceState(value: string, allowed: readonly RegExp[] = []): boolean {
  let normalized = normalizeEvidenceValue(value);
  for (const pattern of allowed) normalized = normalized.replace(new RegExp(pattern.source, pattern.flags), ' ');
  return incompleteStatePattern.test(normalized)
    || incompleteAssignmentPattern.test(normalized)
    || vagueTimingPattern.test(normalized);
}

// This is a bounded deterministic grammar, not general sentiment analysis. It supports:
// explicit auxiliary negation, inability, refusal/failure, and action-suppression predicates.
// Each syntax addition requires negative and affirmative-converse tests so the boundary stays versionable.
const negativeEvidenceGovernor = /\b(?:(?<avoidance>avoid\w*)|(?<blocking>cannot|(?:can|won)['’]t|(?:isn|aren|wasn|weren|don|doesn|didn|couldn|wouldn|shouldn|mustn|haven|hasn|hadn)['’]t|(?:is|are|was|were|do|does|did|can|could|will|would|should|must|have|has|had)[\t ]+not|not[\t ]+able[\t ]+to|(?:unable|unwilling)[\t ]+to|(?:incapable)[\t ]+of|(?:impossible|infeasible)[\t ]+to|(?:refus(?:e|es|ed|ing)|declin(?:e|es|ed|ing)|fail(?:s|ed|ing)?)[\t ]+to|lack(?:s|ed|ing)?[\t ]+(?:the[\t ]+)?(?:ability|capacity)[\t ]+to|skip\w*|ignore\w*|omit\w*|bypass\w*))\b/giu;
const negativeEvidenceClauseBoundary = /[.;]/u;
const avoidancePurposeBoundary = /\b(?:by|using|through|in[\t ]+order[\t ]+to|so[\t ]+that)\b/iu;

export function hasNegatedEvidenceIntent(value: string, protectedTerms: RegExp): boolean {
  const normalized = normalizeEvidenceValue(value);
  for (const governor of normalized.matchAll(negativeEvidenceGovernor)) {
    const remainder = normalized.slice((governor.index ?? 0) + governor[0].length);
    const clauseBoundary = negativeEvidenceClauseBoundary.exec(remainder);
    const clause = clauseBoundary ? remainder.slice(0, clauseBoundary.index) : remainder;
    const purposeBoundary = governor.groups?.avoidance ? avoidancePurposeBoundary.exec(clause) : null;
    // Only "avoid <harm> by/using <required action>" has an affirmative purpose boundary.
    // Missing purpose text is ambiguous, so inspect the whole clause and fail closed when it names the requirement.
    const boundary = purposeBoundary && clause.slice(0, purposeBoundary.index).trim() !== ''
      ? purposeBoundary
      : null;
    const scope = boundary ? clause.slice(0, boundary.index) : clause;
    if (testPattern(protectedTerms, scope)) return true;
  }
  return false;
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

const fieldEchoFunctionWords = new Set([
  'a', 'an', 'and', 'for', 'has', 'is', 'of', 'or', 'the', 'through', 'under', 'using', 'via', 'within',
]);

function independentFieldWordCount(words: readonly string[], labelWords: readonly string[]): number {
  const labelWordSet = new Set(labelWords);
  return words.filter((word) => !fieldEchoFunctionWords.has(word)
    && !labelWordSet.has(word)
    && !word.endsWith('ly')).length;
}

function isFieldLabelEcho(value: string, labels: readonly string[], minimumIndependentWords: number): boolean {
  const words = fieldEchoWords(value);
  return labels.some((label) => {
    const labelWords = fieldEchoWords(label);
    if (labelWords.length === 0 || labelWords.length > words.length) return false;

    for (let start = 0; start <= words.length - labelWords.length; start += 1) {
      const matchesLabel = labelWords.every((word, offset) => words[start + offset] === word);
      if (!matchesLabel) continue;
      const prefix = words.slice(0, start);
      const continuation = words.slice(start + labelWords.length);
      const independentPrefix = continuation.length === 0
        && independentFieldWordCount(prefix, labelWords) >= minimumIndependentWords;
      const independentRelationship = /^(?:for|of|through|using|via|under|within)$/u
        .test(continuation[0] ?? '')
        && independentFieldWordCount(continuation.slice(1), labelWords) >= minimumIndependentWords;
      if (!independentPrefix && !independentRelationship) return true;
    }
    return false;
  });
}

export function hasEvidenceSubstance(value: string, options: EvidenceSubstanceOptions): boolean {
  const normalized = normalizeEvidenceValue(value);
  if (hasIncompleteEvidenceState(normalized, options.allowedIncompleteAssertions)) return false;
  if (evidenceWordCount(normalized) < (options.minimumWords ?? 1)) return false;

  return !isFieldLabelEcho(normalized, options.fieldLabels, options.minimumWords ?? 1);
}

type ContentMatcher = (content: string, location: string) => boolean;
type ValuePredicate = (value: string) => boolean;

const plainTextEvidenceExtensions = new Set(['', '.md', '.mdx', '.txt']);

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function matchesAnyEvidence(...matchers: ContentMatcher[]): ContentMatcher {
  return (content, location) => matchers.some((matcher) => matcher(content, location));
}

export function labeledTextValueMatcher(
  labels: readonly string[],
  predicate: ValuePredicate,
): ContentMatcher {
  const labelPattern = labels.map(escapeRegularExpression).join('|');
  const fieldPattern = new RegExp(String.raw`^[\t ]*(?:${labelPattern})[\t ]*:[\t ]*(.+)$`, 'gimu');
  return (content, location) => plainTextEvidenceExtensions.has(extname(location).toLowerCase())
    && [...content.matchAll(fieldPattern)].some((match) => predicate(match[1] ?? ''));
}

export function orderedTextValueMatcher(predicate: ValuePredicate): ContentMatcher {
  const stepPattern = /^[\t ]*(?:\d+[.)]|[-*][\t ]+\[[ xX]\])[\t ]+([^\r\n]+)$/gimu;
  return (content, location) => plainTextEvidenceExtensions.has(extname(location).toLowerCase())
    && [...content.matchAll(stepPattern)].some((match) => predicate(match[1] ?? ''));
}

export function proseLineValueMatcher(predicate: ValuePredicate): ContentMatcher {
  return (content, location) => plainTextEvidenceExtensions.has(extname(location).toLowerCase())
    && content.split(/\r?\n/gu).some((line) => {
      const trimmed = line.trim();
      return trimmed !== ''
        && !/^(?:#{1,6}[\t ]|(?:\d+[.)]|[-*])[\t ]|>|`{3,}|~{3,})/u.test(trimmed)
        && !/^[\p{L}\p{N}][\p{L}\p{N}\t _-]{0,60}:/u.test(trimmed)
        && predicate(line);
    });
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
