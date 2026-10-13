# Cloudflare Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses delegation. Steps use checkbox syntax for tracking.

**Goal:** Support any number of browser-authenticated Cloudflare profiles, selected independently per project, behind an optional Settings toggle.

**Architecture:** A main-process service owns profile metadata, isolated Wrangler authentication, and credential preparation. Renderer and preload expose metadata-only account management. Main-process terminal creation prepares credentials asynchronously, while TerminalManager remains synchronous and receives only an internal prepared environment.

**Tech Stack:** Electron, Node.js CommonJS, node:test, existing vanilla-JavaScript renderer, esbuild, Playwright Electron smoke tests, installed Wrangler CLI.

**Spec:** `docs/superpowers/specs/2026-10-12-cloudflare-accounts-design.md`

## Global Constraints

- Any number of named profiles; no Personal/Work enumeration or two-account limit.
- Browser sign-in; optional integration disabled by default.
- Selector immediately left of GitHub, hidden while disabled.
- Credentials stay out of public IPC snapshots, remote state, logs, and workspace metadata.
- Managed selection affects new terminals; existing terminals retain their original environment.
- Never change Luce's or a project terminal's home directory.
- Do not rewrite project Wrangler configuration or perform a real deployment.
- Preserve unrelated working-tree changes. Stage only this feature's changes; do not bundle unrelated edits.
- Missing Wrangler gets installation guidance; no silent dependency installation.

## Review Focus

1. A legacy `~/.wrangler` directory must not redirect an isolated login to shared credentials (Task 2).
2. A single Cloudflare user may belong to multiple accounts; the profile must select a verified account ID (Tasks 1 and 2).
3. Reauthentication or removal during credential preparation must not race a terminal launch (Tasks 2 and 3).
4. Codex account switches, text continuations, and restored sessions must preserve the prior Cloudflare selection (Task 3).
5. Three or more profile names, including HTML-like strings and edited fields during state refresh, must remain usable and render safely (Tasks 1 and 4).

## Files and Responsibilities

- `src/main/cloudflare-accounts.cjs`: metadata persistence, enabled preference, operations, public status, prepared credential environment.
- `src/main/cloudflare-auth.cjs`: Wrangler subprocess execution, isolated login configuration, verified identity/token parsing, cancellation and cleanup.
- `src/main/environment.cjs`: installed Wrangler resolution and absolute test override `LUCE_WRANGLER_EXECUTABLE`.
- `src/main/main.cjs`: service lifecycle, validated IPC, metadata snapshots, terminal preparation and in-use guards.
- `src/main/preload.cjs`: narrowly scoped account and preference operations.
- `src/main/store.cjs`: persisted project `cloudflareAccountId`.
- `src/main/terminals.cjs`: internal launch environment and public profile-ID metadata.
- `src/main/workspace-resume.cjs`: profile ID persistence.
- `src/renderer/cloudflare-accounts.js`: Cloudflare accounts panel and reusable account tabs.
- `src/renderer/github-accounts.js`: third account tab integration.
- `src/renderer/app.js`: Settings switch, selector/menu, mismatch notice, session menu identity.
- `src/renderer/index.html`, `src/renderer/theme.css`: selector placement and responsive styling.
- `src/shared/icons.js`, `assets/icons/cloudflare.svg`: Cloudflare icon in the established icon system.
- `tests/cloudflare-accounts.test.cjs`, `tests/cloudflare-auth.test.cjs`, `tests/cloudflare-launch.test.cjs`, `tests/fixtures/wrangler.cjs`: fixture-backed service, authentication and launch coverage.
- `tests/workspace-resume.test.cjs`, `tests/terminals.test.cjs`: regression coverage.
- `scripts/cloudflare-accounts-smoke.mjs`: isolated-profile Electron integration and visual checks.
- `README.md`, `THIRD_PARTY_NOTICES.md`, `assets/icons/README.md`: behavior, expiry/config limitations, icon provenance if needed.

