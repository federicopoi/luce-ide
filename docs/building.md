# Building Luce

Luce currently targets macOS on Apple Silicon (`darwin-arm64`). Intel Macs, Windows and Linux application builds are not supported. Node.js and npm are required to build from source; the packaged application includes Electron but uses separately installed Codex, Claude Code and GitHub CLIs when available.

Install dependencies with `npm ci`, run checks with `npm test`, and build the renderer with `npm run build`. `npm start` builds and runs the source application. Native `node-pty` must match the bundled Electron version and Apple Silicon architecture; keep the repository's install/rebuild workflow intact. Preparing an unsigned artifact on another CI platform does not establish that its native addon will run on macOS.

## Local owner build

`npm run package` retains the existing persistent local signing behavior. It uses or creates the owner's private Luce signing identity under `~/Library/Application Support/Luce Signing`. Reusing that identity preserves the code-signing identity across builds and helps retain macOS permission decisions. It is a local, self-signed development identity, not an Apple Developer ID distribution certificate. This path does not notarize the application.

On a new machine, use `npm run package -- --unsigned` for a portable development build that does not create, import or trust a personal signing keychain. It writes `release/Luce-darwin-arm64/Luce.app`. The artifact is unsigned and unnotarized, and macOS may reject downloaded copies. This mode is useful for CI handoff to a separate signing job, not public release. Do not replace an installed, permission-approved owner build with an unsigned build if retaining its identity is required.

## Public distribution

Public builds require a real Apple-issued Developer ID Application identity and explicit notarization credentials. The packaging script does not generate these or reuse the local self-signed identity. On a macOS build machine where the Developer ID certificate and private key are already installed and `notarytool` has an existing credential profile:

```sh
LUCE_SIGN_IDENTITY='Developer ID Application: Your Organization (TEAMID)' \
LUCE_NOTARY_PROFILE='your-existing-notarytool-profile' \
npm run package -- --public
```

`LUCE_NOTARY_KEYCHAIN` may specify the keychain containing that profile. The public mode delegates hardened-runtime signing and notarization/stapling to Electron Packager's signing/notarization tools. The signer discovers binary files inside `app.asar.unpacked`, including the unpacked `node-pty` addon and `spawn-helper`, and uses its Electron-specific default entitlements (including main-process JIT support). No broad library-validation bypass is added. This configuration has not been exercised with a Developer ID identity; verify native PTY startup and Electron helpers in the actual hardened-runtime release. Missing identity or profile inputs fail before build work begins. A successful local or unsigned build is not evidence of notarization. No Developer ID build or Apple notarization has been performed as part of implementing this packaging workflow.

Before publishing, verify the actual artifact's signature and stapled ticket on macOS, and test the downloaded artifact on a clean Apple Silicon Mac. For example, use `codesign --verify --deep --strict`, `xcrun stapler validate` and `spctl --assess --type execute` against the built app. Public release also needs an appropriate project license, provider asset attribution and third-party notices; packaging those files does not grant redistribution rights.

## Payload boundary

Packaging creates a temporary staging directory instead of copying the repository wholesale. The exact Electron version is read from the installed source dependency and checked against `package-lock.json` before staging; Electron itself remains outside the application payload. A stale installation fails with an instruction to run `npm ci`. The payload contains built desktop/mobile files under `dist`, JavaScript modules under `src/main` and `src/shared`, an explicit set of runtime assets, sanitized package metadata, production dependencies identified by `package-lock.json`, and root license/notice files when present. Apple Silicon `node-pty` binaries and `spawn-helper` are retained (other platform/architecture prebuilds are excluded) and unpacked from ASAR.

Hidden files/directories, private account/settings/credential filenames, symlinks, development dependency packages, repository metadata, source renderer/mobile trees, build scripts, tests, documentation, artifacts and previous releases are excluded. The app reads the current user's own accounts and workspace at runtime; their files are not bundled. The allowlist does not depend on `.gitignore` or whether a file is tracked. Staging is removed after packaging, including failed packaging/signing runs.

Run `node --test tests/packaging.test.cjs` to check the payload boundary and signing-mode configuration without building, signing, installing or restarting an application.
