/**
 * Runs before index.css: sets --figma-cursor-asterisk so cursor:url() respects Vite base.
 */
import { publicAsset } from "./lib/publicAsset";

const cursor = `url("${publicAsset("figma/cursor-asterisk.svg")}") 10 10, auto`;
document.documentElement.style.setProperty("--figma-cursor-asterisk", cursor);