### Task 1: Profiles, Preference, and Project Persistence

**Interfaces:** `CloudflareAccounts({directory, auth})` extends EventEmitter; `enabled`, `setEnabled(boolean)`, `list()`, `get(id)`, `add(name)`, `update(id, patch)`, `remove(id)`. Public profile shape: `{id,name,status,email,accountId,accountName,accounts,message}`; `accounts` contains only `{id,name}`. The internal `auth` adapter is provided by Task 2. Changes emit `changed`.

- [ ] Write failing tests for three profiles, safe names/IDs, restart persistence, disabled default, boolean validation, rename, and no credentials in public JSON.

```js
const service = new CloudflareAccounts({directory: root, auth: fakeAuth});
const profiles = ['Personal', 'Work', 'Client A'].map(name => service.add(name));
assert.equal(service.list().length, 3);
assert.equal(service.enabled, false);
service.setEnabled(true);
service.update(profiles[2].id, {name: 'Client B'});
const restored = new CloudflareAccounts({directory: root, auth: fakeAuth});
assert.equal(restored.enabled, true);
assert.equal(restored.get(profiles[2].id).name, 'Client B');
assert.equal(JSON.stringify(restored.list()).includes('SECRET_FIXTURE'), false);
assert.throws(() => service.setEnabled('true'), /setting/i);
assert.throws(() => service.get('../escape'), /not found/i);
```

- [ ] Run `node --test tests/cloudflare-accounts.test.cjs`; confirm failure because the service is missing.
- [ ] Implement private atomic JSON persistence with `0600` files and `0700` directories. Use UUIDs, trimmed names of at most 60 characters, and reject control characters; render every accepted name as text. Store only validated metadata. Reset transient signing-in/checking state on restart. Add `cloudflareAccountId` to Store's update allowlist.

```js
function validName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 60
      || /[\x00-\x1f\x7f]/.test(value)) throw Error('Enter a valid profile name.');
  return value.trim();
}
function validAccountId(value) { return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value); }
```

- [ ] Test Store save/reload with three project selections and default selection. Test malformed persisted data cannot escape the profile directory.
- [ ] Run focused tests; commit only Task 1 changes as `feat: persist Cloudflare account profiles`.

### Task 2: Isolated Browser Authentication

**Interfaces:** `CloudflareAuth({directory, executable, env, timeoutMs=900000})` exposes `available`, `login(id) -> Promise<identity>`, `cancel(id)`, `identity(id) -> Promise<identity>`, `token(id) -> Promise<string>`, `dispose()`. Identity shape: `{email,accounts:[{id,name}]}`. Authentication never returns process output in errors or public status.

- [ ] Create an executable fixture implementing `login`, `whoami --json`, and `auth token --json`. Store fixture credentials only under the subprocess's isolated home. Include configurable delayed login, multiple memberships, malformed JSON, expiry, and nonzero exits.

```js
const identity = {email:'member@example.test', accounts:[
  {id:'a'.repeat(32),name:'Agency'}, {id:'b'.repeat(32),name:'Client'}
]};
// Fixture output for auth token --json:
const tokenOutput = {type:'oauth', token:'SECRET_FIXTURE'};
```

- [ ] Write failing tests asserting separate credential paths for three UUIDs, legacy/XDG isolation, no inherited credentials, preserved parent environment, serialized login attempts, cancellation/timeouts, malformed responses, and generic secret-free errors. Run `node --test tests/cloudflare-auth.test.cjs` and confirm failures.
- [ ] Resolve installed Wrangler without downloading packages. Support `LUCE_WRANGLER_EXECUTABLE` only as an absolute executable path. Inspect current Wrangler source/CLI contracts using read-only commands to verify JSON shapes and global-config resolution. Reject unsupported CLI behavior with an actionable upgrade message.
- [ ] Implement auth subprocess isolation: profile-local home and XDG configuration only inside authentication subprocesses, clean credential variables, profile-local cwd, bounded output/timeouts, and `stdio` pipes. Do not run commands through interpolated shell text. No account token is printed.

