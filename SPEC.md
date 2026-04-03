# SPEC.md — Generic Collaborative Document Workspace

This document is the product and behavior specification for a new application. It is intentionally implementation-agnostic. It defines requirements, interfaces, constraints, workflows, and acceptance criteria, but does not prescribe technology choices, programming languages, repository structure, or deployment architecture beyond what is functionally required.

The application is a generic collaborative editor for text-first documents. Humans can edit a document concurrently through a UI. An LLM-driven agent can inspect document state, comment on text, propose edits, and perform document actions through a CLI tool. The CLI may talk directly to local state or to a server; this specification assumes a server-backed design is allowed and likely, but does not require a particular implementation strategy.

The system must be generic across document types. It must not hardcode product-specific entities such as tasks, decisions, risks, or code-review objects into the core document model. Such concepts may be represented using generic annotations, comments, metadata, or future extensions.

The core system must support three primary surfaces:

1. A **CLI tool** used by Codex or another coding agent to inspect and manipulate documents.
2. A **server** that stores document state, coordinates concurrent access, and exposes operations to both the CLI and the UI.
3. A **human UI** that allows direct collaborative editing, comments, suggestions, and review.

---

## 1. Goals

After implementation, the system must allow all of the following:

1. A human creates or imports a document and opens it in the editor UI.
2. Multiple human users open the same document concurrently and see live or near-live updates.
3. A human selects text and creates a comment thread.
4. A human selects text and creates a generic annotation with a freeform `kind` and optional metadata.
5. A CLI tool can open a document session, inspect document structure, read scoped context, and issue actions against the document.
6. The CLI tool can be used by Codex to perform document actions such as commenting on text, proposing edits, or importing/exporting files.
7. AI-originated changes appear as reviewable suggestions by default rather than silently mutating human-authored text.
8. Existing files can be imported into the editor, normalized into the internal document model, edited collaboratively, and exported again.
9. The same workflow works for normal prose documents and text/code files treated as text-first documents.

### Minimum successful end-to-end demo

The minimum complete demo for version 1 is:

- a document imported from an existing Markdown file,
- two human sessions editing that document concurrently in the UI,
- one human-created comment thread,
- one human-created annotation,
- one CLI-driven AI suggestion batch rewriting a selected paragraph,
- one CLI-driven AI review run creating comment threads on a selection,
- export of the final document to Markdown,
- all actions reflected through the shared server-backed state.

---

## 2. Scope

### 2.1 In scope

Version 1 includes:

- document creation,
- document import and export,
- document persistence,
- concurrent human editing,
- presence,
- comments and comment threads,
- generic annotations,
- AI suggestion batches,
- AI-authored comments,
- CLI-based document inspection and mutation,
- server-managed open document state,
- activity history,
- support for code files as text-first documents,
- local development and automated test coverage.

### 2.2 Explicitly out of scope for version 1

The following are not required:

- pixel-perfect fidelity for DOCX, PDF, or other layout-centric formats,
- full IDE features,
- language-server integration,
- repository-wide code editing,
- Git hosting integration,
- cloud-drive integration,
- binary file editing,
- advanced permissions beyond simple collaboration,
- multi-region or horizontally scaled collaboration infra,
- offline-first synchronization,
- advanced track-changes parity with Word or Google Docs,
- rich embedded media or page-layout features,
- domain-specific built-in entity types such as task boards,
- autonomous background job durability beyond ordinary persisted operations.

---

## 3. Product principles

### 3.1 Generic core model

The core model must only understand generic collaborative primitives such as content blocks, anchors, comment threads, annotations, suggestions, document versions, and activity records.

It must not require built-in domain types like task, decision, or code review object.

### 3.2 Human-first collaboration

Humans edit the live document directly. AI-originated text edits should default to suggestions or proposals that are reviewable and reversible.

### 3.3 Text-first representation

The system is optimized for text-first documents. Rich formatting may exist, but semantic structure and collaboration behavior are more important than exact visual reproduction of imported formats.

### 3.4 Efficient LLM interaction

The CLI and server must support scoped document reads so that an LLM can work on relevant sections without requiring the full document on every request.

### 3.5 Stable addressing

Comments, annotations, and suggestions must anchor to text in a way that remains useful across edits. The system should not rely only on fragile whole-document absolute offsets.

### 3.6 Reviewability and auditability

The system must make it clear what changed, who changed it, and whether a change is direct, suggested, accepted, rejected, or still pending.

---

## 4. Required product surfaces

## 4.1 CLI tool

A command-line interface must exist specifically so Codex or another agent can perform document actions deterministically.

The CLI is a first-class product surface, not a debug utility.

