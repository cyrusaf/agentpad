import type {
  ActivityEvent,
  Document,
  Thread,
} from "./types";

const API_BASE = (import.meta.env.VITE_AGENTPAD_API as string | undefined)?.replace(/\/$/, "") ?? "";

function buildURL(path: string, query?: Record<string, string>) {
  const base = API_BASE || window.location.origin;
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return API_BASE ? url.toString() : `${url.pathname}${url.search}`;
}

async function request<T>(path: string, init?: RequestInit, actor?: string, query?: Record<string, string>): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-AgentPad-Actor", actor ?? localStorage.getItem("agentpad.actor") ?? "browser-user");
  const response = await fetch(buildURL(path, query), {
    ...init,
    headers,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(err.message ?? err.code ?? `Request failed with status ${response.status}`);
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return (await response.text()) as T;
}

export const api = {
  openFile: (path: string) => request<Document>("/api/files/open", undefined, undefined, { path }),
  readFile: (path: string, params: Record<string, string> = {}) =>
    request("/api/files/read", undefined, undefined, { path, ...params }),
  exportFile: async (path: string, format: string) => {
    const response = await fetch(buildURL("/api/files/export", { path, format }), {
      headers: {
        "X-AgentPad-Actor": localStorage.getItem("agentpad.actor") ?? "browser-user",
      },
    });
    if (!response.ok) {
      throw new Error("Export failed");
    }
    return response.blob();
  },
  listThreads: (path: string) => request<Thread[]>("/api/files/threads", undefined, undefined, { path }),
  createThread: (path: string, payload: { body: string; start: number; end: number }) =>
    request<Thread>("/api/files/threads", { method: "POST", body: JSON.stringify({ path, ...payload }) }),
  replyThread: (path: string, threadID: string, body: string) =>
    request<{ thread: Thread }>("/api/files/thread-replies", {
      method: "POST",
      body: JSON.stringify({ path, thread_id: threadID, body }),
    }),
  resolveThread: (path: string, threadID: string) =>
    request<Thread>("/api/files/thread-resolve", {
      method: "POST",
      body: JSON.stringify({ path, thread_id: threadID }),
    }),
  reopenThread: (path: string, threadID: string) =>
    request<Thread>("/api/files/thread-reopen", {
      method: "POST",
      body: JSON.stringify({ path, thread_id: threadID }),
    }),
  listActivity: (path: string) => request<ActivityEvent[]>("/api/files/activity", undefined, undefined, { path }),
};

export function wsURL(path: string, actor: string) {
  const base = API_BASE || window.location.origin;
  const url = new URL(`${base}/api/files/live`);
  url.searchParams.set("path", path);
  url.searchParams.set("name", actor);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
