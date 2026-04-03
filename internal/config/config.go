package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

type Config struct {
	Server struct {
		Address string `toml:"address"`
		BaseURL string `toml:"base_url"`
	} `toml:"server"`
	Storage struct {
		Path string `toml:"path"`
	} `toml:"storage"`
	Identity struct {
		Name string `toml:"name"`
	} `toml:"identity"`
}

func Default() Config {
	cfg := Config{}
	cfg.Server.Address = "127.0.0.1:8080"
	cfg.Server.BaseURL = "http://127.0.0.1:8080"
	cfg.Storage.Path = defaultStoragePath()
	cfg.Identity.Name = "Agent"
	return cfg
}

func Load(path string) (Config, error) {
	cfg := Default()
	for _, candidate := range configPaths(path) {
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return Config{}, err
		}
		if _, err := toml.DecodeFile(candidate, &cfg); err != nil {
			return Config{}, err
		}
		cfg.Storage.Path = normalizeStoragePath(cfg.Storage.Path)
		return cfg, nil
	}
	cfg.Storage.Path = normalizeStoragePath(cfg.Storage.Path)
	return cfg, nil
}

func configPaths(explicitPath string) []string {
	if strings.TrimSpace(explicitPath) != "" {
		return []string{explicitPath}
	}

	paths := []string{"agentpad.toml"}
	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(home, ".agentpad", "config.toml"))
	}
	return paths
}

func defaultStoragePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Clean(".agentpad")
	}
	return filepath.Join(home, ".agentpad")
}

func normalizeStoragePath(path string) string {
	if strings.TrimSpace(path) == "" {
		return defaultStoragePath()
	}
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(home, strings.TrimPrefix(path, "~/"))
		}
	}
	if !filepath.IsAbs(path) {
		if absPath, err := filepath.Abs(path); err == nil {
			path = absPath
		}
	}
	return filepath.Clean(path)
}
