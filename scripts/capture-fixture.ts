import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, type Browser, type Page } from "playwright-core";
import { chromePath } from "../packages/capture/tools.ts";
import { analyze, ffmpeg } from "../packages/capture/measurement.ts";
import { dataDir } from "../packages/storage/paths.ts";
import { inspect } from "./doctor.ts";

const fault = process.argv[2];
if (fault && !["--no-audio", "--close-target", "--playback-timeout"].includes(fault))
  throw new Error("未知夹具故障参数");
const id = randomUUID();
const dir = join(dataDir(), "reports", `capture-${id}`);
mkdirSync(dir, { recursive: true });
const anchor = join(dir, "anchor.mp4"),
  tone = join(dir, "tone.wav"),
  temp = join(dir, "raw.partial.webm");
const routes = new Map<string, { bytes: Buffer; type: string }>();
const fixtureServer = createServer((req, res) => {
  const route = routes.get(req.url || "");
  if (!route) {
    res.writeHead(404).end();
    return;
  }
  res
    .writeHead(200, {
      "Content-Type": route.type,
      "Content-Length": route.bytes.length,
      "Cache-Control": "no-store",
    })
    .end(route.bytes);
});
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const events: { id: string; state: string; monotonicMs: number }[] = [];
const mark = (id: string, state: string) => {
  events.push({ id, state, monotonicMs: performance.now() });
};
const environment = inspect();
const evidence: Record<string, unknown> = {
  task: "T02",
  origin: "fixture",
  runId: id,
  environment,
  events,
  command: ["pnpm capture:fixture", fault].filter(Boolean).join(" "),
};
let browser: Browser | undefined;
try {
  if (!/Google Chrome/.test(environment.binaries.chrome.version || ""))
    throw new Error("wrong_browser_channel");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=640x360:r=30:d=1.6",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.125*sin(2*PI*1200*t)*gte(t\\,0.5)*lt(t\\,1.1):s=48000:d=1.6",
    "-vf",
    "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(t,0.5)*lt(t,1.1)'",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    anchor,
  ]);
  evidence.source = analyze(anchor, "source");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:duration=2",
    "-c:a",
    "pcm_s16le",
    tone,
  ]);
  for (const name of ["product", "calibration", "recorder"]) {
    let html = readFileSync(new URL(`../fixtures/demo-product/${name}.html`, import.meta.url), "utf8");
    if (name === "calibration") html = html.replace("ProductFilm calibration", id);
    if (name === "recorder" && fault === "--no-audio") html = html.replace("audio:true", "audio:false");
    if (name === "product" && fault === "--playback-timeout")
      html = html.replace("audio.play()", "audio.pause()");
    routes.set(`/${name}`, { bytes: Buffer.from(html), type: "text/html; charset=utf-8" });
  }
  routes.set("/anchor.mp4", { bytes: readFileSync(anchor), type: "video/mp4" });
  routes.set("/tone.wav", { bytes: readFileSync(tone), type: "audio/wav" });
  evidence.inputHashes = Object.fromEntries([...routes].map(([key, r]) => [key, hash(r.bytes)]));
  fixtureServer.listen(0, "127.0.0.1");
  await once(fixtureServer, "listening");
  const addr = fixtureServer.address();
  if (!addr || typeof addr === "string") throw new Error("fixture_server_failed");
  const url = `http://127.0.0.1:${addr.port}`;
  browser = await chromium.launch({
    executablePath: chromePath(),
    headless: false,
    chromiumSandbox: true,
    ignoreDefaultArgs: ["--mute-audio"],
    args: [`--auto-select-tab-capture-source-by-title=${id}`],
  });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const target = await context.newPage(),
    control = await context.newPage();
  for (const p of [target, control]) p.setDefaultTimeout(12000);
  await target.goto(`${url}/calibration`);
  await control.goto(`${url}/recorder`);
  await control.getByText("Start capture").click();
  await control.waitForFunction(() => document.querySelector("output")?.textContent !== "idle", null, {
    timeout: 12000,
  });
  const state = await control.locator("output").textContent();
  if (state !== "recording") throw new Error(state || "recorder_failed");
  mark("stream", "started");
  await target.bringToFront();
  async function play(page: Page, id: string, button: string, ended: () => Promise<void>) {
    mark(id, "start");
    await page.getByRole("button", { name: button }).click();
    await ended();
    mark(id, "completed");
  }
  async function displayedAnchor() {
    const before = performance.now();
    const sample = await target.evaluate(() => ({
      sampleAt: performance.now(),
      displayAt: Number(document.body.dataset.flashAt),
      sourcePtsMs: Number(document.body.dataset.flashMedia) * 1000,
    }));
    const after = performance.now();
    if (!Number.isFinite(sample.displayAt) || !Number.isFinite(sample.sourcePtsMs))
      throw new Error("av_sync_unverified");
    return {
      monotonicMs: (before + after) / 2 - sample.sampleAt + sample.displayAt,
      sourcePtsMs: sample.sourcePtsMs,
      clockReadRoundTripMs: after - before,
    };
  }
  const endAnchor = () => target.locator('body[data-played="yes"]').waitFor();
  await play(target, "leader", "播放校准片", endAnchor);
  const leader = await displayedAnchor();
  await target.goto(`${url}/product`);
  if (fault === "--close-target") await target.close();
  if (fault === "--playback-timeout") target.setDefaultTimeout(2500);
  await play(target, "product", "播放试听音", () => target.getByText("播放完毕").waitFor());
  await target.goto(`${url}/calibration`);
  await play(target, "trailer", "播放校准片", endAnchor);
  const trailer = await displayedAnchor();
  const download = control.waitForEvent("download", { timeout: 10000 });
  await control.getByText("Stop capture").click();
  await (await download).saveAs(temp);
  mark("stream", "stopped");
  const measured = analyze(temp, "capture");
  evidence.captureClock = {
    syncToleranceMs: 80,
    anchors: [leader, trailer].map((sample, i) => ({
      ...sample,
      eventId: i === 0 ? "leader" : "trailer",
      mediaPtsMs: measured.pulses[i].startMs,
    })),
  };
  evidence.capture = measured;
  evidence.sha256 = hash(readFileSync(temp));
  renameSync(temp, join(dir, "raw.webm"));
  evidence.status = "passed";
  evidence.exit = 0;
  console.log("同流首尾偏差 (ms)", measured.offsetsMs, "测试音窗口", measured.product);
} catch (e) {
  evidence.status = "failed";
  evidence.exit = 1;
  evidence.error = String(e);
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (fixtureServer.listening) {
    fixtureServer.closeAllConnections();
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  }
  writeFileSync(join(dir, "report.json"), JSON.stringify(evidence, null, 2));
  console.log(join(dir, "report.json"));
}
