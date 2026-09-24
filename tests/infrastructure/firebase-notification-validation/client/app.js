// VALIDATION ONLY — NOT APPLICATION INTEGRATION
//
// Standalone (non-Next.js) page: initializes the Firebase Web SDK using the
// public web config from firebase_prerequisites, registers this harness's
// own service worker, requests notification permission, and obtains a real
// FCM registration token. Results are written into the DOM so a Playwright
// driver can read them back without any custom IPC.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getMessaging,
  getToken,
  onMessage,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js";

// Public web config — these values are meant to ship in client bundles
// (they identify the project to Google's client SDKs; they are not secrets).
// Sourced verbatim from firebase_prerequisites/Firebase_Config_Details.txt.
const firebaseConfig = {
  apiKey: "AIzaSyAar4S82_Lc3enFXNUIpLjLeiJURxU2tg0",
  authDomain: "nextvest-93730.firebaseapp.com",
  projectId: "nextvest-93730",
  storageBucket: "nextvest-93730.firebasestorage.app",
  messagingSenderId: "295407231445",
  appId: "1:295407231445:web:8346a175fb281cd89e5d5c",
  measurementId: "G-6TV094E9H9",
};

// Web Push certificate (VAPID) key pair public key, from firebase_prerequisites.
const VAPID_KEY =
  "BAVpitPAO3V1CjwFl6lcyeQ6h67rTLzrlq5xFB048F5pQPAf74hF8i6B_L7U5ruraBu0G4b_kKuqpX402wGbTTA";

const statusEl = document.getElementById("status");
const tokenEl = document.getElementById("token");
const receivedEl = document.getElementById("received");

function setStatus(s) {
  statusEl.textContent = s;
  window.__harnessStatus = s;
}

async function main() {
  try {
    setStatus("firebase-app-initializing");
    const app = initializeApp(firebaseConfig);

    setStatus("registering-service-worker");
    const swReg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;

    setStatus("requesting-notification-permission");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(`permission-denied:${permission}`);
      return;
    }

    setStatus("initializing-messaging");
    const messaging = getMessaging(app);

    setStatus("requesting-fcm-token");
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      setStatus("token-empty");
      return;
    }

    tokenEl.textContent = token;
    window.__harnessToken = token;
    setStatus("token-obtained");

    // Foreground message handler — proves actual delivery back to the page
    // when a real FCM send is issued against this token while the tab is open.
    onMessage(messaging, (payload) => {
      receivedEl.textContent = JSON.stringify(payload);
      window.__harnessReceived = payload;
      setStatus("message-received");
    });
  } catch (err) {
    setStatus(`error:${err && err.code ? err.code : err}`);
    window.__harnessError = String((err && err.message) || err);
  }
}

main();
