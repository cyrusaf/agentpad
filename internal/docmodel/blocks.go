package docmodel

import (
	"crypto/sha1"
	"encoding/hex"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/cyrusaf/agentpad/internal/domain"
)

type lineInfo struct {
	Text      string
	StartRune int
	EndRune   int
	Number    int
}

var orderedListRE = regexp.MustCompile(`^\d+\.\s+`)

func BuildBlocks(format domain.DocumentFormat, source string, previous []domain.Block) []domain.Block {
	if format == domain.DocumentFormatText || format == domain.DocumentFormatCode {
		block := domain.Block{
			Kind:      string(format),
			Start:     0,
			End:       utf8.RuneCountInString(source),
			Text:      source,
			Format:    format,
			LineStart: 1,
			LineEnd:   max(1, strings.Count(source, "\n")+1),
		}
		if len(previous) == 1 && previous[0].Kind == block.Kind {
			block.ID = previous[0].ID
		} else {
			block.ID = stableBlockID(block)
		}
		return []domain.Block{block}
	}

	lines := splitLines(source)
	candidates := parseMarkdownLike(lines)
	assignIDs(previous, candidates)
	return candidates
}

func splitLines(source string) []lineInfo {
	if source == "" {
		return []lineInfo{{Text: "", StartRune: 0, EndRune: 0, Number: 1}}
	}
	parts := strings.SplitAfter(source, "\n")
	lines := make([]lineInfo, 0, len(parts))
	offset := 0
	for i, part := range parts {
		lineLen := utf8.RuneCountInString(part)
		lines = append(lines, lineInfo{
			Text:      part,
			StartRune: offset,
			EndRune:   offset + lineLen,
			Number:    i + 1,
		})
		offset += lineLen
	}
	return lines
}

func parseMarkdownLike(lines []lineInfo) []domain.Block {
	var blocks []domain.Block
	for i := 0; i < len(lines); {
		line := lines[i]
		trimmed := strings.TrimSpace(line.Text)
		if trimmed == "" {
			i++
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, "```"):
			start := i
			lang := strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
			i++
			for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i].Text), "```") {
				i++
			}
			if i < len(lines) {
				i++
			}
			blocks = append(blocks, buildBlock(lines, start, i, "code", 0, lang))
		case headingLevel(trimmed) > 0:
			level := headingLevel(trimmed)
			blocks = append(blocks, buildBlock(lines, i, i+1, "heading", level, ""))
			i++
		case strings.HasPrefix(trimmed, ">"):
			start := i
			for i < len(lines) && strings.HasPrefix(strings.TrimSpace(lines[i].Text), ">") {
				i++
			}
			blocks = append(blocks, buildBlock(lines, start, i, "quote", 0, ""))
		case isListLine(trimmed):
			start := i
			for i < len(lines) && isListLine(strings.TrimSpace(lines[i].Text)) {
				i++
			}
			blocks = append(blocks, buildBlock(lines, start, i, "list", 0, ""))
		default:
			start := i
			for i < len(lines) && strings.TrimSpace(lines[i].Text) != "" && !strings.HasPrefix(strings.TrimSpace(lines[i].Text), "```") && headingLevel(strings.TrimSpace(lines[i].Text)) == 0 && !strings.HasPrefix(strings.TrimSpace(lines[i].Text), ">") && !isListLine(strings.TrimSpace(lines[i].Text)) {
				i++
			}
			blocks = append(blocks, buildBlock(lines, start, i, "paragraph", 0, ""))
		}
	}
	if len(blocks) == 0 {
		blocks = append(blocks, domain.Block{
			ID:        stableBlockID(domain.Block{Kind: "paragraph", Start: 0, End: 0, Text: "", LineStart: 1, LineEnd: 1}),
			Kind:      "paragraph",
			Start:     0,
			End:       0,
			Text:      "",
			LineStart: 1,
			LineEnd:   1,
		})
	}
	return blocks
}

func buildBlock(lines []lineInfo, start, end int, kind string, level int, language string) domain.Block {
	var sb strings.Builder
	for _, line := range lines[start:end] {
		sb.WriteString(line.Text)
	}
	block := domain.Block{
		Kind:      kind,
		Start:     lines[start].StartRune,
		End:       lines[end-1].EndRune,
		Text:      sb.String(),
		Level:     level,
		Language:  language,
		Format:    domain.DocumentFormatMarkdown,
		LineStart: lines[start].Number,
		LineEnd:   lines[end-1].Number,
	}
	block.ID = stableBlockID(block)
	return block
}

func headingLevel(line string) int {
	count := 0
	for _, r := range line {
		if r == '#' {
			count++
			continue
		}
		break
	}
	if count > 0 && count < 7 {
		return count
	}
	return 0
}

func isListLine(line string) bool {
	return strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") || strings.HasPrefix(line, "+ ") || orderedListRE.MatchString(line)
}

func assignIDs(previous, next []domain.Block) {
	used := map[string]bool{}
	for i := range next {
		bestID := ""
		bestScore := -1
		for _, prev := range previous {
			if used[prev.ID] || prev.Kind != next[i].Kind {
				continue
			}
			score := similarity(prev, next[i])
			if score > bestScore {
				bestScore = score
				bestID = prev.ID
			}
		}
		if bestScore >= 25 && bestID != "" {
			next[i].ID = bestID
			next[i].CreatedFrom = "preserved"
			used[bestID] = true
		}
	}
}

func similarity(a, b domain.Block) int {
	score := 0
	if normalize(a.Text) == normalize(b.Text) {
		score += 100
	}
	if overlap(a.Start, a.End, b.Start, b.End) > 0 {
		score += overlap(a.Start, a.End, b.Start, b.End) * 50 / max(1, max(a.End-a.Start, b.End-b.Start))
	}
	score += prefixSimilarity(a.Text, b.Text)
	if abs(a.Start-b.Start) < 40 {
		score += 10
	}
	return score
}

func normalize(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	var sb strings.Builder
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func prefixSimilarity(a, b string) int {
	ar, br := []rune(a), []rune(b)
	limit := min(len(ar), len(br))
	match := 0
	for i := 0; i < limit; i++ {
		if ar[i] != br[i] {
			break
		}
		match++
	}
	return match * 30 / max(1, max(len(ar), len(br)))
}

func overlap(aStart, aEnd, bStart, bEnd int) int {
	start := max(aStart, bStart)
	end := min(aEnd, bEnd)
	if end <= start {
		return 0
	}
	return end - start
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func stableBlockID(block domain.Block) string {
	sum := sha1.Sum([]byte(strings.Join([]string{
		block.Kind,
		block.Text,
		block.Language,
		string(block.Format),
		strings.TrimSpace(strings.Join([]string{
			strconv.Itoa(block.Start),
			strconv.Itoa(block.End),
			strconv.Itoa(block.LineStart),
			strconv.Itoa(block.LineEnd),
			strconv.Itoa(block.Level),
		}, ":")),
	}, "\x00")))
	return "block-" + hex.EncodeToString(sum[:8])
}
