#!/usr/bin/env node
/**
 * Stitches the cross-role walkthrough recordings into the final deliverables
 * required by
 * prompts/Claude_Cross_Role_Product_Walkthrough_Playwright_Desktop_Tablet_Mobile.md:
 *
 *   artifacts/walkthrough/cross-role/product-walkthrough-desktop-final.mp4
 *   artifacts/walkthrough/cross-role/product-walkthrough-tablet-portrait-final.mp4
 *   artifacts/walkthrough/cross-role/product-walkthrough-tablet-landscape-final.mp4
 *   artifacts/walkthrough/cross-role/product-walkthrough-mobile-final.mp4
 *   artifacts/walkthrough/cross-role/complete-product-walkthrough-final.mp4
 *   artifacts/walkthrough/cross-role/manifest.json
 *
 * Kept under a dedicated "cross-role/" subdirectory of artifacts/walkthrough/
 * so these outputs never collide with the identically-named final videos
 * already produced there for the two single-role specs (user-walkthrough.spec.ts,
 * admin-walkthrough.spec.ts) by scripts/stitch-walkthrough-videos.mjs — this
 * file's source test (product-walkthrough-e2e.spec.ts /
 * product-walkthrough-responsive.spec.ts) is a different pair of specs
 * entirely, demonstrating cross-role same-entity continuity rather than two
 * independent single-role journeys.
 *
 * Desktop's source is product-walkthrough-e2e.spec.ts's own already-stitched
 * output (it manages its own ~13 BrowserContexts and ffmpeg camera-tracking
 * pipeline internally — see that file's registerCamera()/stitchWalkthroughVideo()).
 * Tablet/mobile sources are the two per-role recordings produced by
 * product-walkthrough-responsive.spec.ts (concatenated user-then-admin).
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "artifacts", "walkthrough", "cross-role", "source-recordings");
const OUT_DIR = path.join(ROOT, "artifacts", "walkthrough", "cross-role");
// The 0.7x-speed siblings live in their own parallel tree, separate from the
// normal-speed finals, so the two speeds don't intermix in one directory.
const SLOWED_OUT_DIR = path.join(ROOT, "artifacts", "walkthrough", "slowed", "cross-role");
const BASE_URL = "http://localhost:3000";

const CANVAS_W = 1280;
const CANVAS_H = 1024;
const FPS = 30;

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
    return parseDurationSeconds(String(err.message ?? ""));
  }
}

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
  return ["-y", ...inputArgs, "-filter_complex", filter, "-map", "[outv]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", outFile];
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

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(SLOWED_OUT_DIR, { recursive: true });

  const desktopSource = path.join(SOURCE_DIR, "desktop", "product-walkthrough-e2e.webm");
  const tabletPortraitUser = path.join(SOURCE_DIR, "tablet-portrait", "product-walkthrough-responsive-user-tablet-portrait.webm");
  const tabletPortraitAdmin = path.join(SOURCE_DIR, "tablet-portrait", "product-walkthrough-responsive-admin-tablet-portrait.webm");
  const tabletLandscapeUser = path.join(SOURCE_DIR, "tablet-landscape", "product-walkthrough-responsive-user-tablet-landscape.webm");
  const tabletLandscapeAdmin = path.join(SOURCE_DIR, "tablet-landscape", "product-walkthrough-responsive-admin-tablet-landscape.webm");
  const mobileUser = path.join(SOURCE_DIR, "mobile", "product-walkthrough-responsive-user-mobile.webm");
  const mobileAdmin = path.join(SOURCE_DIR, "mobile", "product-walkthrough-responsive-admin-mobile.webm");

  const manifest = { createdAt: new Date().toISOString(), baseUrl: BASE_URL, canvas: { width: CANVAS_W, height: CANVAS_H, fps: FPS }, videos: [] };

  async function stitchOne(name, testName, inputs, recordingOrder) {
    const outFile = path.join(OUT_DIR, name);
    console.log(`Stitching ${name} ...`);
    await run(buildConcatArgs(inputs, outFile));
    const durationSeconds = await probeDuration(outFile);
    manifest.videos.push({
      name,
      testName,
      finalVideoPath: path.relative(ROOT, outFile),
      recordingOrder,
      durationSeconds,
    });
    return outFile;
  }

  const desktopFinal = await stitchOne(
    "product-walkthrough-desktop-final.mp4",
    "COMPLETE PRODUCT WALKTHROUGH (cross-role, Desktop)",
    [desktopSource],
    [{ viewport: "desktop", source: path.relative(ROOT, desktopSource) }],
  );

  const tabletPortraitFinal = await stitchOne(
    "product-walkthrough-tablet-portrait-final.mp4",
    "CROSS-ROLE RESPONSIVE WALKTHROUGH (Tablet Portrait)",
    [tabletPortraitUser, tabletPortraitAdmin],
    [
      { role: "user", viewport: "tablet-portrait", source: path.relative(ROOT, tabletPortraitUser) },
      { role: "admin", viewport: "tablet-portrait", source: path.relative(ROOT, tabletPortraitAdmin) },
    ],
  );

  const tabletLandscapeFinal = await stitchOne(
    "product-walkthrough-tablet-landscape-final.mp4",
    "CROSS-ROLE RESPONSIVE WALKTHROUGH (Tablet Landscape)",
    [tabletLandscapeUser, tabletLandscapeAdmin],
    [
      { role: "user", viewport: "tablet-landscape", source: path.relative(ROOT, tabletLandscapeUser) },
      { role: "admin", viewport: "tablet-landscape", source: path.relative(ROOT, tabletLandscapeAdmin) },
    ],
  );

  const mobileFinal = await stitchOne(
    "product-walkthrough-mobile-final.mp4",
    "CROSS-ROLE RESPONSIVE WALKTHROUGH (Mobile)",
    [mobileUser, mobileAdmin],
    [
      { role: "user", viewport: "mobile", source: path.relative(ROOT, mobileUser) },
      { role: "admin", viewport: "mobile", source: path.relative(ROOT, mobileAdmin) },
    ],
  );

  await stitchOne(
    "complete-product-walkthrough-final.mp4",
    "COMPLETE PRODUCT WALKTHROUGH (cross-role, all viewports)",
    [desktopFinal, tabletPortraitFinal, tabletLandscapeFinal, mobileFinal],
    [
      { viewport: "desktop", source: path.relative(ROOT, desktopFinal) },
      { viewport: "tablet-portrait", source: path.relative(ROOT, tabletPortraitFinal) },
      { viewport: "tablet-landscape", source: path.relative(ROOT, tabletLandscapeFinal) },
      { viewport: "mobile", source: path.relative(ROOT, mobileFinal) },
    ],
  );

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

  console.log("\nValidation:");
  for (const video of manifest.videos) {
    const abs = path.join(ROOT, video.finalVideoPath);
    const ok = await fileExistsNonEmpty(abs);
    const durOk = typeof video.durationSeconds === "number" && video.durationSeconds > 0;
    console.log(`  ${video.name}: exists=${ok} durationSeconds=${video.durationSeconds ?? "unknown"} durationOk=${durOk}`);
    if (!ok || !durOk) throw new Error(`Validation failed for ${video.name}`);
  }
  console.log(`\nManifest written to ${path.relative(ROOT, manifestPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
