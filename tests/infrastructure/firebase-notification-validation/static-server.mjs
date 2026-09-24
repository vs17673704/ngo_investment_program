// VALIDATION ONLY — NOT APPLICATION INTEGRATION
//
// Trivial static file server for the isolated FCM validation client page.
// Deliberately separate from the Next.js dev server (different port,
// different process, no Next.js involved at all).

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "client");
const PORT = Number(process.env.HARNESS_PORT || 5057);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(CLIENT_DIR, urlPath);
    if (!filePath.startsWith(CLIENT_DIR)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`[validation-harness] static server listening on http://localhost:${PORT}`);
});
