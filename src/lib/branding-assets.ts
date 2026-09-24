import { existsSync } from "fs";
import path from "path";

/** A stored asset path may point at a file that was later deleted from disk
 * (e.g. a reset or a manual cleanup); callers should render their default
 * instead of a broken image in that case. */
export function existingPublicAsset(url: string | null | undefined): string | null {
  if (!url) return null;
  const full = path.join(process.cwd(), "public", url);
  return existsSync(full) ? url : null;
}
