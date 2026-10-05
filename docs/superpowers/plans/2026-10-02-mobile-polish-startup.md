# Mobile Luce polish and Codex startup repair

User approved implementation and previous remote deployment. Preserve all existing work and running user terminals.

1. Diagnose actual installed Codex startup and fix incompatible launch options with a regression test covering Accounts-enabled launch; verify real signed-in startup without sending model prompts.
2. Restyle phone UI around desktop Luce colors, compact flat rows, thin borders, consistent outlined SVG icons. Preserve remote controls and approvals. Add exited-terminal diagnostic/replacement action, disable input on stopped sessions, preserve unsent text.
3. Review both scoped changes, run meaningful unit and mobile/integration checks, inspect mobile screenshots.
4. Build/deploy updated phone assets, package/install Mac app and reopen when no user terminals are running; verify real packaged startup and remote path.

Progress:
- Root reproduced installed app startup: ERROR --no-daemon cannot be used with --remote. Prior no-Accounts startup test missed the conflicting argument.
- Backend implementer owns bridge/manager/broker and regression tests.
- Mobile implementer owns mobile UI and mobile smoke.
- Backend fix strips --no-daemon only from remote UI arguments while retaining owned app-server argument; failing real CLI regression observed before fix; 58 unit tests pass.
- Signed-in Work startup verified with actual account and no inference, both direct source and Electron main integration.
- Mobile restyle and exit recovery pass mobile smoke; root visually inspected 390px screenshots.
- Scoped backend review approved; mobile review found async send button re-enable after exit and account selection reset on state updates. Assigned both to mobile implementer with regressions.
- Both mobile review findings addressed and re-reviewed clean; new smoke confirms delayed-send exit safety, newer-draft preservation, and account/project/provider selection stability through state pushes.
- Final mobile smoke passes; packaged desktop smoke passes; installed signed-in startup smoke passes without a prompt.
- Deployed updated static assets to Cloudflare (f8bdd89b-fbe7-4000-ac15-7ca244807870); fetched HTML/CSS/JS/SW hashes match build.
- Installed/reopened Luce after normal quit with no user running terminals. Prior app preserved at /Users/fedepoi/Applications/Luce-backup-1790957085768.app.
- Installed deep strict signature and archive hash parity pass. Full deployed-relay/installed-app integration passes real PTY input, phone creation, Claude/Codex exact approval fixtures, local preview click, pairing/revocation.
