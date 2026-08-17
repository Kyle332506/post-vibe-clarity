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

function renderFinding(finding: Finding): string[] {
  const lines = [
    `- **${finding.title}** (${finding.outcome})`,
    `  - Check: ${finding.checkId} (skill version ${finding.skillVersion})`,
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
    '',
    '## Findings',
  ];

  for (const [level, label] of actionLevels) {
    const findings = report.findings.filter((finding) => finding.actionLevel === level);
    if (findings.length === 0) continue;

    lines.push('', `### ${label}`, '');
    for (const finding of findings) lines.push(...renderFinding(finding));
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
