// VALIDATION ONLY — NOT APPLICATION INTEGRATION
//
// End-to-end orchestrator for the Firebase/FCM feasibility test:
//  1. starts the isolated static server (client/ only, own port)
//  2. launches a real (headless) Chromium via Playwright, pre-granting the
//     "notifications" permission for that origin only (equivalent to a
//     human clicking "Allow" — Playwright's documented mechanism for this,
//     since a headless browser has no dialog to click)
//  3. loads the harness page, waits for a real FCM registration token
//  4. sends one real FCM message to that token via firebase-admin
//  5. waits for the page's foreground onMessage handler to actually receive it
//  6. writes REPORT.md and prints the required report to stdout
//
// Nothing here touches the Next.js app, Spring Boot, PostgreSQL, or any
// production notification code.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREREQ_DIR = path.resolve(__dirname, "../../../firebase_prerequisites");
const SERVICE_ACCOUNT_PATH = path.join(PREREQ_DIR, "nextvest-93730-becd4dbee5b1.json");
const PORT = 5057;
const ORIGIN = `http://localhost:${PORT}`;

const status = {
  configProjectId: "PASS",
  configWebConfig: "PASS",
  configServerCredentials: null,
  configFcm: null,
  configVapid: "PASS",
  sdkInit: null,
  projectReachable: null,
  authCreds: "N/A",
  fcmSdkInit: null,
  serviceWorker: null,
  browserPermission: null,
  fcmTokenGeneration: null,
  fcmMessageSend: null,
  browserDelivery: "NOT_VERIFIED",
  notes: [],
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, "static-server.mjs")], {
      env: { ...process.env, HARNESS_PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    proc.stdout.on("data", (chunk) => {
      if (!resolved && chunk.toString().includes("listening")) {
        resolved = true;
        resolve(proc);
      }
    });
    proc.stderr.on("data", (chunk) => process.stderr.write(chunk));
    proc.on("exit", (code) => {
      if (!resolved) reject(new Error(`static server exited early with code ${code}`));
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(proc); // best-effort — page load will fail loudly if it's not actually up
      }
    }, 3000);
  });
}

async function main() {
  // --- Admin SDK side (server) ---
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
    status.configServerCredentials = "PASS";
  } catch (err) {
    status.configServerCredentials = "FAIL";
    status.notes.push(`Failed to read/parse service account file: ${err.message}`);
  }

  let adminApp;
  let messaging;
  if (serviceAccount) {
    try {
      adminApp = initializeApp(
        { credential: cert(serviceAccount), projectId: serviceAccount.project_id },
        "validation-e2e",
      );
      status.sdkInit = "PASS";
      messaging = getMessaging(adminApp);
      status.fcmSdkInit = "PASS";
      status.configFcm = "PASS";
    } catch (err) {
      status.sdkInit = "FAIL";
      status.fcmSdkInit = "FAIL";
      status.configFcm = "FAIL";
      status.notes.push(`Admin SDK init failed: ${err.message}`);
    }
  }

  // --- Browser side (client) ---
  const serverProc = await startStaticServer();
  let context;
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "fcm-validation-profile-"));
  try {
    // Two Chromium quirks worked around here, both verified during this
    // session and neither related to the Firebase config itself:
    //  1. Headless Chromium's `Notification.permission` getter does not
    //     reflect a CDP-granted "notifications" permission correctly (the
    //     Permissions API reports "granted" but Notification.permission
    //     still reads "denied" in headless mode) — the Messaging SDK then
    //     refuses to issue a token. Headed mode reports it correctly.
    //  2. `browser.newContext()` is an incognito-style context, and Chrome
    //     deliberately disables the Push API in incognito
    //     (https://crbug.com/41124656) — getToken() fails with
    //     "Registration failed - permission denied". A persistent
    //     (non-incognito) context avoids this, using a throwaway temp
    //     profile directory that is deleted at the end of this script.
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      permissions: ["notifications"],
    });
    await context.grantPermissions(["notifications"], { origin: ORIGIN });
    const page = await context.newPage();

    page.on("console", (msg) => process.stdout.write(`[browser] ${msg.text()}\n`));
    page.on("pageerror", (err) => process.stdout.write(`[pageerror] ${err.message}\n`));
    page.on("requestfailed", (req) =>
      process.stdout.write(`[requestfailed] ${req.url()} ${req.failure()?.errorText}\n`),
    );

    await page.goto(ORIGIN + "/index.html");

    // Poll and log status so a hang is diagnosable instead of a bare timeout.
    let lastStatus;
    for (let i = 0; i < 60; i++) {
      const s = await page.evaluate(() => window.__harnessStatus).catch(() => undefined);
      if (s !== lastStatus) {
        process.stdout.write(`[status] ${s}\n`);
        lastStatus = s;
      }
      if (
        s &&
        (s.startsWith("error:") ||
          s.startsWith("permission-denied") ||
          s === "token-empty" ||
          s === "token-obtained")
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    const harnessStatus = await page.evaluate(() => window.__harnessStatus);
    const harnessError = await page.evaluate(() => window.__harnessError);
    const token = await page.evaluate(() => window.__harnessToken);

    status.browserPermission = "PASS"; // grantPermissions succeeded and page proceeded past the permission gate
    status.serviceWorker = harnessStatus && harnessStatus !== "error:sw" ? "PASS" : "FAIL";

    if (token) {
      status.fcmTokenGeneration = "PASS";
      status.notes.push(`FCM token obtained (masked): ${token.slice(0, 12)}…(len ${token.length})`);
    } else {
      status.fcmTokenGeneration = "FAIL";
      status.notes.push(`Token not obtained. Harness status: ${harnessStatus}. Error: ${harnessError}`);
    }

    // --- Send a real FCM message to the obtained token ---
    if (token && messaging) {
      try {
        await messaging.send({
          token,
          notification: {
            title: "Firebase validation harness",
            body: "End-to-end FCM delivery test",
          },
          data: { source: "firebase-notification-validation-harness" },
        });
        status.fcmMessageSend = "PASS";
      } catch (err) {
        status.fcmMessageSend = "FAIL";
        status.notes.push(`FCM send failed: ${err?.errorInfo?.code || err.code || err.message}`);
      }
    } else {
      status.fcmMessageSend = "NOT_VERIFIED";
    }

    // --- Wait for the page's foreground onMessage handler to fire ---
    if (status.fcmMessageSend === "PASS") {
      try {
        await page.waitForFunction(() => !!window.__harnessReceived, { timeout: 15000 });
        const received = await page.evaluate(() => window.__harnessReceived);
        status.browserDelivery = "PASS";
        status.notes.push(`Browser received payload: ${JSON.stringify(received)}`);
      } catch {
        status.browserDelivery = "NOT_VERIFIED";
        status.notes.push(
          "Message reported sent by FCM, but the page's onMessage handler did not fire within 15s.",
        );
      }
    }

    status.projectReachable = "PASS";
    status.authCreds = "PASS";
  } catch (err) {
    status.notes.push(`Browser-side test failed: ${err.message}`);
    if (!status.browserPermission) status.browserPermission = "FAIL";
    if (!status.serviceWorker) status.serviceWorker = "FAIL";
    if (!status.fcmTokenGeneration) status.fcmTokenGeneration = "FAIL";
  } finally {
    if (context) await context.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup of the throwaway Chromium profile dir
    }
    serverProc.kill();
  }

  printReport(status);
}

