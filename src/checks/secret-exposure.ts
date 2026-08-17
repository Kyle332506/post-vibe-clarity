import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { listProjectFiles } from '../discovery/file-index.js';
import type { Finding } from '../model/finding.js';
import type { CheckImplementation } from '../orchestrator/check-registry.js';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');

const privateKeyMarker = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY(?: BLOCK)?-----/;
const credentialName = /apiKey|api_key|secret|token|password/i;
const genericQuotedCredentialAssignment = /["']?(?:apiKey|api_key|secret|token|password)[A-Za-z0-9_$.-]*["']?\s*(?::|=(?!=|>))\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/i;
const javascriptOrTypeScriptFile = /\.(?:[cm]?[jt]sx?)$/i;
const supportedTextExtensions = new Set([
  '.env',
  '.go',
  '.java',
  '.json',
  '.key',
  '.kt',
  '.pem',
  '.py',
  '.rb',
  '.rs',
  '.swift',
  '.toml',
  '.yaml',
  '.yml',
]);

type SecretRule = 'private-key-marker' | 'quoted-credential-assignment';

interface SecretDetection {
  line: number;
  rule: SecretRule;
}

function isScannableTextFile(file: string): boolean {
  const name = basename(file).toLowerCase();
  return name === '.env'
    || name.startsWith('.env.')
    || javascriptOrTypeScriptFile.test(name)
    || supportedTextExtensions.has(extname(name));
}

function decodeText(content: Buffer): string | undefined {
  if (content.includes(0)) return undefined;
  const decoded = content.toString('utf8');
  return decoded.includes('\uFFFD') ? undefined : decoded;
}

function scriptKindFor(file: string): import('typescript').ScriptKind {
  const name = file.toLowerCase();
  if (name.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (name.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:mjs|cjs|js)$/.test(name)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function hasDeclareModifier(node: import('typescript').Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) ?? false);
}

function isNonRuntimeNode(
  node: import('typescript').Node,
  sourceFile: import('typescript').SourceFile,
): boolean {
  if (sourceFile.isDeclarationFile) return true;

  for (let current: import('typescript').Node | undefined = node; current && current !== sourceFile; current = current.parent) {
    if (ts.isTypeNode(current) || ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current)) return true;
    if (hasDeclareModifier(current)) return true;
  }

  return false;
}

function isStringLiteralExpression(
  expression: import('typescript').Expression | undefined,
): expression is import('typescript').StringLiteralLike {
  return expression !== undefined && ts.isStringLiteralLike(expression);
}

function propertyNameText(node: import('typescript').Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return propertyNameText(node.expression);
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
  }
  return undefined;
}

function isPropertyNamePosition(node: import('typescript').StringLiteralLike): boolean {
  const parent = node.parent as import('typescript').Node & { name?: import('typescript').Node };
  if (parent.name === node) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return parent.moduleSpecifier === node;
  return ts.isExternalModuleReference(parent) && parent.expression === node;
}

function scanJavaScriptOrTypeScript(file: string, content: string): SecretDetection[] {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
  if (sourceFile.isDeclarationFile) return [];

  const detections = new Map<string, SecretDetection>();

  function record(rule: SecretRule, value: import('typescript').StringLiteralLike): void {
    if (isNonRuntimeNode(value, sourceFile)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(value.getStart(sourceFile)).line + 1;
    detections.set(`${line}:${rule}`, { line, rule });
  }

  function recordCredential(
    name: import('typescript').Node,
    initializer: import('typescript').Expression | undefined,
  ): void {
    if (!isStringLiteralExpression(initializer) || isNonRuntimeNode(initializer, sourceFile)) return;
    const nameText = propertyNameText(name);
    if (!nameText || !credentialName.test(nameText)) return;
    record(privateKeyMarker.test(initializer.text) ? 'private-key-marker' : 'quoted-credential-assignment', initializer);
  }

  function visit(node: import('typescript').Node): void {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node)) {
      recordCredential(node.name, node.initializer);
    } else if (ts.isPropertyAssignment(node)) {
      recordCredential(node.name, node.initializer);
    } else if (ts.isBindingElement(node)) {
      recordCredential(node.propertyName ?? node.name, node.initializer);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      recordCredential(node.left, node.right);
    } else if (ts.isShorthandPropertyAssignment(node)) {
      recordCredential(node.name, node.objectAssignmentInitializer);
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      recordCredential(node.name, node.initializer);
    }

    if (ts.isStringLiteralLike(node)
      && !isPropertyNamePosition(node)
      && !isNonRuntimeNode(node, sourceFile)
      && privateKeyMarker.test(node.text)) {
      record('private-key-marker', node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...detections.values()].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

function scanGenericText(content: string): SecretDetection[] {
  const detections: SecretDetection[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const rule = detectSecretRule(line);
    if (rule) detections.push({ line: index + 1, rule });
  }
  return detections;
}

function findingFor(file: string, detection: SecretDetection): Finding {
  const { line, rule } = detection;
  return {
    id: `secret-exposure.${file}:${line}.${rule}`,
    checkId: 'secret-exposure.scan',
    skillVersion: '0.1.0',
    domains: ['security-privacy'],
    actionLevel: 'stop-before-launch',
    outcome: 'failed',
    title: 'Potential credential stored in the project',
    impact: 'A credential in project files may be copied, committed, logged, or exposed to users.',
    evidence: [{ kind: 'file', summary: `${rule} pattern detected; value redacted`, location: `${file}:${line}` }],
    evidenceConfidence: 'strong-indication',
    applicability: 'The project contains text configuration or source files.',
    recommendation: 'Move the credential to an appropriate secret store and rotate any credential that may have been exposed.',
    verification: 'Scan the project again and verify the original credential was rotated outside this review.',
    humanReviewRequired: false,
  };
}

export function detectSecretRule(line: string): SecretRule | undefined {
  if (privateKeyMarker.test(line)) return 'private-key-marker';
  if (genericQuotedCredentialAssignment.test(line)) return 'quoted-credential-assignment';
  return undefined;
}

export const secretExposureCheck: CheckImplementation = {
  id: 'secret-exposure.scan',
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
  async run({ root }) {
    const findings: Finding[] = [];
    const files = await listProjectFiles(root);

    for (const file of files.filter(isScannableTextFile)) {
      const content = decodeText(await readFile(join(root, file)));
      if (content === undefined) continue;
      const detections = javascriptOrTypeScriptFile.test(file)
        ? scanJavaScriptOrTypeScript(file, content)
        : scanGenericText(content);
      findings.push(...detections.map((detection) => findingFor(file, detection)));
    }

    return findings;
  },
};
