# Project files implementation plan

Goal: deliver the approved file browser and reliable per-project workspace state.
Architecture: restricted main-process file service and media protocol; separate renderer tree/preview module; existing terminal and conversation layout stays in place.
Tech stack: Electron, Node filesystem, plain JS/CSS, xterm, Playwright.
Spec: docs/superpowers/specs/2026-10-04-project-files-design.md

## Constraints and review focus
Preserve existing uncommitted work; capture touched files under artifacts/file-browser-baseline. No new dependencies. No file content execution or terminal auto-submit. Test Unicode/spaced filenames, symlink escapes, large/binary files, stale async responses, and repeated relaunch with missing history.

## Task 1: Filesystem and previews
- [x] Write tests in tests/project-files.test.cjs for directory-first natural sort, path escape rejection, text/binary/size bounds, and media identity.
- [x] Run node --test tests/project-files.test.cjs and observe missing service failure.
- [x] Add src/main/project-files.cjs: list(root,relative,hidden), preview(root,relative), resolve(root,relative); register project-files/project-file-preview IPC in main and preload. Serve only validated media URLs via luce-file protocol with byte-range support.
- [x] Run service tests to green.

## Task 2: Browser UI
- [x] Add scripts/project-files-smoke.mjs reproducing missing Files button and testing tree expansion, text/image/video previews, quoting into a real shell, panel resize and per-project visibility.
- [x] Implement src/renderer/project-files.js, file-sidebar/file-resizer and file-preview HTML, cohesive styles, and app integration with browser visibility/terminal fitting.
- [x] Build then run the smoke script; capture wide/narrow screenshots and inspect them.

## Task 3: Workspace reliability
- [x] Extend real workspace smoke with focus, project switch, focused renderer reload and relaunch checks. Add unit regression for retaining failed restores.
- [x] Diagnose missing live saved identities against transcripts. Extend main/history restore resolution for verified same-account identities, preserve failures on subsequent saves, and provide per-session error details.
- [x] Track focus per project in app arrangement, including old-ID migration.
- [x] Run regression tests and workspace smoke to green.

## Task 4: Verify and deliver
- [x] Run npm test and relevant preview/terminal smoke checks; review task diff against captured baseline.
- [x] Package app, test packaged file and restore flows, verify codesign. Install with the existing backup-preserving installer if filesystem approval permits; leave running user sessions undisturbed.
- [x] Update README and record verification in this plan.

Ruling: execute in the existing checkout with a file-level baseline, since the current working tree contains the actual installed app changes and a clean worktree would omit them. No commits of unrelated user work. The user’s go-ahead authorizes continuing the approved implementation without another design/plan gate.


## Verification and review record

Implemented tasks 1–3. Filesystem tests reject traversal and outside symlinks; bounded text previews remain literal; media capabilities stream byte ranges. UI checks exercise SVG/image, MP4/video seeking, real-shell quoted path drops, hidden files, resizing, per-project visibility/reload, and actual terminal output-link clicks. Links support wrapped output, Unicode names, source-line suffixes, and current shell cwd after cd. Slow reveal regression proves the newest selection wins.

Independent reviewer identified current-cwd lookup, Unicode basenames, and stale reveal ordering. All three findings reproduced and corrected with behavioral tests. Source workspace smoke verifies focus across switching and relaunch, old-ID mapping, saved Codex/Claude restoration and retained column fill. Pending workspace smoke verifies unsent Claude starts fresh and missing-history records survive shutdown/relaunch, then Retry resumes the original identity once history returns.

Additional shutdown regression: quitting during startup retains unprocessed restoration records alongside newly opened terminals, deduplicating restoredFromId. Original generic smoke needed isolated history and explicit startup completion; it now passes projects/PTY/reorder/sidebar/terminal drag/embedded web-preview isolation and recovery. The sandbox-only baseline run could not open local sockets; its stalled processes were stopped after the unrestricted suite passed. Final unrestricted unit suite: 117 passing, zero failures.

Packaging succeeds; staged bundle passes deep/strict codesign and internal symlink verification. Final packaged focus/recovery checks and installation recorded below after completion. Existing working tree preserved; task-only baseline comparison at artifacts/project-files-task.diff. No unrelated changes staged or committed.

Final packaged workspace focus/relaunch and pending-history recovery checks pass. Installed at /Users/fedepoi/Applications/Luce.app; previous app preserved at /Users/fedepoi/Applications/Luce-backup-1791139075751.app. Installed bundle passes deep/strict signature and internal symlink verification; app.asar hash matches the staged verified build. Running user sessions were left open.
