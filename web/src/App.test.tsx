import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const editorPaneMock = vi.hoisted(() => vi.fn());

vi.mock("./components/EditorPane", () => ({
  EditorPane: (props: unknown) => {
    editorPaneMock(props);
    return <div data-testid="editor-pane">editor</div>;
  },
}));

import App, { extractDroppedPathFromDataTransfer } from "./App";
import type { Thread } from "./lib/types";

const filePath = "/Users/tester/spec.md";
const mockDocument = {
  id: filePath,
  title: "spec",
  format: "markdown",
  source: "# Title\n\nHello world",
  revision: 0,
  blocks: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: overrides.id ?? "thread-1",
    document_id: overrides.document_id ?? filePath,
    anchor: overrides.anchor ?? {
      block_id: "block-1",
      start: 0,
      end: 5,
      doc_start: 0,
      doc_end: 5,
      quote: "Hello",
      revision: 0,
      resolved: true,
    },
    status: overrides.status ?? "open",
    author: overrides.author ?? "tester",
    comments: overrides.comments ?? [
      {
        id: `${overrides.id ?? "thread-1"}-comment-1`,
        thread_id: overrides.id ?? "thread-1",
        author: "tester",
        body: "Comment body",
        created_at: new Date().toISOString(),
      },
    ],
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

describe("App", () => {
  beforeEach(() => {
    editorPaneMock.mockClear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.history.replaceState({}, "", "/");
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/api/files/open")) {
        return new Response(JSON.stringify(mockDocument), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/files/threads")) {
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/files/activity")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  it("opens a document from the landing page", async () => {
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/users\/you\/documents/i), {
      target: { value: filePath },
    });
    fireEvent.click(screen.getByRole("button", { name: /open file/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Comments" })).toBeTruthy());
    expect(screen.getByTestId("editor-pane")).toBeTruthy();
  });

  it("extracts a file path from a comment-prefixed uri list", async () => {
    const path = await extractDroppedPathFromDataTransfer({
      files: [] as unknown as FileList,
      getData: (type: string) => (type === "text/uri-list" ? "# Finder selection\r\nfile:///Users/tester/spec.md\r\n" : ""),
    });

    expect(path).toBe("/Users/tester/spec.md");
  });

  it("extracts a file path from browser-specific drop formats", async () => {
    const path = await extractDroppedPathFromDataTransfer({
      files: [] as unknown as FileList,
      getData: (type: string) => {
        if (type === "DownloadURL") {
          return "text/markdown:spec.md:file:///Users/tester/spec.md";
        }
        if (type === "text/x-moz-url") {
          return "file:///Users/tester/ignored.md\nignored.md";
        }
        return "";
      },
    });

    expect(path).toBe("/Users/tester/spec.md");
  });

  it("shows open threads by default and lets you switch to resolved threads", async () => {
    const threads = [
      makeThread({
        id: "thread-open",
        status: "open",
        anchor: {
          block_id: "block-open",
          start: 0,
          end: 5,
          doc_start: 0,
          doc_end: 5,
          quote: "Open quote",
          revision: 0,
          resolved: true,
        },
      }),
      makeThread({
        id: "thread-resolved",
        status: "resolved",
        anchor: {
          block_id: "block-resolved",
          start: 6,
          end: 14,
          doc_start: 6,
          doc_end: 14,
          quote: "Resolved quote",
          revision: 0,
          resolved: true,
        },
        comments: [
          {
            id: "thread-resolved-comment-1",
            thread_id: "thread-resolved",
            author: "tester",
            body: "Resolved body",
            created_at: new Date().toISOString(),
          },
        ],
      }),
    ];

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/api/files/open")) {
        return new Response(JSON.stringify(mockDocument), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/files/threads")) {
        return new Response(JSON.stringify(threads), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/files/activity")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/users\/you\/documents/i), {
      target: { value: filePath },
    });
    fireEvent.click(screen.getByRole("button", { name: /open file/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Comments" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Open quote")).toBeTruthy());
    expect(screen.queryByText("Resolved quote")).toBeNull();
    await waitFor(() => {
      const props = editorPaneMock.mock.calls.at(-1)?.[0] as { threads: Thread[] } | undefined;
      expect(props?.threads.map((thread) => thread.id)).toEqual(["thread-open"]);
    });

    fireEvent.click(screen.getByRole("tab", { name: /resolved/i }));

    await waitFor(() => expect(screen.getByText("Resolved quote")).toBeTruthy());
    expect(screen.queryByText("Open quote")).toBeNull();
    await waitFor(() => {
      const props = editorPaneMock.mock.calls.at(-1)?.[0] as { threads: Thread[] } | undefined;
      expect(props?.threads).toEqual([]);
    });

    fireEvent.click(screen.getByRole("button", { name: /resolved quote/i }));

    await waitFor(() => {
      const props = editorPaneMock.mock.calls.at(-1)?.[0] as { threads: Thread[] } | undefined;
      expect(props?.threads.map((thread) => thread.id)).toEqual(["thread-resolved"]);
    });
  });
});
