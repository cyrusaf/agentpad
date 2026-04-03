package server

import (
	"context"
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
