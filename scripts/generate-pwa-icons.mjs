// One-time script to generate branded PWA icons using sharp's SVG-to-PNG
// compositing. Re-run manually (`node scripts/generate-pwa-icons.mjs`) if the
// theme color or initials ever change; it is not invoked at build/runtime.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const THEME_COLOR = "#000000";
const INITIALS = "RR"; // Derived from NEXT_PUBLIC_APP_NAME="Referral & Reward Program"

const outDir = path.join(process.cwd(), "public", "icons");

function buildSvg({ size, padding = 0, background, opaque = false }) {
  const contentSize = size - padding * 2;
  const fontSize = Math.round(contentSize * 0.42);
  const cx = size / 2;
  const cy = size / 2;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${opaque ? background : background}" />
  <text
    x="${cx}"
    y="${cy}"
    fill="#ffffff"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    text-anchor="middle"
    dominant-baseline="central"
  >${INITIALS}</text>
</svg>`.trim();
}

async function generateIcon({ fileName, size, padding = 0, background = THEME_COLOR }) {
  const svg = buildSvg({ size, padding, background, opaque: true });
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(outDir, fileName), buffer);
  console.log(`Generated ${fileName} (${size}x${size})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  await generateIcon({ fileName: "icon-192.png", size: 192 });
  await generateIcon({ fileName: "icon-512.png", size: 512 });
  // Maskable icon: keep content within ~80% of the canvas (10% padding on
  // each side) so OS masking (circle, squircle, etc.) doesn't clip it.
  await generateIcon({ fileName: "icon-maskable-512.png", size: 512, padding: 51.2 });
  // Apple touch icon must be opaque (no transparency).
  await generateIcon({ fileName: "apple-touch-icon.png", size: 180 });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
