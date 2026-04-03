package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/cyrusaf/agentpad/internal/store"
)

func TestLiveSessionSendsSnapshot(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "live.md")
	if err := os.WriteFile(docPath, []byte("# Hello\n\nLive world"), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}
	doc, err := st.OpenDocument(context.Background(), docPath, "tester")
	if err != nil {
		t.Fatalf("open document: %v", err)
	}

	app := New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/api/files/live?path=" + url.QueryEscape(doc.ID) + "&name=tester"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "test complete")

	var msg serverMessage
	if err := wsjson.Read(ctx, conn, &msg); err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if msg.Type != "snapshot" {
		t.Fatalf("expected snapshot message, got %s", msg.Type)
	}
	if msg.Document == nil || msg.Document.ID != doc.ID {
		t.Fatalf("unexpected snapshot payload: %+v", msg.Document)
	}
}

func TestHTTPDocumentEditsBroadcastAppliedOps(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	docPath := filepath.Join(t.TempDir(), "live-edit.md")
	if err := os.WriteFile(docPath, []byte("# Hello\n\nLive world"), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}
	doc, err := st.OpenDocument(context.Background(), docPath, "tester")
	if err != nil {
		t.Fatalf("open document: %v", err)
	}

	app := New(st, "")
	ts := httptest.NewServer(app.Routes())
	t.Cleanup(ts.Close)

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/api/files/live?path=" + url.QueryEscape(doc.ID) + "&name=browser-user"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "test complete")

	var snapshot serverMessage
	if err := wsjson.Read(ctx, conn, &snapshot); err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if snapshot.Type != "snapshot" {
		t.Fatalf("expected snapshot message, got %s", snapshot.Type)
	}

	payload := map[string]any{
		"path":          doc.ID,
		"position":      9,
		"delete_count":  4,
		"insert_text":   "team",
		"base_revision": doc.Revision,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/files/edit", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AgentPad-Actor", "cli-user")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post edit: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}

	var msg serverMessage
	if err := wsjson.Read(ctx, conn, &msg); err != nil {
		t.Fatalf("read live op: %v", err)
	}
	if msg.Type != "op.applied" {
		t.Fatalf("expected op.applied, got %s", msg.Type)
	}
	if msg.Op == nil {
		t.Fatalf("expected op payload")
	}
	if msg.Op.Author != "cli-user" {
		t.Fatalf("expected op author cli-user, got %q", msg.Op.Author)
	}
	if msg.Op.InsertText != "team" || msg.Op.DeleteCount != 4 || msg.Op.Position != 9 {
		t.Fatalf("unexpected op payload: %+v", msg.Op)
	}
	if msg.Revision != doc.Revision+1 {
		t.Fatalf("expected revision %d, got %d", doc.Revision+1, msg.Revision)
	}
}
