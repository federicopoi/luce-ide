# Orca design preview

The `redesign/orca` branch applies the visual language from the local Orca IDE captures to Luce, keeping its navigation, terminal sessions, account behavior, files, browser previews, and keyboard shortcuts.

## Open alongside the installed app

From this worktree, run:

```sh
npm run preview:orca
```

The window and application are named **Luce Preview**. The launcher always uses `artifacts/orca-preview-profile` in this worktree rather than the installed app's profile. It seeds a project pointing to this worktree on first launch. Projects and preferences in the preview are independent; the installed application remains available. Normal agent CLI authentication still follows Luce's existing account rules.

Development dependencies are shared with the original checkout through an ignored `node_modules` symlink. To make this checkout independent, replace that symlink with an installation using the locked dependencies before packaging.

## Design

Near-black terminal canvas, charcoal navigation and toolbar surfaces, compact flat tabs, subtle gray selection, small consistent corners, thin separators, green activity, and amber attention indicators. The same palette extends to the phone interface while retaining its touch target sizes. PDF and Word pages retain their document colors.

The terminal renderer and its startup palette responses both advertise the new background, so terminal applications render consistently before and after a renderer attaches.

## Verification

```sh
npm test
npm run build
npm run smoke:orca
node scripts/orca-preview-isolation-smoke.mjs
node scripts/ui-polish-smoke.mjs
node scripts/project-tabs-smoke.mjs
node scripts/terminal-resize-smoke.mjs
node scripts/preview-tabs-smoke.mjs
node scripts/preview-device-smoke.mjs
node scripts/terminal-style-smoke.mjs
node scripts/remote-mobile-smoke.mjs
node scripts/account-defaults-smoke.mjs
node scripts/desktop-polish-smoke.mjs
```

The design walkthrough captures welcome, workspace, files, search, settings, accounts, remote setup, and compact-window screenshots in `artifacts/orca-design/`.

The older `scripts/accounts-smoke.mjs` still expects account switching to reject a fresh conversation with “Choose this terminal”. It fails at line 12 in both the current original checkout's copied baseline and this redesign. The newer account-defaults smoke checks the existing continuation behavior instead. No account behavior was changed for the redesign.