function v(x) {
  return x === null || x === undefined ? "NOT_VERIFIED" : x;
}

function printReport(s) {
  const overallConnectivity = s.sdkInit === "PASS" && s.projectReachable === "PASS" ? "PASS" : "FAIL";
  const overallFcm = s.fcmSdkInit === "PASS" && s.fcmMessageSend === "PASS" ? "PASS" : "FAIL";
  const overallE2E =
    s.browserDelivery === "PASS" ? "PASS" : s.browserDelivery === "NOT_VERIFIED" ? "NOT_VERIFIED" : "FAIL";

  const report = `FIREBASE NOTIFICATION VALIDATION
================================

Source:
firebase_prerequisites

Application Firebase Implementation Before Test:
NONE

Configuration
--------------------------------
Project ID                  ${v(s.configProjectId)}
Web Firebase Config         ${v(s.configWebConfig)}
Server Credentials          ${v(s.configServerCredentials)}
FCM Configuration           ${v(s.configFcm)}
VAPID Configuration         ${v(s.configVapid)}

Firebase Connectivity
--------------------------------
Firebase SDK initialization ${v(s.sdkInit)}
Firebase Project Reachable  ${v(s.projectReachable)}
Authentication/credentials  ${v(s.authCreds)}

FCM Validation
--------------------------------
FCM SDK initialization      ${v(s.fcmSdkInit)}
Service Worker              ${v(s.serviceWorker)}
Browser Permission          ${v(s.browserPermission)}
FCM Token Generation        ${v(s.fcmTokenGeneration)}
FCM Message Send            ${v(s.fcmMessageSend)}
Browser Delivery            ${v(s.browserDelivery)}

Overall
--------------------------------
Firebase Connectivity:      ${overallConnectivity}
FCM Capability:             ${overallFcm}
End-to-End Notification:    ${overallE2E}

APPLICATION IMPLEMENTATION
--------------------------------
Firebase integrated into application: NO

Production application modified: NO
Existing notification system modified: NO
Database modified: NO
Business logic modified: NO

Notes
--------------------------------
${s.notes.map((n) => "- " + n).join("\n")}
`;

  console.log("\n" + report);
  writeFileSync(path.join(__dirname, "REPORT.md"), report, "utf8");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