```js
const args = ['whoami', '--json'];
const {stdout} = await execFileAsync(executable, args, {
  env: authEnvironment(id), cwd: profileDirectory(id),
  timeout: 15000, maxBuffer: 256 * 1024
});
// login uses spawn(executable, ['login'], the same isolated cwd/env),
// cancellation and one active browser callback at a time.
```

- [ ] Integrate service `login`, `cancel`, `refresh(id)`, `refreshAll`, and async `prepare(id, baseEnv)`. Preserve selected membership only if still verified; with multiple memberships require explicit `update(id,{accountId})`. Prevent silent email changes on refresh. `prepare` verifies identity and refreshes the OAuth token; reject signed-out/missing membership. Track active operations, block removal/reauthentication while preparing, and recheck after awaited work.

```js
const env = {...baseEnv};
for (const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL',
  'CLOUDFLARE_ACCOUNT_ID','CF_API_TOKEN','CF_API_KEY','CF_EMAIL','CF_ACCOUNT_ID']) delete env[key];
env.CLOUDFLARE_API_TOKEN = verifiedToken;
env.CLOUDFLARE_ACCOUNT_ID = profile.accountId;
// Return env only to main-process launch code; preserve baseEnv.HOME and CODEX_HOME.
```

- [ ] Test `prepare('default', base)` and disabled integration preserve the environment. Test expired credentials refresh for a new launch, token acquisition failure blocks launch, and `dispose` cancels auth children.
- [ ] Run service/auth tests; commit Task 2 changes as `feat: isolate Cloudflare browser logins`.

### Task 3: IPC and All Terminal Launch Paths

**Interfaces:** preload exposes `setCloudflareEnabled`, `addCloudflareAccount`, `updateCloudflareAccount`, `loginCloudflareAccount`, `cancelCloudflareLogin`, `refreshCloudflareAccounts`, and `removeCloudflareAccount`. Public state adds `preferences.cloudflareEnabled`, `cloudflareAvailable`, and `cloudflareAccounts`. Terminal metadata adds `cloudflareAccountId`; tokens are never metadata.

- [ ] Write failing launch tests covering shell/Claude/Codex, three project selections, unchanged HOME/GitHub/Codex identity, disabled/default behavior, concurrent preparation/removal, restore failure, and preservation through continuation/switch paths. Add WorkspaceResume save/reload assertions:

```js
resume.save([{id:'a',projectId:'p',provider:'shell',cloudflareAccountId:'profile-a'},
  {id:'b',projectId:'p',provider:'codex',cloudflareAccountId:'default'}]);
assert.deepEqual(new WorkspaceResume(root).pending.map(s => s.cloudflareAccountId),
  ['profile-a','default']);
```

- [ ] Run `node --test tests/cloudflare-launch.test.cjs tests/workspace-resume.test.cjs`; confirm the added cases fail.
- [ ] Instantiate the service before workspace restoration. Connect `changed`; refresh only enabled profiles, catch refresh failures, dispose during quit. Validate all IPC arguments and signed-in membership before selecting a managed profile. Removal/reauthentication checks running terminals and active credential operations; removal resets matching projects to default.
- [ ] Add a main-only asynchronous `launchProjectTerminal(project, options)` helper used by every direct `terminals.create` call. Prepare credentials before stopping an existing session during an account switch; keep the source session if preparation fails. Pass a non-public `cloudflareEnvironment` option to TerminalManager; compose it after existing GitHub/Codex environments without mutating the base environment. Renderer-supplied options cannot contain this internal option.

```js
async function launchProjectTerminal(project, options = {}) {
  const id = options.cloudflareAccountId || project.cloudflareAccountId || 'default';
  const prepared = await cloudflareAccounts.prepare(id, {});
  return terminals.create(project, {...options, cloudflareAccountId:
    cloudflareAccounts.enabled ? id : 'default', cloudflareEnvironment: prepared});
}
// In TerminalManager: merge only prepared Cloudflare values after provider/GitHub setup,
// clearing conflicting Cloudflare variables only when a managed selection is active.
```

