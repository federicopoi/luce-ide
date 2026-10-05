# Luce

A local Mac workspace for project terminals, Claude Code and Codex conversations, and website previews.

Drag a project row above or below another project to change its order. The drop line marks the position, and the order is saved across restarts.

Agent terminal headers have an **Auto** switch. It starts off in each new terminal. Enable it to accept waiting and future permission requests in that terminal; disable it to return to manual approvals. It uses the agent approval handler, never types answers into terminal input, and does not answer ordinary agent questions. Closing the terminal or restarting Luce resets Auto to off.

## Use

Open `~/Applications/Luce.app`. Add a project folder, or choose **Find local sessions** to add a folder from your existing agent histories. Select a project in the left rail. Its live terminals and saved conversations appear beside it.

- **Recent conversations:** the Projects rail shows saved conversations from all local Codex and Claude folders, newest first and grouped by date. Search by title, folder, or provider. Click to open or focus an existing terminal. Right-click **Add to project** to choose an existing project or create a named project group; you can also drag a conversation onto a project. Organization preserves the conversation’s original working folder. Discovery refreshes every 20 seconds, with a manual refresh button.
- **New conversation:** start Codex, Claude Code, or a project shell using your installed tools. Codex uses the selected project account; Claude uses its existing login.
- **Previous:** click a saved conversation to resume it with its original provider. Open conversations appear under Open terminals and return to Conversations when closed. Names set in Luce appear consistently in the terminal, saved history, and Recent conversations.
- **Layouts:** use the grid button for one, two, or four terminals. Drag a divider between panes to resize them; proportions are remembered per project. A pane's menu can focus, rename, preview, or close that terminal.
- **Preview:** click a website link in terminal output to open it in that terminal’s Luce preview. You can also run your website’s dev server. A browser icon appears in each terminal header when its detected local URL responds, or when Luce finds an HTTP server listening from that project folder. Click it to preview that terminal’s website. The icon disappears when the server stops. Use the terminal’s menu to enter a URL manually. Expand hides the sidebars; Back to terminal restores the running terminals.
- **Navigation:** projects and their conversations share one resizable sidebar. Use the chevron beside Luce to hide it, then restore it from the titlebar. Visibility and width are remembered. The slim tool rail contains search, phone access, accounts, and settings; project files and GitHub controls appear above the workspace.
- **Sidebar widths:** drag either vertical divider to resize Projects or Conversations. Widths are remembered. Focus a divider and use Left/Right arrows for 10px steps; double-click or press Home to reset.
- **Sidebar sections:** drag the horizontal divider between Projects and Recent conversations to change their heights. Each section can fold independently, and the split is remembered.
- **Project options:** rename a project or remove it from Luce without deleting its files.

New Codex conversations launch the normal CLI. They appear in saved history once Codex persists them after use; Luce does not create empty sessions through app-server.

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

Closing the window hides Luce and leaves its terminals running; reopen it from the Dock. Quit stops Luce-owned processes and asks for confirmation. After restarting the app, project preferences and saved agent conversations remain; arbitrary shell processes do not restart automatically.

The rename preserves the original workspace profile at `~/Library/Application Support/Orbit`, including sidebar preferences and preview sessions. Source is available at `~/luce`, an alias of the existing `~/orbit` folder.

## Local data and current boundaries

Luce stores workspace metadata in `~/Library/Application Support/Orbit/workspace.json`. It indexes local Claude Code histories and Codex account databases/transcripts. Account switching copies the selected transcript into the destination account home; source history is kept and an existing destination transcript is backed up before replacement. It indexes local agent conversations; provider-hosted cloud conversations are not imported. Remote control and explicit approval cards are available through Luce Remote. Automatic approvals start off and can be enabled per terminal. A session active outside Luce remains subject to that provider's concurrent-resume behavior.

The preview browser is isolated from Luce's terminal/filesystem bridge. It supports HTTP and HTTPS, including localhost development servers. Browser permissions and pop-up windows are disabled in this build.

