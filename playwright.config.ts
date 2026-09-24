import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["./tests/reporters/pass-fail-artifacts-reporter.ts"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    video: "on",
    // No native "video playback speed" setting exists in Playwright; this
    // slowMo delay paces real actions slower during recording, which is the
    // closest equivalent to a ~70%-of-full-speed recording.
    launchOptions: {
      slowMo: 350,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /walkthrough\//,
    },
    // Dedicated project for the narrative product walkthrough
    // (tests/browser/walkthrough/). Kept separate from the "chromium"
    // project's regression suite so the walkthrough's own viewport choices
    // never affect ordinary test runs.
    {
      name: "walkthrough",
      testMatch: /walkthrough\//,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    // Mobile-viewport twin of "walkthrough" — same viewport size
    // product-walkthrough-e2e.spec.ts's own mobile chapter already uses
    // ({width:390, height:844}), so results stay comparable. Narrowed to the
    // two single-role walkthrough specs only: product-walkthrough-e2e.spec.ts
    // manages ~13 of its own manually-created BrowserContexts and stitches
    // them with a hardcoded 1280px-wide canvas (STITCH_WIDTH) — running that
    // file under a non-1280 project viewport would leave its own `page`
    // fixture recording at a mismatched size relative to its manual camera
    // contexts. It already has a dedicated internal mobile chapter for that
    // concern, so it stays on the desktop-sized "walkthrough" project only.
    {
      name: "walkthrough-mobile",
      testMatch: /walkthrough\/(user|admin)-walkthrough\.spec\.ts$|walkthrough\/product-walkthrough-responsive\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    // Responsive twins of "walkthrough-mobile" for the two single-role
    // specs plus the cross-role responsive companion spec — see the
    // comment above for why product-walkthrough-e2e.spec.ts itself is
    // excluded. Viewport sizes per the walkthrough spec's required
    // profiles (Tablet Portrait 768x1024, Tablet Landscape 1024x768).
    {
      name: "walkthrough-tablet-portrait",
      testMatch: /walkthrough\/(user|admin)-walkthrough\.spec\.ts$|walkthrough\/product-walkthrough-responsive\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "walkthrough-tablet-landscape",
      testMatch: /walkthrough\/(user|admin)-walkthrough\.spec\.ts$|walkthrough\/product-walkthrough-responsive\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
      },
    },
  ],
  webServer: {
    command: "npm run dev:http",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
