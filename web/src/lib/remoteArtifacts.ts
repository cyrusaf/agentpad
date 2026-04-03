import type { ChangeDesc } from "@codemirror/state";
import { diffWordsWithSpace, type Change } from "diff";

import type { Operation } from "./types";
import { runeLength, sliceByCodePoint, toCodeUnitOffset } from "./ot";

export type RemoteArtifactKind = "insert" | "replace" | "delete";

export interface RemoteInsertArtifact {
  id: string;
  kind: "insert" | "replace";
  author: string;
  from: number;
  to: number;
}

export interface RemoteDeleteArtifact {
  id: string;
  kind: "delete";
  author: string;
  position: number;
  text: string;
}

export type RemoteArtifact = RemoteInsertArtifact | RemoteDeleteArtifact;

let nextRemoteArtifactID = 0;

function createRemoteArtifactID() {
  nextRemoteArtifactID += 1;
  return `remote-artifact-${nextRemoteArtifactID}`;
}

export function resetRemoteArtifactIDs() {
  nextRemoteArtifactID = 0;
}

export function getRemoteArtifactTitle(artifact: Pick<RemoteArtifact, "author" | "kind">) {
  if (artifact.kind === "delete") {
    return `Deleted by ${artifact.author}`;
  }
  return `Edited by ${artifact.author}`;
}

interface ChangeGroup {
  addedText: string[];
  removedText: string[];
  unchangedText: string;
}

function groupChanges(changes: Change[]) {
  const groups: ChangeGroup[] = [];
  let pending: ChangeGroup | null = null;

  for (const change of changes) {
    if (!change.added && !change.removed) {
      if (pending) {
        groups.push(pending);
        pending = null;
      }
      groups.push({
        addedText: [],
        removedText: [],
        unchangedText: change.value,
      });
      continue;
    }

    if (!pending) {
      pending = {
        addedText: [],
        removedText: [],
        unchangedText: "",
      };
    }

    if (change.added) {
      pending.addedText.push(change.value);
    } else if (change.removed) {
      pending.removedText.push(change.value);
    }
  }

  if (pending) {
    groups.push(pending);
  }

  return groups;
}

function buildReplacementArtifacts(nextSource: string, author: string, position: number, previousText: string, insertedText: string) {
  const changes = diffWordsWithSpace(previousText, insertedText);
  const groups = groupChanges(changes);
  const artifacts: RemoteArtifact[] = [];
  let nextPosition = position;

  for (const group of groups) {
    if (group.unchangedText) {
      const length = runeLength(group.unchangedText);
      nextPosition += length;
      continue;
    }

    const addedLength = group.addedText.reduce((sum, value) => sum + runeLength(value), 0);
    const hasRemoved = group.removedText.length > 0;
    const deletePosition = nextPosition + addedLength;

    for (const value of group.addedText) {
      const length = runeLength(value);
      const from = toCodeUnitOffset(nextSource, nextPosition);
      const to = toCodeUnitOffset(nextSource, nextPosition + length);
      if (from < to) {
        artifacts.push({
          id: createRemoteArtifactID(),
          kind: hasRemoved ? "replace" : "insert",
          author,
          from,
          to,
        });
      }
      nextPosition += length;
    }

    for (const value of group.removedText) {
      artifacts.push({
        id: createRemoteArtifactID(),
        kind: "delete",
        author,
        position: toCodeUnitOffset(nextSource, deletePosition),
        text: value,
      });
    }
  }

  return artifacts;
}

export function buildRemoteArtifactsForOperation(previousSource: string, nextSource: string, op: Operation): RemoteArtifact[] {
  const author = op.author?.trim() || "Someone else";
  const deletedText = op.delete_count > 0 ? sliceByCodePoint(previousSource, op.position, op.position + op.delete_count) : "";
  const artifacts: RemoteArtifact[] = [];

  if (deletedText && op.insert_text) {
    return buildReplacementArtifacts(nextSource, author, op.position, deletedText, op.insert_text);
  }

  const insertedLength = runeLength(op.insert_text);
  if (insertedLength > 0) {
    const from = toCodeUnitOffset(nextSource, op.position);
    const to = toCodeUnitOffset(nextSource, op.position + insertedLength);
    if (from < to) {
      artifacts.push({
        id: createRemoteArtifactID(),
        kind: "insert",
        author,
        from,
        to,
      });
    }
  }

  if (deletedText) {
    artifacts.push({
      id: createRemoteArtifactID(),
      kind: "delete",
      author,
      position: toCodeUnitOffset(nextSource, op.position),
      text: deletedText,
    });
  }

  return artifacts;
}

export function mapRemoteArtifacts(artifacts: RemoteArtifact[], changes: ChangeDesc) {
  return artifacts.flatMap((artifact) => {
    if (artifact.kind === "delete") {
      return {
        ...artifact,
        position: changes.mapPos(artifact.position, -1),
      };
    }

    const from = changes.mapPos(artifact.from, 1);
    const to = changes.mapPos(artifact.to, -1);
    if (from >= to) {
      return [];
    }
    return {
      ...artifact,
      from,
      to,
    };
  });
}
