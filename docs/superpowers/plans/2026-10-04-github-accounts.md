# GitHub Accounts Implementation Plan

> Use superpowers:executing-plans to implement inline.

**Goal:** Select Personal or Zafe GitHub access and commit identity per Luce project.
**Architecture:** A main-process GitHub profile service isolates gh auth; terminal launch composes its environment after Codex account selection; a separate renderer panel provides account management.
**Tech Stack:** Electron, Node, GitHub CLI, Git, Playwright.
**Spec:** ../specs/2026-10-04-github-accounts-design.md

## Constraints
Preserve current dirty workspace and user terminal sessions. Baseline touched files for review; no broad staging or commits. User authorized implementation after the proposed account flow; continue without repeated design gates. No external repository writes or real account sign-in during verification.

## Tasks
- [x] Write failing profile/env/device-flow tests using gh fixture. Implement github-accounts.cjs with safe metadata, login lifecycle, identity and Git environment. Verify real git routing and identity.
- [x] Wire executable discovery, IPC, project setting, terminals and resume pinning. Exercise all three providers and persisted existing/explicit profiles.
- [x] Add Accounts GitHub tab, device code, identity editing, project selector and terminal account context. Write failing Electron smoke then implement and run it.
- [x] Review scoped diff; fix material findings, run full tests and existing account/files smokes. Package, install with backup, verify signature and package contents.

## Review focus
Cross-account Keychain fallback, inherited tokens/config, cancellation/retry races, project change versus live terminal identity, restored terminal account selection. Token output must stay within main process memory and child env.

Verification: npm test → 124/124 pass; general app, Codex accounts, GitHub profiles/relaunch, Codex continuation GitHub pinning, files/media/cwd/drag/link, and preview-context smokes pass. Review findings fixed and rechecked. Explicit GitHub profiles are scoped to github.com; Enterprise/custom SSH keeps Existing setup. Real browser authorization remains a user action.
