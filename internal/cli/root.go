package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/cyrusaf/agentpad/internal/collab"
	"github.com/spf13/cobra"

	"github.com/cyrusaf/agentpad/internal/config"
	"github.com/cyrusaf/agentpad/internal/domain"
	"github.com/cyrusaf/agentpad/internal/server"
	skillassets "github.com/cyrusaf/agentpad/skills"
)

type RootOptions struct {
	ConfigPath string
	ServerURL  string
	Actor      string
	JSON       bool
	Config     config.Config
}

type Client struct {
	baseURL string
	actor   string
	http    *http.Client
}

type OpenResult struct {
	Path     string          `json:"path"`
	URL      string          `json:"url"`
	Document domain.Document `json:"document"`
}

type EditResult struct {
	Path     string          `json:"path"`
	Document domain.Document `json:"document"`
	Op       collab.Op       `json:"op"`
}

var browserOpener = openBrowser

func NewRootCmd() *cobra.Command {
	opts := &RootOptions{}
	cmd := &cobra.Command{
		Use:              "agentpad",
		Short:            "CLI for AgentPad collaborative files",
		TraverseChildren: true,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if opts.ConfigPath == "" {
				opts.ConfigPath = os.Getenv("AGENTPAD_CONFIG")
			}
			cfg, err := config.Load(opts.ConfigPath)
			if err != nil {
				return err
			}
			opts.Config = cfg
			if opts.ServerURL == "" {
				opts.ServerURL = cfg.Server.BaseURL
			}
			if opts.Actor == "" {
				opts.Actor = cfg.Identity.Name
			}
			return nil
		},
	}
	cmd.PersistentFlags().StringVar(&opts.ServerURL, "server", "", "AgentPad server base URL")
	cmd.PersistentFlags().StringVar(&opts.ConfigPath, "config", "", "Path to agentpad.toml")
	cmd.PersistentFlags().StringVar(&opts.Actor, "actor", "", "Actor/display name")
	cmd.PersistentFlags().StringVar(&opts.Actor, "name", "", "Display name")
	cmd.PersistentFlags().BoolVar(&opts.JSON, "json", false, "Emit machine-readable JSON")

	cmd.AddCommand(newServeCmd(opts))
	cmd.AddCommand(newOpenCmd(opts))
	cmd.AddCommand(newReadCmd(opts))
	cmd.AddCommand(newEditCmd(opts))
	cmd.AddCommand(newThreadsCmd(opts))
	cmd.AddCommand(newActivityCmd(opts))
	cmd.AddCommand(newExportCmd(opts))
	cmd.AddCommand(newInstallSkillCmd(opts))
	return cmd
}

func newServeCmd(opts *RootOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "serve",
		Short: "Run the AgentPad server",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintf(cmd.ErrOrStderr(), "AgentPad server listening on %s\n", opts.Config.Server.Address)
			return server.Run(opts.Config)
		},
	}
}

func newOpenCmd(opts *RootOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "open <file>",
		Short: "Open a local file in AgentPad via the default browser",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			client := opts.client()
			var doc domain.Document
			if err := client.getJSON(context.Background(), "/api/files/open", map[string]string{"path": resolvedPath}, &doc); err != nil {
				return err
			}
			deepLink, err := documentURL(opts.ServerURL, doc.ID, "")
			if err != nil {
				return err
			}
			if opts.JSON {
				return printValue(cmd, true, OpenResult{
					Path:     doc.ID,
					URL:      deepLink,
					Document: doc,
				})
			}
			return browserOpener(deepLink)
		},
	}
}

func newReadCmd(opts *RootOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "read <file>",
		Short: "Read a scoped region of a file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			params := map[string]string{"path": resolvedPath}
			blockID, _ := cmd.Flags().GetString("block")
			query, _ := cmd.Flags().GetString("query")
			quote, _ := cmd.Flags().GetString("quote")
			prefix, _ := cmd.Flags().GetString("prefix")
			suffix, _ := cmd.Flags().GetString("suffix")
			start, _ := cmd.Flags().GetInt("start")
			end, _ := cmd.Flags().GetInt("end")
			if blockID != "" {
				params["block_id"] = blockID
			}
			if query != "" {
				params["query"] = query
			}
			if quote != "" {
				params["quote"] = quote
			}
			if prefix != "" {
				params["prefix"] = prefix
			}
			if suffix != "" {
				params["suffix"] = suffix
			}
			if cmd.Flags().Changed("start") {
				params["start"] = fmt.Sprint(start)
			}
			if cmd.Flags().Changed("end") {
				params["end"] = fmt.Sprint(end)
			}
			var read domain.DocumentRead
			if err := opts.client().getJSON(context.Background(), "/api/files/read", params, &read); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, read)
		},
	}
	cmd.Flags().String("block", "", "Specific block ID")
	cmd.Flags().String("query", "", "Search query")
	cmd.Flags().String("quote", "", "Exact quote to resolve into an anchor")
	cmd.Flags().String("prefix", "", "Expected text immediately before the quote")
	cmd.Flags().String("suffix", "", "Expected text immediately after the quote")
	cmd.Flags().Int("start", 0, "Range start rune offset")
	cmd.Flags().Int("end", 0, "Range end rune offset")
	return cmd
}

