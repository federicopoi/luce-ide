# Navigation and preview cleanup

User requested simpler navigation and website previews that stay in Luce.

- Put the project view switch beside the navigation heading; use sidebar/tab icons instead of the terminal grid icon.
- In tabs mode, the sidebar is for the active project's conversations. Hide project rows, global recents, and Add project; retain conversation search and history refresh.
- Move the project Files control below Phone in the tool rail. Keep its per-project behavior and pressed state.
- Verify terminal text/OSC links and website popups stay internal. Current renderer already explicitly handles terminal links, and main-process external launches are for account sign-in. Agent-issued browser commands are a separate launch path; add a terminal-scoped route for normal `open`, `xdg-open`, and `BROWSER` requests without changing system browser settings.
- Verify source ownership, Back, tabs switching/reload, file browsing, secure terminal-scoped requests, and existing sessions. Package and install while preserving the running app and previous bundle.

Terminal routing covers normal PATH-resolved `open` / `xdg-open` and tools honoring `BROWSER`, including bare localhost addresses. Absolute `/usr/bin/open`, custom shell aliases, and direct browser application launches bypass this scoped helper; no OS-wide browser interception is installed. Non-web document/Finder commands retain their normal behavior. Account sign-in remains an explicit external-browser flow.
