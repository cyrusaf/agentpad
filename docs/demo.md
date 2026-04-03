# Demo Generation

Generate the current Codex + browser demo from a repo checkout with:

```bash
cd web
npm install
cd ..
./docs/demo/make-vertical-codex-demo.sh
```

You will need `codex`, `tmux`, `asciinema`, and `ffmpeg` installed locally. The terminal renderer (`agg`) bootstraps itself on first run.

The demo script:

- resets the sample document and comments
- starts a local AgentPad server
- records the browser flow with Playwright
- captures the Codex terminal with `asciinema`
- renders the terminal to GIF with `agg`
- merges everything into the final vertical MP4

The final output is written to [docs/videos/agentpad-vertical-codex-demo.mp4](videos/agentpad-vertical-codex-demo.mp4).
