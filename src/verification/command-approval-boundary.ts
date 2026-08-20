import type { CommandApprovalBoundary } from '../model/verification.js';

export const COMMAND_APPROVAL_BOUNDARY: CommandApprovalBoundary = Object.freeze({
  policyVersion: 'command-authorization/0.2',
  confirms: Object.freeze([
    'exact-command-declaration',
    'resolved-argument-array',
    'direct-launcher-evidence-checked-before-start',
  ]),
  doesNotConfirm: Object.freeze([
    'transitive-runtime-loads',
    'immutability-between-check-and-use',
    'same-user-process-isolation',
    'operating-system-runtime-closure',
  ]),
}) as CommandApprovalBoundary;

export function copyCommandApprovalBoundary(): CommandApprovalBoundary {
  return structuredClone(COMMAND_APPROVAL_BOUNDARY);
}