The CLI must support at least the following categories of behavior:

- authenticate or identify against the server if needed,
- create documents,
- list documents,
- open a document or document session,
- fetch document outline or metadata,
- fetch blocks or ranges of content,
- search within a document,
- create comment threads,
- reply to comment threads,
- create annotations,
- create suggestion batches,
- apply or reject suggestion batches,
- import files,
- export files,
- show activity or document history,
- request AI operations on a scoped region.

The CLI must be scriptable and suitable for non-interactive use by Codex.

The CLI must support machine-readable output for at least the commands that are likely to be used programmatically.

## 4.2 Server

A server component is allowed and expected. If present, it must be the source of truth for persisted document state and must coordinate access between CLI clients and UI clients.

The server must support:

- persistence of documents and collaboration artifacts,
- storage of open document state or durable document state,
- concurrency coordination,
- APIs for UI and CLI actions,
- session or identity handling sufficient for collaborative editing,
- activity and audit logging,
- AI request orchestration when AI features are invoked.

The server may choose the exact transport and protocol style, but the behavior must satisfy this specification.

## 4.3 Human UI

A browser-based or otherwise graphical human UI must exist for direct editing.

The UI must support:

- opening a document,
- editing text directly,
- seeing other users’ presence,
- creating and replying to comment threads,
- creating annotations,
- reviewing AI suggestions,
- accepting or rejecting suggestions,
- importing and exporting files,
- seeing document activity,
- resolving comment threads.

---

## 5. Functional requirements

## 5.1 Documents

The system must support:

- create document,
- rename document,
- open document,
- list documents,
- delete document,
- duplicate document.

Each document must have:

- a stable document identifier,
- a title,
- persisted content,
- created and updated timestamps,
- a history of collaboration activity sufficient for auditability.

The system must support opening an existing file into the editor by importing it into the canonical internal model.

## 5.2 Content model

The system must have one canonical internal document model used for collaboration, comments, suggestions, annotations, and export.

The exact representation is implementation-defined, but it must support at least:

- paragraphs,
- headings,
- lists,
- block quotes,
- code blocks,
- basic inline styling,
- links,
- plain text content,
- block identity,
- range anchoring,
- document versioning or revision tracking.

Every visible block-like unit of content must have a stable identifier suitable for anchoring comments and suggestions.

## 5.3 Anchors

Comments, annotations, and suggestions must reference specific text or block regions through anchors.

Anchors must be robust enough to survive ordinary edits with reasonable confidence.

A good anchor typically includes:

- block identity,
- local text range,
- enough surrounding text or quoting information to reattach after nearby edits.

The implementation may choose the exact format, but the anchor behavior must satisfy the workflows in this spec.

## 5.4 Comments and threads

The system must support comment threads attached to text or block ranges.

A thread must support:

- creation,
- replies,
- resolution,
- reopening,
- author attribution,
- timestamps,
- anchor preservation across ordinary edits.

The UI must render threads inline or adjacent to the relevant text and also provide a thread list or sidebar view.

The CLI must allow creating and replying to threads by referencing anchors, blocks, selections, or equivalent scoped identifiers.

## 5.5 Generic annotations

The system must support generic annotations separate from comment threads.

An annotation must support:

- a freeform `kind` string,
- an optional body or label,
- optional metadata,
- optional anchor or block references,
- creation, update, and deletion.

The base system must not assign built-in semantics to annotation kinds beyond storing and displaying them.

The UI must make annotations visible and inspectable.

The CLI must allow creating and listing annotations.

## 5.6 Suggestions

AI-originated edits must default to suggestion batches rather than direct edits.

A suggestion batch must:

- be attributable to an author or agent,
- target a document revision or base version,
- contain one or more proposed operations,
- have a status such as pending, accepted, rejected, stale, or equivalent,
- be reviewable by humans.

The UI must show suggested changes clearly.

A user must be able to accept or reject a whole batch at minimum. Finer-grained acceptance is optional for version 1.

The CLI must be able to create suggestion batches and apply or reject them.

## 5.7 Presence and collaboration

The human UI must support multi-user concurrent editing of the same document.

At minimum it must show:

- who else is present,
- where another user is currently active or selected if supported,
- live or near-live propagation of edits.

The system must handle concurrent edits without data loss in ordinary use.

The implementation may choose its concurrency mechanism, but the user-visible behavior must feel collaborative rather than last-write-wins destructive.

## 5.8 Activity history

The system must record meaningful activity for each document.

At minimum the activity feed must include:

- document created,
- human edited content,
- comment thread created,
- annotation created,
- suggestion batch created,
- suggestion accepted or rejected,
- import performed,
- export performed.

Each activity item must include time and actor attribution when available.

