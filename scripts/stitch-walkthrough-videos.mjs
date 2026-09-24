#!/usr/bin/env node
/**
 * Stitches the per-viewport walkthrough recordings (produced by
 * `npm run test:e2e:walkthrough:{user,admin}:{desktop,tablet-portrait,tablet-landscape,mobile}`
 * and archived under artifacts/walkthrough/source-recordings/<role>/<viewport>/)
 * into the final product-demo videos required by
 * prompts/Claude_Playwright_Product_Walkthrough_Tests_Desktop_Tablet_Mobile.md:
 *
 *   artifacts/walkthrough/user-walkthrough-final.mp4
 *   artifacts/walkthrough/admin-walkthrough-final.mp4
 *   artifacts/walkthrough/complete-product-walkthrough-final.mp4
 *   artifacts/walkthrough/manifest.json
 *
 * The four viewport recordings for a role have different resolutions/aspect
 * ratios (1280x720, 768x1024, 1024x768, 390x844), so each is letterboxed
 * onto a common canvas before concatenation rather than being stretched.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "artifacts", "walkthrough", "source-recordings");
const OUT_DIR = path.join(ROOT, "artifacts", "walkthrough");
// The 0.7x-speed siblings live in their own parallel tree, separate from the
// normal-speed finals, so the two speeds don't intermix in one directory.
const SLOWED_OUT_DIR = path.join(ROOT, "artifacts", "walkthrough", "slowed");
const BASE_URL = "http://localhost:3000";

// Common presentation canvas: wide enough for the 1280px-wide desktop/
// tablet-landscape recordings, tall enough for the 1024px-tall
// tablet-portrait recording — every input is letterboxed/pillarboxed onto
// this canvas rather than stretched, per the spec's "do not distort aspect
// ratio" requirement.
const CANVAS_W = 1280;
const CANVAS_H = 1024;
const FPS = 30;

const VIEWPORT_ORDER = ["desktop", "tablet-portrait", "tablet-landscape", "mobile"];

// Every final video also gets a slowed-down sibling at this fraction of
// normal playback speed (via ffmpeg's setpts filter), written alongside the
// original rather than replacing it. This is a permanent, always-on step —
// not a one-off pass — so every future stitch run produces both speeds.
const SLOW_SPEED_FACTOR = 0.7;

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-4000)}`));
    });
    proc.on("error", reject);
  });
}

function parseDurationSeconds(ffmpegStderr) {
  const match = ffmpegStderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

async function probeDuration(filePath) {
  try {
    const stderr = await run(["-i", filePath]);
    return parseDurationSeconds(stderr);
  } catch (err) {
    // ffmpeg -i with no output exits non-zero even on success; the error
    // object still carries the stderr text we need to parse.
    return parseDurationSeconds(String(err.message ?? ""));
  }
}

/**
 * Builds the -filter_complex graph that letterboxes each input onto the
 * shared canvas and concatenates them (video-only — the recordings have no
 * audio track since they're headless Playwright captures).
 */
function buildConcatArgs(inputFiles, outFile) {
  const inputArgs = inputFiles.flatMap((f) => ["-i", f]);
  const scaled = inputFiles
    .map(
      (_, i) =>
        `[${i}:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease,` +
        `pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS}[v${i}]`,
    )
    .join(";");
  const concatInputs = inputFiles.map((_, i) => `[v${i}]`).join("");
  const filter = `${scaled};${concatInputs}concat=n=${inputFiles.length}:v=1:a=0[outv]`;
  return [
    "-y",
    ...inputArgs,
    "-filter_complex",
    filter,
    "-map",
    "[outv]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    outFile,
  ];
}

/**
 * Builds the ffmpeg args for a slowed-down sibling of an already-stitched
 * final video: re-encodes with setpts to stretch playback to `speedFactor`
 * of the original speed. No audio filter is needed — these recordings are
 * silent headless captures with no audio stream.
 */
