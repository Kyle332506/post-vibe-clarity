import { extname } from 'node:path';
import { createOperationsCheck } from './create-check.js';
import {
  hasConcreteOwnerEvidence,
  hasEvidenceSubstance,
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
const calendarRecurrencePattern = /\b(?:on[\t ]+)?(?:the[\t ]+)?(?:first|second|third|fourth|fifth|last|\d{1,2}(?:st|nd|rd|th))[\t ]+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[\t ]+of[\t ]+(?:each|every)[\t ]+(?:month|quarter|year)\b/iu;
const restorationExercisePattern = /^(?:exercise|practice|rehearse|test|validate|verify)\b/iu;
const procedureRelationshipPattern = /\b(?:according[\t ]+to|following|from|referenced[\t ]+in|through|to|under|using|via)\b/giu;
const procedureStatePattern = /\b(?:is|are|was|were|be|been|being|exists?|remains?|available)\b/iu;
const procedureDescriptionPattern = /\b(?:about|and|concerning|for|or|regarding|with)\b/iu;
const procedureFunctionWords = new Set([
  'a', 'an', 'and', 'according', 'at', 'for', 'following', 'from', 'in', 'into', 'it', 'its',
  'of', 'on', 'referenced', 'the', 'then', 'through', 'to', 'under', 'using', 'via', 'with',
]);

function procedureWords(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? [];
}

function independentProcedureWordCount(value: string): number {
  return procedureWords(value).filter((word) => !procedureFunctionWords.has(word)).length;
}

function hasActionableProcedureStructure(value: string): boolean {
  return value.split(';').some((segment) => {
    const normalized = normalizeEvidenceValue(segment);
    const words = procedureWords(normalized);
    if (words.length < 4
      || procedureFunctionWords.has(words[0]!)
      || procedureStatePattern.test(normalized)) {
      return false;
    }

    for (const relationship of normalized.matchAll(procedureRelationshipPattern)) {
      const start = relationship.index;
      const end = start + relationship[0].length;
      if (independentProcedureWordCount(normalized.slice(0, start)) >= 1
        && independentProcedureWordCount(normalized.slice(end)) >= 2) {
        return true;
      }
    }

    return !procedureDescriptionPattern.test(normalized)
      && independentProcedureWordCount(words.slice(1).join(' ')) >= 3;
  });
}

const dataValue: ValuePredicate = (value) => hasEvidenceSubstance(value, {
  fieldLabels: ['data', 'protected data', 'data source'],
  minimumWords: 2,
});
const mechanismValue: ValuePredicate = (value) => hasEvidenceSubstance(value, {
  fieldLabels: ['backup mechanism', 'mechanism'],
  minimumWords: 2,
});
const durationValue = (fieldLabels: readonly string[]): ValuePredicate => (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, { fieldLabels, minimumWords: 2 })
    && durationPattern.test(normalized);
};
const retentionValue = durationValue(['retention']);
const recoveryTimeValue = durationValue(['recovery time', 'recovery time expectation', 'recovery time objective', 'rto']);
const frequencyValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['frequency', 'backup frequency', 'recovery point', 'recovery point expectation', 'recovery point objective', 'rpo'],
    minimumWords: 2,
  })
    && (durationPattern.test(normalized) || explicitCadencePattern.test(normalized));
};
const restoreValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['restore step', 'restore steps', 'restore procedure', 'recovery procedure'],
    minimumWords: 4,
  })
    && !/^(?:run|follow|execute)[\t ]+(?:the[\t ]+)?(?:restore|recovery)[\t ]+procedure$/iu.test(normalized)
    && hasActionableProcedureStructure(normalized);
};
const ownerValue: ValuePredicate = (value) => hasConcreteOwnerEvidence(value);
const maintainerValue: ValuePredicate = (value) => hasConcreteOwnerEvidence(value, ['maintainer']);
const notificationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['failure notification', 'backup failure handling', 'alerting'],
    minimumWords: 5,
  })
    && /\b(?:alerts?|notif(?:y|ies|ied|ication\w*)|pages?|reports?|routes?|sends?|surfaces?)\b/iu.test(normalized);
};
const testingValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['restore testing', 'restoration testing', 'recovery testing'],
    minimumWords: 3,
  })
    && restorationExercisePattern.test(normalized)
    && (explicitCadencePattern.test(normalized) || calendarRecurrencePattern.test(normalized))
    && /\b(?:in|against|within|using)[\t ]+(?:(?:a|an|the)[\t ]+)?[\p{L}\p{N}][\p{L}\p{N}-]*/iu.test(normalized);
};
const substantiveBoundaryValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['boundary', 'boundaries', 'limitation', 'limitations'],
    minimumWords: 5,
    allowedIncompleteAssertions: [
      /\bnot[\t ]+stored\b/giu,
      /\bdoes[\t ]+not[\t ]+include\b/giu,
    ],
  })
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
      labeledValueMatcher('retention', retentionValue),
      structuredFieldValueMatcher(['retention'], retentionValue),
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
      labeledValueMatcher('recovery time(?: expectation| objective)?|rto', recoveryTimeValue),
      structuredFieldValueMatcher(['recoveryTimeExpectation', 'recovery_time_expectation', 'recoveryTimeObjective', 'recovery_time_objective', 'rto'], recoveryTimeValue),
    ),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('owner|responsible(?: role)?', ownerValue),
      labeledValueMatcher('maintainer', maintainerValue),
      structuredFieldValueMatcher(['owner', 'responsibleRole', 'responsible_role'], ownerValue),
      structuredFieldValueMatcher(['maintainer'], maintainerValue),
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
