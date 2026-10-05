# Workspace organization implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the independent tasks, with scoped review and verification.

**Goal:** Resizable workspace panes and sidebar sections, compact usage, and consistent conversation identity, naming and project organization.

**Architecture:** Keep existing PTYs and xterm nodes alive during layout changes. Persist layout proportions locally. Use provider/account/thread identity for conversation naming, ownership and duplicate prevention; project assignment organizes history without rewriting provider transcripts.

**Tech Stack:** Electron, JavaScript/CJS, xterm, Node tests, Playwright Electron smoke tests.

**Spec:** User screenshots and requested behavior in this session.

## Constraints

- Preserve all existing uncommitted changes and live user processes; no commits or live app restart.
- Folder preservation is the default for assignment, pending the optional user clarification.
- Auto approval, account isolation, remote access and existing terminal controls must continue working.
- Implement reversible changes in the existing feature branch, which contains the ongoing Luce implementation.

## Review focus

- Repeated and concurrent resume requests must focus one terminal, including fresh sessions whose identity arrives later.
- Account identities must not collide; renaming and assignment must survive refresh/restart.
- Moving history must retain original working directory and not rewrite provider credentials/transcripts.
- Resize controls must retain PTY state, survive rendering, clamp sizes and support collapsed sections.
- Existing project reordering and file drops must remain distinct from conversation drag and drop.

## Task 1: Conversation lifecycle and organization

- [x] Add meaningful regressions for canonical names, assignments and duplicate resume.
- [x] Implement persistent metadata, guarded IPC and actual session identity linking.
- [x] Focus existing conversations, hide open history duplicates, unify live/history/recent names.
- [x] Add recent context menu selection, existing-project drops and named new project grouping.
- [x] Verify isolated tests and Electron fixture; do not mutate live user history.

## Task 2: Terminal resizing

- [x] Add per-project persistent grid split proportions and visible draggable dividers.
- [x] Support 2/4 layouts, minimum dimensions, keyboard controls, double-click reset.
- [x] Preserve attached xterm nodes and fit actual PTYs during resizing.
- [x] Verify real Electron resize and persistence with isolated shell terminals.

## Task 3: Sidebar and usage polish

- [x] Move sidebar restore controls beside brand; normal project hover cursor.
- [x] Add persistent vertical rail divider, collapse-aware sizing and keyboard controls.
- [x] Compact quota dialog preserving real usage/reset/staleness information.
- [x] Verify actual UI interactions in isolated Electron fixture.

## Task 4: Terminal website links (user steering)

- [x] Route formatted OSC 8 and wrapped plain HTTP(S) links into the clicked terminal’s Luce preview.
- [x] Preserve PTYs, reject unsupported schemes, and avoid external browser launch.
- [x] Verify real Electron clicks with local pages and scoped review.

## Integration

- [x] Review changes across tasks and resolve findings.
- [x] Run full unit tests, build and relevant Electron smoke checks.
- [x] Package, install through verified staged ditto copy without stopping live Luce.
- [x] Record completion and explain restart requirement to user.

## Completion evidence

82 unit tests pass. Source app smoke, accounts, Auto approvals, organization, terminal resizing, sidebar/usage, links, and deployed-relay remote integration pass. Packaged organization, resizing, sidebar/usage, and link fixtures pass. Installed application signature and runtime archive hashes verified. Existing user Luce PID 91101 kept running.
