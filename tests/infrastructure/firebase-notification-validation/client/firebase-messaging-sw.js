// VALIDATION ONLY — NOT APPLICATION INTEGRATION
//
// Service worker for the standalone Firebase FCM validation harness only.
// This file is served from tests/infrastructure/firebase-notification-validation/client/
// by static-server.mjs, on its own isolated port — it is NOT the
// application's real service worker (public/sw.js) and is not reachable
// from the application's origin/dev server.

importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAar4S82_Lc3enFXNUIpLjLeiJURxU2tg0",
  authDomain: "nextvest-93730.firebaseapp.com",
  projectId: "nextvest-93730",
  storageBucket: "nextvest-93730.firebasestorage.app",
  messagingSenderId: "295407231445",
  appId: "1:295407231445:web:8346a175fb281cd89e5d5c",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Validation notification";
  const body = (payload.notification && payload.notification.body) || "";
  self.registration.showNotification(title, { body });
});
