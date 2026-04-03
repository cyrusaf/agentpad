import { describe, expect, it, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";

import { buildRemoteArtifactsForOperation, getRemoteArtifactTitle, mapRemoteArtifacts, resetRemoteArtifactIDs } from "./remoteArtifacts";
import { applyOperation } from "./ot";
import type { Operation } from "./types";

describe("remoteArtifacts", () => {
  beforeEach(() => {
    resetRemoteArtifactIDs();
  });

  it("creates an insert artifact for remote inserts", () => {
    const source = "Alpha beta";
    const op: Operation = {
      position: 5,
      delete_count: 0,
      insert_text: " brave",
      base_revision: 0,
      author: "pair",
    };

    const next = applyOperation(source, op);
    const artifacts = buildRemoteArtifactsForOperation(source, next, op);

    expect(artifacts).toEqual([
      {
        id: "remote-artifact-1",
        kind: "insert",
        author: "pair",
        from: 5,
        to: 11,
      },
    ]);
  });

  it("creates replace and delete artifacts for replacements", () => {
    const source = "Alpha beta";
    const op: Operation = {
      position: 6,
      delete_count: 4,
      insert_text: "crew",
      base_revision: 0,
      author: "pair",
    };

    const next = applyOperation(source, op);
    const artifacts = buildRemoteArtifactsForOperation(source, next, op);

    expect(artifacts).toEqual([
      {
        id: "remote-artifact-1",
        kind: "replace",
        author: "pair",
        from: 6,
        to: 10,
      },
      {
        id: "remote-artifact-2",
        kind: "delete",
        author: "pair",
        position: 10,
        text: "beta",
      },
    ]);
  });

  it("uses token-level replacement artifacts instead of whole-span highlights", () => {
    const source = "Alpha beta gamma.";
    const op: Operation = {
      position: 0,
      delete_count: source.length,
      insert_text: "Alpha brave beta gamma.",
      base_revision: 0,
      author: "pair",
    };

    const next = applyOperation(source, op);
    const artifacts = buildRemoteArtifactsForOperation(source, next, op);

    expect(artifacts).toEqual([
      {
        id: "remote-artifact-1",
        kind: "insert",
        author: "pair",
        from: 6,
        to: 12,
      },
    ]);
  });

  it("anchors replacement artifacts at the changed token subsection", () => {
    const source = "Second paragraph for replacement testing.";
    const op: Operation = {
      position: 0,
      delete_count: source.length,
      insert_text: "Second paragraph for swap testing.",
      base_revision: 0,
      author: "pair",
    };

    const next = applyOperation(source, op);
    const artifacts = buildRemoteArtifactsForOperation(source, next, op);

    expect(artifacts).toEqual([
      {
        id: "remote-artifact-1",
        kind: "replace",
        author: "pair",
        from: 21,
        to: 25,
      },
      {
        id: "remote-artifact-2",
        kind: "delete",
        author: "pair",
        position: 25,
        text: "replacement",
      },
    ]);
  });

  it("creates a delete artifact for delete-only operations", () => {
    const source = "Alpha beta";
    const op: Operation = {
      position: 6,
      delete_count: 4,
      insert_text: "",
      base_revision: 0,
      author: "pair",
    };

    const next = applyOperation(source, op);
    const artifacts = buildRemoteArtifactsForOperation(source, next, op);

    expect(artifacts).toEqual([
      {
        id: "remote-artifact-1",
        kind: "delete",
        author: "pair",
        position: 6,
        text: "beta",
      },
    ]);
  });

  it("maps existing artifacts through later edits without expanding them to new boundary inserts", () => {
    const state = EditorState.create({ doc: "Alpha beta" });
    const transaction = state.update({
      changes: { from: 6, to: 6, insert: "remote " },
    });

    const mapped = mapRemoteArtifacts(
      [
        {
          id: "remote-artifact-1",
          kind: "insert",
          author: "pair",
          from: 6,
          to: 10,
        },
        {
          id: "remote-artifact-2",
          kind: "delete",
          author: "pair",
          position: 6,
          text: "beta",
        },
      ],
      transaction.changes,
    );

    expect(mapped).toEqual([
      {
        id: "remote-artifact-1",
        kind: "insert",
        author: "pair",
        from: 13,
        to: 17,
      },
      {
        id: "remote-artifact-2",
        kind: "delete",
        author: "pair",
        position: 6,
        text: "beta",
      },
    ]);
  });

  it("drops mark artifacts that collapse to zero width", () => {
    const state = EditorState.create({ doc: "Alpha beta" });
    const transaction = state.update({
      changes: { from: 6, to: 10, insert: "" },
    });

    const mapped = mapRemoteArtifacts(
      [
        {
          id: "remote-artifact-1",
          kind: "insert",
          author: "pair",
          from: 6,
          to: 10,
        },
      ],
      transaction.changes,
    );

    expect(mapped).toEqual([]);
  });

  it("formats artifact titles by kind", () => {
    expect(getRemoteArtifactTitle({ kind: "insert", author: "pair" })).toBe("Edited by pair");
    expect(getRemoteArtifactTitle({ kind: "delete", author: "pair" })).toBe("Deleted by pair");
  });
});