func newEditCmd(opts *RootOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "edit <file>",
		Short: "Apply a document edit through AgentPad",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			anchorJSON, _ := cmd.Flags().GetString("anchor-json")
			anchorFile, _ := cmd.Flags().GetString("anchor-file")
			if anchorJSON != "" && anchorFile != "" {
				return fmt.Errorf("only one of --anchor-json or --anchor-file may be used")
			}

			start, _ := cmd.Flags().GetInt("start")
			end, _ := cmd.Flags().GetInt("end")
			insertText, err := readFlagOrFile(cmd, "text", "text-file")
			if err != nil {
				return err
			}
			baseRevision, _ := cmd.Flags().GetInt64("base-revision")
			anchor, err := readAnchorInput(anchorJSON, anchorFile)
			if err != nil {
				return err
			}

			requestBody := map[string]any{
				"path":        resolvedPath,
				"insert_text": insertText,
			}
			if anchor != nil {
				if cmd.Flags().Changed("start") || cmd.Flags().Changed("end") || cmd.Flags().Changed("base-revision") {
					return fmt.Errorf("--start, --end, and --base-revision are only valid in positional edit mode")
				}
				requestBody["anchor"] = anchor
			} else {
				if !cmd.Flags().Changed("start") || !cmd.Flags().Changed("end") {
					return fmt.Errorf("either --anchor-json/--anchor-file or both --start and --end are required")
				}
				if start < 0 {
					return fmt.Errorf("--start must be non-negative")
				}
				if end < start {
					return fmt.Errorf("--end must be greater than or equal to --start")
				}

				currentDoc := domain.Document{}
				if err := opts.client().getJSON(context.Background(), "/api/files/open", map[string]string{"path": resolvedPath}, &currentDoc); err != nil {
					return err
				}
				if !cmd.Flags().Changed("base-revision") {
					baseRevision = currentDoc.Revision
				}
				requestBody["position"] = start
				requestBody["delete_count"] = end - start
				requestBody["base_revision"] = baseRevision
			}

			var resp struct {
				Document domain.Document `json:"document"`
				Op       collab.Op       `json:"op"`
			}
			if err := opts.client().doJSON(context.Background(), http.MethodPost, "/api/files/edit", requestBody, &resp); err != nil {
				return err
			}

			return printValue(cmd, opts.JSON, EditResult{
				Path:     resolvedPath,
				Document: resp.Document,
				Op:       resp.Op,
			})
		},
	}
	cmd.Flags().String("anchor-json", "", "Anchor payload as JSON")
	cmd.Flags().String("anchor-file", "", "Path to a JSON file containing an anchor payload")
	cmd.Flags().Int("start", 0, "Edit start rune offset")
	cmd.Flags().Int("end", 0, "Edit end rune offset")
	cmd.Flags().String("text", "", "Replacement text")
	cmd.Flags().String("text-file", "", "Read replacement text from a file ('-' for stdin)")
	cmd.Flags().Int64("base-revision", 0, "Document revision the edit is based on")
	return cmd
}

