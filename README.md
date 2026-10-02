# Orbit

A local Mac workspace for project terminals, Claude Code and Codex conversations, and website previews.

## Use

Open `~/Applications/Orbit.app`. Add a project folder, or choose **Find local sessions** to add a folder from your existing agent histories. Select a project in the left rail. Its live terminals and saved conversations appear beside it.

- **New conversation:** start Codex, Claude Code, or a project shell using your installed tools and existing logins.
- **Previous:** click a saved conversation to resume it with its original provider. Right-click to rename it in Orbit.
- **Layouts:** use the grid button for one, two, or four terminals. A pane's menu can focus, rename, preview, or close that terminal.
- **Preview:** run your website’s dev server. A browser icon appears in each terminal header when its detected local URL responds, or when Orbit finds an HTTP server listening from that project folder. Click it to preview that terminal’s website. The icon disappears when the server stops. Use the terminal’s menu to enter a URL manually. Expand hides the sidebars; Back to terminal restores the running terminals.
- **Sidebar widths:** drag either vertical divider to resize Projects or Conversations. Widths are remembered. Focus a divider and use Left/Right arrows for 10px steps; double-click or press Home to reset.
- **Project options:** rename a project or remove it from Orbit without deleting its files.

New Codex conversations launch the normal CLI. They appear in saved history once Codex persists them after use; Orbit does not create empty sessions through app-server.

| Shortcut | Action |
| --- | --- |
| ⌘ O | Add project |
| ⌘ N | New conversation menu |
| ⌘ T | New shell |
| ⌘ K | Conversation search |
| ⌘ 1 / ⌘ 2 / ⌘ 3 | One / two / four terminals |
| ⌘ ⇧ Enter | Focus current terminal |
| ⌘ ⇧ P | Toggle preview |
| ⌃ ⌘ F | Mac fullscreen |

Closing the window hides Orbit and leaves its terminals running; reopen it from the Dock. Quit stops Orbit-owned processes and asks for confirmation. After restarting the app, project preferences and saved agent conversations remain; arbitrary shell processes do not restart automatically.

## Local data and current boundaries

Orbit stores workspace metadata in `~/Library/Application Support/Orbit/workspace.json`. It reads local Claude Code histories and Codex's conversation database/transcripts without modifying them. It does not manage remote/cloud conversations, automatic approvals, or mobile access. Approvals continue through each agent's terminal UI. A session active outside Orbit remains subject to that provider's concurrent-resume behavior.

The preview browser is isolated from Orbit's terminal/filesystem bridge. It supports HTTP and HTTPS, including localhost development servers. Browser permissions and pop-up windows are disabled in this build.

This is an Apple Silicon personal test build with an ad-hoc signature, not a notarized distribution build. Shells load your existing shell configuration, so existing shell startup messages also appear inside Orbit.

## Develop and rebuild

```sh
cd ~/orbit
npm ci
npm test
npm start
```

Package and reinstall:

```sh
npm run package
npm run install:app
open ~/Applications/Orbit.app
```

`npm run smoke` runs the Electron integration checks in an isolated temporary profile and captures screenshots in `artifacts/`. To check a packaged executable:

```sh
ORBIT_EXECUTABLE="$HOME/Applications/Orbit.app/Contents/MacOS/Orbit" npm run smoke
```

Provider history formats can change; if a conversation is missing, refresh discovery and use the provider's own resume picker from a shell as a fallback (`codex resume` or `claude --resume`).

Deferred optimization: discovery currently caches bounded transcript excerpts; large history collections can consume extra memory. Compact metadata caching is a follow-up.
