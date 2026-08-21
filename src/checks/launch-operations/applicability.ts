import type { CapabilityManifest } from '../../model/capability.js';
import type { OperationsCheckId } from './types.js';

export interface OperationsApplicability {
  status: 'applicable' | 'not-applicable' | 'unverified';
  profile: 'service' | 'worker' | 'mobile-desktop' | 'cli' | 'library' | 'ambiguous';
  reason: string;
}

const universalChecks = new Set<OperationsCheckId>([
  'launch-operations.release-process',
  'launch-operations.rollback-process',
  'launch-operations.maintenance-ownership',
]);

function selectProfile(manifest: CapabilityManifest): OperationsApplicability['profile'] {
  const artifacts = new Set(manifest.artifacts.map(({ value }) => value));
  if (artifacts.has('web') || artifacts.has('backend')) return 'service';
  if (artifacts.has('worker')) return 'worker';
  if (artifacts.has('mobile') || artifacts.has('desktop')) return 'mobile-desktop';
  if (artifacts.has('cli')) return 'cli';
  if (artifacts.has('library')) return 'library';
  return 'ambiguous';
}

function isApplicableForProfile(
  checkId: OperationsCheckId,
  profile: OperationsApplicability['profile'],
  manifest: CapabilityManifest,
): boolean {
  if (checkId === 'launch-operations.monitoring-response') {
    return profile === 'service' || profile === 'worker' || profile === 'mobile-desktop';
  }
  if (checkId === 'launch-operations.health-check') {
    return manifest.capabilities.some(({ value }) => value === 'network-service');
  }
  return checkId === 'launch-operations.backup-restore'
    && manifest.capabilities.some(({ value }) => value === 'persistent-data');
}

function profileDescription(profile: OperationsApplicability['profile']): string {
  if (profile === 'service') return 'service';
  if (profile === 'worker') return 'background worker';
  if (profile === 'mobile-desktop') return 'mobile or desktop application';
  if (profile === 'cli') return 'command-line application';
  if (profile === 'library') return 'library';
  return 'unrecognized project shape';
}

export function selectOperationsApplicability(
  checkId: OperationsCheckId,
  manifest: CapabilityManifest,
): OperationsApplicability {
  const profile = selectProfile(manifest);
  if (universalChecks.has(checkId)) {
    return {
      status: 'applicable',
      profile,
      reason: 'Release, rollback, and maintenance ownership evidence is relevant to every project shape.',
    };
  }
  if (profile === 'ambiguous') {
    return {
      status: 'unverified',
      profile,
      reason: 'The project manifest does not identify a recognized artifact shape for this shape-dependent operations review.',
    };
  }
  if (isApplicableForProfile(checkId, profile, manifest)) {
    return {
      status: 'applicable',
      profile,
      reason: `This ${profileDescription(profile)} has the capability or delivery shape that makes this operations review relevant.`,
    };
  }
  return {
    status: 'not-applicable',
    profile,
    reason: `This ${profileDescription(profile)} does not have the capability or delivery shape that requires this operations review.`,
  };
}
