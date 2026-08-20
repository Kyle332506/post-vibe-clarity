# Install PostVibeClarity with another Agent Skills host

Use the host's current first-party skill documentation to select its project-scoped skill location and invocation.

## Install

Inspect the host's first-party documentation and replace the placeholder below with that host's project-scoped skill directory. Clone a reviewed release tag and record its resolved commit:

```bash
set -eu
PVC_VERSION="v0.2.0"
PVC_REPO_URL="https://github.com/Kyle332506/post-vibe-clarity.git"
PVC_TEMP_ROOT="$(mktemp -d)"
PVC_SOURCE="$PVC_TEMP_ROOT/post-vibe-clarity"
git clone --branch "$PVC_VERSION" --depth 1 --single-branch "$PVC_REPO_URL" "$PVC_SOURCE"
PVC_REVISION="$(git -C "$PVC_SOURCE" rev-parse HEAD)"
PVC_INSTALL_ROOT="<host-project-skill-directory>"
```

Then stage the five pinned skill directories in a uniquely named staging directory under `PVC_INSTALL_ROOT`. Stop immediately if cloning, revision resolution, or staging fails. Confirm that all five named directories exist in the completed stage before moving any live destination. Before replacement, compare each existing destination with the staged copy using a path-only command such as `diff -qr`. Create a unique, bounded directory under `$PVC_INSTALL_ROOT/.postvibeclarity-backups`, and move every existing destination into the bounded backup directory before replacement. Do not delete or overwrite an existing skill directory in place.

Copy only `post-vibe-clarity`, `project-discovery`, `secret-exposure`, `launch-essentials`, and `universal-verification` from the pinned source. After the staged copies are installed, write both `PVC_VERSION` and `PVC_REVISION` to `$PVC_INSTALL_ROOT/.postvibeclarity-revision`. Preserve the previous revision record in the same backup. Keep the backup until discovery and a read-only review succeed; use no broad or unresolved destructive command.

## Verify

Verify the host discovers `post-vibe-clarity`, `project-discovery`, `secret-exposure`, `launch-essentials`, and `universal-verification` in the current project. The invocation is host-defined; use the host's first-party instructions. If the host does not discover a newly created top-level skill directory, restart that host and verify again. Confirm `.postvibeclarity-revision` contains the expected tag and commit.

## Run a review

Use the host-defined invocation for `post-vibe-clarity` and request a read-only launch review of the current project. Do not change project files during the review.

## Update

Choose a reviewed release tag and repeat the pinned staging procedure. Do not copy from a moving default branch. Compare existing destinations with the staged release, move all five exact existing directories into a unique bounded backup, install the staged copies, update `.postvibeclarity-revision`, and verify before reapplying intentional local changes.

## Uninstall

Consult the host's first-party documentation. Compare the installed skills with the recorded revision, preserve locally changed copies in a named project backup, and then remove only the five PostVibeClarity skill directories and the revision record from the current project scope.

## Compatibility evidence

The [Agent Skills specification](https://agentskills.io/specification) is format compatibility evidence for this entry. Retain the `Format compatible` label until runtime acceptance is recorded.

Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.
