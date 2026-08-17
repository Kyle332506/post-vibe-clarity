---
name: secret-exposure
description: Use when inspecting a project for embedded credentials, verifying secret-removal work, or responding to a possible credential exposure without disclosing values.
license: Apache-2.0
---

# Secret exposure

Find evidence of embedded credentials without copying secret values into prompts, logs, reports, screenshots, or chat.

## Deterministic path

When local PostVibeClarity tooling is available, run the project review with the canonical skills directory:

```text
postvibe review [project-path] --skills [skills-path] --format markdown
```

Use the `secret-exposure.scan` finding and keep the run read-only. The foundation scanner checks readable source and configuration files for private-key markers and quoted assignments with credential-like names; it reports rule identifiers and locations, not matched values.

Treat this as bounded evidence, not a comprehensive secret scan. Record unscanned files, repository history, generated artifacts, deployed bundles, provider state, and inaccessible environments as `unverified` when no separate check covers them.

## Manual fallback

When deterministic tooling cannot run:

1. Inventory readable source, configuration, environment templates, CI files, deployment manifests, and packaged artifacts.
2. Search for private-key markers and credential-like names such as API keys, secrets, tokens, and passwords. Use only a search mode that returns file paths and line numbers or safely redacted results. If no location-only or safely redacted search is available, stop this check, mark it `unverified`, and never invoke a content-revealing fallback.
3. Distinguish references to runtime environment variables, obvious placeholders, and test fixtures from embedded credential values. Treat ambiguity as a likely issue or `unverified`, not a pass.
4. Inspect repository history and deployed artifacts only when safe read access exists; otherwise name those coverage gaps explicitly.
5. Report the detection rule, location, impact, recommendation, and verification method. Never include the matching line or value.

## Response and verification

Do not delete, rotate, revoke, or replace a credential during this read-only skill. Recommend separate approved work to rotate it at the issuer, remove it from current files and relevant history or artifacts, update the authorized secret store, and test dependent behavior. Revocation may be an additional containment action, but it never substitutes for issuer-side rotation before resolution.

Report the finding resolved only after authorized evidence confirms issuer-side rotation, a fresh scan finds no exposure, and relevant application tests pass. Keep all other exposure boundaries open or `unverified`.
