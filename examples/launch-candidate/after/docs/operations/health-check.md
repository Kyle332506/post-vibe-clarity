# Health check

This document is example repository guidance. It does not prove live behavior.

Probe: GET `/health`.
Healthy result: HTTP 200 with status ok.
Coverage: the probe checks process availability only and does not verify every dependency.
Failure handling: the monitoring system notifies the On-call Maintainer.
Owner: On-call Maintainer.

Boundary: the example path is repository evidence only; no endpoint or probe was executed.
