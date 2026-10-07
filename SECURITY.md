# Security and local data

Please report suspected vulnerabilities privately using GitHub's **Report a
vulnerability** feature when available. Otherwise contact the maintainers
privately before posting reproduction details. Never attach credentials,
pairing links, conversation transcripts, or an entire application profile to
an issue. Maintainers should enable private vulnerability reporting before
making this repository public.

Luce runs installed provider CLIs and shell commands with your Mac user's
permissions. Choose trusted project folders and review commands and agent
permission requests. Auto approval is optional and starts disabled.

Accounts belong to the person using the app. Codex's existing login is reused
locally; added Codex accounts have separate private directories and file-based
credentials. GitHub profiles use GitHub CLI with Keychain storage when
available and a private configuration directory otherwise. Claude Code uses
its existing local login. Accounts and provider subscriptions are not bundled
or provided by Luce. Removing a profile preserves its local credential/history
directory; it does not revoke provider access.

The existing application profile is under
`~/Library/Application Support/Orbit` for compatibility with earlier builds.
Workspace metadata, transcripts, credentials, attachments, browser storage,
signing identities and relay configuration must never be committed or
included in a release. There is no Luce analytics service. Provider CLIs,
websites you preview and an optional configured relay make their own network
requests.

Remote access is optional and disabled until configured and enabled. A paired
phone can operate terminals and approve agent requests. Treat pairing URLs
as credentials; revoke a device if its link is exposed. Payloads are encrypted
between the Mac and paired phone, but you must also trust the service serving
the phone application's JavaScript. The private relay enrollment secret is
for the relay administrator and must never be embedded in public downloads.

Automated secret scans, dependency audits and tests are safeguards, not a
guarantee that every vulnerability has been found. Apple notarization is
required for the intended public download process and is separate from the
local developer signing option.