This is an Apple Silicon personal test build with an ad-hoc signature, not a notarized distribution build. Shells load your existing shell configuration, so existing shell startup messages also appear inside Luce.

## Develop and rebuild

```sh
cd ~/luce
npm ci
npm test
npm start
```

Package and reinstall:

```sh
npm run package
npm run install:app
open ~/Applications/Luce.app
```

`npm run smoke` runs the Electron integration checks in an isolated temporary profile and captures screenshots in `artifacts/`. To check a packaged executable:

```sh
LUCE_EXECUTABLE="$HOME/Applications/Luce.app/Contents/MacOS/Luce" npm run smoke
npm run smoke:accounts
```

Provider history formats can change; if a conversation is missing, refresh discovery and use the provider's own resume picker from a shell as a fallback (`codex resume` or `claude --resume`).

Deferred optimization: discovery currently caches bounded transcript excerpts; large history collections can consume extra memory. Compact metadata caching is a follow-up.


## GitHub per project

Open **Accounts → GitHub** and add profiles such as **Personal** and **Zafe**. Sign in through the GitHub browser device flow, choosing the intended browser login. For an organization, use a GitHub user with access to that organization. Edit each profile's commit name/email; the default email is GitHub's private noreply address.

Use the **GitHub** selector under the project path or **Project options → GitHub account**. New shell, Codex and Claude terminals use that profile's Git credentials and commit identity. Existing terminals keep their original account, including Codex account switches/continuations and app relaunch. A project-default change shows a note while older terminals remain open. Close a profile's terminals before reauthenticating or removing it.

Requires `gh` (GitHub CLI); install with `brew install gh` if needed and restart Luce. Profile metadata lives in `github-accounts.json`; CLI configuration lives in private `github-accounts/<id>` folders, with credentials in Keychain when available. Removing a profile preserves its local credentials; it does not revoke GitHub access. Luce never changes global Git settings or repository remote URLs. Standard github.com SSH remote forms use HTTPS through that terminal's Git environment. Selected profiles support github.com with isolated gh configuration; custom SSH aliases and GitHub Enterprise configurations can keep **Use existing setup**.

## Preview beside your conversation

Click a terminal URL or a project file to preview it. Luce temporarily replaces project/conversation navigation with the active terminal on the left and uses the rest of the window for the preview. The terminal remains interactive. Drag the separator or use its arrow keys to resize; the website preview's expand button fills the window. **Back to terminal** restores your pane arrangement and sidebar settings.

## Accounts and usage

Open **Accounts** in the top bar or press **⌘ ,**. **Work** points to your existing Codex home/login; rename that label if needed. **Add & sign in** creates a private Codex home and opens the normal browser sign-in. Choose the intended account in that browser. Credentials stay local; they are never sent to the renderer. Added accounts use file-based credentials in `~/Library/Application Support/Orbit/codex-accounts/<id>/auth.json`. Account names are stored in `accounts.json`.

Use **Project options → Default Codex account** for new conversations. Saved conversations resume with the account whose history contains them. Click the account label in a terminal header to switch only that conversation. The native confirmation explains that its running response and children stop. The complete local transcript is copied and read-checked before resume; the source remains available. New terminals let you start a fresh conversation with another account. The owned Codex bridge records the live thread ID when the provider supplies it; if a saved identity is unavailable, choose the correct saved conversation before continuing its history.

If local history cannot be read in the target environment, Luce creates a clearly labeled **text continuation** with recoverable user/assistant text. Click **Paste context** once Codex reaches its prompt, review it, then press Enter. Tool state, attachments and non-text context are not restored in this fallback. **Terminal options → Start text continuation** also lets you use this fallback if the provider rejects a resumed conversation on its first request. Luce never automatically submits this context or changes accounts during a response. New Codex terminals use `--no-daemon` so stopping the PTY also stops its owned agent process.

