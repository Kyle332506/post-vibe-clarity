# Repository settings runbook

This maintainer runbook documents, but does not authorize, GitHub mutations after the public repository exists. Resolve the authenticated owner first, preview each bounded change, and stop at every approval gate. Record each requested control as `configured`, `unavailable`, or `not approved`; never infer or claim success from the commands alone.

## Resolve the repository owner

```bash
PVC_OWNER="$(gh api user --jq .login)"
gh repo view "$PVC_OWNER/post-vibe-clarity" --json nameWithOwner,visibility,url
```

Confirm that `PVC_OWNER` is the intended personal account and that the target is exactly `$PVC_OWNER/post-vibe-clarity` before continuing.

## Repository settings approval gate

**Target:** Repository settings for `$PVC_OWNER/post-vibe-clarity`.

**Effect:** Changes the public description, Issues, Discussions, wiki, Projects, merge methods, delete-on-merge behavior, and the eight repository topics shown below.

Preview the exact values with the approver. Wait for explicit user approval before continuing.

Only after that approval, apply the repository settings:

```bash
gh repo edit "$PVC_OWNER/post-vibe-clarity" \
  --description "Evidence-backed production preparation for vibe-coded apps and projects." \
  --enable-issues=true \
  --enable-discussions=false \
  --enable-wiki=false \
  --enable-projects=false \
  --enable-squash-merge=true \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --delete-branch-on-merge

gh repo edit "$PVC_OWNER/post-vibe-clarity" \
  --add-topic "vibe-coding,production,production-readiness,agent-skills,launch-checklist,developer-tools,security,open-source"
```

The approved topics are `vibe-coding`, `production`, `production-readiness`, `agent-skills`, `launch-checklist`, `developer-tools`, `security`, and `open-source`. The intended merge policy is squash merge only, with source branches deleted after merge.

## Security controls approval gate

**Target:** Security controls for `$PVC_OWNER/post-vibe-clarity`.

**Effect:** Enables vulnerability alerts, secret scanning, push protection, and private vulnerability reporting when each control is available to the repository and account.

Preview these four controls and their availability with the approver. Wait for explicit user approval before continuing.

Only after that approval, request each security control separately so that every result can be recorded:

```bash
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/vulnerability-alerts"
gh repo edit "$PVC_OWNER/post-vibe-clarity" --enable-secret-scanning=true
gh repo edit "$PVC_OWNER/post-vibe-clarity" --enable-secret-scanning-push-protection=true
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/private-vulnerability-reporting"
```

An unavailable or rejected control is not permission to omit it from the release record. Capture the response and date, then record the control as `unavailable`.

## Branch protection approval gate

**Target:** Protection settings for the `main` branch of `$PVC_OWNER/post-vibe-clarity`.

**Effect:** Requires the `verify` status check with strict up-to-date checks, linear history, and resolved conversations, while disallowing force pushes and branch deletion.

Preview [`.github/branch-protection.json`](../.github/branch-protection.json) and the exact branch target with the approver. Wait for explicit user approval before continuing.

Only after that approval, apply the reviewed payload:

```bash
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/branches/main/protection" --input .github/branch-protection.json
```

## Social preview approval gate

**Target:** The Social preview setting for `$PVC_OWNER/post-vibe-clarity`.

**Effect:** Uploads [`assets/social-preview.png`](../assets/social-preview.png) as the repository's public social-preview image.

Preview the exact 1280 by 640 PNG with the approver. Wait for explicit user approval before continuing.

Only after that approval, open **Settings -> General -> Social preview** and upload the reviewed asset. This remains a manual Settings-page action because the chosen CLI workflow does not provide the upload.

## Complete state audit

Run the following read-only checks after approved mutations. Compare the observed values with the approved target values; command completion is not evidence that a setting took effect.

### Repository identity and features audit

```bash
gh repo view "$PVC_OWNER/post-vibe-clarity" --json nameWithOwner,visibility,description,defaultBranchRef,hasIssuesEnabled,hasDiscussionsEnabled,hasWikiEnabled,deleteBranchOnMerge,url
```

Confirm the exact description, `main` default branch, public visibility, Issues enabled, Discussions and wiki disabled, and delete-on-merge enabled.

### Topics audit

```bash
gh api "repos/$PVC_OWNER/post-vibe-clarity/topics"
```

Confirm that the returned topic names exactly match the eight approved topics.

### Merge methods and Projects audit

```bash
gh api "repos/$PVC_OWNER/post-vibe-clarity" --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, has_projects}'
```

Confirm squash merge is enabled, merge commits and rebase merging are disabled, and Projects is disabled.

### Security controls audit

```bash
gh api "repos/$PVC_OWNER/post-vibe-clarity" --jq '.security_and_analysis'
gh api --method GET "repos/$PVC_OWNER/post-vibe-clarity/vulnerability-alerts" --include
```

Record the observed secret-scanning, push-protection, and vulnerability-alert states. The vulnerability-alert endpoint's status is part of the evidence; do not treat an empty body by itself as proof.

### Private vulnerability reporting audit

```bash
gh api "repos/$PVC_OWNER/post-vibe-clarity/private-vulnerability-reporting"
```

Record the returned enabled state or the exact unavailable response.

### Branch protection audit

```bash
gh api "repos/$PVC_OWNER/post-vibe-clarity/branches/main/protection"
```

Compare the response with `.github/branch-protection.json`, including the required `verify` check, strict mode, linear history, conversation resolution, force-push prohibition, and deletion prohibition.

### CI audit

```bash
gh run list --repo "$PVC_OWNER/post-vibe-clarity" --workflow "Foundation CI" --limit 5
```

Record the commit SHA and successful default-branch `verify` run used for the release decision.

### Manual social preview audit

Open the repository page and its **Settings -> General -> Social preview** section. Record the reviewed asset path, file hash, reviewer, date, and whether the preview is visibly configured. A pending or declined upload is `not approved`, not configured.

For every repository feature, security control, branch rule, CI requirement, and manual preview, use the state vocabulary configured, unavailable, or not approved. For `unavailable`, include the API response and date; for `not approved`, include the gate and decision date.

## Release gate

Do not create the `v0.1.0` tag or release until a maintainer has separately approved publication after reviewing successful default-branch CI, the [release notes](releases/v0.1.0.md), [known limitations](foundation-coverage.md), compatibility labels, and the [disclaimer](../DISCLAIMER.md). A release describes the available evidence; it must not claim that applications are production-ready or fully secured.
