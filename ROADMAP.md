# PostVibeClarity roadmap

The roadmap communicates direction, not promised release dates. Items remain unimplemented coverage until their checks, evidence contracts, documentation, and acceptance tests land.

## Near-term foundation work

- Versioned agent compatibility evidence and repeatable runtime acceptance.
- Additional launch-essential checks with explicit applicability and human-review boundaries.
- Framework and provider adapters that preserve the framework-agnostic core.

Optional Level 1 command evidence is implemented in v0.2. It runs only a fingerprinted set of declared local commands after exact approval and keeps missing or excluded work unverified.

Six deterministic repository-only launch-operations checks are implemented in v0.3. They content-check written release, recovery, monitoring, applicable health and backup, and maintenance-ownership evidence. They do not verify live systems or provider state.

## Broader production preparation

- Full live and provider operations verification remains open future work, including active environment verification, deployment state, alert delivery, health endpoint responses, backup creation, restore results, and rollback execution.
- Live recovery exercises and stronger staged-release verification.
- Performance and cost evidence, accessibility, and deeper maintainability workflows.
- Code and configuration remedies; repository audits and broad readiness requests do not authorize them.
- Legal-sufficiency workflows with qualified human ownership.
- Deep shape packs and provider-specific evidence.

## Later distribution and remediation

- Host-native packages or plugins where evidence supports them.
- Approval-gated remediation and fresh rechecks.
- Strong containment through sandboxing or container-backed command execution. The current local executor is not a security sandbox.

See [current foundation coverage](docs/foundation-coverage.md) for what exists today.
