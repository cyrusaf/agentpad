import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, DragEvent, FormEvent, PointerEvent as ReactPointerEvent } from "react";

import { EditorPane, type EditorPaneHandle } from "./components/EditorPane";
import { api } from "./lib/api";
import { clearUnreadThreadState, diffUnreadThreadActivity } from "./lib/threadHighlights";
import type { Document, Presence, SelectionRange, Thread } from "./lib/types";

interface RouteState {
  path: string | null;
  threadId: string | null;
}

const COMMENTS_WIDTH_STORAGE_KEY = "agentpad.commentsWidth";
const DEFAULT_COMMENTS_WIDTH = 560;
const MIN_COMMENTS_WIDTH = 360;
const MAX_COMMENTS_WIDTH = 960;
const MIN_EDITOR_WIDTH = 420;

function readRoute(): RouteState {
  const url = new URL(window.location.href);
  return {
    path: url.searchParams.get("path"),
    threadId: url.searchParams.get("thread"),
  };
}

function writeRoute(route: RouteState, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);
  if (route.path) {
    url.searchParams.set("path", route.path);
  } else {
    url.searchParams.delete("path");
  }
  if (route.path && route.threadId) {
    url.searchParams.set("thread", route.threadId);
  } else {
    url.searchParams.delete("thread");
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "replace") {
    window.history.replaceState({}, "", next);
  } else {
    window.history.pushState({}, "", next);
  }
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatQuote(thread: Thread) {
  const quote = thread.anchor.quote.replace(/\s+/g, " ").trim();
  if (!quote) {
    return "Commented text";
  }
  return quote.length > 88 ? `${quote.slice(0, 85)}...` : quote;
}

function getSelectionPreview(selection: SelectionRange | null) {
  if (!selection) {
    return "";
  }
  const text = selection.text.replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function getComposerStyle(selection: SelectionRange | null): CSSProperties | undefined {
  if (!selection?.rect) {
    return { left: 24, top: 96 };
  }
  const width = 320;
  const left = Math.max(16, Math.min(selection.rect.left, window.innerWidth - width - 16));
  const top = Math.max(80, Math.min(selection.rect.bottom + 12, window.innerHeight - 240));
  return { left, top };
}

function pathFromURI(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "file:") {
      return null;
    }
    const pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) {
      return pathname.slice(1);
    }
    if (url.hostname && url.hostname !== "localhost") {
      return `//${decodeURIComponent(url.hostname)}${pathname}`;
    }
    return pathname;
  } catch {
    return null;
  }
}

function pathFromPlainText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("file://")) {
    return pathFromURI(trimmed);
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    return trimmed;
  }
  return null;
}

function pathFromDownloadURL(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split(":");
  if (parts.length < 3) {
    return null;
  }
  return pathFromURI(parts.slice(2).join(":"));
}

