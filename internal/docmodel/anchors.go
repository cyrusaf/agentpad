package docmodel

import (
	"strings"

	"github.com/cyrusaf/agentpad/internal/collab"
	"github.com/cyrusaf/agentpad/internal/domain"
)

func AnchorFromSelection(doc domain.Document, start, end int) (*domain.Anchor, error) {
	if start < 0 || end < start || end > len([]rune(doc.Source)) {
		return nil, domain.NewError(domain.ErrCodeInvalidAnchor, "selection is out of bounds", 400)
	}
	blocks := doc.Blocks
	if len(blocks) == 0 {
		blocks = BuildBlocks(doc.Format, doc.Source, nil)
	}
	var block domain.Block
	found := false
	for _, candidate := range blocks {
		if start >= candidate.Start && end <= candidate.End {
			block = candidate
			found = true
			break
		}
	}
	if !found && len(blocks) > 0 {
		block = blocks[0]
	}
	sourceRunes := []rune(doc.Source)
	quote := string(sourceRunes[start:end])
	prefixStart := max(0, start-20)
	suffixEnd := min(len(sourceRunes), end+20)
	anchor := &domain.Anchor{
		BlockID:  block.ID,
		Start:    start - block.Start,
		End:      end - block.Start,
		DocStart: start,
		DocEnd:   end,
		Quote:    quote,
		Prefix:   string(sourceRunes[prefixStart:start]),
		Suffix:   string(sourceRunes[end:suffixEnd]),
		Revision: doc.Revision,
	}
	return anchor, nil
}

func ResolveAnchor(doc domain.Document, anchor domain.Anchor, history []collab.Op) (domain.Anchor, error) {
	current := anchor
	start := anchor.DocStart
	end := anchor.DocEnd
	for _, op := range history {
		start = collab.TransformPosition(start, op, false)
		end = collab.TransformPosition(end, op, true)
	}
	current.DocStart = start
	current.DocEnd = end
	if end < start {
		end = start
	}

	docRunes := []rune(doc.Source)
	if start >= 0 && end <= len(docRunes) && start <= end {
		quote := string(docRunes[start:end])
		if quote == anchor.Quote || strings.TrimSpace(anchor.Quote) == "" {
			applyResolvedBlock(doc.Blocks, &current, start, end)
			current.Quote = quote
			current.Resolved = true
			return current, nil
		}
	}

	if repaired, ok := repairByQuote(doc, anchor); ok {
		return repaired, nil
	}
	return current, domain.NewError(domain.ErrCodeInvalidAnchor, "anchor could not be resolved", 400)
}

func repairByQuote(doc domain.Document, anchor domain.Anchor) (domain.Anchor, bool) {
	candidates := make([]domain.Block, 0, len(doc.Blocks))
	for _, block := range doc.Blocks {
		if block.ID == anchor.BlockID {
			candidates = append(candidates, block)
		}
	}
	for _, block := range doc.Blocks {
		if block.ID != anchor.BlockID {
			candidates = append(candidates, block)
		}
	}
	for _, block := range candidates {
		blockRunes := []rune(block.Text)
		quoteRunes := []rune(anchor.Quote)
		if len(quoteRunes) == 0 || len(blockRunes) < len(quoteRunes) {
			continue
		}
		for idx := 0; idx+len(quoteRunes) <= len(blockRunes); idx++ {
			match := string(blockRunes[idx : idx+len(quoteRunes)])
			if match != anchor.Quote {
				continue
			}
			prefixOk := strings.HasSuffix(string(blockRunes[max(0, idx-len([]rune(anchor.Prefix))):idx]), anchor.Prefix)
			suffixEnd := min(len(blockRunes), idx+len(quoteRunes)+len([]rune(anchor.Suffix)))
			suffixOk := strings.HasPrefix(string(blockRunes[idx+len(quoteRunes):suffixEnd]), anchor.Suffix)
			if prefixOk || suffixOk {
				repaired := anchor
				repaired.Start = idx
				repaired.End = idx + len(quoteRunes)
				repaired.DocStart = block.Start + idx
				repaired.DocEnd = block.Start + idx + len(quoteRunes)
				repaired.BlockID = block.ID
				repaired.Resolved = true
				repaired.ResolvedBlockID = block.ID
				return repaired, true
			}
		}
	}
	return anchor, false
}

func applyResolvedBlock(blocks []domain.Block, anchor *domain.Anchor, docStart, docEnd int) {
	for _, block := range blocks {
		if docStart >= block.Start && docEnd <= block.End {
			anchor.BlockID = block.ID
			anchor.Start = docStart - block.Start
			anchor.End = docEnd - block.Start
			anchor.Resolved = true
			anchor.ResolvedBlockID = block.ID
			return
		}
	}
}
