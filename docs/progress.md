# Orbit execution ledger

Spec approved by user `go` on 2026-10-01; proceed to build and install.
Execution: inline implementation; fresh-context final review required by executing-plans.
Isolation: new dedicated repository `/Users/fedepoi/orbit`, branch `orbit-build`; no changes to home repository.
Pre-flight: store/history data consumed by terminal manager and IPC; terminal manager metadata consumed by UI; preview bounds originate in renderer but URL validation remains in main. Interfaces consistent.
Tasks: 1 data; 2 terminals; 3 app and preview; 4 package/review/install.
Task 1: complete — 6 data tests pass, including database-only Codex history.
Task 1 test correction: macOS temporary paths resolve through /private; fixture assertion now compares canonical directories as required by the spec.
Task 2: verification found URL detection consuming a shell-echoed backslash escape; completion pending correction and green suite.
Task 2: complete — URL escape regression RED→GREEN; full suite 8/8 passes.
Task 3: first Electron smoke passes real PTY, two-project switching, renderer reload, embedded local website, expanded preview and return, isolated preview globals, and unsafe URL rejection.
Test harness correction: poll async IPC predicates from Node; browser waitForFunction does not await this async predicate in this version. Native preview capture uses the entire BrowserWindow rather than the renderer-only page screenshot.
Task 3: complete — development and packaged Electron smoke pass; browser geometry verified after asynchronous layout settles. Native child webContents capture confirms rendered website content; parent captures omit native child surfaces.
Task 4: package produced and ad-hoc signature passes deep strict validation. Fresh-context review and installation pending.
Packaging decision: disable packager's binary ASAR digest injection for the personal ad-hoc build because its framework re-signing step failed. Full final app bundle is ad-hoc signed and verified. Not a notarized distribution build.
Dependency fix: node-pty's packaged spawn-helper arrived without executable mode. Postinstall restores 0755; packaging will run it too.
