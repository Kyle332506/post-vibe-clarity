import type { Finding } from '../model/finding.js';
import type { ReadinessReport } from '../model/report.js';
import type { VerifiedReadinessReport } from '../model/verified-report.js';
import { renderMarkdown } from './render-markdown.js';

const verificationCheckId = 'universal-verification.commands';
const containmentWarning = 'Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.';

function statusEvidence(finding: Finding): string {
  return finding.evidence.find(({ kind }) => kind === 'command' || kind === 'behavior')?.summary
    ?? `Status: ${finding.outcome}; duration: unavailable.`;
}

function commandId(finding: Finding): string {
  return finding.id.slice(`${verificationCheckId}.`.length);
}

function renderLocalVerification(report: VerifiedReadinessReport): string[] {
  const findings = report.findings.filter(({ checkId }) => checkId === verificationCheckId);
  const exclusions = findings.filter((finding) => statusEvidence(finding).includes('Status: excluded;'));
  const changedPaths = findings.flatMap((finding) => finding.evidence
    .filter(({ kind, location }) => kind === 'file' && location !== undefined)
    .map((evidence) => ({ commandId: commandId(finding), evidence })));

  const lines = [
    '## Local verification',
    '',
    `- Plan ID: ${report.verification.planId}`,
    `- Plan fingerprint: ${report.verification.planFingerprint}`,
    `- Execution ID: ${report.verification.executionId}`,
    `- Execution record: ${report.verification.executionRecordPath}`,
    '',
    '### Command evidence',
    '',
  ];
  if (findings.length === 0) {
    lines.push('- No command evidence was recorded.');
  } else {
    for (const finding of findings) {
      const source = finding.evidence.find(({ kind, location }) => kind === 'command' && location !== undefined);
      lines.push(`- ${commandId(finding)}: ${statusEvidence(finding)}`);
      if (source?.location) lines.push(`  - Source: ${source.location}`);
    }
  }

  lines.push('', '### Changed paths', '');
  if (changedPaths.length === 0) {
    lines.push('- None observed.');
  } else {
    for (const { commandId: id, evidence } of changedPaths) {
      lines.push(`- ${evidence.location} (${id}; ${evidence.summary})`);
    }
  }

  lines.push('', '### Exclusions', '');
  if (exclusions.length === 0) {
    lines.push('- None recorded.');
  } else {
    for (const finding of exclusions) lines.push(`- ${commandId(finding)}: ${finding.unverifiedBoundaries?.join(' ') ?? 'Excluded.'}`);
  }
  lines.push('', '### Containment warning', '', containmentWarning);
  return lines;
}

export function renderVerifiedMarkdown(report: VerifiedReadinessReport): string {
  const markdown = renderMarkdown(report as unknown as ReadinessReport);
  const marker = '\n## Important limitation\n';
  if (!markdown.includes(marker)) throw new Error('Cannot place local verification in the report template.');
  return markdown.replace(marker, `\n${renderLocalVerification(report).join('\n')}\n${marker}`);
}
