import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listProjectFiles } from '../discovery/file-index.js';
import type { Finding } from '../model/finding.js';
import type { CheckImplementation } from '../orchestrator/check-registry.js';

const privateKeyMarker = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY(?: BLOCK)?-----/;
const quotedCredentialAssignment = /(?:["'][^"'\r\n]*(?:apiKey|api_key|secret|token|password)[^"'\r\n]*["']|\b(?=[\w$]*(?:apiKey|api_key|secret|token|password))[A-Za-z_$][\w$]*)\s*(?:=|:)\s*(['"])(?:\\.|(?!\1)[^\r\n])*\1/i;
const scannableFile = /\.(?:env|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|json|ya?ml|toml)$/;

export function detectSecretRule(line: string): string | undefined {
  if (privateKeyMarker.test(line)) return 'private-key-marker';
  if (quotedCredentialAssignment.test(line)) return 'quoted-credential-assignment';
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
