import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../web/node_modules/playwright/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const docPath = path.join(rootDir, "docs/demo/coding-agent-plan.md");
const baseURL = "http://127.0.0.1:8081";
const outputDir = path.resolve("docs/videos");
const tempDir = path.join(outputDir, ".browser-human-codex-tmp");
const readyMarker = "/tmp/agentpad-human-comment-created";
const reviewerComment = "Please define the success metric and exact rollback threshold before asking Codex to implement this.";
const codexReply = "I added the rollout KPI and rollback threshold to the Goal section.";
const addedSentence =
  "Success metric: keep p95 reconciliation lag under 5 minutes and failed reconciliations under 0.5% during rollout. Roll back if lag exceeds 15 minutes or failures exceed 2% for 10 consecutive minutes.";

async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function waitForVisible(locator, timeout = 120000) {
  await locator.waitFor({ state: "visible", timeout });
  return locator;
}

await fs.rm(readyMarker, { force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.rm(tempDir, { recursive: true, force: true });
await fs.mkdir(tempDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 980 },
  recordVideo: {
    dir: tempDir,
    size: { width: 1600, height: 980 },
  },
});

const page = await context.newPage();
const docURL = `${baseURL}/?path=${encodeURIComponent(docPath)}`;

try {
  await page.goto(docURL, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "coding-agent-plan" }).waitFor({ state: "visible" });
  await pause(page, 1200);

  const goalLine = page.getByText(
    "Ship the new checkout reconciliation flow behind a feature flag, with metrics that make rollout safe for the on-call engineer.",
  );
  await goalLine.waitFor({ state: "visible" });
  const box = await goalLine.boundingBox();
  if (!box) {
    throw new Error("Could not locate the Goal paragraph for selection.");
  }

  await page.mouse.move(box.x + 340, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await pause(page, 700);

  const composer = page.getByPlaceholder("Write a comment on this selection");
  await composer.fill(reviewerComment);
  await pause(page, 1000);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await pause(page, 1200);

  await page.getByText(reviewerComment).waitFor({ state: "visible" });
  await fs.writeFile(readyMarker, "ready\n");

  await waitForVisible(page.getByText(codexReply));
  await waitForVisible(page.getByText(addedSentence));
  await pause(page, 3000);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const files = await fs.readdir(tempDir);
const webm = files.find((name) => name.endsWith(".webm"));
if (!webm) {
  throw new Error("Browser recording was not generated.");
}
await fs.rename(path.join(tempDir, webm), path.join(outputDir, "agentpad-browser-human-codex.webm"));
await fs.rm(tempDir, { recursive: true, force: true });
await fs.rm(readyMarker, { force: true });
