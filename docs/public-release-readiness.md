# Public source readiness — 2026-10-07

This preparation targets a source-code beta for Apple Silicon Macs. It does
not establish that a public, notarized download is ready.

## Audit and fixes

- Gitleaks 8.30.1 scanned all 26 pre-existing commits across local refs:
  no detected secrets. A separate historical-path check found no tracked
  authentication files, workspace/account databases, relay bootstrap files,
  signing keys or keychains. Existing history includes maintainer paths and
  public deployment identifiers; these are not authentication secrets.
- Both production-only and complete npm dependency audits reported zero
  known vulnerabilities at the time of this check.
- Packaging now stages an explicit runtime payload instead of copying the
  repository with an exclusion list. Hidden/private files, symlinks,
  development dependencies and unsupported PTY prebuilds are excluded.
  Installed Electron is resolved and checked against the lockfile explicitly.
- Codex reauthentication cannot replace an account under active terminals
  or transfers. A durable pending-login guard survives concurrent account
  refreshes, cancellation failures and early completion events. Public
  account refresh results omit transient login identifiers and browser URLs.
- The local approval service authenticates before URL parsing, validates
  request-body objects, and catches async failures without exposing exception
  details or stopping the service.
- The source has an MIT license, full production dependency notices, provider
  mark attribution, security/contribution guidance and checksum-pinned secret
  scanning in a prepared CI template. GitHub rejected workflow writes with
  the current OAuth scope; automatic checks still need enabling using
  docs/ci/README.md. The npm archive for http_ece omitted its license; its notice
  was retrieved from that version's published upstream source commit.
- Relay deployment uses the administrator's own Cloudflare account. Private
  enrollment/bootstrap setup is documented and never bundled in the app.

## Verification

A temporary clean source copy installed dependencies with `npm ci`, passed
all 144 tests, built the desktop/mobile assets, and verified reproducible
third-party notices. Isolated Electron fixtures verify account sign-in guards
and credential redaction without signing into a real account or submitting
model prompts. Installed Codex compatibility tests explicitly disable shared
credential storage and verify the isolated account is signed out.

An actual unsigned macOS arm64 package retained the main/shared modules,
desktop/mobile assets, MIT notices, production dependencies, native PTY addon
and spawn helper. Its native-terminal/file-drop smoke passed. The final
persistent locally signed package also passed isolated account lifecycle,
reauthentication and native-terminal/file-drop smoke checks. Developer ID
signing and Apple notarization have not been exercised with release
credentials. Automated scans and tests do not prove absence of every flaw.

## Before public downloads

1. Enable the prepared GitHub checks using docs/ci/README.md. Merge/review the intended source branch and choose the repository's public
   visibility separately. Enable private vulnerability reporting and confirm
   the MIT license is the intended project policy.
2. Build using the documented `--public` mode with the maintainer's Developer
   ID Application identity and notarization profile. Validate signing,
   notarization/stapling and native PTY operation in that actual artifact.
3. Test a downloaded artifact on a clean Apple Silicon Mac, including folder
   access, real provider sign-in, account switching, upgrades and restart.
4. Publish a versioned download and setup instructions. Hosted multi-user
   phone enrollment, automatic app updates and other operating systems are
   not included in this source-beta preparation. Phone access is currently
   optional and self-hosted.
