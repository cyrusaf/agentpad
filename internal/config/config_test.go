package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultUsesAgentIdentity(t *testing.T) {
	cfg := Default()
	if cfg.Identity.Name != "Agent" {
		t.Fatalf("expected default identity Agent, got %q", cfg.Identity.Name)
	}
}

func TestLoadFallsBackToHomeConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	configDir := filepath.Join(home, ".agentpad")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}

	configPath := filepath.Join(configDir, "config.toml")
	if err := os.WriteFile(configPath, []byte("[identity]\nname = \"Codex\"\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	workdir := t.TempDir()
	prevWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(workdir); err != nil {
		t.Fatalf("chdir temp dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(prevWD)
	})

	cfg, err := Load("")
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.Identity.Name != "Codex" {
		t.Fatalf("expected home config identity Codex, got %q", cfg.Identity.Name)
	}
}

func TestLoadPrefersLocalConfigOverHomeConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	configDir := filepath.Join(home, ".agentpad")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}

	homeConfigPath := filepath.Join(configDir, "config.toml")
	if err := os.WriteFile(homeConfigPath, []byte("[identity]\nname = \"Codex\"\n"), 0o644); err != nil {
		t.Fatalf("write home config: %v", err)
	}

	workdir := t.TempDir()
	localConfigPath := filepath.Join(workdir, "agentpad.toml")
	if err := os.WriteFile(localConfigPath, []byte("[identity]\nname = \"Workspace\"\n"), 0o644); err != nil {
		t.Fatalf("write local config: %v", err)
	}

	prevWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(workdir); err != nil {
		t.Fatalf("chdir temp dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(prevWD)
	})

	cfg, err := Load("")
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.Identity.Name != "Workspace" {
		t.Fatalf("expected local config identity Workspace, got %q", cfg.Identity.Name)
	}
}
