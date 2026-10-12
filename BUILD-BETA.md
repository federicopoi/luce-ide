# Luce 0.1.0-beta.1 — unnotarized Apple Silicon beta

This is an explicitly unnotarized public beta, authorized for distribution with macOS **Open Anyway** installation guidance. It has a persistent local integrity signature, not an Apple Developer ID signature. It has not been notarized by Apple. The regular `--public` mode remains reserved for Developer ID signed, notarized releases.

Requirements: Apple Silicon Mac (M1 or later), macOS 13 or newer. The installer includes Electron; Node.js is only needed to rebuild. Codex, Claude Code and GitHub CLI remain separately installed tools using the user's own accounts. Phone access requires a self-hosted relay.

## Rebuild

On an Apple Silicon Mac, install Node.js 24, then run:

```sh
npm ci
npm test
npm run notices:check
npm run package -- --local
node scripts/create-dmg.mjs
```

The DMG appears in `release/Luce-0.1.0-beta.1-mac-arm64.dmg`, with an adjacent SHA-256 file. The DMG script refuses to overwrite an existing image. The local signing mode creates or reuses a private identity on the build machine; no keys or credentials are included in the source or packaged payload. A different signing identity and filesystem timestamps produce different DMG bytes; byte-for-byte reproducibility is not claimed.

## Source provenance

The release branch and attached source archive contain the source used for this beta, including the maintainer's local changes beyond the previously published commit. `RELEASE-SOURCE.json` records that base commit and **original** file hashes before the beta version edits and release documentation were added. Those hashes are provenance, not a checksum of the final source tree. The release's source archive has its own SHA-256 in `SHA256SUMS.txt`.

## Installation

Open the DMG and drag Luce into Applications. Eject the image. Try opening Luce from Applications once, dismiss the blocked-launch alert, then use **System Settings → Privacy & Security → Open Anyway** for Luce. Authenticate if asked and confirm Open. The option is available for about an hour after a blocked launch; try opening Luce again if it is missing. Only approve the Luce copy downloaded from this release.

Illustrated guide: https://federicopoi.github.io/luce/#install-guide
Apple instructions: https://support.apple.com/en-us/102445

## Verification and limits

The release source passed 172 tests, production dependency audit (zero known vulnerabilities), and production notice checks. The actual packaged app passed isolated native-terminal/file-drop, account lifecycle, and account reauthentication checks. The DMG checksum verified; its app was copied to a temporary Applications folder, the image unmounted, and the copied app's independent links, signature and native terminal were checked. Runtime inspection confirmed the beta version, Apple Silicon native PTY binaries, Luce icon, license/notices and no private credential/profile paths.

These tests used temporary profiles on the build Mac and provider fixtures. They do not establish every user's real provider login, every macOS version, or the Gatekeeper first-launch UI on a separate clean Mac. Apple has not checked or notarized this beta. Updates are manual.
