import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { platform, release, arch } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { mediaBinary, chromePath } from "../packages/capture/tools.ts";
import { dataDir } from "../packages/storage/paths.ts";

function run(file: string, args: string[]) {
  const r = spawnSync(file, args, { encoding: "utf8", timeout: 8000, maxBuffer: 2 ** 20 });
  return { exit: r.status, output: (r.stdout || "").trim(), error: r.error?.message };
}
export function checkBinary(file: string, args: string[]) {
  const r = run(file, args);
  return {
    file,
    args,
    exit: r.exit,
    status: r.exit === 0 ? "available" : "blocked",
    version: r.output.split("\n")[0] || null,
    error: r.error,
  };
}

export function inspect() {
  const ffmpeg = mediaBinary("ffmpeg");
  const filters = run(ffmpeg, ["-hide_banner", "-filters"]);
  const encoders = run(ffmpeg, ["-hide_banner", "-encoders"]);
  const features: Record<string, boolean> = {};
  for (const [names, result] of [
    [["amix", "subtitles", "xfade", "silencedetect", "signalstats", "drawtext"], filters],
    [["libx264", "aac"], encoders],
  ] as const) {
    for (const name of names)
      features[name] = result.exit === 0 && new RegExp(`\\s${name}\\s`).test(result.output);
  }
  const db = new DatabaseSync(":memory:");
  const sqlite = db.prepare("SELECT sqlite_version() AS version").get()?.version;
  db.close();
  const binaries = {
    node: checkBinary(process.execPath, ["--version"]),
    pnpm: checkBinary("pnpm", ["--version"]),
    chrome: checkBinary(chromePath(), ["--version"]),
    codex: checkBinary("codex", ["--version"]),
    ffmpeg: checkBinary(ffmpeg, ["-version"]),
    ffprobe: checkBinary(mediaBinary("ffprobe"), ["-version"]),
  };
  const localReady =
    process.version === "v24.22.1" &&
    binaries.pnpm.version === "11.25.0" &&
    Object.values(binaries).every((b) => b.status === "available") &&
    Object.values(features).every(Boolean);
  const require = createRequire(import.meta.url);
  return {
    task: "T00",
    checkedAt: new Date().toISOString(),
    localReady,
    os: [platform(), release(), arch()],
    gitHead: run("git", ["rev-parse", "HEAD"]).output || null,
    workingTreeDirty: Boolean(run("git", ["status", "--porcelain"]).output),
    lockSha256: createHash("sha256")
      .update(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url)))
      .digest("hex"),
    sqlite,
    playwright: require("playwright-core/package.json").version,
    binaries,
    features,
    providers: {
      codexImage: { status: "unverified", reason: "尚未实测后台生成并取得图片" },
      omni: {
        status: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "unverified" : "blocked",
        reason: "需可用的 Gemini API 配置及已接受预算",
      },
      tts: { status: "unverified", reason: "尚未选择提供方" },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = inspect();
  const dir = join(dataDir(), "reports", `doctor-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "doctor.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2), "\n", join(dir, "doctor.json"));
  process.exitCode = report.localReady ? 0 : 1;
}
