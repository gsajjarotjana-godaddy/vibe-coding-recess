import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Project Pages lives at /repo-name/. Set in CI: VITE_BASE_PATH=/vibe-coding-recess */
function basePath(): string {
  const p = process.env.VITE_BASE_PATH;
  if (!p || p === "/") return "/";
  const s = p.trim().startsWith("/") ? p.trim() : `/${p.trim()}`;
  return s.endsWith("/") ? s : `${s}/`;
}

export default defineConfig({
  plugins: [react()],
  envPrefix: "VITE_",
  base: basePath(),
});
