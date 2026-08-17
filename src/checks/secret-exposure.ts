import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listProjectFiles } from '../discovery/file-index.js';
import type { Finding } from '../model/finding.js';
import type { CheckImplementation } from '../orchestrator/check-registry.js';

const privateKeyMarker = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY(?: BLOCK)?-----/;
const credentialName = /apiKey|api_key|secret|token|password/i;
const scannableFile = /\.(?:env|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|json|ya?ml|toml)$/;

function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_$]/.test(character);
}

function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_$]/.test(character);
}

function quotedStringEnd(line: string, start: number): number | undefined {
  const quote = line[start];
  if (quote === undefined) return undefined;

  for (let index = start + 1; index < line.length; index += 1) {
    if (line[index] === '\\') {
      index += 1;
      continue;
    }
    if (line[index] === quote) return index + 1;
  }

  return undefined;
}

function isAssignmentEquals(line: string, index: number): boolean {
  const previous = line[index - 1];
  const next = line[index + 1];

  return previous !== '=' && previous !== '!' && previous !== '<' && previous !== '>' && next !== '=' && next !== '>';
}

type TokenKind = 'identifier' | 'quoted' | 'symbol';

interface LineToken {
  kind: TokenKind;
  start: number;
  end: number;
  terminated: boolean;
}

interface PendingColon {
  angleDepth: number;
  colonTokenIndex: number;
}

interface AnnotationAnalysis {
  annotationColon: Set<number>;
  assignmentByColon: Map<number, number>;
  typeOnlyToken: boolean[];
}

function tokenizeLine(line: string): LineToken[] {
  const tokens: LineToken[] = [];

  for (let index = 0; index < line.length;) {
    const character = line[index];
    if (character === undefined) break;

    if (character === ' ' || character === '\t') {
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      const end = quotedStringEnd(line, index);
      tokens.push({ kind: 'quoted', start: index, end: end ?? line.length, terminated: end !== undefined });
      if (end === undefined) break;
      index = end;
      continue;
    }

    if (isIdentifierStart(character)) {
      let end = index + 1;
      while (end < line.length && isIdentifierPart(line[end] ?? '')) end += 1;
      tokens.push({ kind: 'identifier', start: index, end, terminated: true });
      index = end;
      continue;
    }

    tokens.push({ kind: 'symbol', start: index, end: index + 1, terminated: true });
    index += 1;
  }

  return tokens;
}

function structuralClosing(character: string): string | undefined {
  return character === '(' ? ')' : character === '[' ? ']' : character === '{' ? '}' : undefined;
}

function isTypeAnnotationColon(line: string, tokens: LineToken[], colonIndex: number, scopeClosing?: string): boolean {
  const name = tokens[colonIndex - 1];
  const beforeName = tokens[colonIndex - 2];
  if (name?.kind !== 'identifier' || beforeName === undefined) return false;

  if (beforeName.kind === 'identifier') {
    const keyword = line.slice(beforeName.start, beforeName.end);
    return keyword === 'const' || keyword === 'let' || keyword === 'var';
  }

  const character = line[beforeName.start];
  return scopeClosing === ')' && (character === '(' || character === ',');
}

function markTypeOnly(typeOnlyDelta: Int32Array, start: number, end: number): void {
  typeOnlyDelta[start] = (typeOnlyDelta[start] ?? 0) + 1;
  typeOnlyDelta[end] = (typeOnlyDelta[end] ?? 0) - 1;
}