Codex account usage is read through its documented app-server interface every minute and on manual refresh. Click the remaining-usage label for window details/reset times. Luce shows only the windows reported by the provider, not estimated message counts; missing/stale values are labeled. Claude Code usage comes through a per-terminal status-line bridge (supported by Claude Code 2.1.251+ on eligible subscriptions), normally after the first response. Existing custom status-line output is preserved; global Claude settings are not modified. This update adds multiple accounts for Codex; Claude continues using its existing account.

Removing an added account from Luce is blocked while its terminals or account operations are active. Removing it resets project defaults to Work but preserves the credential/history directory on disk. Work cannot be removed or signed into again through Luce, protecting the existing shared login. Added account settings start separately; global default Codex configuration is not copied.

Provider authentication, model entitlements, and server-side restrictions still apply. Verification includes local Codex protocol/history compatibility and isolated provider fixtures; real work-to-personal inference must be checked after you sign into that second account.

Drag a terminal's header to another pane to move it; occupied panes swap. Switching accounts on a new Codex terminal lets you start fresh or choose a saved conversation. The small size label measures the saved conversation transcript, excluding project files; `Size —` means its transcript is not yet linked or available.

Drop files from Finder onto an open terminal to paste their quoted paths. Press Escape twice within 350ms to clear the current input line (Ctrl+U); a single Escape retains its normal action after the short interval. Project badges show a gray open-terminal count and a blue dot for Codex/Claude agents actively working (a tiny count appears when more than one is working). Waiting for an approval or answer, finishing a response, and interrupting a task clear the working count; idle agents and shells remain in the open count. Both badges appear in the sidebar and top tabs. A small green light beside the count (with a tiny count for multiple responses) means a Codex or Claude response finished while you were in another project; opening that project clears the light.


## Phone control with Cloudflare

Open **Phone** in the top bar (or **Luce → Phone & Remote…**), enable remote access, then choose **Pair phone**. Scan the private QR code in your phone camera. In Safari, use **Share → Add to Home Screen**; in Chrome, use **Install app**. No Tailscale or VPN app is needed. The phone works on mobile data or another Wi-Fi network.

The Mac connects outward to a Cloudflare Worker and SQLite Durable Object. Each paired phone has its own AES-GCM key, stored in the private QR fragment and phone browser storage. Relay enrollment credentials remain in the Mac profile, outside the packaged app/public site. Cloudflare relays encrypted terminal/RPC payloads; the website JavaScript delivery still relies on the hosting service. Revoke a phone from the Mac to disable its access. Anyone with an unrevoked pairing link can control this Mac through Luce, so keep it private.

The phone lists projects and running terminals, shows their actual output, sends input, interrupts/closes terminals, starts new terminals with existing accounts, and shows available quota data. Projects can be searched and collapsed. Live provides conversation search and Open, Working, Needs input and All filters, with actual agent activity kept separate from open-terminal counts. Yellow dots mark working agents; green dots mark finished or attention states, with counts for multiple sessions. The terminal switcher keeps each conversation distinct, and drafts stay with their own terminal. Phone renames use the same saved title as desktop, and Auto controls only supported agent permission requests; questions stay manual. Conversation size appears when its exact account and thread history are available. Creating or writing to terminals is disabled while disconnected. It controls the same Mac-owned PTYs. Reconnecting refreshes output without repeating commands. The phone cannot resize Mac terminals.

New Codex terminals run through an owned stdio app-server and private Unix socket bridge; new Claude Code terminals get per-session PermissionRequest hooks. Pending requests can be explicitly approved once or declined from the phone or desktop. Stale requests expire when their terminal closes. Native terminal approval still works. Existing terminals launched before this update need to be resumed in the new app to get approval cards; terminal input remains available for ordinary prompts.

Phone previews show a separate browser on your Mac as regularly refreshed images, limited to known local preview servers. Choose Phone or Desktop for the viewport size, tap to click, and swipe to scroll. Tap a website field, then use Insert text and the browser key buttons to fill forms. Back, Forward, and Reload navigate that browser while keeping your Mac's visible preview untouched. New browser controls require restarting Luce after installing an update; older running hosts show restart guidance.

Send submits terminal text followed by Enter. The separate Enter button submits text already present in the terminal. The phone also supports older running Mac hosts by sending text and Enter separately; uncertain network failures are never automatically resent.

