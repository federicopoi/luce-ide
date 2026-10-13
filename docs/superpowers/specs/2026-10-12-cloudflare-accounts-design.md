# Optional Cloudflare accounts in Luce

## Purpose

Let users add any number of named Cloudflare login profiles and choose one independently for each project. Names are user-defined; Personal and Work are examples, not fixed categories. Use browser sign-in, matching the existing GitHub account experience.

## User experience

- Add a persisted **Cloudflare integration** switch in Settings, disabled by default.
- When enabled, show a Cloudflare selector immediately left of the existing GitHub selector for the selected project.
- Add a Cloudflare section to Accounts when enabled. Support adding, renaming, signing in, cancelling sign-in, refreshing identity, and removing profiles.
- Each profile shows its user email, connection status, and selected Cloudflare account name. One login can have access to multiple Cloudflare accounts; the user chooses a specific account ID for that profile after sign-in. Users may create additional profiles for other account IDs or other logins.
- The project menu lists connected profiles and an **Existing setup** choice. Save the selected profile per project.
- Changes affect new shell, Claude, and Codex terminals. Existing terminals retain their original credentials and show a short mismatch notice when appropriate.
- Disabling the integration hides its controls and stops applying managed Cloudflare credentials to new terminals. Keep saved profiles and project selections for later re-enabling. Existing terminals continue with their original environment.
- Block removal or reauthentication while a profile has running terminals. Removing an unused profile resets projects referencing it to Existing setup.
- Show actionable errors for missing Wrangler, cancelled or failed sign-in, expired credentials, and unavailable account membership.

## Authentication and isolation

Use Wrangler's supported OAuth browser sign-in and identity/token commands. Resolve an installed Wrangler CLI without silently installing dependencies. If unavailable, explain how to install it.

Each managed login must use a dedicated credential namespace. Wrangler's global config resolver can prefer a legacy home directory over XDG configuration, so setting an invented `WRANGLER_HOME` or only changing XDG configuration is insufficient. Run authentication operations in dedicated subprocesses with a profile-local home/config environment; never change Luce's or a project terminal's home directory. Confirm the resolver and identity/token JSON contract against the Wrangler version used by the implementation and fixtures.

Serialize OAuth browser logins to avoid callback-port collisions. Support cancellation, timeouts, child-process cleanup, and application shutdown. Start authentication outside project folders so project `.env` files cannot override the selected login.

Keep OAuth credentials local with restrictive directory/file permissions. Prefer supported encrypted/keychain storage only when independently isolated per profile; do not claim keychain protection without verification. Public IPC snapshots, remote state, logs, and workspace files must never contain tokens.

For a new terminal with a managed selection, refresh and verify credentials in the main process, then provide the selected bearer token and account ID through `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Remove conflicting inherited Cloudflare credential variables for managed selections. Preserve unrelated environment variables and the existing Codex/GitHub configuration.

Project configuration and commands can explicitly override account targets. Luce's selector supplies credentials and the default account; it does not rewrite repository configuration or guarantee that arbitrary commands cannot override it. Document this clearly. A terminal's credentials are fixed at launch; if they expire, start a new terminal to retrieve refreshed credentials.

## Data and integration

- Add a main-process Cloudflare account service, separate from GitHub and Codex services.
- Persist profile metadata (UUID, display name, verified identity, selected Cloudflare account ID/name) locally; store credential material separately.
- Persist `cloudflareAccountId` on projects and the enabled setting in main-process preferences.
- Validate profile IDs, names, account membership, and project assignments at the IPC boundary.
- Expose only profile metadata and statuses through preload and state snapshots.
- Extend terminal metadata and workspace restoration to remember the profile used for a session. If a previously selected profile is unavailable, report the restore failure rather than silently launching with another account.
- Extend the account dialog, project header/menu, and Settings using the existing UI components and visual style.
- Retain the current default environment behavior for Existing setup and when the integration is disabled.

## Validation

- Add three or more profiles, rename them, persist them, and select different profiles for different projects.
- Test OAuth success, cancellation, timeout, malformed identity responses, multiple account memberships, expired credentials, and missing CLI.
- Verify login namespaces remain isolated with both legacy and XDG Wrangler layouts.
- Verify new shells and both agent providers receive the correct Cloudflare token/account ID without changing their home, Codex profile, or GitHub identity.
- Verify existing sessions keep their selection; disabled integration does not inject managed credentials.
- Verify removal restrictions, project-reference cleanup, and restoration behavior.
- Ensure public and remote snapshots never expose tokens.
- Run focused unit tests, the relevant existing account/terminal/store/restore tests, renderer build, and an Electron UI smoke check for enable/disable, account management, selector placement, and three-profile selection. Use fixtures; do not perform a real deployment.

## Scope

This adds account management and per-project credential selection for existing deployment commands. It does not add a deployment dashboard, deploy button, Cloudflare purchases, or automatic deployments.

## Sources

- https://developers.cloudflare.com/workers/wrangler/commands/general/
- https://developers.cloudflare.com/workers/wrangler/system-environment-variables/
- https://github.com/cloudflare/workers-sdk/blob/main/packages/workers-utils/src/global-wrangler-config-path.ts
