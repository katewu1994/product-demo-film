import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export function mediaBinary(name: "ffmpeg" | "ffprobe") {
  const configured = process.env[`PRODUCTFILM_${name.toUpperCase()}`];
  if (configured) return configured;
  if (process.platform === "darwin" && process.arch === "arm64") {
    try {
      return join(dirname(require.resolve(`@${name}-installer/darwin-arm64/package.json`)), name);
    } catch {
      /* Use a system installation if the optional package is absent. */
    }
  }
  return name;
}

export const chromePath = () =>
  process.env.PRODUCTFILM_CHROME ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");
