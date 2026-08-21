import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

const releaseRequirements: readonly EvidenceRequirement[] = [
  { id: 'artifact', patterns: [/\b(?:artifact|application|service|package|binary|mobile app|desktop app)\b/iu] },
  { id: 'target', patterns: [/\b(?:production|staging|registry|app store|play store|distribution channel|deployment target)\b/iu] },
  { id: 'prerequisites', patterns: [/\b(?:prerequisite|required access|before (?:release|deploy|publish)|approved revision)\b/iu] },
  { id: 'procedure', patterns: [/^\s*(?:\d+[.)]|[-*]\s+\[[ xX]\])\s+\S/mu] },
  { id: 'verification', patterns: [/\b(?:verification|verify|smoke test|confirm the expected version|post-release)\b/iu] },
  { id: 'owner', patterns: [/\b(?:owner|responsible|maintainer|release team)\s*:/iu] },
];

export const releaseProcessCheck = createOperationsCheck({
  id: 'launch-operations.release-process',
  label: 'Release and deployment',
  domains: ['release-delivery'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [
      /(?:^|\/)[^/]*(?:deploy(?:ment)?|release|publish(?:ing)?|distribution|operations|runbooks?)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
      /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/iu,
    ],
    requirements: releaseRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document the release, deployment, publishing, or distribution procedure, including prerequisites, verification, and ownership.',
  verification: 'Review the versioned procedure with the responsible maintainer and confirm the live target separately.',
  liveBoundary: 'No deployment, registry, or store was queried.',
});
