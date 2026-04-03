import type { Thread } from "./types";

export interface ThreadUnreadDiff {
  threadIds: string[];
  commentIds: string[];
}

export interface ThreadUnreadState {
  threadIds: ReadonlySet<string>;
  commentIds: ReadonlySet<string>;
}

export function diffUnreadThreadActivity(
  previousThreads: Thread[],
  nextThreads: Thread[],
  actor: string,
  focusedThreadId: string | null,
): ThreadUnreadDiff {
  const previousByThreadID = new Map(previousThreads.map((thread) => [thread.id, thread]));
  const unreadThreadIDs = new Set<string>();
  const unreadCommentIDs = new Set<string>();

  for (const thread of nextThreads) {
    if (thread.id === focusedThreadId) {
      continue;
    }

    const previousThread = previousByThreadID.get(thread.id);
    const previousCommentIDs = new Set(previousThread?.comments.map((comment) => comment.id) ?? []);
    const newRemoteComments = thread.comments.filter((comment) => !previousCommentIDs.has(comment.id) && comment.author !== actor);

    if (!previousThread) {
      if (thread.author !== actor && newRemoteComments.length > 0) {
        unreadThreadIDs.add(thread.id);
        for (const comment of newRemoteComments) {
          unreadCommentIDs.add(comment.id);
        }
      }
      continue;
    }

    if (newRemoteComments.length > 0) {
      unreadThreadIDs.add(thread.id);
      for (const comment of newRemoteComments) {
        unreadCommentIDs.add(comment.id);
      }
    }
  }

  return {
    threadIds: [...unreadThreadIDs],
    commentIds: [...unreadCommentIDs],
  };
}

export function clearUnreadThreadState(threadId: string, threads: Thread[], unreadState: ThreadUnreadState) {
  const nextThreadIDs = new Set(unreadState.threadIds);
  const nextCommentIDs = new Set(unreadState.commentIds);
  const thread = threads.find((item) => item.id === threadId);
  const hadUnreadThread = nextThreadIDs.delete(threadId);
  let hadUnreadComments = false;

  for (const comment of thread?.comments ?? []) {
    if (nextCommentIDs.delete(comment.id)) {
      hadUnreadComments = true;
    }
  }

  if (!hadUnreadThread && !hadUnreadComments) {
    return unreadState;
  }

  return {
    threadIds: nextThreadIDs,
    commentIds: nextCommentIDs,
  };
}
