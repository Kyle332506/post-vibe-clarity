import { describe, expect, it } from 'vitest';
import { selectOperationsApplicability } from '../../../src/checks/launch-operations/applicability.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';

function manifest(
  artifacts: ArtifactType[] = [],
  capabilities: string[] = [],
): CapabilityManifest {
  const detection = <T extends string>(value: T): Detection<T> => ({
    value,
    confidence: 'confirmed',
    evidence: [{ kind: 'file', location: 'package.json', summary: 'Fixture detection.' }],
  });

  return {
    schemaVersion: '0.1',
    projectRoot: '/fixture',
    generatedAt: '2026-08-20T00:00:00.000Z',
    artifacts: artifacts.map(detection),
    frameworks: [],
    services: [],
    capabilities: capabilities.map(detection),
  };
}

describe('selectOperationsApplicability', () => {
  it('selects the documented shape-aware applicability matrix', () => {
    const expected = {
      webService: {
        release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
        health: 'applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      backendWithData: {
        release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
        health: 'applicable', backup: 'applicable', ownership: 'applicable',
      },
      mobile: {
        release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
        health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      cli: {
        release: 'applicable', rollback: 'applicable', monitoring: 'not-applicable',
        health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      library: {
        release: 'applicable', rollback: 'applicable', monitoring: 'not-applicable',
        health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      ambiguous: {
        release: 'applicable', rollback: 'applicable', monitoring: 'unverified',
        health: 'unverified', backup: 'unverified', ownership: 'applicable',
      },
    } as const;
    const manifests = {
      webService: manifest(['web'], ['network-service']),
      backendWithData: manifest(['backend'], ['network-service', 'persistent-data']),
      mobile: manifest(['mobile']),
      cli: manifest(['cli']),
      library: manifest(['library']),
      ambiguous: manifest(),
    } as const;
    const checkIds = {
      release: 'launch-operations.release-process',
      rollback: 'launch-operations.rollback-process',
      monitoring: 'launch-operations.monitoring-response',
      health: 'launch-operations.health-check',
      backup: 'launch-operations.backup-restore',
      ownership: 'launch-operations.maintenance-ownership',
    } as const;

    for (const [shape, expectedChecks] of Object.entries(expected)) {
      const selectedManifest = manifests[shape as keyof typeof manifests];
      for (const [check, status] of Object.entries(expectedChecks)) {
        expect(selectOperationsApplicability(
          checkIds[check as keyof typeof checkIds],
          selectedManifest,
        ).status).toBe(status);
      }
    }
  });
});