function buildSpeedArgs(inputFile, outFile, speedFactor) {
  return [
    "-y",
    "-i",
    inputFile,
    "-filter:v",
    `setpts=PTS/${speedFactor}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    outFile,
  ];
}

function slowSpeedName(name, speedFactor) {
  return name.replace(/\.mp4$/, `-${speedFactor}x.mp4`);
}

async function fileExistsNonEmpty(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

async function resolveRoleViewportFiles(role) {
  const files = {};
  for (const viewport of VIEWPORT_ORDER) {
    const dir = path.join(SOURCE_DIR, role, viewport);
    const entries = await fs.readdir(dir).catch(() => []);
    const webm = entries.find((f) => f.endsWith(".webm"));
    if (!webm) throw new Error(`Missing source recording for ${role}/${viewport} in ${dir}`);
    files[viewport] = path.join(dir, webm);
  }
  return files;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(SLOWED_OUT_DIR, { recursive: true });

  const userFiles = await resolveRoleViewportFiles("user");
  const adminFiles = await resolveRoleViewportFiles("admin");

  const manifest = {
    createdAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    canvas: { width: CANVAS_W, height: CANVAS_H, fps: FPS },
    videos: [],
  };

  // ===== User final =====
  const userOrder = VIEWPORT_ORDER.map((v) => userFiles[v]);
  const userOutFile = path.join(OUT_DIR, "user-walkthrough-final.mp4");
  console.log("Stitching user-walkthrough-final.mp4 ...");
  await run(buildConcatArgs(userOrder, userOutFile));
  const userDuration = await probeDuration(userOutFile);
  manifest.videos.push({
    name: "user-walkthrough-final.mp4",
    testName: "USER PRODUCT WALKTHROUGH",
    finalVideoPath: path.relative(ROOT, userOutFile),
    recordingOrder: VIEWPORT_ORDER.map((viewport) => ({
      viewport,
      source: path.relative(ROOT, userFiles[viewport]),
    })),
    durationSeconds: userDuration,
  });

  // ===== Admin final =====
  const adminOrder = VIEWPORT_ORDER.map((v) => adminFiles[v]);
  const adminOutFile = path.join(OUT_DIR, "admin-walkthrough-final.mp4");
  console.log("Stitching admin-walkthrough-final.mp4 ...");
  await run(buildConcatArgs(adminOrder, adminOutFile));
  const adminDuration = await probeDuration(adminOutFile);
  manifest.videos.push({
    name: "admin-walkthrough-final.mp4",
    testName: "ADMIN PRODUCT WALKTHROUGH",
    finalVideoPath: path.relative(ROOT, adminOutFile),
    recordingOrder: VIEWPORT_ORDER.map((viewport) => ({
      viewport,
      source: path.relative(ROOT, adminFiles[viewport]),
    })),
    durationSeconds: adminDuration,
  });

  // ===== Complete product final =====
  // Recommended order from the spec: User/Desktop -> Admin/Desktop ->
  // User/TabletPortrait -> Admin/TabletPortrait -> User/TabletLandscape ->
  // Admin/TabletLandscape -> User/Mobile -> Admin/Mobile.
  const completeOrder = [];
  const completeManifestOrder = [];
  for (const viewport of VIEWPORT_ORDER) {
    completeOrder.push(userFiles[viewport]);
    completeManifestOrder.push({ role: "user", viewport, source: path.relative(ROOT, userFiles[viewport]) });
    completeOrder.push(adminFiles[viewport]);
    completeManifestOrder.push({ role: "admin", viewport, source: path.relative(ROOT, adminFiles[viewport]) });
  }
  const completeOutFile = path.join(OUT_DIR, "complete-product-walkthrough-final.mp4");
  console.log("Stitching complete-product-walkthrough-final.mp4 ...");
  await run(buildConcatArgs(completeOrder, completeOutFile));
  const completeDuration = await probeDuration(completeOutFile);
  manifest.videos.push({
    name: "complete-product-walkthrough-final.mp4",
    testName: "COMPLETE PRODUCT WALKTHROUGH (User + Admin, all viewports)",
    finalVideoPath: path.relative(ROOT, completeOutFile),
    recordingOrder: completeManifestOrder,
    durationSeconds: completeDuration,
  });

  // ===== 70%-speed siblings (permanent, alongside the originals) =====
  const speedVideos = [];
  for (const video of manifest.videos) {
    const sourceAbs = path.join(ROOT, video.finalVideoPath);
    const slowName = slowSpeedName(video.name, SLOW_SPEED_FACTOR);
    const slowOutFile = path.join(SLOWED_OUT_DIR, slowName);
    console.log(`Stitching ${slowName} (${SLOW_SPEED_FACTOR}x speed) ...`);
    await run(buildSpeedArgs(sourceAbs, slowOutFile, SLOW_SPEED_FACTOR));
    const slowDuration = await probeDuration(slowOutFile);
    speedVideos.push({
      name: slowName,
      testName: `${video.testName} (${SLOW_SPEED_FACTOR}x speed)`,
      finalVideoPath: path.relative(ROOT, slowOutFile),
      sourceVideo: video.name,
      speedFactor: SLOW_SPEED_FACTOR,
      durationSeconds: slowDuration,
    });
  }
  manifest.videos.push(...speedVideos);

  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // ===== Validation =====
  console.log("\nValidation:");
  for (const video of manifest.videos) {
    const abs = path.join(ROOT, video.finalVideoPath);
    const ok = await fileExistsNonEmpty(abs);
    const durOk = typeof video.durationSeconds === "number" && video.durationSeconds > 0;
    console.log(
      `  ${video.name}: exists=${ok} durationSeconds=${video.durationSeconds ?? "unknown"} durationOk=${durOk}`,
    );
    if (!ok || !durOk) {
      throw new Error(`Validation failed for ${video.name}`);
    }
  }
  console.log(`\nManifest written to ${path.relative(ROOT, manifestPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
