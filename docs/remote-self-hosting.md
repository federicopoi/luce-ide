# Optional phone access: self-hosting

Desktop terminals, files and accounts work without a relay. This repository
does not provide public relay enrollment credentials. Phone access currently
requires a relay that you administer or explicitly trust.

1. Run `npm ci` and `npm run build` at the repository root.
2. Authenticate Wrangler with your own Cloudflare account. If you have more
   than one account, set `CLOUDFLARE_ACCOUNT_ID` to the intended account ID.
3. Create a strong random enrollment secret using a password manager. Store
   it privately; do not put it in the repository, shell arguments or public
   app bundle. Run `npx wrangler secret put REGISTRATION_TOKEN --config
   relay/wrangler.toml` and paste the value into Wrangler's prompt.
4. Deploy with `npx wrangler deploy --config relay/wrangler.toml`. The config
   includes the required Worker assets and SQLite Durable Object migration.
5. Create `remote-bootstrap.json` inside the Mac's existing Luce profile
   (`~/Library/Application Support/Orbit`) with this shape, replacing both
   placeholders privately:

```json
{
  "relayURL": "https://your-luce-relay.your-account.workers.dev",
  "registrationToken": "REPLACE_WITH_YOUR_PRIVATE_ENROLLMENT_SECRET"
}
```

Make the profile private to your user and the file readable/writable only by
that user (`chmod 700` for the profile and `chmod 600` for this file). Quit and
reopen Luce when your work can be stopped, then use **Phone → Enable remote
access → Pair phone**. Keep generated pairing links private.

Use a separate relay/secret for development. Revoking a phone removes its
access; deleting a saved link alone does not revoke it. Cloudflare service
availability, quotas and billing are the administrator's responsibility.
A publicly hosted multi-user enrollment service is not included in this
release. Never share one administrator enrollment secret in a public app.
