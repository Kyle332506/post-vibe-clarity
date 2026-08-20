import type { Finding } from '../model/finding.js';
import { checkExecutionStatuses, readinessDomains, type ReadinessReport } from '../model/report.js';
import type { VerifiedReadinessReport } from '../model/verified-report.js';
import { renderSafeMarkdownCode } from './markdown-safety.js';
import { renderMarkdown } from './render-markdown.js';
import { CONTAINMENT_WARNING } from '../verification/contract-constants.js';

const verificationCheckId = 'universal-verification.commands';
const findingOutcomes = new Set([
  'passed',
  'failed',
  'likely-issue',
  'unverified',
  'not-applicable',
  'risk-accepted',
  'resolved-and-rechecked',
]);
const executionStatuses = new Set<string>(checkExecutionStatuses);
const domains = new Set<string>(readinessDomains);

function safeContractValue<T extends string>(value: T, allowed: Set<string>): T {
  return (allowed.has(value) ? value : renderSafeMarkdownCode(value)) as T;
}

function statusEvidence(finding: Finding): string {
  return finding.evidence.find(({ kind }) => kind === 'command' || kind === 'behavior')?.summary
    ?? `Status: ${finding.outcome}; duration: unavailable.`;
}

function commandId(finding: Finding): string {
  return finding.id.slice(`${verificationCheckId}.`.length);
}

function safeBaseReport(report: VerifiedReadinessReport): ReadinessReport {
  const safe = structuredClone(report) as unknown as ReadinessReport;
  safe.generatedAt = renderSafeMarkdownCode(safe.generatedAt);
  safe.toolkitVersion = renderSafeMarkdownCode(safe.toolkitVersion);
  safe.manifest.projectRoot = renderSafeMarkdownCode(safe.manifest.projectRoot);
  for (const artifact of safe.manifest.artifacts) {
    artifact.value = renderSafeMarkdownCode(artifact.value) as typeof artifact.value;
  }
  for (const finding of safe.findings) {
    finding.title = renderSafeMarkdownCode(finding.title);
    finding.checkId = renderSafeMarkdownCode(finding.checkId);
    finding.checkVersion = renderSafeMarkdownCode(finding.checkVersion);
    finding.skillVersion = renderSafeMarkdownCode(finding.skillVersion);
    finding.outcome = safeContractValue(finding.outcome, findingOutcomes);
    finding.impact = renderSafeMarkdownCode(finding.impact);
    finding.recommendation = renderSafeMarkdownCode(finding.recommendation);
    finding.verification = renderSafeMarkdownCode(finding.verification);
    for (const evidence of finding.evidence) {
      if (evidence.location !== undefined) evidence.location = renderSafeMarkdownCode(evidence.location);
    }
    if (finding.unverifiedBoundaries !== undefined) {
      finding.unverifiedBoundaries = finding.unverifiedBoundaries.map(renderSafeMarkdownCode);
    }
  }
  for (const execution of safe.checkExecutions) {
    execution.checkId = renderSafeMarkdownCode(execution.checkId);
    execution.checkVersion = renderSafeMarkdownCode(execution.checkVersion);
    execution.skillId = renderSafeMarkdownCode(execution.skillId);
    execution.skillVersion = renderSafeMarkdownCode(execution.skillVersion);
    execution.status = safeContractValue(execution.status, executionStatuses);
    execution.domains = execution.domains.map((domain) => safeContractValue(domain, domains));
  }
  for (const gap of safe.coverageGaps) {
    if (gap.checkId !== undefined) gap.checkId = renderSafeMarkdownCode(gap.checkId);
    gap.status = safeContractValue(gap.status, executionStatuses);
    gap.domains = gap.domains.map((domain) => safeContractValue(domain, domains));
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
  const observation = report.verification.observationBoundary;
  const excludedDirectories = [
    ...observation.versionControlDirectories,
    ...observation.artifactDirectories,
    ...observation.coverageDirectories,
    ...observation.distributionDirectories,
    ...observation.dependencyDirectories,
  ];
  lines.push('', '### Observation boundary', '');
  lines.push(`- Policy: ${renderSafeMarkdownCode(observation.policyVersion)}`);
  lines.push(`- Pinned root: ${renderSafeMarkdownCode(observation.rootIdentity.realPath)} (device ${renderSafeMarkdownCode(observation.rootIdentity.device)}; inode ${renderSafeMarkdownCode(observation.rootIdentity.inode)})`);
  lines.push(`- Excluded directories: ${excludedDirectories.map(renderSafeMarkdownCode).join(', ')}`);
  lines.push('- Symlinks and non-regular files are not observed.');
  lines.push('- Inaccessible paths fail observation.');
  lines.push('- Only content SHA-256 metadata is recorded; filesystem metadata is not recorded.');
  lines.push('- Exact artifact exclusions:');
  if (observation.exactArtifactExclusions.length === 0) {
    lines.push('  - None.');
  } else {
    for (const path of observation.exactArtifactExclusions) {
      lines.push(`  - ${renderSafeMarkdownCode(path)}`);
    }
  }
  lines.push('', '### Containment warning', '', CONTAINMENT_WARNING);
  return lines;
}

export function renderVerifiedMarkdown(report: VerifiedReadinessReport): string {
  const markdown = renderMarkdown(safeBaseReport(report));
  const marker = '\n## Important limitation\n';
  if (!markdown.includes(marker)) throw new Error('Cannot place local verification in the report template.');
  return markdown.replace(marker, `\n${renderLocalVerification(report).join('\n')}\n${marker}`);
}
