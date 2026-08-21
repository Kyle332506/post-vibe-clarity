# Backup and restore

This document is example repository guidance. It does not prove live behavior.

Data: signup metrics timestamp records.
Repository reference: [`data/schema.sql`](../../data/schema.sql).
Backup mechanism: scheduled encrypted snapshots of the intended data store.
Frequency: every 24 hours; acceptable data loss is 24 hours.
Retention: 30 days.
1. Select an approved snapshot in the recovery environment.
2. Restore the snapshot using the example recovery procedure recorded in this document.
Recovery time expectation: four hours.
Owner: Data Recovery Maintainer.
Failure notification: backup-job failures notify the Data Recovery Maintainer.
Restore testing: test quarterly in a non-production recovery environment.
Boundaries: live backup configuration and access material are not stored here.