function pathFromDroppedText(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  for (const line of lines) {
    const candidate = pathFromDownloadURL(line) ?? pathFromPlainText(line) ?? pathFromURI(line);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

const DROPPED_PATH_TEXT_TYPES = ["text/uri-list", "text/plain", "DownloadURL", "public.file-url", "text/x-moz-url"];

type DroppedDataTransfer = Pick<DataTransfer, "files" | "getData" | "items">;

function readDroppedString(item: DataTransferItem) {
  return new Promise<string>((resolve) => {
    item.getAsString((value) => resolve(value ?? ""));
  });
}

async function readDroppedItemStrings(items: DataTransferItemList | null | undefined) {
  if (!items) {
    return [];
  }
  const matchingItems = Array.from(items).filter((item) => item.kind === "string" && DROPPED_PATH_TEXT_TYPES.includes(item.type));
  return Promise.all(matchingItems.map((item) => readDroppedString(item)));
}

function getDroppedFileName(dataTransfer: Pick<DataTransfer, "files">) {
  return dataTransfer.files?.[0]?.name?.trim() || null;
}

export async function extractDroppedPathFromDataTransfer(
  dataTransfer: DroppedDataTransfer,
) {
  const file = dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
  if (file?.path) {
    return file.path;
  }

  for (const type of DROPPED_PATH_TEXT_TYPES) {
    const raw = dataTransfer.getData(type);
    if (!raw) {
      continue;
    }
    const parsed = pathFromDroppedText(raw);
    if (parsed) {
      return parsed;
    }
  }

  const itemStrings = await readDroppedItemStrings(dataTransfer.items);
  for (const raw of itemStrings) {
    const parsed = pathFromDroppedText(raw);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function hasDroppedPathData(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }
  const types = Array.from(dataTransfer.types ?? []);
  const hasMatchingItems = Array.from(dataTransfer.items ?? []).some(
    (item) => item.kind === "file" || (item.kind === "string" && DROPPED_PATH_TEXT_TYPES.includes(item.type)),
  );
  return dataTransfer.files.length > 0 || hasMatchingItems || DROPPED_PATH_TEXT_TYPES.some((type) => types.includes(type));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCommentsWidthMax(viewportWidth: number) {
  return Math.max(MIN_COMMENTS_WIDTH, Math.min(MAX_COMMENTS_WIDTH, viewportWidth - MIN_EDITOR_WIDTH));
}

function clampCommentsWidth(width: number, viewportWidth = window.innerWidth) {
  return clampNumber(Math.round(width), MIN_COMMENTS_WIDTH, getCommentsWidthMax(viewportWidth));
}

function readStoredCommentsWidth() {
  const raw = localStorage.getItem(COMMENTS_WIDTH_STORAGE_KEY);
  if (!raw) {
    return clampCommentsWidth(DEFAULT_COMMENTS_WIDTH);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return clampCommentsWidth(DEFAULT_COMMENTS_WIDTH);
  }
  return clampCommentsWidth(parsed);
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => readRoute());
  const [actor, setActor] = useState(localStorage.getItem("agentpad.actor") ?? "browser-user");
  const [openPath, setOpenPath] = useState(() => readRoute().path ?? "");
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unreadThreadIds, setUnreadThreadIds] = useState<Set<string>>(() => new Set());
  const [unreadCommentIds, setUnreadCommentIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("Open a local file to begin.");
  const [commentBody, setCommentBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [dropActive, setDropActive] = useState(false);
  const [commentsWidth, setCommentsWidth] = useState(() => readStoredCommentsWidth());
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);
  const editorRef = useRef<EditorPaneHandle | null>(null);
  const dropInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedThreadRef = useRef<string | null>(null);
  const previousThreadsRef = useRef<Thread[]>([]);
  const dragDepthRef = useRef(0);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const activeThreadId = route.threadId;
  const orderedThreads = [...threads].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "open" ? -1 : 1;
    }
    return right.updated_at.localeCompare(left.updated_at);
  });
  const activeThread = orderedThreads.find((thread) => thread.id === activeThreadId) ?? null;
  const selectionPreview = getSelectionPreview(selection);
  const composerStyle = getComposerStyle(selection);

  const handleRevisionChange = useEffectEvent((revision: number, source: string) => {
    setCurrentDoc((current) => (current ? { ...current, revision, source } : current));
  });

  const navigateTo = useEffectEvent((nextRoute: RouteState, mode: "push" | "replace" = "push") => {
    writeRoute(nextRoute, mode);
    setRoute(nextRoute);
    setOpenPath(nextRoute.path ?? "");
  });

  const refreshThreads = useEffectEvent(async (path: string, mode: "load" | "local" | "live" = "local") => {
    const nextThreads = await api.listThreads(path);
    const previousThreads = previousThreadsRef.current;
    previousThreadsRef.current = nextThreads ?? [];
    const unreadDiff =
      mode === "live" ? diffUnreadThreadActivity(previousThreads, nextThreads ?? [], actor, route.threadId) : null;
    startTransition(() => {
      setThreads(nextThreads ?? []);
      if (mode === "load") {
        setUnreadThreadIds(new Set());
        setUnreadCommentIds(new Set());
        return;
      }
      if (!unreadDiff) {
        return;
      }
      if (unreadDiff.threadIds.length > 0) {
        setUnreadThreadIds((current) => {
          const next = new Set(current);
          for (const threadID of unreadDiff.threadIds) {
            next.add(threadID);
          }
          return next;
        });
      }
      if (unreadDiff.commentIds.length > 0) {
        setUnreadCommentIds((current) => {
          const next = new Set(current);
          for (const commentID of unreadDiff.commentIds) {
            next.add(commentID);
          }
          return next;
        });
      }
    });
  });

  const clearThreadUnread = useEffectEvent((threadID: string, sourceThreads: Thread[] = threads) => {
    const nextUnreadState = clearUnreadThreadState(threadID, sourceThreads, {
      threadIds: unreadThreadIds,
      commentIds: unreadCommentIds,
    });
    if (nextUnreadState.threadIds !== unreadThreadIds) {
      setUnreadThreadIds(new Set(nextUnreadState.threadIds));
    }
    if (nextUnreadState.commentIds !== unreadCommentIds) {
      setUnreadCommentIds(new Set(nextUnreadState.commentIds));
    }
  });

  const loadDocument = useEffectEvent(async (path: string) => {
    const doc = await api.openFile(path);
    startTransition(() => {
      setCurrentDoc(doc);
      setSelection(null);
      setCommentBody("");
      setReplyDrafts({});
      setOpenPath(doc.id);
      setStatus(`Opened ${doc.title}`);
    });
    await refreshThreads(doc.id, "load");
  });

  const handleDocumentArtifactHint = useEffectEvent(() => {
    if (currentDoc) {
      void loadDocument(currentDoc.id);
    }
  });

  const handleThreadsArtifactHint = useEffectEvent(() => {
    if (currentDoc) {
      void refreshThreads(currentDoc.id, "live");
    }
  });

  useEffect(() => {
    localStorage.setItem("agentpad.actor", actor);
  }, [actor]);

  useEffect(() => {
    localStorage.setItem(COMMENTS_WIDTH_STORAGE_KEY, String(commentsWidth));
  }, [commentsWidth]);

  useEffect(() => {
    if (!dropActive || !dropInputRef.current) {
      return;
    }
    dropInputRef.current.value = "";
    dropInputRef.current.focus();
  }, [dropActive]);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(readRoute());
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setCommentsWidth((current: number) => clampCommentsWidth(current));
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) {
        return;
      }
      const delta = resizeStateRef.current.startX - event.clientX;
      setCommentsWidth(clampCommentsWidth(resizeStateRef.current.startWidth + delta));
    };

    const stopResize = () => {
      if (!resizeStateRef.current) {
        return;
      }
      resizeStateRef.current = null;
      document.body.classList.remove("is-resizing-comments");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      document.body.classList.remove("is-resizing-comments");
    };
  }, []);

  useEffect(() => {
    lastFocusedThreadRef.current = null;
    previousThreadsRef.current = [];
    setUnreadThreadIds(new Set());
    setUnreadCommentIds(new Set());
  }, [route.path]);

  useEffect(() => {
    const path = route.path;
    if (!path) {
      startTransition(() => {
        setCurrentDoc(null);
        setSelection(null);
        setPresence([]);
        setThreads([]);
        setUnreadThreadIds(new Set());
        setUnreadCommentIds(new Set());
        setCommentBody("");
        setReplyDrafts({});
        setStatus("Open a local file to begin.");
      });
      return;
    }
    if (currentDoc?.id === path) {
      return;
    }
    startTransition(() => {
      setCurrentDoc(null);
      setThreads([]);
      setPresence([]);
      setSelection(null);
      setUnreadThreadIds(new Set());
      setUnreadCommentIds(new Set());
      setCommentBody("");
      setReplyDrafts({});
    });
    void (async () => {
      try {
        await loadDocument(path);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to open that file.";
        setStatus(message);
        navigateTo({ path: null, threadId: null }, "replace");
      }
    })();
  }, [route.path, currentDoc?.id]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const activeCard = window.document.querySelector<HTMLElement>(`[data-thread-card="${activeThreadId}"]`);
    activeCard?.scrollIntoView({ block: "nearest" });
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    clearThreadUnread(activeThreadId, threads);
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!activeThreadId || activeThreadId === lastFocusedThreadRef.current) {
      return;
    }
    const thread = threads.find((item) => item.id === activeThreadId);
    if (!thread) {
      return;
    }
    editorRef.current?.focusRange(thread.anchor.doc_start, thread.anchor.doc_end);
    lastFocusedThreadRef.current = activeThreadId;
  }, [activeThreadId, threads]);

  async function submitOpenPath() {
    if (!openPath.trim()) {
      setStatus("Enter an absolute file path.");
      return;
    }
    navigateTo({ path: openPath.trim(), threadId: null });
  }

  function openDroppedPath(nextPath: string) {
    setOpenPath(nextPath);
    navigateTo({ path: nextPath, threadId: null });
  }

  function setDropFailureStatus(dataTransfer: Pick<DataTransfer, "files">) {
    const droppedFileName = getDroppedFileName(dataTransfer);
    setStatus(
      droppedFileName
        ? `Dropped ${droppedFileName}, but this browser did not expose its absolute path. Paste the full path instead.`
        : "Could not read a file path from that drop. Paste the absolute path instead.",
    );
  }

  function handleOpenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitOpenPath();
  }

  async function createThread() {
    if (!currentDoc || !selection) {
      setStatus("Select some text first.");
      return;
    }
    if (!commentBody.trim()) {
      setStatus("Add a comment first.");
      return;
    }
    const created = await api.createThread(currentDoc.id, {
      body: commentBody,
      start: selection.start,
      end: selection.end,
    });
    setCommentBody("");
    setSelection(null);
    editorRef.current?.clearSelection();
    await refreshThreads(currentDoc.id, "local");
    navigateTo({ path: currentDoc.id, threadId: created.id }, "replace");
    setStatus("Comment added");
  }

  async function replyThread(threadID: string) {
    const body = replyDrafts[threadID]?.trim();
    if (!body || !currentDoc) {
      return;
    }
    await api.replyThread(currentDoc.id, threadID, body);
    setReplyDrafts((current) => ({ ...current, [threadID]: "" }));
    await refreshThreads(currentDoc.id, "local");
    setStatus("Reply added");
  }

  async function setThreadStatus(threadID: string, action: "resolve" | "reopen") {
    if (!currentDoc) {
      return;
    }
    if (action === "resolve") {
      await api.resolveThread(currentDoc.id, threadID);
      setStatus("Comment resolved");
    } else {
      await api.reopenThread(currentDoc.id, threadID);
      setStatus("Comment reopened");
    }
    await refreshThreads(currentDoc.id, "local");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Link copied");
    } catch {
      setStatus("Could not copy link.");
    }
  }

  function openThread(threadID: string) {
    if (!currentDoc) {
      return;
    }
    clearThreadUnread(threadID, threads);
    setCommentsCollapsed(false);
    navigateTo({ path: currentDoc.id, threadId: threadID }, "replace");
  }

  function clearRoute() {
    navigateTo({ path: null, threadId: null });
  }

  function startCommentsResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 1100) {
      return;
    }
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: commentsWidth,
    };
    document.body.classList.add("is-resizing-comments");
  }

  function handleDropTargetDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDroppedPathData(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setDropActive(true);
  }

  function handleDropTargetDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDroppedPathData(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    if (!dropActive) {
      setDropActive(true);
    }
  }

  function handleDropTargetDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasDroppedPathData(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDropActive(false);
    }
  }

  function handleDropOverlayInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextPath = pathFromDroppedText(event.target.value);
    if (!nextPath) {
      return;
    }
    event.target.value = "";
    dragDepthRef.current = 0;
    setDropActive(false);
    openDroppedPath(nextPath);
  }

  function handleDropOverlayInputDrop(event: DragEvent<HTMLInputElement>) {
    event.stopPropagation();
    const target = event.currentTarget;
    const dataTransfer = event.dataTransfer;
    window.requestAnimationFrame(() => {
      const insertedPath = pathFromDroppedText(target.value);
      target.value = "";
      if (insertedPath) {
        dragDepthRef.current = 0;
        setDropActive(false);
        openDroppedPath(insertedPath);
        return;
      }
      void (async () => {
        const nextPath = await extractDroppedPathFromDataTransfer(dataTransfer);
        if (!nextPath) {
          dragDepthRef.current = 0;
          setDropActive(false);
          setDropFailureStatus(dataTransfer);
          return;
        }
        dragDepthRef.current = 0;
        setDropActive(false);
        openDroppedPath(nextPath);
      })();
    });
  }

  if (!route.path) {
    return (
      <div
        className={`page-shell page-shell-home ${dropActive ? "page-shell-drop-active" : ""}`}
        onDragEnter={handleDropTargetDragEnter}
        onDragOver={handleDropTargetDragOver}
        onDragLeave={handleDropTargetDragLeave}
      >
        {dropActive ? (
          <div className="page-drop-overlay">
            <input
              ref={dropInputRef}
              className="page-drop-overlay-input"
              aria-label="Drop a file path"
              placeholder="Drop the file directly on this textbox to open its absolute path"
              onChange={handleDropOverlayInputChange}
              onDrop={handleDropOverlayInputDrop}
            />
          </div>
        ) : null}
        <header className="page-header">
          <div>
            <p className="eyebrow">Server-backed local files</p>
            <h1>AgentPad</h1>
            <p className="page-subtitle">{status}</p>
          </div>
          <label className="inline-field">
            <span>Name</span>
            <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Display name" />
          </label>
        </header>

        <main className="docs-page">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Open</p>
                <h2>Local file</h2>
              </div>
            </div>

            <form className={`drop-zone open-surface ${dropActive ? "drop-zone-active" : ""}`} onSubmit={handleOpenSubmit}>
              <div className="open-surface-copy">
                <h3>Drop a file directly on the textbox or paste a path</h3>
                <p>AgentPad edits the original file and keeps collaboration metadata in `~/.agentpad`.</p>
              </div>

              <label className="stacked-field open-surface-field">
                <span>Absolute path</span>
                <div className="open-surface-controls">
                  <input
                    value={openPath}
                    onChange={(event) => setOpenPath(event.target.value)}
                    placeholder="Drop a file on this textbox or paste /Users/you/Documents/note.md"
                  />
                  <button className="button" type="submit">
                    Open file
                  </button>
                </div>
              </label>
            </form>
          </section>
        </main>
      </div>
    );
  }

  const docLayoutStyle = {
    "--comments-sidebar-width": `${commentsWidth}px`,
  } as CSSProperties;
  const commentsToggleLabel = commentsCollapsed ? `Show comments (${orderedThreads.length})` : "Hide comments";

  return (
    <div
      className={`page-shell page-shell-doc ${dropActive ? "page-shell-drop-active" : ""}`}
      onDragEnter={handleDropTargetDragEnter}
      onDragOver={handleDropTargetDragOver}
      onDragLeave={handleDropTargetDragLeave}
    >
      {dropActive ? (
        <div className="page-drop-overlay">
          <input
            ref={dropInputRef}
            className="page-drop-overlay-input"
            aria-label="Drop a file path"
            placeholder="Drop the file directly on this textbox to open its absolute path"
            onChange={handleDropOverlayInputChange}
            onDrop={handleDropOverlayInputDrop}
          />
        </div>
      ) : null}
      <header className="doc-header">
        <div className="doc-header-main">
          <button className="button secondary" onClick={clearRoute}>
            Open
          </button>
          <div className="doc-header-copy">
            <div className="doc-title-row">
              <p className="eyebrow">File</p>
              <h1>{currentDoc?.title ?? "Loading file..."}</h1>
            </div>
            <div className="doc-meta-row">
              <span>{status}</span>
              {currentDoc ? (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="doc-path" title={currentDoc.id}>
                    {currentDoc.id}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="doc-header-actions">
          <div className="doc-header-controls">
            <div className="presence-strip">
              {presence.length === 0 ? (
                <span className="status-tag muted">Just you</span>
              ) : (
                presence.map((person) => (
                  <span key={person.session_id} className="status-tag">
                    {person.name}
                  </span>
                ))
              )}
            </div>
            <label className="inline-field compact">
              <span>Name</span>
              <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Display name" />
            </label>
            <button className="button secondary" onClick={() => setCommentsCollapsed((current) => !current)} aria-pressed={!commentsCollapsed}>
              {commentsToggleLabel}
            </button>
            <button className="button secondary" onClick={() => void copyLink()}>
              Copy link
            </button>
          </div>
        </div>
      </header>

      <main className={`doc-layout ${commentsCollapsed ? "doc-layout-comments-collapsed" : ""}`} style={docLayoutStyle}>
        <section className="doc-editor-column">
          {selection ? (
            <div className="selection-composer" style={composerStyle}>
              <p className="composer-label">Add comment</p>
              {selectionPreview ? <p className="composer-quote">"{selectionPreview}"</p> : null}
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                rows={3}
                placeholder="Write a comment on this selection"
              />
              <div className="panel-actions">
                <button className="button" onClick={() => void createThread()}>
                  Comment
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSelection(null);
                    setCommentBody("");
                    editorRef.current?.clearSelection();
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <EditorPane
            ref={editorRef}
            document={currentDoc}
            actor={actor}
            threads={orderedThreads}
            activeThreadId={activeThreadId}
            onThreadSelect={openThread}
            onSelectionChange={setSelection}
            onPresenceChange={setPresence}
            onRevisionChange={handleRevisionChange}
            onDocumentArtifactHint={handleDocumentArtifactHint}
            onThreadsArtifactHint={handleThreadsArtifactHint}
            onStatus={setStatus}
          />
        </section>

        {!commentsCollapsed ? (
          <>
            <div
              className="comments-resizer"
              role="separator"
              aria-label="Resize comments sidebar"
              aria-orientation="vertical"
              aria-valuemin={MIN_COMMENTS_WIDTH}
              aria-valuemax={getCommentsWidthMax(window.innerWidth)}
              aria-valuenow={commentsWidth}
              onPointerDown={startCommentsResize}
            />

            <aside className="comments-sidebar">
              <div className="comments-sidebar-header">
                <div>
                  <p className="eyebrow">Discussion</p>
                  <h2>Comments</h2>
                </div>
                <span className="status-tag">{orderedThreads.length}</span>
              </div>

              {orderedThreads.length === 0 ? (
                <div className="empty-state">
                  <h3>No comments yet</h3>
                  <p>Select text in the editor to start a thread.</p>
                </div>
              ) : (
                <div className="thread-list">
                  {orderedThreads.map((thread) => {
                    const isActive = thread.id === activeThreadId;
                    const unreadCommentCount = (thread.comments ?? []).filter((comment) => unreadCommentIds.has(comment.id)).length;
                    const isUnread = unreadThreadIds.has(thread.id) || unreadCommentCount > 0;
                    return (
                      <article
                        key={thread.id}
                        className={`thread-card ${isActive ? "thread-card-active" : ""} ${isUnread ? "thread-card-unread" : ""}`}
                        data-thread-card={thread.id}
                      >
                        <div className="thread-card-header">
                          <span className={`thread-state ${thread.status === "resolved" ? "thread-state-resolved" : ""}`}>{thread.status}</span>
                          <div className="thread-meta">
                            <span>{thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}</span>
                            {unreadCommentCount > 0 ? <span className="thread-unread-badge">{unreadCommentCount} new</span> : null}
                            <span>{formatTimestamp(thread.updated_at)}</span>
                          </div>
                        </div>

                        <blockquote className="thread-quote-block">
                          <button
                            className={`thread-quote-button ${isUnread ? "thread-quote-button-unread" : ""}`}
                            onClick={() => openThread(thread.id)}
                            title={thread.anchor.quote}
                          >
                            <span className="thread-quote">{formatQuote(thread)}</span>
                          </button>
                        </blockquote>

                        {isActive ? (
                          <div className="thread-detail">
                            <div className="comment-list">
                              {(thread.comments ?? []).map((comment) => (
                                <div
                                  key={comment.id}
                                  className={`comment-bubble ${unreadCommentIds.has(comment.id) ? "comment-bubble-unread" : ""}`}
                                >
                                  <div className="comment-bubble-meta">
                                    <strong>{comment.author}</strong>
                                    <span>{formatTimestamp(comment.created_at)}</span>
                                  </div>
                                  <p>{comment.body}</p>
                                </div>
                              ))}
                            </div>

                            <textarea
                              rows={3}
                              value={replyDrafts[thread.id] ?? ""}
                              onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))}
                              placeholder="Reply to this thread"
                            />

                            <div className="panel-actions thread-detail-actions">
                              <button className="button" onClick={() => void replyThread(thread.id)}>
                                Reply
                              </button>
                              {thread.status === "open" ? (
                                <button className="button secondary" onClick={() => void setThreadStatus(thread.id, "resolve")}>
                                  Resolve
                                </button>
                              ) : (
                                <button className="button secondary" onClick={() => void setThreadStatus(thread.id, "reopen")}>
                                  Reopen
                                </button>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}

              {activeThread ? <div className="sidebar-footer">Active thread by {activeThread.author}</div> : null}
            </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
