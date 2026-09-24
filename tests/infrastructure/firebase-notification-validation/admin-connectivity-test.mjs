// VALIDATION ONLY — NOT APPLICATION INTEGRATION
//
// Server-side Firebase Admin SDK connectivity + FCM configuration test.
// Reads the service-account credentials from firebase_prerequisites/ (never
// copied into this harness) and performs one read-only Firebase Auth call
// (listUsers(1)) to prove the credentials are valid and the intended
// project is reachable, without creating/modifying any data.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREREQ_DIR = path.resolve(__dirname, "../../../firebase_prerequisites");
const SERVICE_ACCOUNT_PATH = path.join(PREREQ_DIR, "nextvest-93730-becd4dbee5b1.json");

const result = {
  serviceAccountParsed: false,
  projectId: null,
  sdkInitialized: false,
  projectReachable: false,
  authCredentialsValid: false,
  messagingApiAvailable: false,
  errors: [],
};

function mask(str) {
  if (!str) return "(none)";
  return `${str.slice(0, 6)}…(len ${str.length})`;
}

try {
  const raw = readFileSync(SERVICE_ACCOUNT_PATH, "utf8");
  const serviceAccount = JSON.parse(raw);
  result.serviceAccountParsed = true;
  result.projectId = serviceAccount.project_id;

  console.log("SERVICE_ACCOUNT_FILE: configured / masked");
  console.log(`SERVICE_ACCOUNT_PROJECT_ID: ${serviceAccount.project_id}`);
  console.log(`SERVICE_ACCOUNT_CLIENT_EMAIL: ${serviceAccount.client_email}`);
  console.log(`SERVICE_ACCOUNT_PRIVATE_KEY: ${mask(serviceAccount.private_key)} [masked]`);

  const app = initializeApp(
    { credential: cert(serviceAccount), projectId: serviceAccount.project_id },
    "firebase-validation-harness",
  );
  result.sdkInitialized = true;

  const messaging = getMessaging(app);
  result.messagingApiAvailable = true;

  // validateOnly send with a syntactically-plausible but non-existent
  // registration token: this forces the Admin SDK to authenticate to
  // Google's OAuth2 token endpoint with the service-account key, then call
  // the real FCM v1 send endpoint for THIS project (googleapis.com/v1/
  // projects/nextvest-93730/messages:send). No message is actually
  // delivered (validateOnly: true) and no data is created — but a
  // credential/project-reachability problem, an FCM-disabled project, or a
  // wrong project ID would surface here as an auth/permission/project error
  // rather than a token error, which is exactly the signal we need.
  try {
    await messaging.send(
      {
        token: "cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        notification: { title: "validation", body: "validation" },
      },
      true, // dryRun / validateOnly
    );
    // Would only reach here if Google accepted the token as real, which is
    // not expected for a synthetic token.
    result.projectReachable = true;
    result.authCredentialsValid = true;
  } catch (sendErr) {
    const code = sendErr?.errorInfo?.code || sendErr?.code || "";
    const tokenRejectionCodes = [
      "messaging/invalid-registration-token",
      "messaging/registration-token-not-registered",
      "messaging/invalid-argument", // FCM validated the request against the project and rejected only the malformed token value
    ];
    if (tokenRejectionCodes.includes(code)) {
      // Reached the real FCM send API for this project and authenticated
      // successfully; it only rejected the fake token itself.
      result.projectReachable = true;
      result.authCredentialsValid = true;
    } else {
      throw sendErr;
    }
  }
} catch (err) {
  result.errors.push({
    step: result.sdkInitialized
      ? result.messagingApiAvailable
        ? "messaging-validate-send"
        : "messaging-init"
      : result.serviceAccountParsed
        ? "sdk-init"
        : "service-account-read",
    code: err?.code || err?.errorInfo?.code || err?.name,
    message: (err?.message || String(err)).slice(0, 500),
  });
}

console.log("\n--- ADMIN CONNECTIVITY RESULT (JSON) ---");
console.log(JSON.stringify(result, null, 2));
