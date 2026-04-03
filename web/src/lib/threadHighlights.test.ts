import { describe, expect, it } from "vitest";

import { clearUnreadThreadState, diffUnreadThreadActivity } from "./threadHighlights";
import type { Thread } from "./types";

function makeThread(overrides: Partial<Thread> & Pick<Thread, "id">): Thread {
  return {
    id: overrides.id,
    document_id: "/tmp/doc.md",
    anchor: {
      block_id: "block",
      start: 0,
      end: 5,
      doc_start: 0,
      doc_end: 5,
      quote: "quote",
      revision: 0,
    },
    status: "open",
    author: "reviewer",
    comments: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("threadHighlights", () => {
  it("marks new remote threads and their initial comments unread", () => {
    const nextThreads = [
      makeThread({
        id: "thread-1",
        author: "reviewer",
        comments: [
          {
            id: "comment-1",
            thread_id: "thread-1",
            author: "reviewer",
            body: "Please update this",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ];

    expect(diffUnreadThreadActivity([], nextThreads, "browser-user", null)).toEqual({
      threadIds: ["thread-1"],
      commentIds: ["comment-1"],
    });
  });

  it("ignores self-authored replies", () => {
    const previousThreads = [
      makeThread({
        id: "thread-1",
        comments: [
          {
            id: "comment-1",
            thread_id: "thread-1",
            author: "reviewer",
            body: "Please update this",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ];
    const nextThreads = [
      makeThread({
        id: "thread-1",
        comments: [
          previousThreads[0].comments[0],
          {
            id: "comment-2",
            thread_id: "thread-1",
            author: "browser-user",
            body: "Handled",
            created_at: "2026-01-01T00:01:00Z",
          },
        ],
      }),
    ];

    expect(diffUnreadThreadActivity(previousThreads, nextThreads, "browser-user", null)).toEqual({
      threadIds: [],
      commentIds: [],
    });
  });

  it("does not mark focused threads unread", () => {
    const previousThreads = [
      makeThread({
        id: "thread-1",
        comments: [
          {
            id: "comment-1",
            thread_id: "thread-1",
            author: "reviewer",
            body: "Please update this",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ];
    const nextThreads = [
      makeThread({
        id: "thread-1",
        comments: [
          previousThreads[0].comments[0],
          {
            id: "comment-2",
            thread_id: "thread-1",
            author: "reviewer",
            body: "Another note",
            created_at: "2026-01-01T00:01:00Z",
          },
        ],
      }),
    ];

    expect(diffUnreadThreadActivity(previousThreads, nextThreads, "browser-user", "thread-1")).toEqual({
      threadIds: [],
      commentIds: [],
    });
  });

  it("clears a thread and all of its unread comments together", () => {
    const threads = [
      makeThread({
        id: "thread-1",
        comments: [
          {
            id: "comment-1",
            thread_id: "thread-1",
            author: "reviewer",
            body: "Please update this",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "comment-2",
            thread_id: "thread-1",
            author: "reviewer",
            body: "One more thought",
            created_at: "2026-01-01T00:01:00Z",
          },
        ],
      }),
    ];

    expect(
      clearUnreadThreadState("thread-1", threads, {
        threadIds: new Set(["thread-1"]),
        commentIds: new Set(["comment-1", "comment-2"]),
      }),
    ).toEqual({
      threadIds: new Set<string>(),
      commentIds: new Set<string>(),
    });
  });
});
