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

function hasQuotedCredentialAssignment(line: string): boolean {
  let segmentHasCredentialName = false;

  for (let index = 0; index < line.length;) {
    const character = line[index];
    if (character === undefined) return false;

    if (character === '"' || character === "'") {
      const end = quotedStringEnd(line, index);
      if (end === undefined) return false;
      if (credentialName.test(line.slice(index + 1, end - 1))) segmentHasCredentialName = true;
      index = end;
      continue;
    }

    if (isIdentifierStart(character)) {
      let end = index + 1;
      while (end < line.length && isIdentifierPart(line[end] ?? '')) end += 1;
      if (credentialName.test(line.slice(index, end))) segmentHasCredentialName = true;
      index = end;
      continue;
    }

    if (character === '=' || character === ':') {
      let valueStart = index + 1;
      while (line[valueStart] === ' ' || line[valueStart] === '\t') valueStart += 1;
      const valueQuote = line[valueStart];

      if (valueQuote === '"' || valueQuote === "'") {
        const valueEnd = quotedStringEnd(line, valueStart);
        if (valueEnd === undefined) return false;
        if (segmentHasCredentialName) return true;
        index = valueEnd;
        continue;
      }
    }

    if (character === ';' || character === ',' || character === '{' || character === '}') {
      segmentHasCredentialName = false;
    }
    index += 1;
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