## 5.9 Import and export

The system must support importing existing files into the internal document model.

Version 1 must support import from at least:

- plain text,
- Markdown,
- HTML,
- code files treated as text-first documents.

Version 1 must support export to at least:

- plain text,
- Markdown,
- JSON representation of the canonical document model.

HTML export is strongly preferred.

Import and export need semantic fidelity, not perfect visual fidelity.

The system must surface import warnings if a source file contains features that cannot be represented well.

## 5.10 AI operations

The system must support server-mediated AI operations invoked through the CLI and optionally through the UI.

Minimum AI operations for version 1:

- rewrite a scoped selection into a suggestion batch,
- review a scoped selection and create one or more comment threads,
- answer or reply to an existing comment thread.

AI operations must be scoped so the model does not need to read the entire document by default.

AI operations must be attributable in activity history and authorship metadata.

If AI credentials are not configured, the rest of the application must still work. AI actions may be unavailable or disabled with a clear explanation.

---

## 6. CLI requirements

The exact command names are implementation-defined, but the CLI must make the following workflows possible.

## 6.1 Document discovery and creation

The CLI must be able to:

- list documents,
- create a document,
- show document metadata,
- delete a document,
- duplicate a document.

## 6.2 Scoped reads

The CLI must be able to retrieve:

- the full document when needed,
- document outline or block list,
- selected blocks by identifier,
- text around an anchor,
- comments for a region,
- annotations for a region,
- document activity,
- open suggestion batches.

These reads should be designed so Codex can efficiently request only the context it needs.

## 6.3 Mutations

The CLI must be able to:

- create or update content through supported operations,
- create threads,
- reply to threads,
- resolve threads,
- create annotations,
- create suggestion batches,
- accept or reject suggestion batches,
- import files,
- export documents.

## 6.4 AI invocation

The CLI must support one or more commands that cause the server to run AI operations on a scoped document region.

The CLI must allow passing:

- document identifier,
- scoped target region or selection,
- intent such as rewrite, review, or reply,
- optional instructions,
- optional structured output mode if supported.

The CLI must surface the result in a way Codex can consume, including references to created suggestion batches or threads.

## 6.5 Machine-readable outputs

For scripting use, the CLI must support a machine-readable output mode for core commands. JSON is acceptable.

The CLI should use stable field names suitable for automated tooling.

---

## 7. Server requirements

The server must expose the capabilities needed by both CLI and UI clients.

The transport style is implementation-defined, but the following behaviors are required.

## 7.1 Persistence

The server must durably persist:

- document metadata,
- document content,
- comments and threads,
- annotations,
- suggestion batches,
- activity history,
- imported file provenance if tracked,
- user/display identity needed for attribution.

## 7.2 Concurrency coordination

The server must support concurrent document access by multiple clients.

If the implementation uses live sessions, the server may track open document state in memory as long as persisted document state remains recoverable.

The system must not require external infrastructure for version 1 beyond whatever the implementation chooses to run locally.

## 7.3 Validation

The server must validate requests sufficiently to prevent malformed document operations, invalid anchors, or corrupted suggestion batches.

## 7.4 AI mediation

All AI interactions must be mediated by the server or an equivalent trusted backend component.

UI and CLI clients must not require direct API keys to external model providers.

## 7.5 Identity

Version 1 may use lightweight identities such as display names or local sessions. Full production auth is not required.

However, activity, comments, and suggestions must still record attribution consistently.

---

## 8. UI requirements

## 8.1 Core layout

The human UI must provide at minimum:

- a document list or launcher,
- a main editor surface,
- a comment/thread view,
- an annotation view or inspector,
- a suggestion review view,
- an activity view,
- import and export controls.

These may be combined into one or more panels, but the capabilities must exist.

## 8.2 Editing

Humans must be able to edit text directly in the main editor surface.

The UI must support undo and redo.

The UI should feel responsive during collaborative editing.

## 8.3 Presence

When multiple users are in the same document, the UI must show who is present. Cursor or selection presence is preferred but not strictly required if presence is otherwise visible.

## 8.4 Comments

A human must be able to select text or a block region and create a comment thread. The UI must support viewing, replying, resolving, and reopening threads.

## 8.5 Annotations

A human must be able to create an annotation on a selected region or block and specify at least:

- kind,
- optional body.

The UI must make annotations visible and inspectable.

## 8.6 Suggestions

Suggestion batches must be visible in the UI with enough information for a human to understand:

- what region they affect,
- who authored them,
- whether they are pending or resolved,
- what accepting or rejecting them will do.

Humans must be able to accept or reject suggestion batches.

## 8.7 Import and export

