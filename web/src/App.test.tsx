import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/EditorPane", () => ({
  EditorPane: () => <div data-testid="editor-pane">editor</div>,
}));

import App, { extractDroppedPathFromDataTransfer } from "./App";

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

describe("App", () => {
  beforeEach(() => {
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

  it("extracts a file path from a comment-prefixed uri list", () => {
    const path = extractDroppedPathFromDataTransfer({
      files: [] as unknown as FileList,
      getData: (type: string) => (type === "text/uri-list" ? "# Finder selection\r\nfile:///Users/tester/spec.md\r\n" : ""),
    });

    expect(path).toBe("/Users/tester/spec.md");
  });

  it("extracts a file path from browser-specific drop formats", () => {
    const path = extractDroppedPathFromDataTransfer({
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
});
