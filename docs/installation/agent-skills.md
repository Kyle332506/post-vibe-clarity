# Install PostVibeClarity with another Agent Skills host

Use the host's current first-party skill documentation to select its project-scoped skill location and invocation.

## Install

Inspect the host's first-party documentation and replace the placeholder below with that host's project-scoped skill directory. Clone a reviewed release tag and record its resolved commit:

```bash
set -eu
PVC_VERSION="v0.3.0"
PVC_REPO_URL="https://github.com/Kyle332506/post-vibe-clarity.git"
PVC_TEMP_ROOT="$(mktemp -d)"
PVC_SOURCE="$PVC_TEMP_ROOT/post-vibe-clarity"
git clone --branch "$PVC_VERSION" --depth 1 --single-branch "$PVC_REPO_URL" "$PVC_SOURCE"
PVC_REVISION="$(git -C "$PVC_SOURCE" rev-parse HEAD)"
PVC_INSTALL_ROOT="<host-project-skill-directory>"
mkdir -p "$PVC_INSTALL_ROOT"
PVC_STAGE="$(mktemp -d "$PVC_INSTALL_ROOT/.postvibeclarity-stage.XXXXXX")"
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials launch-operations universal-verification; do
  cp -R "$PVC_SOURCE/skills/$PVC_SKILL" "$PVC_STAGE/$PVC_SKILL"
done
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials launch-operations universal-verification; do
  if [ ! -d "$PVC_STAGE/$PVC_SKILL" ]; then
    printf 'Staging failed: missing %s; live installation was not changed.\n' "$PVC_SKILL" >&2
    exit 1
  fi
done
mkdir -p "$PVC_INSTALL_ROOT/.postvibeclarity-backups"
PVC_BACKUP_ROOT="$(mktemp -d "$PVC_INSTALL_ROOT/.postvibeclarity-backups/update.XXXXXX")"
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials launch-operations universal-verification; do
  if [ -e "$PVC_INSTALL_ROOT/$PVC_SKILL" ]; then
    diff -qr "$PVC_INSTALL_ROOT/$PVC_SKILL" "$PVC_STAGE/$PVC_SKILL" || true
    mv "$PVC_INSTALL_ROOT/$PVC_SKILL" "$PVC_BACKUP_ROOT/$PVC_SKILL"
  fi
  mv "$PVC_STAGE/$PVC_SKILL" "$PVC_INSTALL_ROOT/$PVC_SKILL"
done
if [ -f "$PVC_INSTALL_ROOT/.postvibeclarity-revision" ]; then
  cp "$PVC_INSTALL_ROOT/.postvibeclarity-revision" "$PVC_BACKUP_ROOT/previous-install-revision"
fi
printf 'version=%s\nrevision=%s\n' "$PVC_VERSION" "$PVC_REVISION" > "$PVC_INSTALL_ROOT/.postvibeclarity-revision"
rmdir "$PVC_STAGE"
```

Then stage the six pinned skill directories in a uniquely named directory under `PVC_INSTALL_ROOT`. The block stops immediately if cloning, revision resolution, or staging fails and confirms that all six named directories exist before moving any live destination. Before replacement, compare each existing destination with the staged copy using the path-only `diff -qr` command, and move every existing destination into the bounded backup directory before replacement. Do not delete or overwrite an existing skill directory in place.

Copy only `post-vibe-clarity`, `project-discovery`, `secret-exposure`, `launch-essentials`, `launch-operations`, and `universal-verification` from the pinned source. After the staged copies are installed, the block writes both `PVC_VERSION` and `PVC_REVISION` to `$PVC_INSTALL_ROOT/.postvibeclarity-revision` and preserves the previous revision record in the same backup. Keep the backup until discovery and a read-only review succeed; use no broad or unresolved destructive command.

## Verify

Verify the host discovers `post-vibe-clarity`, `project-discovery`, `secret-exposure`, `launch-essentials`, `launch-operations`, and `universal-verification` in the current project. The invocation is host-defined; use the host's first-party instructions. If the host does not discover a newly created top-level skill directory, restart that host and verify again. Confirm `.postvibeclarity-revision` contains the expected tag and commit.

## Run a review

Use the host-defined invocation for `post-vibe-clarity` and request a read-only launch review of the current project. Do not change project files during the review.

## Update

Choose a reviewed release tag and repeat the pinned staging procedure. Do not copy from a moving default branch. Compare existing destinations with the staged release, move all six exact existing directories into a unique bounded backup, install the staged copies, update `.postvibeclarity-revision`, and verify before reapplying intentional local changes.

## Uninstall

Consult the host's first-party documentation. Compare the installed skills with the recorded revision, preserve locally changed copies in a named project backup, and then remove only the six named PostVibeClarity skill directories and the revision record from the current project scope.

## Compatibility evidence

The [Agent Skills specification](https://agentskills.io/specification) is format compatibility evidence for this entry. Retain the `Format compatible` label until runtime acceptance is recorded.

Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.
