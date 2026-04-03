package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cyrusaf/agentpad/internal/docmodel"
	"github.com/cyrusaf/agentpad/internal/server"
	"github.com/cyrusaf/agentpad/internal/store"
	"net/http/httptest"
)

func TestOpenJSON(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "one.md")
	if err := os.WriteFile(docPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("seed document: %v", err)
	}
	if _, err := st.OpenDocument(context.Background(), docPath, "tester"); err != nil {
		t.Fatalf("open document: %v", err)
	}

	app := server.New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{"--server", ts.URL, "--actor", "tester", "--json", "open", docPath})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}
	if !strings.Contains(stdout.String(), `"title": "one"`) {
		t.Fatalf("expected document in output, got %s", stdout.String())
	}
	if !strings.Contains(stdout.String(), `"url":`) {
		t.Fatalf("expected deep link in output, got %s", stdout.String())
	}
}

func TestOpenLaunchesBrowserForRelativePath(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	workDir := t.TempDir()
	docPath := filepath.Join(workDir, "plan.md")
	if err := os.WriteFile(docPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("seed document: %v", err)
	}

	app := server.New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	previousWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(workDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(previousWD)
	})

	var openedURL string
	previousOpener := browserOpener
	browserOpener = func(rawURL string) error {
		openedURL = rawURL
		return nil
	}
	t.Cleanup(func() {
		browserOpener = previousOpener
	})

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{"--server", ts.URL, "--actor", "tester", "open", "plan.md"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}

	resolvedPath, err := filepath.EvalSymlinks(docPath)
	if err != nil {
		resolvedPath = docPath
	}
	expectedURL := ts.URL + "/?path=" + url.QueryEscape(resolvedPath)
	if openedURL != expectedURL {
		t.Fatalf("expected browser opener to receive %s, got %s", expectedURL, openedURL)
	}
	if strings.TrimSpace(stdout.String()) != "" {
		t.Fatalf("expected no stdout output, got %s", stdout.String())
	}
}

func TestNameFlagOverridesActor(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "one.md")
	if err := os.WriteFile(docPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("seed document: %v", err)
	}
	if _, err := st.OpenDocument(context.Background(), docPath, "tester"); err != nil {
		t.Fatalf("open document: %v", err)
	}

	app := server.New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{"--server", ts.URL, "--name", "Codex", "--json", "threads", "create", docPath, "--start", "0", "--end", "5", "--body", "Check this"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}
	if !strings.Contains(stdout.String(), `"author": "Codex"`) {
		t.Fatalf("expected Codex author in output, got %s", stdout.String())
	}
}

func TestEditJSONAppliesAgentPadWrite(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "one.md")
	if err := os.WriteFile(docPath, []byte("# Title\n\nHello world"), 0o644); err != nil {
		t.Fatalf("seed document: %v", err)
	}

	app := server.New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{
		"--server", ts.URL,
		"--actor", "tester",
		"--json",
		"edit", docPath,
		"--start", "9",
		"--end", "14",
		"--text", "Team",
	})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}
	if !strings.Contains(stdout.String(), `"insert_text": "Team"`) {
		t.Fatalf("expected applied op in output, got %s", stdout.String())
	}

	body, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("read edited file: %v", err)
	}
	if !strings.Contains(string(body), "Team world") {
		t.Fatalf("expected on-disk document update, got %q", string(body))
	}
}

func TestReadJSONReturnsAnchorForQuote(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "one.md")
	if err := os.WriteFile(docPath, []byte("# Title\n\nAlpha plan.\n\nBeta plan.\n"), 0o644); err != nil {
		t.Fatalf("seed document: %v", err)
	}

	app := server.New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{
		"--server", ts.URL,
		"--actor", "tester",
		"--json",
		"read", docPath,
		"--quote", "plan",
		"--prefix", "Alpha ",
	})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}
	if !strings.Contains(stdout.String(), `"anchor":`) || !strings.Contains(stdout.String(), `"quote": "plan"`) {
		t.Fatalf("expected anchor in output, got %s", stdout.String())
	}
}

func TestEditJSONAppliesAnchorWrite(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "one.md")
	if err := os.WriteFile(docPath, []byte("# Title\n\nHello world"), 0o644); err != nil {
		t.Fatalf("seed document: %v", err)
	}
	doc, err := st.OpenDocument(context.Background(), docPath, "tester")
	if err != nil {
		t.Fatalf("open document: %v", err)
	}
	anchor, err := docmodel.AnchorFromSelection(doc, 9, 14)
	if err != nil {
		t.Fatalf("anchor selection: %v", err)
	}
	anchorPath := filepath.Join(t.TempDir(), "anchor.json")
	body, err := json.Marshal(anchor)
	if err != nil {
		t.Fatalf("marshal anchor: %v", err)
	}
	if err := os.WriteFile(anchorPath, body, 0o644); err != nil {
		t.Fatalf("write anchor file: %v", err)
	}

	app := server.New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{
		"--server", ts.URL,
		"--actor", "tester",
		"--json",
		"edit", docPath,
		"--anchor-file", anchorPath,
		"--text", "Team",
	})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}
	if !strings.Contains(stdout.String(), `"insert_text": "Team"`) {
		t.Fatalf("expected applied op in output, got %s", stdout.String())
	}

	updatedBody, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("read edited file: %v", err)
	}
	if !strings.Contains(string(updatedBody), "Team world") {
		t.Fatalf("expected on-disk document update, got %q", string(updatedBody))
	}
}

func TestInstallSkillWritesBundledFiles(t *testing.T) {
	targetSkillsDir := filepath.Join(t.TempDir(), "skills")

	cmd := NewRootCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stdout)
	cmd.SetArgs([]string{"--json", "install-skill", "--skills-dir", targetSkillsDir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute cli: %v", err)
	}

	skillDir := filepath.Join(targetSkillsDir, "agentpad")
	expectedFiles := []string{
		filepath.Join(skillDir, "SKILL.md"),
		filepath.Join(skillDir, "agents", "openai.yaml"),
		filepath.Join(skillDir, "references", "cli-reference.md"),
	}
	for _, path := range expectedFiles {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected installed file %s: %v", path, err)
		}
	}
	if !strings.Contains(stdout.String(), `"installed_to":`) {
		t.Fatalf("expected install metadata in output, got %s", stdout.String())
	}
}
