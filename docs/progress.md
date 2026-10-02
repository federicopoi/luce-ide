# Orbit execution ledger

Spec approved by user `go` on 2026-10-01; proceed to build and install.
Execution: inline implementation; fresh-context final review required by executing-plans.
Isolation: new dedicated repository `/Users/fedepoi/orbit`, branch `orbit-build`; no changes to home repository.
Pre-flight: store/history data consumed by terminal manager and IPC; terminal manager metadata consumed by UI; preview bounds originate in renderer but URL validation remains in main. Interfaces consistent.
Tasks: 1 data; 2 terminals; 3 app and preview; 4 package/review/install.
Task 1: complete — 6 data tests pass, including database-only Codex history.
Task 1 test correction: macOS temporary paths resolve through /private; fixture assertion now compares canonical directories as required by the spec.
Task 2: complete — real PTY input/output, physical cwd, resize, local URL detection, live resume reuse and missing CLI/folder checks pass.
Dependency fix: node-pty's packaged spawn-helper arrived without executable mode. Postinstall restores 0755; packaging will run it too.
