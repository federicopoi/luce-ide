# GitHub accounts per project

Personal and Zafe projects select independent GitHub profiles under Accounts → GitHub. Profiles support distinct user logins or the same login with distinct commit identities for organization work. Codex accounts remain independent.

Use the installed GitHub CLI browser device flow, isolated configuration directories, private metadata and GitHub CLI credential storage. Main owns credentials; renderer receives only profile names, login, status, identity and device code. Resolve credentials explicitly by username and pin the token in each spawned process environment, avoiding the CLI shared active Keychain slot. Never call global auth switch or setup-git.

Project settings apply to new terminals for shell, Codex and Claude. Running terminals retain their selected profile; restored terminals retain the saved profile (including existing setup). Account removal and reauthentication are blocked while in use. Removing a profile preserves its credentials on disk and resets project defaults. Commit name/email can be edited. Standard github.com SSH remotes are mapped to HTTPS in process Git configuration, without rewriting repository files. Git remote rewriting is limited to github.com. Profiles support github.com; custom SSH aliases and GitHub Enterprise configuration are outside this feature and can use Existing setup. Enterprise-specific environment tokens are preserved, but gh configuration remains isolated per selected profile.

Failures to authenticate block explicit profile launches rather than silently using another login. Missing gh offers installation instructions. Login cancellation, errors and timeouts show safe messages. Browser URLs are allowlisted; tokens never appear in IPC, metadata, diagnostics or UI. Existing setup keeps inherited behavior.

Verify profile persistence, Git credential routing, identity, inherited configuration, device flow/cancellation and renderer interactions using fixtures, then full suite and packaged app. Real account sign-in remains a user action.
