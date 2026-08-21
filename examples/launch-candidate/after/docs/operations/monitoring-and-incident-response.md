# Monitoring and incident response

This document is example repository guidance. It does not prove live behavior.

Signals: application errors and failed requests.
Review location: the configured monitoring dashboard.
Notification expectation: the On-call Maintainer reviews a new high-severity alert promptly.
1. Triage the affected release and capture the failure time.
2. Follow the local [rollback and recovery guide](rollback-and-recovery.md) when impact continues.
Owner: On-call Maintainer.

Boundary: no monitoring provider was queried, and no alert delivery or response was tested.
