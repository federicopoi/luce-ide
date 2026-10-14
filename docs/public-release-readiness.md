# Public source readiness

Luce is an MIT-licensed source project for Apple Silicon Macs. Community
contributions, including Windows support, are welcome through reviewed PRs.
Windows support is not yet part of a supported release.

## Repository safeguards

- The current source and reachable Git history are scanned with Gitleaks.
  The historical exception in `.gitleaksignore` is a verified SHA-256 source-file
  checksum, not a credential.
- Local account profiles, relay credentials, signing material, conversation
  data, attachments, and build outputs are excluded by `.gitignore` and the
  packaging allowlist. Each user supplies their own accounts.
- Internal development ledgers and planning notes have been removed from the
  current source tree. Existing commit history is retained; historical author
  information and non-secret development paths may still be visible.
- Pull requests use read-only, secret-free CI for tests, builds, license notices,
  dependency advisories, and complete-history secret scanning.
- Contributor changes to `main` require maintainer code-owner review and passing
  checks. Private vulnerability reporting is the route for security reports.

## Public download readiness

Repository visibility and source checks do not establish that a downloadable
app is notarized or that another operating system is supported. For a public
Mac binary, use the documented `--public` packaging mode, validate Developer ID
signing and notarization, and test the downloaded artifact on a clean Mac.

No application credentials or signing keys are distributed. Phone access is
optional and self-hosted, as described in `remote-self-hosting.md`.
