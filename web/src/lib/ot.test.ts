import { describe, expect, it } from "vitest";

import { toEditorChange } from "./ot";
import type { Operation } from "./types";

describe("toEditorChange", () => {
  it("converts code point operation offsets into CodeMirror code unit changes", () => {
    const source = "A🙂 beta";
    const op: Operation = {
      position: 2,
      delete_count: 4,
      insert_text: " crew",
      base_revision: 0,
    };

    expect(toEditorChange(source, op)).toEqual({
      from: 3,
      to: 7,
      insert: " crew",
    });
  });
});
