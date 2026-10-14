# GitHub source checks

The active workflow is `.github/workflows/checks.yml`. A copy is retained in
`checks.yml` here for reference. It runs on pull requests and pushes to `main`.

- **Test and build:** Node.js 24 on macOS, tests, renderer build, dependency
  notices, and an npm audit at high severity.
- **Secret scan:** checksum-pinned Gitleaks on Linux, scanning complete Git
  history with redacted output. One exact historical release-manifest file hash
  is excluded in `.gitleaksignore`; no credential rule is disabled.

The workflow uses pinned action commits, read-only repository permissions,
and no application or deployment credentials. Fork PRs use `pull_request`;
no `pull_request_target` workflow runs contributor code. First-time contributor
workflow runs may require maintainer approval.

`main` requires these checks and the maintainer's code-owner approval for
contributor changes. Keep required check names consistent with the workflow.
