# Desktop replacement coverage

The acceptance criterion is that the user can stop using the host and retain every function with an exactly synchronized sidebar. **That criterion is not met by this build.** The core coding client works, but the following boundaries prevent a truthful claim of full replacement.

| Area | Current result | Remaining work |
| --- | --- | --- |
| Local thread IDs and persistence | Shared native Codex history | Compare all host-visible local rows, including historical source kinds and filters |
| Project names, membership, ordering | Read from the host’s saved legacy state every five seconds | Obtain a host-owned mutation path; migrate legacy organization only with version-compatible support |
| Pins and unread state | Read from host metadata | Two-way mutation, active identity reconciliation and exact semantics for multiple local profiles |
| New backend projects | Can be created and shown in vector.dev | This host does not yet render canonical backend project changes consistently |
| Chat rename, archive, restore | Native mutations, live verified on a disposable thread | End-to-end host sidebar observation for each supported version |
| New chat and output streaming | Model turn, saved drafts, tabs, reload and idle-backend recovery verified | Exercise long tasks and every event variant |
| Resume and history | Original IDs, passive reads and paginated history | Validate all older transcript forms and runtime ownership transitions |
| Interrupt, guidance, fork, compaction | Controls implemented | Live exercise of each path; robust recovery after backend loss |
| Approval and input requests | Command/file previews, one-turn selected permissions, basic typed forms | Live validation of every approval type and complex elicitation schemas |
| Terminal and files | Host PTY, syntax editor, tabs, search, draft recovery, previews and backups | Persistent/reconnectable terminals and broader editor features |
| Git and review | Stage/unstage, scoped commits, branch/worktree controls, reviewed push and draft PR | Live push/PR validation against an explicitly selected remote |
| Goals | Native goal get/set/pause controls | Validate budget transitions and continuation lifecycle in this client |
| Skills and local plugins | Discover and inspect existing resources | Full installation/configuration and marketplace UI |
| Local MCP servers | Existing configuration, status and OAuth | Reconnect UX and complete per-tool availability validation |
| Hosted app tools and embedded apps | Missing | Desktop/cloud session capability provisioning, embedded resource rendering |
| Browser and computer use | Existing configured MCP tools may work | Independent native service integrations; no dependency on the host process |
| Voice and dictation | Missing | Audio capture, transcription, realtime sessions and permissions UX |
| Cloud/remote chats, ChatGPT chats, Spaces and Sites | Missing | Supported authentication, listing, data models, execution and service APIs |
| Automations | Saved schedule inspection | Independent scheduler, recurrence/timezone semantics and coordinated ownership to avoid duplicate execution |
| Notifications | Opt-in native background alerts, private content by default, click-to-open | Actual macOS presentation/permissions validation |
| Account switching and profiles | Launch-time CODEX_HOME override | Profile management UI, isolated windows and identity-aware sidebar reads |
| Remote access and mobile | Missing | Authenticated encrypted transport, pairing, reconnection and off-device validation |
| Distribution and updates | Local unsigned Apple Silicon package with app icon | Signing, notarization, installer and update strategy |

## Why exact sidebar writes are blocked

This installed host keeps authoritative project membership, pins, read markers and portions of ordering in `.codex-global-state.json`. Its saved migration state has not completed the transition to app-server-owned membership. Earlier local work verified that updating native membership did not change the host’s sidebar. Merely offering `project/update` or `thread/metadata/update` in the protocol cannot establish exact synchronization with the host UI.

This project therefore reads a limited projection of the saved state and leaves the file untouched. Rewriting a running host’s private state can lose concurrent changes and still may not update its in-memory UI. No code-signing authorization bypass, injection or private IPC authorization workaround is implemented.

The host also has remote/cloud data and native integrations outside local app-server. Those need separate supported APIs and validation. A protocol console is useful during development; it does not satisfy feature parity by itself.

## Next acceptance work

1. Compare the full host-visible sidebar against vector.dev on the actual host version, including sections, hidden threads, unread state, sort mode and remote sources.
2. Establish a supported host-owned mutation path for every sidebar operation and test both directions, including simultaneous conflicting changes.
3. Implement or integrate the missing host services, including independent scheduling when the host is closed; validate native notifications on the user’s Mac.
4. Validate long-running work, reconnection, writer ownership, upgrades and recovery before treating vector.dev as the sole client.
