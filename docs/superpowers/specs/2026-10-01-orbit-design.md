# Orbit: local Mac IDE

## Purpose and approved visual direction

Build and install a usable personal Mac application based on the approved Orbit mockup. The user works primarily in Claude Code and Codex terminals, often four at once. Orbit must make projects and their conversations easy to switch, and let the user preview a locally running website without leaving the app.

Use a charcoal window, rounded terminal panels, restrained mint highlights, native Mac window controls, a narrow project rail, and a conversation sidebar. Orbit is the provisional name.

## First-build scope

- Add a project through the native directory picker, rename it, switch between projects, and remove it from Orbit without deleting files.
- Persist the project list, selected project, pane layout, conversation labels, and preview URLs in Orbit's application data directory.
- Offer one, two, and four terminal layouts with keyboard shortcuts and a focused pane mode. Terminals use real pseudo-terminals, support interactive CLI applications, resizing, scrolling, copy/paste, and the user's shell environment.
- Start a shell, a new Codex conversation, or a new Claude Code conversation in the selected project's working directory. Use the installed CLIs and their existing authentication. Show useful errors if a CLI or project directory is missing.
- Discover saved local Codex and Claude Code conversations, group them by recorded project directory, and show searchable title, provider, and last-used time. Refresh discovery on request and after activity. Ignore malformed entries; do not modify the providers' histories or authentication files.
- Resume a selected saved conversation using the corresponding CLI session ID. Focusing an already-live Orbit session must reuse its terminal instead of starting another writer for that conversation. Sessions running outside Orbit cannot be assumed attachable; the provider's own resume behavior remains authoritative.
- Each terminal can have a preview URL. Recognize local HTTP URLs in output, offer a Preview action, and allow manual URL entry. Keep the server running while viewing the preview.
- Embed a browser with a URL bar, reload, back-to-terminal action, and an expanded mode hiding both sidebars. Returning restores the previous terminal arrangement and active pane.
- Keep terminal processes alive while switching projects, previewing a website, or hiding the window. A deliberate Quit ends Orbit-owned terminal processes, with a confirmation when they are running. Restart restores workspace metadata and conversation resume options, not arbitrary shell process state.
- Native permission prompts remain interactive in the agent terminals. This first build does not add an automatic approval engine, remote access, mobile app, or cloud conversation management.

## Architecture

Use Electron for the Mac application shell and embedded browser, xterm.js for terminal rendering, and node-pty for pseudo-terminal processes. Keep project storage, conversation discovery, terminal lifecycle, and browser lifecycle as separate modules. A narrow preload bridge connects the local UI to validated main-process operations.

Store source in `/Users/fedepoi/orbit`. Package an Apple Silicon `Orbit.app` and install it into `/Users/fedepoi/Applications` so testing does not require a development server. Include a reusable build/install command and basic usage documentation.

## Data and lifecycle

Projects have stable IDs, display names, canonical absolute directories, and layout preferences. Terminal sessions have stable IDs, project ownership, provider, optional provider conversation ID, title, process status, and optional preview URL. Provider history records are read-only inputs; live Orbit state is separate.

Cache discovered metadata to keep startup responsive. Match actual recorded directories rather than guessing project identity solely from encoded folder names. Session titles use recorded titles when available, then the first user prompt when available, then a readable fallback. Do not render transcript content as HTML.

## Browser and terminal boundaries

Browser previews have no Node access or Orbit preload bridge. Enable sandboxing and context isolation. Accept HTTP and HTTPS URLs only; block other schemes and privileged navigation. Validate main-process IPC senders and payloads. Shell launches use argument arrays rather than interpolating user labels or session IDs into command strings. Never change global Claude/Codex permission settings.

## Verification and delivery

Test project persistence and invalid paths, representative Claude/Codex history fixtures and malformed records, argument-safe resume launches, local URL detection, and terminal ownership/lifecycle. Verify the packaged application with real terminal input/output, project switching without losing running sessions, a local HTTP preview, expanded preview and return, and discovery of installed-provider histories. Check the interface visually against the approved mockup.

Open the installed application for the user. Report the installed path, how to add a project and start/resume a conversation, and any verified limitation. Distribution signing/notarization and an updater are outside this personal test build.
