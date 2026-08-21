import { extname } from 'node:path';
import { createOperationsCheck } from './create-check.js';
import { structuredFieldMatcher } from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

type ContentMatcher = (content: string, location: string) => boolean;

const plainTextExtensions = new Set(['.md', '.mdx', '.txt']);
const negativeEvidence = String.raw`(?:none|unknown|n\/a|tbd|todo|disabled|never|missing|unavailable|not[\t ]+defined|do[\t ]+not|does[\t ]+not|no)`;
const quantity = String.raw`(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|ninety)`;
const duration = String.raw`${quantity}[\t ]+(?:minutes?|hours?|days?|weeks?|months?|years?)`;

const dataValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b(?:databases?|tables?|records?|files?|uploads?|objects?|blobs?|volumes?|datasets?|queues?|messages?|customer[\t ]+data|user[\t ]+data)\b).+$`, 'iu');
const mechanismValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b(?:snapshots?|replicas?|exports?|archives?|dumps?|point-in-time[\t -]+recovery|continuous[\t -]+backup)\b).+$`, 'iu');
const durationValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b${duration}\b).+$`, 'iu');
const restoreValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b(?:select|restore|recover|download|follow|invoke|run|apply)\w*\b)(?=.*\b(?:snapshots?|backups?|databases?|data|files?|exports?|archives?|procedure|runbook|operations[\t ]+system)\b).+$`, 'iu');
const ownerValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b(?:maintainer|owner|on-call|team|lead|engineer|operator|responder|support|sre)\b).+$`, 'iu');
const notificationValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b(?:alert\w*|notif(?:y|ies|ied|ication\w*)|pag(?:e|es|ed|ing)|surfac\w*|report\w*)\b)(?=.*\b(?:maintainers?|owners?|on-call|teams?|services?|pager|email|slack|operators?|responders?|support|sre)\b).+$`, 'iu');
const testingValue = new RegExp(String.raw`^(?!.*\b${negativeEvidence}\b)(?=.*\b(?:daily|weekly|monthly|quarterly|annually|yearly|every[\t ]+${duration})\b)(?=.*\b(?:non-production|recovery|staging|test|isolated)[\t -]+environment\b).+$`, 'iu');
const substantiveBoundaryValue = /^(?!.*\b(?:none|unknown|n\/a|tbd|todo|disabled|missing|unavailable)\b)(?=.{20,}$)(?=.*\b(?:configuration|credentials|secrets?|scope|provider|environment|system|repository|live)\b)(?=.*\b(?:not[\t ]+stored|excluded|outside|does[\t ]+not[\t ]+include|limited[\t ]+to|only)\b).+$/iu;

function testPattern(pattern: RegExp, value: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(value);
}

function matchesAny(...matchers: ContentMatcher[]): ContentMatcher {
  return (content, location) => matchers.some((matcher) => matcher(content, location));
}

function labeledValueMatcher(labels: string, valuePattern: RegExp): ContentMatcher {
  return (content, location) => {
    if (!plainTextExtensions.has(extname(location).toLowerCase())) return false;
    const fieldPattern = new RegExp(String.raw`^[\t ]*(?:${labels})[\t ]*:[\t ]*(.+)$`, 'gimu');
    return [...content.matchAll(fieldPattern)].some((match) => testPattern(valuePattern, match[1] ?? ''));
  };
}

const backupRestoreRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'data',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('data|protected data|data source', dataValue),
      structuredFieldMatcher(['data', 'protectedData', 'protected_data', 'dataSource', 'data_source'], dataValue),
    ),
  },
  {
    id: 'mechanism',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('backup mechanism|mechanism', mechanismValue),
      structuredFieldMatcher(['backupMechanism', 'backup_mechanism', 'mechanism'], mechanismValue),
    ),
  },
  {
    id: 'recovery-point',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('frequency|backup frequency|recovery point(?: expectation| objective)?|rpo', durationValue),
      structuredFieldMatcher(['frequency', 'backupFrequency', 'backup_frequency', 'recoveryPointExpectation', 'recovery_point_expectation', 'recoveryPointObjective', 'recovery_point_objective', 'rpo'], durationValue),
    ),
  },
  {
    id: 'retention',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('retention', durationValue),
      structuredFieldMatcher(['retention'], durationValue),
    ),
  },
  {
    id: 'restore-procedure',
    textOnlyPatterns: true,
    patterns: [
      new RegExp(String.raw`^[\t ]*(?:\d+[.)]|[-*][\t ]+\[[ xX]\])[\t ]+(?![^\r\n]*\b${negativeEvidence}\b)(?=[^\r\n]*\b(?:select|restore|recover|download|follow|invoke|run|apply)\w*\b)(?=[^\r\n]*\b(?:snapshots?|backups?|databases?|data|files?|exports?|archives?|procedure|runbook|operations[\t ]+system)\b)[^\r\n]+$`, 'imu'),
    ],
    matches: matchesAny(
      labeledValueMatcher('restore steps?|restore procedure|recovery procedure', restoreValue),
      structuredFieldMatcher(['restoreSteps', 'restore_steps', 'restoreProcedure', 'restore_procedure', 'recoveryProcedure', 'recovery_procedure'], restoreValue),
    ),
  },
  {
    id: 'recovery-time',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('recovery time(?: expectation| objective)?|rto', durationValue),
      structuredFieldMatcher(['recoveryTimeExpectation', 'recovery_time_expectation', 'recoveryTimeObjective', 'recovery_time_objective', 'rto'], durationValue),
    ),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('owner|responsible(?: role)?|maintainer', ownerValue),
      structuredFieldMatcher(['owner', 'responsibleRole', 'responsible_role', 'maintainer'], ownerValue),
    ),
  },
  {
    id: 'failure-notification',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('failure notification|backup failure handling|alerting', notificationValue),
      structuredFieldMatcher(['failureNotification', 'failure_notification', 'backupFailureHandling', 'backup_failure_handling', 'alerting'], notificationValue),
    ),
  },
  {
    id: 'restore-testing',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('restore testing|restoration testing|recovery testing', testingValue),
      structuredFieldMatcher(['restoreTesting', 'restore_testing', 'restorationTesting', 'restoration_testing', 'recoveryTesting', 'recovery_testing'], testingValue),
    ),
  },
  {
    id: 'boundaries',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('boundaries|boundary|limitations?', substantiveBoundaryValue),
      structuredFieldMatcher(['boundaries', 'boundary', 'limitations'], substantiveBoundaryValue),
    ),
  },
];

const backupRiskPatterns = [
  /^[\t ]*(?:backups[\t ]+are[\t ]+disabled|we[\t ]+do[\t ]+not[\t ]+back[\t ]+up[\t ]+this[\t ]+data|there[\t ]+is[\t ]+no[\t ]+restore[\t ]+path)[\t ]*[.!;,]*[\t ]*$/imu,
];

export const backupRestoreCheck = createOperationsCheck({
  id: 'launch-operations.backup-restore',
  label: 'Backup and restore',
  domains: ['data-correctness', 'reliability-recovery'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [
      /(?:^|\/)[^/]*(?:backup|restore|recovery|data[-_. ]?(?:protection|recovery)|operations?|runbooks?)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
    ],
    requirements: backupRestoreRequirements,
    riskPatterns: backupRiskPatterns,
  }),
  recommendation: 'Document protected data, backup and restoration expectations, ownership, testing, notification, and evidence boundaries.',
  verification: 'Review the versioned backup and restore evidence with the owner and test restoration separately in an approved environment.',
  liveBoundary: 'No backup or restoration was observed or tested.',
  risk: {
    title: 'Backup or restoration is explicitly unavailable',
    impact: 'Persistent project data may not have a usable recovery path after loss or corruption.',
    actionLevel: 'stop-before-launch',
  },
});
