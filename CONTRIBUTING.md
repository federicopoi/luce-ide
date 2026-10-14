# Contributing

Contributions are welcome. Discuss larger changes in an issue first, then fork
the repository and create a branch from `main`. Open a pull request against
`main`. Contributor changes require the maintainer's code-owner approval and
passing source checks; new commits dismiss previous approvals.

Use Node.js 24 and a supported Mac. Clone the repository, run `npm ci`, then
`npm test` and `npm run build`. `npm start` launches the development app.
See [building](docs/building.md) for isolated builds and distribution options.
Codex, Claude Code and GitHub CLI are optional external tools; install the
tools you intend to use and sign in with your own accounts.

Keep changes focused and include tests for behavior changes. Use fixture
providers and temporary profiles for integration checks. Never run an
integration test against another person's credentials, conversations or
application profile. Do not include `.env` files, tokens, pairing URLs,
private signing keys or local session data in commits or screenshots.

Run `npm run notices` after changing production dependencies and commit the
updated notices. Third-party code and brand marks retain their own licenses
and trademark rights. Contributions to Luce are provided under the project
MIT license. Report security issues according to [SECURITY.md](SECURITY.md).

## Windows and other platforms

Windows support is welcome but not implemented yet. Start with
[the Windows porting guide](docs/windows-porting.md). Keep the port in focused
PRs and explain which platforms you tested. Use your own CLI logins or fixtures;
maintainer credentials, signing keys, and relay access are not needed.

## Pull request checks

GitHub Actions runs tests, the renderer build, the third-party notice check,
dependency audit, and a redacted full-history secret scan. Workflows have
read-only repository permissions and need no application credentials. Fork
contributions use `pull_request`, never `pull_request_target`. Maintainers may
need to approve a first-time contributor's workflow run.
