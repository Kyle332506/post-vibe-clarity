# Rollback and recovery

This document is example repository guidance. It does not prove live behavior.

Trigger: roll back when release health verification fails.
Decision owner: Incident Lead.
1. Stop the rollout and record the affected revision.
2. Restore the previously approved version listed in the release record.
Verification: repeat the health verification and confirm the expected revision.

Boundary: no release was changed and no recovery procedure was run.
