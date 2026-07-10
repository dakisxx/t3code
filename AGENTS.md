# AGENTS.md

## Task Completion Requirements

- `vp check` and `vp run typecheck` must pass before considering tasks completed.
  - If changing native mobile code, `vp run lint:mobile` must also pass.
- Use `vp test` for the built-in Vite+ test command and `vp run test` when you specifically need the `test` package script.

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and client applications. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.
- `packages/client-runtime`: Shared runtime package for sharing client code across web and mobile.

## Linux Desktop Release Symlink

Personal workflow note: when the user says "build it" in this checkout, they mean build the desktop client Linux AppImage, not just the web/server production bundles. Run:

```bash
mise exec -- bun run dist:desktop:linux
```

After building a new Linux AppImage (e.g. `bun run dist:desktop:linux`), update the stable symlink so the user's installed `.desktop` entry keeps working without edits:

```bash
ln -sf T3-Code-<version>-x86_64.AppImage release/T3-Code-latest.AppImage
```

The desktop entry at `~/.local/share/applications/t3code.desktop` points to `release/T3-Code-latest.AppImage`, not the versioned filename.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Fork Workflow (Personal)

This checkout is a fork of `pingdotgg/t3code`. Branch convention:

- **`main`** — pristine mirror of `upstream/main`. Never commit here. Only ever fast-forwarded.
- **`feat/*` / `docs/*` / `chore/*`** — one personal feature/change per branch, branched off `main`. Each branch should be self-contained so it can be PR'd upstream, paused, dropped, or rebased independently.
- **`personal`** — `main` + all personal feature branches merged in. **This is the branch to build/run from.** Never commit directly here; it should only ever contain merge commits plus whatever's on its feature branches.

Remotes:

- `origin` → `https://github.com/dakisxx/t3code.git` (this fork)
- `upstream` → `https://github.com/pingdotgg/t3code.git`

### Syncing upstream

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main

git checkout personal
git merge main           # creates a merge commit on personal
# resolve any conflicts (likely in files touched by both upstream and a feature)
git push origin personal
```

If a merge conflict on `personal` is non-trivial, the cleaner fix is to rebase the offending feature branch onto new `main` first, then re-merge `personal`:

```bash
git checkout feat/foo
git rebase main          # resolve conflicts here, in feature context
git push --force-with-lease origin feat/foo

git checkout personal
git reset --hard main    # discard old merges
git merge --no-ff feat/chat-find feat/nord-theme feat/larger-base-font docs/linux-release-symlink docs/fork-workflow
git push --force-with-lease origin personal
```

### Adding a new personal feature

```bash
git checkout main
git checkout -b feat/your-thing
# work, commit
git push -u origin feat/your-thing

git checkout personal
git merge --no-ff feat/your-thing
git push origin personal
```

### Upstreaming a feature

Each `feat/*` branch is already isolated against clean upstream — no rebase needed before opening the PR:

```bash
gh pr create --repo pingdotgg/t3code --base main --head feat/your-thing
```

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents.

- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `bun run sync:repos`; use `bun run sync:repos --repo <id>` to sync one
  configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so
  `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for examples of
  idiomatic usage, tests, module structure, and API design.
