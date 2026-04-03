package collab

import (
	"fmt"
	"unicode/utf8"
)

type Op struct {
	Position     int    `json:"position"`
	DeleteCount  int    `json:"delete_count"`
	InsertText   string `json:"insert_text"`
	BaseRevision int64  `json:"base_revision"`
	Author       string `json:"author,omitempty"`
}

func RuneLen(text string) int {
	return utf8.RuneCountInString(text)
}

func Apply(source string, op Op) (string, error) {
	runes := []rune(source)
	if op.Position < 0 || op.Position > len(runes) {
		return "", fmt.Errorf("position %d out of bounds", op.Position)
	}
	if op.DeleteCount < 0 || op.Position+op.DeleteCount > len(runes) {
		return "", fmt.Errorf("delete_count %d out of bounds", op.DeleteCount)
	}
	insert := []rune(op.InsertText)
	next := make([]rune, 0, len(runes)-op.DeleteCount+len(insert))
	next = append(next, runes[:op.Position]...)
	next = append(next, insert...)
	next = append(next, runes[op.Position+op.DeleteCount:]...)
	return string(next), nil
}

func TransformPosition(pos int, prior Op, stickRight bool) int {
	if pos < prior.Position {
		return pos
	}
	insertLen := RuneLen(prior.InsertText)
	delStart := prior.Position
	delEnd := prior.Position + prior.DeleteCount
	if prior.DeleteCount == 0 {
		if pos > prior.Position {
			return pos + insertLen
		}
		if stickRight {
			return pos + insertLen
		}
		return pos
	}
	if pos < delStart {
		return pos
	}
	if pos > delEnd {
		return pos + insertLen - prior.DeleteCount
	}
	if pos == delEnd {
		return delStart + insertLen
	}
	if stickRight {
		return delStart + insertLen
	}
	return delStart
}

func Rebase(op Op, history []Op) Op {
	current := op
	for _, prior := range history {
		current = TransformAgainst(current, prior)
	}
	return current
}

func TransformAgainst(incoming Op, prior Op) Op {
	start := TransformPosition(incoming.Position, prior, false)
	end := TransformPosition(incoming.Position+incoming.DeleteCount, prior, true)
	if end < start {
		end = start
	}
	incoming.Position = start
	incoming.DeleteCount = end - start
	return incoming
}
