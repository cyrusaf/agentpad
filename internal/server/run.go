package server

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/cyrusaf/agentpad/internal/config"
	"github.com/cyrusaf/agentpad/internal/store"
)

func Run(cfg config.Config) error {
	st, err := store.Open(cfg.Storage.Path)
	if err != nil {
		return err
	}
	defer st.Close()

	staticDir := filepath.Join("web", "dist")
	if _, err := os.Stat(staticDir); err != nil {
		staticDir = ""
	}

	app := New(st, staticDir)
	return http.ListenAndServe(cfg.Server.Address, app.Routes())
}
