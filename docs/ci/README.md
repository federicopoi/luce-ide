# Enable GitHub source checks

The prepared workflow is stored in `docs/ci/checks.yml`. The current GitHub
OAuth login cannot push files under `.github/workflows` without the `workflow`
scope, so automatic checks are not enabled by this branch.

To enable them, use GitHub's web editor to create `.github/workflows/checks.yml`
with this template, or authorize a GitHub credential with workflow write access
and move the file there. The workflow runs on pushes and pull requests, uses
Node 24 on macOS for tests/build/license/dependency checks, and scans the full
repository history with checksum-pinned Gitleaks on Linux. It needs no project
secrets and has read-only repository permissions.