- [ ] Extend restore records with profile ID. Preserve the session's explicit choice in Codex switching and text continuations; desktop and remote creation already share `createValidatedTerminal`, which must call the helper. Reject unknown or unavailable selections; no fallback to a different managed account.
- [ ] Assert tokens never occur in service lists, main snapshots, remote state, or saved workspace records. Run launch/service/auth/terminal/restore regression tests; commit as `feat: apply Cloudflare accounts per project`.

### Task 4: Optional Accounts UI and Project Selector

**Interfaces:** `createCloudflarePanel({api,run,escape,getState,openModal,showCodex,showGitHub})` exposes `show()` and `update()`. Account tabs support Codex/GitHub/Cloudflare, with Cloudflare present only while enabled.

- [ ] Add failing Electron smoke assertions: selector initially absent, Settings toggle enables it, Accounts accepts three profiles, verified account membership selection works, independent projects remember choices, and disabling hides UI while retaining metadata. Use fixture CLI and a temporary Luce profile, never real logins.

```js
assert.equal(await page.locator('#project-cloudflare').isVisible(), false);
await page.getByRole('button',{name:'Settings',exact:true}).click();
await page.getByRole('switch',{name:'Cloudflare integration'}).check();
await page.getByRole('button',{name:'Close dialog'}).click();
assert.equal(await page.locator('#project-cloudflare').isVisible(), true);
```

- [ ] Implement escaped profile cards, add-name form, rename, sign-in/cancel, refresh, remove, and membership dropdown. Preserve edited names/focus across state refresh; use `<input>` values and `textContent` for user-controlled data. Show unavailable CLI guidance and error statuses without process output.
- [ ] Add the Settings switch, reusable tabs, accessible Cloudflare icon/button immediately before GitHub, connected-profile popup plus Existing setup, project-menu item, session profile label, and mismatch note. Use the existing popup/modal machinery. Long names truncate visually with accessible full text; header controls must fit narrow windows.

```js
cloudflareButton.hidden = !project || !state.preferences?.cloudflareEnabled;
cloudflareButton.setAttribute('aria-label', 'Choose Cloudflare account');
// Save popup selections through api.updateProject(project.id,{cloudflareAccountId:id}).
```

- [ ] Capture desktop, narrow-window, account-panel and disabled-state screenshots; visually inspect alignment, selector order, keyboard access, long names, and membership dropdown. If source artwork is added, record its provenance in the established notices files.
- [ ] Run renderer build and fixture smoke check; commit as `feat: add optional Cloudflare account controls`.

### Task 5: Documentation and Final Verification

- [ ] Update README with enabling Settings, adding any number of browser profiles, selecting memberships/projects, account changes applying to new terminals, token-expiry behavior, and explicit Wrangler config/command overrides. Explain missing CLI setup and credential-storage reality.
- [ ] Run the complete unit suite once with `npm test`; run `npm run build` and the new fixture Electron smoke script. Run relevant existing account and workspace-resume smoke scripts if touched paths introduce uncovered integration risk. Do not deploy or sign in to real Cloudflare accounts.
- [ ] Review the feature-only diff against every spec requirement, including three-profile use, inactive integration, all create/switch/restore paths, removal races, and secret-free IPC.
- [ ] Run `git diff --check`. Inspect screenshots and record command results in the handoff. Commit remaining feature docs/tests only; report exact validation and any real-Wrangler compatibility limits.

## Execution Handoff

Recommended approach: native execution in this session. The tasks depend closely on the account-service and launch-helper interfaces; keeping one implementer avoids repeated context setup. Before product-code edits, the user reviews this plan and chooses native or subagent-driven execution. Use the execution skill and an isolated workspace appropriate to the current dirty working tree; do not discard existing edits or rebuild the plan from scratch.
