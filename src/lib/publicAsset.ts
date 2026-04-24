/**
 * Resolves public/ URLs for GitHub Pages (Vite `base`, e.g. /vibe-coding-recess/)
 * and local dev. Use paths relative to /public, no leading slash.
 * @example publicAsset("figma/left-line.svg")
 */
export function publicAsset(pathRelativeToPublic: string): string {
  const p = pathRelativeToPublic.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${p}`;
}