Keep Luce open, the Mac online, and the lid open. **Keep Mac awake** prevents idle system sleep while remote access is enabled; it cannot keep an offline or powered-off Mac accessible. Push notifications are opt-in with generic messages that omit conversation content. On iPhone, install the home-screen app to enable supported web push; delivery depends on the browser/OS and Mac connectivity.

The deployment lives in `relay/wrangler.toml`; build first, then use `wrangler deploy --config relay/wrangler.toml`. The private `remote-bootstrap.json` in the Mac profile contains the relay URL/enrollment secret. Do not commit it or copy it into the app. Run `npm run smoke:relay` for a real local Worker, `npm run smoke:mobile` for phone UI fixtures, and `npm run smoke:remote` for live Cloudflare + isolated Electron + real PTY + preview + Claude permission-hook integration. The last command uses the private Mac bootstrap; it neither touches your running Luce sessions nor submits model prompts. Cloudflare usage/billing depends on your plan and traffic.

## Project tabs, sound and images

Use the project-view icon beside Settings, or **Settings → Projects view**, to switch between the sidebar and top tabs. Drag tabs to reorder the same saved project list. **⌘1–⌘8** selects the corresponding project and **⌘9** selects the last project; terminal layout shortcuts are now **⌘⌥1–⌘⌥3**. Recent conversations remain available in the collapsible left sidebar.

**Settings → Completion sound** toggles a soft completion/attention ping; Preview sound lets you hear it. Completion and waiting questions light the project indicator. A question requiring your input turns that terminal's Auto off and stays manual; enable Auto again when you want permission approvals resumed. Automatically approved permission prompts do not trigger attention alerts. Sound also plays while Luce is focused, so another pane can alert you. Closely arriving events share one ping.

Pasted images and temporary screenshot drops are stored as private, persistent image attachments before their quoted paths are inserted into the terminal. Existing saved-file drops retain their original paths. macOS may still block access to a screenshot's temporary bytes; if that happens, save the screenshot to Desktop and drop the saved file instead. Luce cannot repair an already submitted inaccessible path in another terminal.

## Fill a column and reopen your workspace

In the four-pane layout, click a terminal header's **Fill column** button (or choose it from ⋯) to use the empty pane above or below it. The other column keeps its two terminals and resize handle. **Restore column split** brings the empty pane back. Filling never covers an occupied pane.

Luce reopens the last workspace after quitting: selected project, open saved Codex/Claude conversations and accounts, fresh shells in their working folders, terminal positions, active/focused view, website preview, sizes, column fills, and existing project/sidebar/tab preferences. Shell commands and jobs are not replayed, and Auto starts off. Missing conversations or signed-out accounts produce restore guidance while the remaining terminals reopen. Conversation content comes from provider history; unsaved shell output and partially typed input are not recovered.


## Project files

Click the folder icon beside the project path in Conversations to open **Files**. Expand folders, filter the visible tree, toggle hidden files, and drag the divider to resize the panel. Each project remembers its open panel, expanded folders, and selection. Refresh picks up changes made by agents.

Click a file for an in-workspace preview: text/code, images, and supported videos/audio. The preview has **Back to terminal**, **Copy path**, and **Insert path**. Text is displayed literally and limited to 1 MB; unsupported or binary files show a clear message. Media support depends on the installed Electron codecs. Files and links stay within the project folder.

Drag a file or folder from Files onto a terminal to insert its shell-quoted full path. This does not press Enter. Existing local file paths in terminal output are clickable, including relative paths and source locations such as `src/app.js:12:3`. Clicking one opens Files, expands the parent folders, selects the file, and previews it. Relative links use that terminal’s working folder.

Focused terminal views are remembered per project across switching and relaunch. Agent terminals with no submitted prompt or saved history reopen fresh. If a saved conversation cannot be found, its restore record is preserved and a named notice offers **Retry** or **Dismiss** in that project’s Conversations area. Retry refreshes history and resumes the original conversation when available.
