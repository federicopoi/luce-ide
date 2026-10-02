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
Final review: fresh-context read-only reviewer found five Important issues, no Critical issues, one Minor optimization, no declined judgments.
Final fixed: keyboard focus during refresh — Electron smoke focus assertion failed before fix; actual keyboard input after refresh passes after preserving live pane DOM.
Final fixed: new-session identity — Claude live-ID reuse test failed before fix; Codex startup now obtains a persistent thread ID via official app-server without a model turn, then opens it in the CLI. Installed-provider Electron tests pass for IDs, reuse and saved labels.
Final fixed: process cleanup — signal-resistant parent/child regression failed before fix; bounded descendant termination and confirmed exit now pass. Quit awaits cleanup.
Final fixed: preview recovery — stopped-server/restart/Reload smoke timed out before fix; failed-load state and reattachment now recover.
Final fixed: malformed history — mixed null records/content dropped both fixture sessions before fix; individual invalid values are skipped and both sessions appear.
Final suite: 11/11 unit tests pass; extended Electron smoke passes including actual keyboard and installed providers, with no model inference requested.
Final minor (deferred): reduce history-cache memory by retaining compact metadata instead of parsed transcript excerpts. Reads and entry count remain bounded; startup discovery completed in under a second on this machine.
Installed-copy verification: Node fs.cp default rewrote 14 framework symlinks to absolute source paths, breaking strict signing and standalone use. Actual installed signature and link checks failed; installer now preserves literal symlinks and a standalone verification script checks both boundaries.
Dependency fix: node-pty's packaged spawn-helper arrived without executable mode. Postinstall restores 0755; packaging will run it too.
Task 4: complete — installed-copy link/signature validation and Electron integration smoke pass. Orbit installed in ~/Applications and opened for user testing. Removed the invalid first-install backup created during this task. Source retained on orbit-build.