A human must be able to import a supported file into a document and export a document to one of the supported formats.

## 8.8 Activity view

A human must be able to inspect recent document activity.

---

## 9. Data and API behaviors

This section intentionally specifies behaviors rather than transport details.

## 9.1 Canonical entities

The system must have durable representations for at least the following entities:

- document,
- block or content node,
- anchor,
- thread,
- comment,
- annotation,
- suggestion batch,
- activity event,
- user/session identity.

## 9.2 Operation categories

The system must support content operations sufficient to:

- insert text,
- replace text,
- delete text,
- insert block-like content,
- replace block-like content,
- delete block-like content,
- import document content,
- export document content.

The implementation may support higher-level semantic operations, but those are optional so long as these behaviors are available.

## 9.3 Versioning

Document operations and suggestion batches must carry enough version information to detect stale proposals or resolve ordinary concurrency safely.

The exact versioning model is implementation-defined.

## 9.4 Error handling

The system must return actionable errors for:

- document not found,
- invalid anchor,
- invalid suggestion application,
- unsupported import format,
- export failure,
- AI unavailable,
- concurrency or stale-version conflicts when relevant.

Errors exposed through the CLI should be machine-readable when JSON output is requested.

---

## 10. Non-functional requirements

## 10.1 Local development

The full system must be runnable locally for development and testing.

## 10.2 Reliability

Ordinary user actions must not corrupt document state.

## 10.3 Observability

The implementation must produce enough logs or diagnostics to debug document operations, suggestion application, imports, exports, and AI actions.

## 10.4 Performance

The system should handle reasonably sized text documents without requiring full-document re-fetch on every small action.

The CLI and server must support scoped reads to reduce LLM token use.

## 10.5 Security

External AI credentials, if used, must not be embedded in the UI.

---

## 11. Acceptance criteria

The implementation is complete only when all of the following are true.

## 11.1 Human collaboration

1. Two separate human sessions can open the same document and both observe collaborative edits.
2. Each human session can create comments and annotations.
3. Comments remain attached to the relevant region after ordinary nearby edits.

## 11.2 CLI functionality

1. The CLI can list, create, inspect, import, and export documents.
2. The CLI can fetch scoped document context rather than only full documents.
3. The CLI can create comment threads and annotations.
4. The CLI can invoke AI rewrite and review actions on a selected region.
5. The CLI can accept or reject suggestion batches.

## 11.3 Server-backed state

1. Document state persists across server restart or process restart.
2. Comments, annotations, suggestions, and activity history persist.
3. Concurrent access from UI and CLI remains coherent.

## 11.4 AI behavior

1. AI rewrite actions produce suggestions by default, not silent direct edits.
2. AI review actions can create comment threads anchored to relevant text.
3. If AI is unavailable, the rest of the system continues to function.

## 11.5 Import and export

1. A Markdown file can be imported, edited, and exported.
2. A plain text or code file can be imported, edited, and exported.
3. Exported Markdown is structurally reasonable for the edited document.

---

## 12. Testing requirements

The implementation must include automated tests covering the core behaviors.

At minimum there must be tests for:

- document creation and persistence,
- import of supported file types,
- export of supported file types,
- anchor preservation under ordinary edits,
- comment thread lifecycle,
- annotation lifecycle,
- suggestion batch lifecycle,
- CLI read and write commands,
- concurrent editing behavior,
- AI operation integration with AI mocked or stubbed,
- end-to-end workflow spanning UI, server, and CLI.

The end-to-end workflow test must cover at least:

1. import a Markdown file,
2. open it in two UI sessions,
3. make concurrent edits,
4. create a comment thread,
5. create an annotation,
6. run a CLI-driven AI rewrite that creates a suggestion batch,
7. accept that suggestion in the UI,
8. export the final document.

---

## 13. Implementation freedom

The implementation agent may choose any reasonable:

- programming language,
- frameworks,
- libraries,
- repository layout,
- storage engine,
- API style,
- transport mechanism,
- concurrency engine,
- testing stack,
- local orchestration approach,

provided the resulting system satisfies this specification.

If the implementation makes meaningful architectural choices not dictated here, those choices should be documented in `README.md` along with local run instructions and any tradeoffs.

---

## 14. Summary of what must exist

The final application must include all three of these:

### 14.1 CLI for Codex

A documented CLI that Codex can use to inspect and manipulate document state and invoke AI operations.

### 14.2 Shared state backend

A server or equivalent backend component that stores documents, coordinates collaboration, and services both the CLI and UI.

### 14.3 Human editor UI

A collaborative editing UI for humans that interacts with the shared backend and supports comments, annotations, suggestions, review, and import/export.

These are all required for version 1.
