import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd(), "..");

async function runCLI(args: string[]) {
  const { stdout } = await execFileAsync(
    "go",
    ["run", "./cmd/agentpad", "--server", "http://127.0.0.1:8080", "--actor", "cli-user", "--json", ...args],
    { cwd: repoRoot },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

test("opens a local file in the collaborative UI", async ({ page }) => {
  const samplePath = path.resolve(repoRoot, "testdata", "sample.md");

  await page.goto("/");
  await page.getByPlaceholder("/Users/you/Documents/note.md").fill(samplePath);
  await page.getByRole("button", { name: "Open file" }).click();

  await expect(page.getByRole("heading", { name: "sample" })).toBeVisible();
  await expect(page.getByText("Live").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
});

test("updates thread state live when the CLI changes it", async ({ page }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentpad-live-"));
  const docPath = path.join(tempDir, "websocket-thread.md");

  try {
    await fs.writeFile(docPath, "# Title\n\nAlpha beta gamma delta\n", "utf8");

    await page.goto("/");
    await page.getByPlaceholder("/Users/you/Documents/note.md").fill(docPath);
    await page.getByRole("button", { name: "Open file" }).click();

    await expect(page.getByRole("heading", { name: "websocket-thread" })).toBeVisible();
    await expect(page.getByText("Live").first()).toBeVisible();
    await expect(page.getByText("No comments yet")).toBeVisible();

    const created = await runCLI(["threads", "create", docPath, "--start", "9", "--end", "19", "--body", "CLI comment"]);
    const threadId = String(created.id ?? "");
    const threadCard = page.locator("[data-thread-card]").first();

    await expect(threadCard).toBeVisible();
    await expect(threadCard.getByText("1 comment")).toBeVisible();
    await expect(threadCard.locator(".thread-unread-badge")).toHaveText("1 new");
    await expect(threadCard.getByText("Alpha beta")).toBeVisible();

    await threadCard.getByRole("button", { name: /Alpha beta/ }).click();
    await expect(threadCard.locator(".thread-unread-badge")).toHaveCount(0);
    await expect(threadCard.getByText("CLI comment")).toBeVisible();

    await runCLI(["threads", "reply", docPath, threadId, "--body", "CLI reply"]);
    await expect(threadCard.getByText("2 comments")).toBeVisible();
    await expect(threadCard.getByText("CLI reply")).toBeVisible();
    await expect(threadCard.locator(".thread-unread-badge")).toHaveCount(0);

    await runCLI(["threads", "resolve", docPath, threadId]);
    await expect(threadCard.locator(".thread-state")).toHaveText("resolved");
    await expect(threadCard.getByRole("button", { name: "Reopen" })).toBeVisible();

    await runCLI(["threads", "reopen", docPath, threadId]);
    await expect(threadCard.locator(".thread-state")).toHaveText("open");
    await expect(threadCard.getByRole("button", { name: "Resolve" })).toBeVisible();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("shows remote editor highlights for another browser session and clears them on click", async ({ browser, page }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentpad-remote-edit-"));
  const docPath = path.join(tempDir, "remote-edit.md");
  const collaboratorContext = await browser.newContext();
  const collaboratorPage = await collaboratorContext.newPage();

  try {
    await fs.writeFile(docPath, "# Title\n\nAlpha beta gamma delta\n", "utf8");

    await page.goto("/");
    await page.getByPlaceholder("/Users/you/Documents/note.md").fill(docPath);
    await page.getByRole("button", { name: "Open file" }).click();
    await expect(page.getByRole("heading", { name: "remote-edit" })).toBeVisible();

    await collaboratorPage.goto("/");
    await collaboratorPage.getByLabel("Name").fill("pair-programmer");
    await collaboratorPage.getByPlaceholder("/Users/you/Documents/note.md").fill(docPath);
    await collaboratorPage.getByRole("button", { name: "Open file" }).click();
    await expect(collaboratorPage.getByRole("heading", { name: "remote-edit" })).toBeVisible();

    await collaboratorPage.locator(".cm-line").last().click();
    await collaboratorPage.keyboard.press("End");
    await collaboratorPage.keyboard.insertText(" together");

    const remoteInsert = page.locator(".cm-remote-change-insert");
    await expect(remoteInsert.first()).toHaveAttribute("title", "Edited by pair-programmer");
    const remoteInsertCount = await remoteInsert.count();
    expect(remoteInsertCount).toBeGreaterThan(0);

    await remoteInsert.first().click();
    await expect(page.locator(".cm-remote-change-insert")).toHaveCount(remoteInsertCount - 1);
  } finally {
    await collaboratorContext.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("shows remote editor highlights for CLI edits", async ({ page }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentpad-cli-edit-"));
  const docPath = path.join(tempDir, "cli-edit.md");

  try {
    await fs.writeFile(docPath, "# Title\n\nAlpha beta gamma delta\n", "utf8");

    await page.goto("/");
    await page.getByPlaceholder("/Users/you/Documents/note.md").fill(docPath);
    await page.getByRole("button", { name: "Open file" }).click();
    await expect(page.getByRole("heading", { name: "cli-edit" })).toBeVisible();

    await runCLI(["edit", docPath, "--start", "15", "--end", "19", "--text", "crew"]);

    await expect(page.locator(".cm-remote-change-replace").first()).toHaveAttribute("title", "Edited by cli-user");
    await expect(page.locator(".cm-remote-change-delete").first()).toContainText("beta");
    await expect(page.locator(".cm-remote-change-author").first()).toHaveText("cli-user");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
