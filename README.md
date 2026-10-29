# vector.dev

A local desktop and browser workspace for Codex. Use your existing Codex sign-in and local conversation history through a dedicated interface for chats, files, terminal work, and Git.

**Development build:** full desktop parity is incomplete. Exact two-way host sidebar editing, cloud features, and voice are not implemented. See [PARITY.md](PARITY.md).

## Run locally

Requirements: macOS, Node.js 22.18 or newer, and a compatible installed Codex executable. The app prefers the Codex binary bundled with the desktop host, then falls back to the installed CLI. Keep the host installed if you use its bundled binary.

```sh
git clone https://github.com/Cxsmxnaut/vector.dev.git
cd vector.dev
npm ci
npm run build
npm run open
```

`npm run open` starts a loopback-only server and opens a fresh, single-use connection link. The link is saved privately in `.runtime/connection.json`, expires after ten minutes, and is removed from the browser address after sign-in. Browser sessions use an HttpOnly cookie. Runtime credentials stay local.

To start the server directly, use `npm start`. The default address is `127.0.0.1:4318`; `PORT=0 npm start` selects an available port. You can also double-click **Open Browser.command**.

## Mac application

```sh
npm run desktop
# Build an unsigned Apple Silicon app:
npm run package:mac
```

The packaged application is `release/vector.dev-darwin-arm64/vector.dev.app`. Closing its window hides it while local work continues. Use **vector.dev → Quit** to stop the application and backend. Reopen its Dock icon to return to the window.

This builds an unsigned `.app` bundle. A DMG installer, notarization, and automatic updates are not included.

## Features

- Original local Codex thread IDs, history, paginated transcripts, Markdown, tool activity, reasoning, images, and JSON export.
- Local host project organization, pins, ordering, and unread markers projected into the sidebar every five seconds. The host's private sidebar state is read-only.
- New and resumed conversations, streaming, interruption, mid-turn guidance, model/reasoning selection, and attachments.
- Persistent drafts and chat tabs, conflict detection between windows, bounded event replay, and backend reconnection. Messages are never automatically resent.
- Syntax-highlighted editor, file tabs, project search, local editor drafts, change previews, backups, and restoration.
- Git staging, reviewed commits, clean branch switching, branch/worktree creation, and controls for pushing and creating draft pull requests. Repository changes invalidate stale previews. No force push is offered.
- Command/file approval previews, selected additional permissions scoped to one turn, and basic typed MCP forms. Reopened conversations retain saved permissions unless you choose a different mode.
- Optional native background alerts for completed/failed tasks and approval requests. Titles are hidden by default; enable notifications in Settings and allow them in macOS.
- Host PTY terminal, local skills/plugins, MCP status/OAuth, account usage, shared model settings, goals, and code review.
- Saved automation inspection and a developer console for the installed backend protocol. An exposed RPC method does not by itself establish desktop feature parity.

## Local data and permissions

Set `VECTOR_CODEX_BIN` to select a compatible Codex binary, or `CODEX_HOME` to use another profile. Neither changes your machine's defaults.

New installations store private drafts, window state, and editor backups under `CODEX_HOME/vector.dev/`. Existing pre-rebrand local state is reused in place when detected, preserving drafts and backups without copying them into the repository. Uploads remain in the Codex attachment directory. `.runtime/`, `evidence/`, generated bindings, dependencies, and packaged applications are excluded from Git.

The native renderer has Node integration disabled, context isolation enabled, and Electron sandboxing enabled. Browser access is restricted to this Mac. Remote access and mobile pairing have not been deployed.

The user-operated terminal has host permissions and is separate from the agent's sandbox. Filesystem and Git commands operate on real local files. The editor supports UTF-8 text up to 1 MB and preserves POSIX file mode. It checks the disk before saving and creates a backup, but cannot provide an atomic compare-and-swap against unrelated editors. Git actions similarly recheck a reviewed snapshot without locking unrelated clients out of the repository.

GitHub authentication and author overrides apply only to the requested operation. The application never switches the machine's active GitHub account. Repository identity rules are implemented in `server/git.mjs`.

## Development and validation

```sh
npm test
npm run dev
# Rebuilds frontend assets and watches the backend; reload after frontend edits.
npm run verify:live
# Optional: consumes account usage for one ephemeral model turn.
npm run verify:live -- --inference
```

The live verification command reads local history and creates only disposable files and a short process in a temporary directory. The optional inference check uses the existing account.

`server/methods.json` is the packaged protocol manifest. The development build was tested with Codex `0.164.0-alpha.11.1`. Experimental methods can differ across versions. To regenerate local reference bindings and the manifest for your selected binary, run `npm run protocol:update`; generated `protocol/` files stay untracked.

The automated tests cover sidebar precedence, authenticated transport, event replay, draft conflicts, backup/restore, symlink boundaries, scoped Git commits/worktrees, approval scopes, and notification privacy. Remote push/PR mutations and actual macOS alert presentation still need live validation in the target environment.

Local shell, editor, and interface features do not require a hosting subscription. Codex model calls and agent-powered operations consume the signed-in account's allowance or credits. Third-party tools may have their own requirements.

## Architecture

- `server/rpc.mjs`: persistent bidirectional JSONL connection to Codex.
- `server/main.mjs`: authenticated local HTTP gateway and event stream.
- `server/sidebar.mjs`: host sidebar projection combined with native thread metadata.
- `server/store.mjs`, `server/files.mjs`, `server/git.mjs`: local persistence and workspace operations.
- `src/`: React interface.
- `desktop/`: Electron shell and notification policy.

vector.dev is an independent client and is not affiliated with OpenAI. [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) describes the underlying integration surface.
