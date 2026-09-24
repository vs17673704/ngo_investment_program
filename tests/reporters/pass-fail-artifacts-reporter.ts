import fs from "fs";
import path from "path";
import type { Reporter, TestCase, TestResult } from "playwright/types/testReporter";

/**
 * Copies each test's retained artifacts (trace/screenshot/video) into
 * tests/browser/artifacts/passed/ or tests/browser/artifacts/failed/,
 * depending on outcome. Playwright's own `test-results/` output is a flat,
 * un-sorted mix of both when trace/screenshot/video are set to "on" (always
 * capture) — this reporter is what actually splits them by pass/fail.
 */
const ARTIFACTS_ROOT = path.join(process.cwd(), "tests", "browser", "artifacts");

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 150);
}

export default class PassFailArtifactsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.attachments.length === 0) return;

    const outcome = result.status === "passed" ? "passed" : "failed";
    const dirName = `${sanitize(test.titlePath().slice(1).join(" - "))}-retry${result.retry}`;
    const destDir = path.join(ARTIFACTS_ROOT, outcome, dirName);
    fs.mkdirSync(destDir, { recursive: true });

    for (const attachment of result.attachments) {
      if (!attachment.path) continue;
      try {
        const ext = path.extname(attachment.path);
        const destPath = path.join(destDir, `${sanitize(attachment.name)}${ext}`);
        fs.copyFileSync(attachment.path, destPath);
      } catch {
        // Best-effort: never fail the test run over artifact copying.
      }
    }
  }
}
