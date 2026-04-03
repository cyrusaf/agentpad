package collab

import "testing"

func TestTransformAgainstInsertBefore(t *testing.T) {
	prior := Op{Position: 2, DeleteCount: 0, InsertText: "XY"}
	incoming := Op{Position: 5, DeleteCount: 1, InsertText: "Z"}
	got := TransformAgainst(incoming, prior)
	if got.Position != 7 {
		t.Fatalf("expected rebased position 7, got %d", got.Position)
	}
}

func TestApply(t *testing.T) {
	got, err := Apply("hello world", Op{Position: 6, DeleteCount: 5, InsertText: "teammates"})
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if got != "hello teammates" {
		t.Fatalf("unexpected result: %q", got)
	}
}
