# Contributing

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
