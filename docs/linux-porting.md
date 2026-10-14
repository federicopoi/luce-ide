# Contributing Linux support

Luce currently supports Apple Silicon Macs. Linux support is a contribution
target, not a supported release yet. Its JavaScript/Electron foundation can be
extended to Linux, but changing the packaging target alone is not enough.
Open a tracking issue and submit small PRs preserving macOS support.

Review these areas first:

- **Terminals and providers:** `src/main/terminals.cjs` uses node-pty.
  Verify shell selection, PTY startup/resizing, and independent account
  environments. `environment.cjs` currently falls back to `/bin/zsh` and
  includes Mac-specific PATH entries; handle Linux shells and CLI discovery.
- **Processes and working folders:** `processes.cjs`, `terminal-cwd.cjs`,
  and `servers.cjs` invoke process tools at fixed paths. Resolve Linux tools
  or add Linux implementations, and test child cleanup, current directories,
  and local preview server discovery.
- **Conversation history:** `history.cjs` invokes `/usr/bin/sqlite3`.
  Define dependency discovery or a portable implementation and preserve
  read-only history access and profile isolation.
- **Credentials and approval bridges:** verify credential storage when a
  desktop keyring is available and when it is absent. Preserve private-file
  permissions, authenticated local IPC, and isolated account profiles.
- **Desktop integration:** adapt Mac menus, shortcuts, window controls,
  open-in-app behavior, and completion sounds (`completion-sound.cjs` uses
  `afplay`). Test desktop launch as well as launch from a terminal.
- **Display and previews:** test X11 and Wayland sessions, scaling, clipboard,
  file drops, browser previews, and file-preview security boundaries. Record
  the distribution, desktop environment, and display session used.
- **Packaging:** add Linux build/install instructions and select an initial
  distribution format. `scripts/package.mjs` currently targets macOS arm64;
  the staging allowlist also retains Mac native binaries. Package and verify
  node-pty for each declared Linux architecture and Electron version. Keep
  Mac signing separate; Apple signing credentials are not needed for a port.
- **Tests:** use temporary profiles and fixture providers. Add Linux checks
  as support becomes runnable, keeping existing Mac checks passing. A
  successful renderer build or secret scan on Linux does not establish
  Linux desktop support.

Each person supplies their own provider subscriptions and credentials. A port
does not need the maintainer's Luce profile, conversations, relay credentials,
API tokens, or signing keys. Explain tested features and remaining gaps in
each PR; document supported distributions and architectures before a release.
