# Luce desktop redesign

The user approved a whole-app refresh using the supplied Codex/ChatGPT screenshot. Keep the real terminal workspace and its existing capabilities. Current source is preserved in the private `federicopoi/luce-ide` repository on `main`, commit `9bd4fe1`, tag `pre-redesign`.

1. Add an Electron integration check for a single navigation column, nested project conversations, project switching, and a calm empty project view.
2. Consolidate projects and conversations into one resizable sidebar, add a compact utility rail, and move project context/files/GitHub controls above the workspace. Preserve node IDs and terminal instances.
3. Apply a consistent neutral dark palette, readable typography, rounded selections, restrained borders and controls across terminals, files, previews, popovers, settings and accounts. A project with no open terminals gets one centered start view.
4. Verify actual Electron layouts at desktop and smaller widths, project tabs, switching, file/media previews, native browser bounds, accounts, terminal resizing and persistence. Review screenshots and code; fix findings.
5. Package, test the packaged app, and install with the existing installer that preserves the previous app. Leave running user sessions open. Save redesign on a separate GitHub branch so the rollback snapshot remains intact.

## Verification ledger

- Initial redesign integration test failed because project and conversation panels occupied separate columns. The implemented unified navigation passes.
- Review found that folding Projects hid conversations; a new check reproduced the failure. Conversations now move outside the folded project rows. Review confirmed the correction.
- Review requested distinct account/folder context for identical titles. Saved rows retain account context; recent rows show folder and account. Both have explicit accessible labels and detailed tooltips.
- A click-to-create test reproduced a pane-placement race: the API state event assigned the session before the create response handled the clicked slot. Explicit pane requests now reposition that session while retaining an occupied target's previous content.
- Full suite: 124 tests pass. Electron workflows pass for general PTYs/navigation, files/text/images/video seeking/drag/link races/current cwd, Codex and GitHub accounts, project tabs, sidebar sizing/usage, terminal resizing, history organization, quit/relaunch and column focus, source conversation beside previews, and Back restoring navigation.
- Source and packaged screenshots inspected for empty projects, terminals, files, accounts, settings and previews. The new stylesheet is copied into the packaged renderer. Existing terminal output remains provider-controlled.
- Ruling: keep desktop redesign on `redesign/chatgpt-ui` and preserve GitHub `main` plus `pre-redesign` as the exact rollback baseline, per the user's request to retain this version.
