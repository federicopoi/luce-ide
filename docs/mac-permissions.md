# Remembering Mac folder access

Luce uses a persistent local code-signing certificate for personal Mac builds. Its designated requirement identifies the bundle and this certificate instead of the changing build hash. macOS uses that requirement to recognize the same app across updates. See [Apple's designated-requirement documentation](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).

After moving from the old ad-hoc signature, macOS may ask for folder access once more. Approve the folders you want Luce to use. Subsequent builds retain that signing identity; quitting and reopening does not replace it. Existing denied permissions can be changed under **System Settings → Privacy & Security → Files and Folders**.

The certificate, encrypted private keychain and its unlock password live in `~/Library/Application Support/Luce Signing`. The directory is private to your Mac user, and its password file is readable only by that user. Private export files are removed after import. Keep this directory when reinstalling or restoring your Mac: silently generating a new identity would lose the continuity needed for existing approvals. No signing secrets belong in the repository or app bundle.

On a new development Mac, prepare the identity and authorize its code-signing trust once:

```sh
node scripts/signing.mjs
security add-trusted-cert -r trustRoot -p codeSign \
  -k "$HOME/Library/Application Support/Luce Signing/identity.keychain-db" \
  "$HOME/Library/Application Support/Luce Signing/certificate.pem"
```

macOS may require authentication for the trust change. It is scoped to the code-signing purpose. Packaging temporarily adds the private keychain to the lookup list, signs and verifies the app, and restores the previous list even when signing fails. Missing or inconsistent identity files stop packaging instead of falling back to an ad-hoc signature.

```sh
npm run package
node scripts/signing-smoke.mjs
npm run install:app
```

The signing smoke builds two different small apps, checks that their build hashes differ while their certificate-bound designated requirements match, and verifies both against the same requirement. It does not grant or modify folder-access permissions. This is local personal signing, not a notarized Developer ID distribution build.
