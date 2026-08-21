import { extname } from 'node:path';
import { createOperationsCheck } from './create-check.js';
import {
  evidenceWordCount,
  hasNegativeEvidenceAssertion,
  normalizeEvidenceValue,
  structuredFieldValueMatcher,
} from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

type ContentMatcher = (content: string, location: string) => boolean;
type ValuePredicate = (value: string) => boolean;

const plainTextExtensions = new Set(['.md', '.mdx', '.txt']);
const quantity = String.raw`(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|ninety)`;
const duration = String.raw`${quantity}[\t ]+(?:minutes?|hours?|days?|weeks?|months?|years?)`;

const durationPattern = new RegExp(String.raw`\b${duration}\b`, 'iu');
const explicitCadencePattern = new RegExp(String.raw`\b(?:(?:once|twice|${quantity}[\t ]+times?)[\t ]+per[\t ]+(?:hour|day|week|month|year)|hourly|daily|weekly|monthly|quarterly|annually|yearly|every[\t ]+${duration})\b`, 'iu');

const concreteValue = (value: string, generic: RegExp, minimumWords = 2): boolean => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized)
    && evidenceWordCount(normalized) >= minimumWords
    && !generic.test(normalized);
};

const dataValue: ValuePredicate = (value) => concreteValue(value, /^(?:data|database|resource|storage|store)$/iu);
const mechanismValue: ValuePredicate = (value) => concreteValue(value, /^(?:backup|backup mechanism|mechanism|restore)$/iu);
const durationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized) && durationPattern.test(normalized);
};
const frequencyValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized)
    && (durationPattern.test(normalized) || explicitCadencePattern.test(normalized));
};
const restoreValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized)
    && evidenceWordCount(normalized) >= 4
    && !/^(?:run|follow|execute)[\t ]+(?:the[\t ]+)?(?:restore|recovery)[\t ]+procedure$/iu.test(normalized)
    && /\b(?:approved|maintained|documented|referenced|provider|private|snapshot|runbook|operations[\t ]+system|recovery[\t ]+environment)\b/iu.test(normalized);
};
const ownerValue: ValuePredicate = (value) => concreteValue(value, /^(?:owner|team|maintainer|support|operator)$/iu);
const notificationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized)
    && evidenceWordCount(normalized) >= 5
    && /\b(?:alerts?|notif(?:y|ies|ied|ication\w*)|pages?|reports?|routes?|sends?|surfaces?)\b/iu.test(normalized);
};
const testingValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized)
    && explicitCadencePattern.test(normalized)
    && /\b(?:in|against|within|using)[\t ]+(?:(?:a|an|the)[\t ]+)?[\p{L}\p{N}][\p{L}\p{N}-]*/iu.test(normalized);
};
const substantiveBoundaryValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return !hasNegativeEvidenceAssertion(normalized, [
    /\bnot[\t ]+stored\b/giu,
    /\bdoes[\t ]+not[\t ]+include\b/giu,
  ])
    && evidenceWordCount(normalized) >= 5
    && /\b(?:not[\t ]+stored|excluded|outside|does[\t ]+not[\t ]+include|limited[\t ]+to|only)\b/iu.test(normalized);
};

function matchesAny(...matchers: ContentMatcher[]): ContentMatcher {
  return (content, location) => matchers.some((matcher) => matcher(content, location));
}

function labeledValueMatcher(labels: string, predicate: ValuePredicate): ContentMatcher {
  return (content, location) => {
    if (!plainTextExtensions.has(extname(location).toLowerCase())) return false;
    const fieldPattern = new RegExp(String.raw`^[\t ]*(?:${labels})[\t ]*:[\t ]*(.+)$`, 'gimu');
    return [...content.matchAll(fieldPattern)].some((match) => predicate(match[1] ?? ''));
  };
}

function orderedRestoreMatcher(content: string, location: string): boolean {
  if (!plainTextExtensions.has(extname(location).toLowerCase())) return false;
  const stepPattern = /^[\t ]*(?:\d+[.)]|[-*][\t ]+\[[ xX]\])[\t ]+([^\r\n]+)$/gimu;
  return [...content.matchAll(stepPattern)].some((match) => restoreValue(match[1] ?? ''));
}

const backupRestoreRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'data',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('data|protected data|data source', dataValue),
      structuredFieldValueMatcher(['data', 'protectedData', 'protected_data', 'dataSource', 'data_source'], dataValue),
    ),
  },
  {
    id: 'mechanism',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('backup mechanism|mechanism', mechanismValue),
      structuredFieldValueMatcher(['backupMechanism', 'backup_mechanism', 'mechanism'], mechanismValue),
    ),
  },
  {
    id: 'recovery-point',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('frequency|backup frequency|recovery point(?: expectation| objective)?|rpo', frequencyValue),
      structuredFieldValueMatcher(['frequency', 'backupFrequency', 'backup_frequency', 'recoveryPointExpectation', 'recovery_point_expectation', 'recoveryPointObjective', 'recovery_point_objective', 'rpo'], frequencyValue),
    ),
  },
  {
    id: 'retention',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('retention', durationValue),
      structuredFieldValueMatcher(['retention'], durationValue),
    ),
  },
  {
    id: 'restore-procedure',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      orderedRestoreMatcher,
      labeledValueMatcher('restore steps?|restore procedure|recovery procedure', restoreValue),
      structuredFieldValueMatcher(['restoreSteps', 'restore_steps', 'restoreProcedure', 'restore_procedure', 'recoveryProcedure', 'recovery_procedure'], restoreValue),
    ),
  },
  {
    id: 'recovery-time',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('recovery time(?: expectation| objective)?|rto', durationValue),
      structuredFieldValueMatcher(['recoveryTimeExpectation', 'recovery_time_expectation', 'recoveryTimeObjective', 'recovery_time_objective', 'rto'], durationValue),
    ),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('owner|responsible(?: role)?|maintainer', ownerValue),
      structuredFieldValueMatcher(['owner', 'responsibleRole', 'responsible_role', 'maintainer'], ownerValue),
    ),
  },
  {
    id: 'failure-notification',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('failure notification|backup failure handling|alerting', notificationValue),
      structuredFieldValueMatcher(['failureNotification', 'failure_notification', 'backupFailureHandling', 'backup_failure_handling', 'alerting'], notificationValue),
    ),
  },
  {
    id: 'restore-testing',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('restore testing|restoration testing|recovery testing', testingValue),
      structuredFieldValueMatcher(['restoreTesting', 'restore_testing', 'restorationTesting', 'restoration_testing', 'recoveryTesting', 'recovery_testing'], testingValue),
    ),
  },
  {
    id: 'boundaries',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('boundaries|boundary|limitations?', substantiveBoundaryValue),
      structuredFieldValueMatcher(['boundaries', 'boundary', 'limitations'], substantiveBoundaryValue),
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
