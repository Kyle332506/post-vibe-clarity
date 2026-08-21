import type { CheckImplementation } from '../../orchestrator/check-registry.js';
import { backupRestoreCheck } from './backup-restore.js';
import { healthCheck } from './health-check.js';
import { maintenanceOwnershipCheck } from './maintenance-ownership.js';
import { monitoringResponseCheck } from './monitoring-response.js';
import { releaseProcessCheck } from './release-process.js';
import { rollbackProcessCheck } from './rollback-process.js';

export const launchOperationsChecks: readonly CheckImplementation[] = Object.freeze([
  backupRestoreCheck,
  healthCheck,
  maintenanceOwnershipCheck,
  monitoringResponseCheck,
  releaseProcessCheck,
  rollbackProcessCheck,
]);
