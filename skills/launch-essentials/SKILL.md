---
name: launch-essentials
description: Use when a project collects personal data or adds regulated capabilities and needs privacy-notice evidence, launch-document review, or post-change verification.
license: Apache-2.0
---

# Launch essentials

Check for capability-driven launch evidence while reserving legal and policy judgments for an appropriate human reviewer.

## Deterministic path

When local PostVibeClarity tooling is available, run the project review with the canonical skills directory:

```text
postvibe review [project-path] --skills [skills-path] --format markdown
```

Use the `launch-essentials.privacy-notice` finding. The foundation check routes only when account-related personal-data collection is detected. It looks for a privacy-notice file or route candidate; it does not verify the candidate's accuracy, publication state, or legal sufficiency.

Treat a discovered policy file as evidence of a candidate, not evidence of compliance. Record inaccessible collection paths, runtime behavior, hosted pages, vendor configuration, jurisdictions, and human-review status as `unverified` when they were not checked.

## Manual fallback

When deterministic tooling cannot run:

1. Determine whether the project collects personal information, starting with account email addresses and expanding to every detected form, API, upload, tracker, payment, or support path.
2. Build a factual inventory of what is collected, why, where it is stored, who receives it, which vendors process it, how long it is retained, and how access, correction, export, and deletion work.
3. Locate privacy-notice files and routes, the deployed notice if safely readable, and links shown at each collection point.
4. Compare the notice candidate with the factual inventory. Record contradictions, omissions, stale statements, missing links, and inaccessible areas as findings or `unverified` boundaries.
5. Require review by the responsible privacy owner or qualified counsel for applicable legal requirements. Record the reviewer and scope without substituting an agent's judgment.

## Proposal and verification

Propose missing artifacts or factual corrections without drafting or publishing definitive legal text. Obtain separate approval before any project edit; publishing policy text is outside a normal review.

After approved work, verify that the reviewed notice exists in the intended environment, is linked where information is collected, and still matches the confirmed data inventory. Keep legal sufficiency and every unchecked capability explicitly assigned to human review or `unverified`.
