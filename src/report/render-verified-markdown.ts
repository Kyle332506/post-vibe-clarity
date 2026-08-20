import type { Finding } from '../model/finding.js';
import type { ReadinessReport } from '../model/report.js';
import type { VerifiedReadinessReport } from '../model/verified-report.js';
import { renderSafeMarkdownCode } from './markdown-safety.js';
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

function safeBaseReport(report: VerifiedReadinessReport): ReadinessReport {
  const safe = structuredClone(report) as unknown as ReadinessReport;
  safe.manifest.projectRoot = renderSafeMarkdownCode(safe.manifest.projectRoot);
  for (const finding of safe.findings.filter(({ checkId }) => checkId === verificationCheckId)) {
    for (const evidence of finding.evidence) {
      if (evidence.location !== undefined) evidence.location = renderSafeMarkdownCode(evidence.location);
    }
    if (finding.unverifiedBoundaries !== undefined) {
      finding.unverifiedBoundaries = finding.unverifiedBoundaries.map(renderSafeMarkdownCode);
    }
  }
  for (const gap of safe.coverageGaps.filter(({ checkId }) => checkId === verificationCheckId)) {
    gap.reason = renderSafeMarkdownCode(gap.reason);
  }
  return safe;
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
    `- Plan ID: ${renderSafeMarkdownCode(report.verification.planId)}`,
    `- Plan fingerprint: ${renderSafeMarkdownCode(report.verification.planFingerprint)}`,
    `- Execution ID: ${renderSafeMarkdownCode(report.verification.executionId)}`,
    `- Execution record: ${renderSafeMarkdownCode(report.verification.executionRecordPath)}`,
    '',
    '### Command evidence',
    '',
  ];
  if (findings.length === 0) {
    lines.push('- No command evidence was recorded.');
  } else {
    for (const finding of findings) {
      const source = finding.evidence.find(({ kind, location }) => kind === 'command' && location !== undefined);
      lines.push(`- ${renderSafeMarkdownCode(commandId(finding))}: ${statusEvidence(finding)}`);
      if (source?.location) lines.push(`  - Source: ${renderSafeMarkdownCode(source.location)}`);
    }
  }

  lines.push('', '### Changed paths', '');
  if (changedPaths.length === 0) {
    lines.push('- None observed.');
  } else {
    for (const { commandId: id, evidence } of changedPaths) {
      lines.push(`- ${renderSafeMarkdownCode(evidence.location ?? '')} (${renderSafeMarkdownCode(id)}; ${evidence.summary})`);
    }
  }

  lines.push('', '### Exclusions', '');
  if (exclusions.length === 0) {
    lines.push('- None recorded.');
  } else {
    for (const finding of exclusions) {
      const boundaries = finding.unverifiedBoundaries?.map(renderSafeMarkdownCode).join(' ') ?? 'Excluded.';
      lines.push(`- ${renderSafeMarkdownCode(commandId(finding))}: ${boundaries}`);
    }
  }
  lines.push('', '### Containment warning', '', containmentWarning);
  return lines;
}

export function renderVerifiedMarkdown(report: VerifiedReadinessReport): string {
  const markdown = renderMarkdown(safeBaseReport(report));
  const marker = '\n## Important limitation\n';
  if (!markdown.includes(marker)) throw new Error('Cannot place local verification in the report template.');
  return markdown.replace(marker, `\n${renderLocalVerification(report).join('\n')}\n${marker}`);
}
