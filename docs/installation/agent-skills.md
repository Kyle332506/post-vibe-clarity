# Install PostVibeClarity with another Agent Skills host

Use the host's current first-party skill documentation to select its project-scoped skill location and invocation.

## Install

Inspect the host's first-party documentation, then copy these four directories from this repository into that host's project scope: `skills/post-vibe-clarity`, `skills/project-discovery`, `skills/secret-exposure`, and `skills/launch-essentials`. Keep the four directory names unchanged.

## Verify

Verify the host discovers `post-vibe-clarity`, `project-discovery`, `secret-exposure`, and `launch-essentials` in the current project. The invocation is host-defined; use the host's first-party instructions. If the host does not discover a newly created top-level skill directory, restart that host and verify again.

## Run a review

Use the host-defined invocation for `post-vibe-clarity` and request a read-only launch review of the current project. Do not change project files during the review.

## Update

Consult the host's first-party documentation, then replace the four project-scoped skill directories with current copies from this repository and verify discovery.

## Uninstall

Use the host's first-party documentation to remove only the four PostVibeClarity skill directories from the current project scope.

## Compatibility evidence

The [Agent Skills specification](https://agentskills.io/specification) is format compatibility evidence for this entry. Retain the `Format compatible` label until runtime acceptance is recorded.

Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.
