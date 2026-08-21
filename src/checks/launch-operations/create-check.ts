import type { CapabilityManifest } from '../../model/capability.js';
import type { ActionLevel, Domain, Finding } from '../../model/finding.js';
import type { CheckImplementation } from '../../orchestrator/check-registry.js';
import { evaluateDocumentEvidence } from './document-evidence.js';
import { selectOperationsApplicability, type OperationsApplicability } from './applicability.js';
import type { DocumentEvidenceProfile, OperationsCheckId } from './types.js';

export interface OperationsCheckDefinition {
  id: OperationsCheckId;
  label: string;
  domains: readonly Domain[];
  actionLevel: ActionLevel;
  profile: (manifest: CapabilityManifest) => DocumentEvidenceProfile;
  recommendation: string;
  verification: string;
  liveBoundary: string;
  risk?: { title: string; impact: string; actionLevel: ActionLevel };
}

const version = '0.1.0';

function baseFinding(
  definition: OperationsCheckDefinition,
  applicability: OperationsApplicability,
): Pick<Finding, 'checkId' | 'checkVersion' | 'skillVersion' | 'domains' | 'applicability' | 'recommendation' | 'verification'> {
  return {
    checkId: definition.id,
    checkVersion: version,
    skillVersion: version,
    domains: [...definition.domains],
    applicability: applicability.reason,
    recommendation: definition.recommendation,
    verification: definition.verification,
  };
}

function notApplicableFinding(
  definition: OperationsCheckDefinition,
  applicability: OperationsApplicability,
): Finding {
  return {
    id: `${definition.id}.not-applicable`,
    ...baseFinding(definition, applicability),
    actionLevel: 'improve-when-appropriate',
    outcome: 'not-applicable',
    title: `${definition.label} review not applicable`,
    impact: 'The detected project shape does not require this operations review.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    humanReviewRequired: false,
  };
}

function applicabilityUnverifiedFinding(
  definition: OperationsCheckDefinition,
  applicability: OperationsApplicability,
): Finding {
  return {
    id: `${definition.id}.unverified`,
    ...baseFinding(definition, applicability),
    actionLevel: definition.actionLevel,
    outcome: 'unverified',
    title: `${definition.label} applicability could not be verified`,
    impact: 'The project shape is not sufficiently identified to determine whether this operations review applies.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    humanReviewRequired: true,
    unverifiedBoundaries: [applicability.reason],
  };
}

function evidenceUnverifiedFinding(
  definition: OperationsCheckDefinition,
  applicability: OperationsApplicability,
  status: 'missing' | 'insufficient',
  evidence: Finding['evidence'],
  boundaries: readonly string[],
): Finding {
  const evidenceBoundary = status === 'missing'
    ? 'No matching versioned operations evidence was available.'
    : 'Available operations evidence did not satisfy all required criteria.';
  return {
    id: `${definition.id}.unverified`,
    ...baseFinding(definition, applicability),
    actionLevel: definition.actionLevel,
    outcome: 'unverified',
    title: `${definition.label} evidence could not be verified`,
    impact: 'The available repository evidence is not sufficient to verify this operations practice.',
    evidence,
    evidenceConfidence: 'insufficient',
    humanReviewRequired: true,
    unverifiedBoundaries: [...new Set([evidenceBoundary, ...boundaries])],
  };
}

function passedFinding(
  definition: OperationsCheckDefinition,
  applicability: OperationsApplicability,
  evidence: Finding['evidence'],
): Finding {
  return {
    id: `${definition.id}.passed`,
    ...baseFinding(definition, applicability),
    actionLevel: definition.actionLevel,
    outcome: 'passed',
    title: `${definition.label} evidence found`,
    impact: 'Versioned repository evidence satisfies the defined operations evidence profile.',
    evidence,
    evidenceConfidence: 'confirmed',
    humanReviewRequired: false,
    unverifiedBoundaries: [definition.liveBoundary],
  };
}

function likelyIssueFinding(
  definition: OperationsCheckDefinition,
  applicability: OperationsApplicability,
  evidence: Finding['evidence'],
): Finding {
  const risk = definition.risk;
  if (!risk) throw new Error('A risk finding requires risk metadata.');
  return {
    id: `${definition.id}.likely-issue`,
    ...baseFinding(definition, applicability),
    actionLevel: risk.actionLevel,
    outcome: 'likely-issue',
    title: risk.title,
    impact: risk.impact,
    evidence,
    evidenceConfidence: 'confirmed',
    humanReviewRequired: true,
  };
}

export function createOperationsCheck(definition: OperationsCheckDefinition): CheckImplementation {
  return {
    id: definition.id,
    version,
    domains: definition.domains,
    actionLevel: 0,
    requiredAccess: ['filesystem-read'],
    async run(context) {
      const applicability = selectOperationsApplicability(definition.id, context.manifest);
      if (applicability.status === 'not-applicable') return [notApplicableFinding(definition, applicability)];
      if (applicability.status === 'unverified') return [applicabilityUnverifiedFinding(definition, applicability)];

      const result = await evaluateDocumentEvidence(
        context.root,
        context.excludedArtifactPaths ?? [],
        definition.profile(context.manifest),
      );
      if (definition.risk && result.riskEvidence.length > 0) {
        return [likelyIssueFinding(definition, applicability, result.riskEvidence)];
      }
      if (result.status !== 'usable') {
        return [evidenceUnverifiedFinding(
          definition,
          applicability,
          result.status,
          result.evidence,
          result.unverifiedBoundaries,
        )];
      }
      return [passedFinding(definition, applicability, result.evidence)];
    },
  };
}
