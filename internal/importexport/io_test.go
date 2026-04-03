package importexport

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cyrusaf/agentpad/internal/domain"
)

func TestImportHTMLNormalizesToMarkdown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.html")
	if err := os.WriteFile(path, []byte("<h1>Hello</h1><p>World</p>"), 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	imported, err := ImportFile(path)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	if imported.Format != domain.DocumentFormatMarkdown {
		t.Fatalf("expected markdown format, got %s", imported.Format)
	}
	if !strings.Contains(imported.Source, "Hello") {
		t.Fatalf("expected converted markdown content, got %q", imported.Source)
	}
	if len(imported.Warnings) == 0 {
		t.Fatalf("expected import warning")
	}
}