func newThreadsCmd(opts *RootOptions) *cobra.Command {
	cmd := &cobra.Command{Use: "threads", Short: "Comment thread operations"}
	cmd.AddCommand(&cobra.Command{
		Use:   "list <file>",
		Short: "List threads for a file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			var items []domain.Thread
			if err := opts.client().getJSON(context.Background(), "/api/files/threads", map[string]string{"path": resolvedPath}, &items); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, items)
		},
	})
	create := &cobra.Command{
		Use:   "create <file>",
		Short: "Create a thread",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			body, err := readFlagOrFile(cmd, "body", "body-file")
			if err != nil {
				return err
			}
			start, _ := cmd.Flags().GetInt("start")
			end, _ := cmd.Flags().GetInt("end")
			var thread domain.Thread
			if err := opts.client().doJSON(context.Background(), http.MethodPost, "/api/files/threads", map[string]any{
				"path":  resolvedPath,
				"body":  body,
				"start": start,
				"end":   end,
			}, &thread); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, thread)
		},
	}
	create.Flags().String("body", "", "Comment body")
	create.Flags().String("body-file", "", "Read comment body from a file ('-' for stdin)")
	create.Flags().Int("start", 0, "Selection start")
	create.Flags().Int("end", 0, "Selection end")
	cmd.AddCommand(create)
	reply := &cobra.Command{
		Use:   "reply <file> <thread-id>",
		Short: "Reply to a thread",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			body, err := readFlagOrFile(cmd, "body", "body-file")
			if err != nil {
				return err
			}
			var resp map[string]any
			if err := opts.client().doJSON(context.Background(), http.MethodPost, "/api/files/thread-replies", map[string]any{
				"path":      resolvedPath,
				"thread_id": args[1],
				"body":      body,
			}, &resp); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, resp)
		},
	}
	reply.Flags().String("body", "", "Reply body")
	reply.Flags().String("body-file", "", "Read reply body from a file ('-' for stdin)")
	cmd.AddCommand(reply)
	cmd.AddCommand(threadStatusCmd(opts, "resolve", "/api/files/thread-resolve"))
	cmd.AddCommand(threadStatusCmd(opts, "reopen", "/api/files/thread-reopen"))
	return cmd
}

func readFlagOrFile(cmd *cobra.Command, valueFlag, fileFlag string) (string, error) {
	value, _ := cmd.Flags().GetString(valueFlag)
	filePath, _ := cmd.Flags().GetString(fileFlag)
	if value != "" && filePath != "" {
		return "", fmt.Errorf("only one of --%s or --%s may be used", valueFlag, fileFlag)
	}
	if filePath == "" {
		return value, nil
	}
	if filePath == "-" {
		body, err := io.ReadAll(cmd.InOrStdin())
		if err != nil {
			return "", fmt.Errorf("read --%s stdin: %w", fileFlag, err)
		}
		return string(body), nil
	}
	body, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("read --%s %s: %w", fileFlag, filePath, err)
	}
	return string(body), nil
}

func threadStatusCmd(opts *RootOptions, action, endpoint string) *cobra.Command {
	return &cobra.Command{
		Use:   action + " <file> <thread-id>",
		Short: strings.Title(action) + " a thread",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			var thread domain.Thread
			if err := opts.client().doJSON(context.Background(), http.MethodPost, endpoint, map[string]any{
				"path":      resolvedPath,
				"thread_id": args[1],
			}, &thread); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, thread)
		},
	}
}

func newActivityCmd(opts *RootOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "activity <file>",
		Short: "Show file activity",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			var items []domain.ActivityEvent
			if err := opts.client().getJSON(context.Background(), "/api/files/activity", map[string]string{"path": resolvedPath}, &items); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, items)
		},
	}
}

func newExportCmd(opts *RootOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "export <file>",
		Short: "Export a file through the server",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedPath, err := resolveCLIPath(args[0])
			if err != nil {
				return err
			}
			format, _ := cmd.Flags().GetString("format")
			output, _ := cmd.Flags().GetString("out")
			body, err := opts.client().getRaw(context.Background(), "/api/files/export", map[string]string{
				"path":   resolvedPath,
				"format": format,
			})
			if err != nil {
				return err
			}
			if output == "" {
				_, err = cmd.OutOrStdout().Write(body)
				return err
			}
			if err := os.WriteFile(output, body, 0o644); err != nil {
				return err
			}
			return printValue(cmd, opts.JSON, map[string]any{"written": output})
		},
	}
	cmd.Flags().String("format", "markdown", "Export format")
	cmd.Flags().String("out", "", "Output file path")
	return cmd
}

func newInstallSkillCmd(opts *RootOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "install-skill",
		Short: "Install the bundled AgentPad skill into your Codex skills directory",
		RunE: func(cmd *cobra.Command, args []string) error {
			skillsDir, _ := cmd.Flags().GetString("skills-dir")
			if strings.TrimSpace(skillsDir) == "" {
				var err error
				skillsDir, err = defaultCodexSkillsDir()
				if err != nil {
					return err
				}
			}

			targetDir := filepath.Join(skillsDir, "agentpad")
			filesWritten, err := installBundledSkill(targetDir)
			if err != nil {
				return err
			}

			return printValue(cmd, opts.JSON, map[string]any{
				"skill":         "agentpad",
				"installed_to":  targetDir,
				"files_written": filesWritten,
			})
		},
	}
	cmd.Flags().String("skills-dir", "", "Target Codex skills directory (defaults to $CODEX_HOME/skills or ~/.codex/skills)")
	return cmd
}

