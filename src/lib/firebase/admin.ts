import { readFileSync } from "fs";
import { join } from "path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

// Master Prompt.md §26: Firebase Admin SDK, server-side only. The service
// account private key is real (from firebase_prerequisites/, see
// FIREBASE_SERVICE_ACCOUNT_PATH in .env) and must never reach the browser —
// only ever import this from server code (src/lib/push/fcm.ts), never from
// a "use client" component.
//
// Pinned to `globalThis` for the same reason as the Prisma client singleton
// in src/lib/prisma.ts: Next.js dev-mode hot reload would otherwise call
// initializeApp() again on every edit and crash with
// "The default Firebase app already exists".
const globalForFirebaseAdmin = globalThis as unknown as { __firebaseAdminApp?: App };

export function getFirebaseAdminApp(): App {
  if (globalForFirebaseAdmin.__firebaseAdminApp) {
    return globalForFirebaseAdmin.__firebaseAdminApp;
  }

  const existing = getApps()[0];
  if (existing) {
    globalForFirebaseAdmin.__firebaseAdminApp = existing;
    return existing;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not configured");
  }

  // turbopackIgnore: the path is env-driven, not statically analyzable — without
  // this hint Turbopack would trace and bundle the entire project (including
  // public/) as a false-positive "this file might be needed" precaution.
  const resolvedPath = join(process.cwd(), /* turbopackIgnore: true */ serviceAccountPath);
  const serviceAccount = JSON.parse(readFileSync(resolvedPath, "utf-8"));

  const app = initializeApp({ credential: cert(serviceAccount) });
  globalForFirebaseAdmin.__firebaseAdminApp = app;
  return app;
}