function analyzeTypeAnnotations(line: string, tokens: LineToken[]): AnnotationAnalysis {
  const annotationColon = new Set<number>();
  const assignmentByColon = new Map<number, number>();
  const typeOnlyDelta = new Int32Array(tokens.length + 1);
  const pendingAnnotationByScope = new Map<number, PendingColon>();
  const pendingAssignmentByScope = new Map<number, PendingColon>();
  const scopes: Array<{ closing?: string; id: number }> = [{ id: 0 }];
  let nextScopeId = 1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== 'symbol') continue;

    const character = line[token.start];
    const scope = scopes.at(-1);
    if (character === undefined || scope === undefined) continue;

    const closing = structuralClosing(character);
    if (closing !== undefined) {
      scopes.push({ closing, id: nextScopeId });
      nextScopeId += 1;
      continue;
    }

    if (scope.closing === character) {
      const annotation = pendingAnnotationByScope.get(scope.id);
      if (annotation !== undefined && annotation.angleDepth === 0) {
        annotationColon.add(annotation.colonTokenIndex);
        markTypeOnly(typeOnlyDelta, annotation.colonTokenIndex + 1, index);
      }
      pendingAnnotationByScope.delete(scope.id);
      pendingAssignmentByScope.delete(scope.id);
      scopes.pop();
      continue;
    }

    const annotation = pendingAnnotationByScope.get(scope.id);
    const assignment = pendingAssignmentByScope.get(scope.id);
    if (character === ':') {
      pendingAssignmentByScope.set(scope.id, { angleDepth: 0, colonTokenIndex: index });
      if (isTypeAnnotationColon(line, tokens, index, scope.closing)) {
        pendingAnnotationByScope.set(scope.id, { angleDepth: 0, colonTokenIndex: index });
      }
      continue;
    }
    if (character === '<') {
      if (annotation !== undefined) annotation.angleDepth += 1;
      if (assignment !== undefined) assignment.angleDepth += 1;
      continue;
    }
    if (character === '>') {
      if (annotation !== undefined && annotation.angleDepth > 0) annotation.angleDepth -= 1;
      if (assignment !== undefined && assignment.angleDepth > 0) assignment.angleDepth -= 1;
      continue;
    }
    if (character === '=' && isAssignmentEquals(line, token.start)) {
      if (assignment !== undefined && assignment.angleDepth === 0) {
        assignmentByColon.set(assignment.colonTokenIndex, index);
      }
      if (annotation !== undefined && annotation.angleDepth === 0) {
        annotationColon.add(annotation.colonTokenIndex);
        assignmentByColon.set(annotation.colonTokenIndex, index);
        markTypeOnly(typeOnlyDelta, annotation.colonTokenIndex + 1, index);
      }
      if (assignment?.angleDepth === 0) pendingAssignmentByScope.delete(scope.id);
      if (annotation?.angleDepth === 0) pendingAnnotationByScope.delete(scope.id);
      continue;
    }
    if (character === ',' || character === ';') {
      if (assignment?.angleDepth === 0) pendingAssignmentByScope.delete(scope.id);
      if (annotation !== undefined && annotation.angleDepth === 0) {
        annotationColon.add(annotation.colonTokenIndex);
        markTypeOnly(typeOnlyDelta, annotation.colonTokenIndex + 1, index);
        pendingAnnotationByScope.delete(scope.id);
      }
    }
  }

  const typeOnlyToken = new Array<boolean>(tokens.length);
  let typeOnlyDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    typeOnlyDepth += typeOnlyDelta[index] ?? 0;
    typeOnlyToken[index] = typeOnlyDepth > 0;
  }

  return { annotationColon, assignmentByColon, typeOnlyToken };
}

function isCredentialToken(line: string, token: LineToken): boolean {
  if (token.kind === 'identifier') return credentialName.test(line.slice(token.start, token.end));
  if (token.kind !== 'quoted' || !token.terminated) return false;
  return credentialName.test(line.slice(token.start + 1, token.end - 1));
}

function isQuotedValue(tokens: LineToken[], delimiterIndex: number): boolean {
  const value = tokens[delimiterIndex + 1];
  return value?.kind === 'quoted' && value.terminated;
}

function hasQuotedCredentialAssignment(line: string): boolean {
  const tokens = tokenizeLine(line);
  const { annotationColon, assignmentByColon, typeOnlyToken } = analyzeTypeAnnotations(line, tokens);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || typeOnlyToken[index] || !isCredentialToken(line, token)) continue;

    const delimiterIndex = index + 1;
    const delimiter = tokens[delimiterIndex];
    if (delimiter?.kind !== 'symbol') continue;

    const delimiterCharacter = line[delimiter.start];
    if (delimiterCharacter === '=' && isAssignmentEquals(line, delimiter.start) && isQuotedValue(tokens, delimiterIndex)) {
      return true;
    }
    if (delimiterCharacter !== ':') continue;

    const assignmentIndex = assignmentByColon.get(delimiterIndex);
    if (assignmentIndex !== undefined && isQuotedValue(tokens, assignmentIndex)) return true;
    if (!annotationColon.has(delimiterIndex) && isQuotedValue(tokens, delimiterIndex)) return true;
  }

  return false;
}

export function detectSecretRule(line: string): string | undefined {
  if (privateKeyMarker.test(line)) return 'private-key-marker';
  if (hasQuotedCredentialAssignment(line)) return 'quoted-credential-assignment';
  return undefined;
}

export const secretExposureCheck: CheckImplementation = {
  id: 'secret-exposure.scan',
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
  async run({ root }) {
    const findings: Finding[] = [];
    const files = await listProjectFiles(root);

    for (const file of files.filter((name) => scannableFile.test(name))) {
      const content = await readFile(join(root, file), 'utf8');
      const lines = content.split(/\r?\n/);

      lines.forEach((line, index) => {
        const rule = detectSecretRule(line);
        if (!rule) return;

        findings.push({
          id: `secret-exposure.${file}:${index + 1}.${rule}`,
          checkId: 'secret-exposure.scan',
          skillVersion: '0.1.0',
          domains: ['security-privacy'],
          actionLevel: 'stop-before-launch',
          outcome: 'failed',
          title: 'Potential credential stored in the project',
          impact: 'A credential in project files may be copied, committed, logged, or exposed to users.',
          evidence: [{ kind: 'file', summary: `${rule} pattern detected; value redacted`, location: `${file}:${index + 1}` }],
          evidenceConfidence: 'strong-indication',
          applicability: 'The project contains text configuration or source files.',
          recommendation: 'Move the credential to an appropriate secret store and rotate any credential that may have been exposed.',
          verification: 'Scan the project again and verify the original credential was rotated outside this review.',
          humanReviewRequired: false,
        });
      });
    }

    return findings;
  },
};
