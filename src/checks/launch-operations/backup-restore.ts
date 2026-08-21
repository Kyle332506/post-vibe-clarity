import { createOperationsCheck } from './create-check.js';
import { structuredFieldMatcher } from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

const dataValue = /\b(?:data|database|store|storage|records?|files?|uploads?)\b/iu;
const mechanismValue = /\b(?:backup|snapshot|replica|export|archive)\w*\b/iu;
const durationValue = /\b(?:minutes?|hours?|days?|weeks?|months?|years?|monthly|daily|hourly)\b/iu;
const restoreValue = /\b(?:restore|recover|snapshot|provider procedure|recovery procedure)\w*\b/iu;
const ownerValue = /\b(?:maintainer|owner|on-call|team|lead|engineer|operator|responder|support|sre)\b/iu;
const notificationValue = /\b(?:alert\w*|notif(?:y|ies|ied|ication\w*)|pag(?:e|es|ed|ing)|surfac\w*|report\w*)\b/iu;
const testingCadenceValue = /\b(?:daily|weekly|monthly|quarterly|annually|yearly|every[\t ]+\d+[\t ]+(?:days?|weeks?|months?))\b/iu;
const substantiveBoundaryValue = /^(?![\t ]*(?:tbd|todo|unknown|none|n\/a)\b)[\s\S]*\S[\s\S]*$/iu;

const backupRestoreRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'data',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:data|protected data|data source)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)\S[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['data', 'protectedData', 'protected_data', 'dataSource', 'data_source'], dataValue),
  },
  {
    id: 'mechanism',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:backup mechanism|mechanism)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|none\b)[^\r\n]*\b(?:backup|snapshot|replica|export|archive)\w*\b[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['backupMechanism', 'backup_mechanism', 'mechanism'], mechanismValue),
  },
  {
    id: 'recovery-point',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:frequency|backup frequency|recovery point(?: expectation| objective)?|rpo)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)[^\r\n]*\b(?:minutes?|hours?|days?|weeks?|monthly|daily|hourly)\b[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['frequency', 'backupFrequency', 'backup_frequency', 'recoveryPointExpectation', 'recovery_point_expectation', 'recoveryPointObjective', 'recovery_point_objective', 'rpo'], durationValue),
  },
  {
    id: 'retention',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*retention[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|none\b)[^\r\n]*\b(?:hours?|days?|weeks?|months?|years?)\b[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['retention'], durationValue),
  },
  {
    id: 'restore-procedure',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:\d+[.)]|[-*][\t ]+\[[ xX]\])[\t ]+[^\r\n]*\b(?:restore|recover|snapshot|provider procedure|recovery procedure)\w*\b[^\r\n]*$/imu,
      /^[\t ]*(?:restore steps?|restore procedure|recovery procedure)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|none\b)\S[^\r\n]*$/imu,
    ],
    matches: structuredFieldMatcher(['restoreSteps', 'restore_steps', 'restoreProcedure', 'restore_procedure', 'recoveryProcedure', 'recovery_procedure'], restoreValue),
  },
  {
    id: 'recovery-time',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:recovery time(?: expectation| objective)?|rto)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)[^\r\n]*\b(?:minutes?|hours?|days?)\b[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['recoveryTimeExpectation', 'recovery_time_expectation', 'recoveryTimeObjective', 'recovery_time_objective', 'rto'], durationValue),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:owner|responsible(?: role)?|maintainer)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)\S[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['owner', 'responsibleRole', 'responsible_role', 'maintainer'], ownerValue),
  },
  {
    id: 'failure-notification',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:failure notification|backup failure handling|alerting)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|none\b)[^\r\n]*\b(?:alert|notify|page|surface|report)\w*\b[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['failureNotification', 'failure_notification', 'backupFailureHandling', 'backup_failure_handling', 'alerting'], notificationValue),
  },
  {
    id: 'restore-testing',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:restore testing|restoration testing|recovery testing)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|never\b)[^\r\n]*\b(?:daily|weekly|monthly|quarterly|annually|yearly|every[\t ]+\d+[\t ]+(?:days?|weeks?|months?))\b[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['restoreTesting', 'restore_testing', 'restorationTesting', 'restoration_testing', 'recoveryTesting', 'recovery_testing'], testingCadenceValue),
  },
  {
    id: 'boundaries',
    textOnlyPatterns: true,
    patterns: [/^[\t ]*(?:boundaries|boundary|limitations?)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|none\b)\S[^\r\n]*$/imu],
    matches: structuredFieldMatcher(['boundaries', 'boundary', 'limitations'], substantiveBoundaryValue),
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
