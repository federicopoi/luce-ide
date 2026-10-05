# Mobile workspace consistency implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; preserve existing shared workspace edits.

**Goal:** Make the paired mobile site easy to navigate and consistent with desktop names and actual agent activity.
**Architecture:** Existing encrypted transport and five navigation tabs stay. Pure presentation helpers classify live metadata; desktop owns canonical renames and Auto permissions. Existing preview/submit compatibility remains.

- [x] Add failing tests for phase/count separation, exact conversation sizes and validated remote rename/Auto. Implement shared mobile helpers and canonical host callbacks; do not expose full history/transcripts.
- [x] Add failing mobile checks for Live overview/filter/search, plain status dots/counts, same-name separate IDs, switching/renaming and deleted/stopping-session recovery. Implement compact collapsible projects, Live list and terminal switcher; fix stale refresh/confirmation targets and disconnected controls. Keep create selections, approval/preview and input protections.
- [x] Run unit, mobile, desktop remote and preview regressions; review; verify small/large phone layouts. Build/install Mac host, deploy existing Cloudflare Worker/assets, verify public asset hashes and shell update. Document restart/reload requirements without stopping user sessions.
