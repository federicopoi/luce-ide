# Contributing Windows support

Luce currently supports Apple Silicon Macs. Its JavaScript/Electron foundation
can be extended to Windows, but changing the packaging target alone is not
enough. Open a tracking issue and submit small PRs preserving macOS support.

Review these areas first:

- **Terminals:** `src/main/terminals.cjs` uses node-pty. Select a Windows shell
  and verify ConPTY, resizing, and account environment composition.
- **Processes and working folders:** `processes.cjs` and `terminal-cwd.cjs`
  use Unix process tools. Add Windows implementations and child-cleanup tests.
- **Provider discovery:** `environment.cjs` loads a Mac shell environment.
  Resolve Windows executables and preserve independent account profiles.
- **Approval bridges:** preserve local authentication and isolation when
  replacing Unix IPC and filesystem permissions with Windows equivalents.
- **Paths and previews:** test drive letters, backslashes, spaces, Unicode,
  file drops, canonical paths, and browser/file-preview security boundaries.
- **Desktop integration:** adapt Mac-specific menus, shortcuts, sounds,
  open-in-app behavior, and window controls.
- **Packaging:** add separate Windows build/sign/install instructions. The
  current packaging targets macOS arm64; Mac signing credentials are not needed.
- **Tests:** use temporary profiles and fixture providers. Add Windows checks
  as platform support becomes runnable, keeping existing Mac checks passing.

Each person supplies their own provider subscriptions and credentials. A port
does not need the maintainer's Luce profile, conversations, relay credentials,
API tokens, or signing keys.
