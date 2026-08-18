import type { ActionLevel, Finding, Outcome } from '../model/finding.js';
import type { ReadinessReport } from '../model/report.js';

const actionLevels: Array<[ActionLevel, string]> = [
  ['stop-before-launch', 'Stop before launch'],
  ['resolve-before-launch', 'Resolve before launch'],
  ['plan-soon', 'Plan soon'],
  ['improve-when-appropriate', 'Improve when appropriate'],
  ['human-review-needed', 'Human review needed'],
];

const outcomes: Array<[Outcome, string]> = [
  ['passed', 'Passed'],
  ['failed', 'Failed'],
  ['likely-issue', 'Likely issue'],
  ['unverified', 'Unverified'],
  ['not-applicable', 'Not applicable'],
  ['risk-accepted', 'Risk accepted'],
  ['resolved-and-rechecked', 'Resolved and rechecked'],
];

const domainLabels = new Map([
  ['product-ux', 'Product and user experience'],
  ['security-privacy', 'Security and privacy'],
  ['data-correctness', 'Data and correctness'],
  ['reliability-recovery', 'Reliability and recovery'],
  ['operations-observability', 'Operations and observability'],
  ['performance-cost', 'Performance and cost'],
  ['maintainability-change-safety', 'Maintainability and change safety'],
  ['release-delivery', 'Release and delivery'],
  ['policy-business-essentials', 'Policy and business essentials'],
]);

function renderFinding(finding: Finding): string[] {
  const lines = [
    `- **${finding.title}** (${finding.outcome})`,
    `  - Check: ${finding.checkId} (check version ${finding.checkVersion}; skill version ${finding.skillVersion})`,
    `  - Impact: ${finding.impact}`,
    `  - Recommendation: ${finding.recommendation}`,
    `  - Verification: ${finding.verification}`,
  ];
  const locations = finding.evidence.flatMap((evidence) => evidence.location === undefined ? [] : [evidence.location]);

  if (locations.length > 0) {
    lines.push(`  - Evidence locations: ${locations.join(', ')}`);
  }

  return lines;
}

function renderScope(report: ReadinessReport): string[] {
  const artifacts = report.manifest.artifacts.map((artifact) => artifact.value);
  const artifactDescription = artifacts.length === 0 ? 'No artifact types were identified.' : `Artifact types: ${artifacts.join(', ')}.`;

  return [
    `- Project root: ${report.manifest.projectRoot}`,
    `- ${artifactDescription}`,
    `- Generated at: ${report.generatedAt}`,
    `- Toolkit version: ${report.toolkitVersion}`,
    `- Partial review: ${report.partial ? 'yes' : 'no'}`,
  ];
}

export function renderMarkdown(report: ReadinessReport): string {
  const lines = [
    '# PostVibeClarity launch review',
    '',
    '## Summary',
    '',
    ...actionLevels.map(([level, label]) => `- ${label}: ${report.summary.byActionLevel[level]}`),
    ...outcomes.map(([outcome, label]) => `- ${label}: ${report.summary.byOutcome[outcome]}`),
    `- Checks completed: ${report.summary.byCheckStatus.completed}`,
    `- Checks unavailable: ${report.summary.byCheckStatus.unavailable}`,
    `- Checks failed: ${report.summary.byCheckStatus.failed}`,
    `- Checks unverified: ${report.summary.byCheckStatus.unverified}`,
    '',
    '## Findings',
  ];

  for (const [level, label] of actionLevels) {
    const findings = report.findings.filter((finding) => finding.actionLevel === level);
    if (findings.length === 0) continue;

    lines.push('', `### ${label}`, '');
    for (const finding of findings) lines.push(...renderFinding(finding));
  }

  lines.push('', '## Checks performed', '');
  if (report.checkExecutions.length === 0) {
    lines.push('- No routed checks were recorded.');
  } else {
    for (const execution of report.checkExecutions) {
      lines.push(
        `- ${execution.checkId}: ${execution.status}`,
        `  - Skill: ${execution.skillId} (version ${execution.skillVersion})`,
        `  - Check version: ${execution.checkVersion}`,
        `  - Domains: ${execution.domains.map((domain) => domainLabels.get(domain) ?? domain).join(', ')}`,
        `  - Findings recorded: ${execution.findingIds.length}`,
      );
    }
  }

  lines.push('', '## Coverage gaps', '');
  if (report.coverageGaps.length === 0) {
    lines.push('- None recorded.');
  } else {
    for (const gap of report.coverageGaps) {
      if (gap.checkId) {
        lines.push(`- Check ${gap.checkId} (${gap.status}): ${gap.reason}`);
      } else {
        const labels = gap.domains.map((domain) => domainLabels.get(domain) ?? domain).join(', ');
        lines.push(`- ${labels}: ${gap.reason}`);
      }
    }
  }

  lines.push('', '## Unverified areas', '');
  const unverified = report.findings.filter((finding) => finding.outcome === 'unverified');
  if (unverified.length === 0) {
    lines.push('- None reported.');
  } else {
    for (const finding of unverified) {
      lines.push(`- ${finding.title}`);
      for (const boundary of finding.unverifiedBoundaries ?? []) lines.push(`  - ${boundary}`);
    }
  }

  lines.push('', '## Scope', '', ...renderScope(report), '', '## Important limitation', '', report.disclaimer, '');
  return lines.join('\n');
}