func (opts *RootOptions) client() *Client {
	return &Client{
		baseURL: strings.TrimSuffix(opts.ServerURL, "/"),
		actor:   opts.Actor,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) getJSON(ctx context.Context, path string, query map[string]string, out any) error {
	body, err := c.getRaw(ctx, path, query)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, out)
}

func (c *Client) getRaw(ctx context.Context, path string, query map[string]string) ([]byte, error) {
	fullURL, err := urlWithQuery(c.baseURL+path, query)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-AgentPad-Actor", c.actor)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		var appErr domain.Error
		if err := json.Unmarshal(body, &appErr); err == nil && appErr.Code != "" {
			return nil, &appErr
		}
		return nil, fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, requestBody any, out any) error {
	var bodyReader io.Reader
	if requestBody != nil {
		data, err := json.Marshal(requestBody)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("X-AgentPad-Actor", c.actor)
	if requestBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		var appErr domain.Error
		if err := json.Unmarshal(body, &appErr); err == nil && appErr.Code != "" {
			return &appErr
		}
		return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(body, out)
}

func printValue(cmd *cobra.Command, asJSON bool, value any) error {
	if asJSON {
		data, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			return err
		}
		_, err = fmt.Fprintln(cmd.OutOrStdout(), string(data))
		return err
	}
	switch v := value.(type) {
	case domain.Document:
		fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\trev=%d\t%s\n", v.ID, v.Title, v.Revision, v.Format)
	case EditResult:
		fmt.Fprintf(cmd.OutOrStdout(), "%s\trev=%d\tpos=%d\tdel=%d\n", v.Path, v.Document.Revision, v.Op.Position, v.Op.DeleteCount)
	case domain.DocumentRead:
		fmt.Fprintln(cmd.OutOrStdout(), v.Text)
	default:
		data, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			return err
		}
		_, err = fmt.Fprintln(cmd.OutOrStdout(), string(data))
		return err
	}
	return nil
}

func readAnchorInput(rawJSON, path string) (*domain.Anchor, error) {
	switch {
	case rawJSON != "":
		return decodeAnchor([]byte(rawJSON))
	case path != "":
		body, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		return decodeAnchor(body)
	default:
		return nil, nil
	}
}

func decodeAnchor(body []byte) (*domain.Anchor, error) {
	var anchor domain.Anchor
	if err := json.Unmarshal(body, &anchor); err != nil {
		return nil, fmt.Errorf("decode anchor: %w", err)
	}
	return &anchor, nil
}

func urlWithQuery(rawURL string, query map[string]string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	values := parsed.Query()
	for key, value := range query {
		values.Set(key, value)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func resolveCLIPath(rawPath string) (string, error) {
	if strings.TrimSpace(rawPath) == "" {
		return "", fmt.Errorf("missing file path")
	}
	return filepath.Abs(rawPath)
}

func defaultCodexSkillsDir() (string, error) {
	if codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME")); codexHome != "" {
		return filepath.Join(codexHome, "skills"), nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(homeDir, ".codex", "skills"), nil
}

func installBundledSkill(targetDir string) (int, error) {
	const skillRoot = "agentpad"

	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return 0, fmt.Errorf("create skill directory: %w", err)
	}

	filesWritten := 0
	if err := fs.WalkDir(skillassets.FS, skillRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(skillRoot, path)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return nil
		}

		destinationPath := filepath.Join(targetDir, filepath.FromSlash(relativePath))
		if d.IsDir() {
			return os.MkdirAll(destinationPath, 0o755)
		}

		body, err := fs.ReadFile(skillassets.FS, path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(destinationPath, body, 0o644); err != nil {
			return err
		}
		filesWritten++
		return nil
	}); err != nil {
		return filesWritten, fmt.Errorf("install skill assets: %w", err)
	}

	return filesWritten, nil
}

func documentURL(baseURL, path, threadID string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", err
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	values := parsed.Query()
	values.Set("path", path)
	if threadID != "" {
		values.Set("thread", threadID)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func openBrowser(rawURL string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", rawURL)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL)
	default:
		cmd = exec.Command("xdg-open", rawURL)
	}
	return cmd.Start()
}
