import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, sep, isAbsolute } from "node:path";
import { analyze, decodeAudio, ffmpeg, probe, toneSpans } from "../packages/capture/measurement.ts";
import { fixturePlan, validate } from "../packages/render/fixture-plan.ts";
import { dataDir } from "../packages/storage/paths.ts";
import { inspect } from "./doctor.ts";

const reports = join(dataDir(), "reports"),
  capture = process.argv[2];
if (!capture || !/^capture-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(capture))
  throw new Error("请传入成功的 capture-<UUID> 报告目录名");
const dir = join(reports, `render-${randomUUID()}`);
mkdirSync(dir, { recursive: true });
const hash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
function captureFile(name: string) {
  const p = realpathSync(join(reports, capture, name));
  const rel = relative(realpathSync(reports), p);
  if (isAbsolute(rel) || rel.startsWith(`..${sep}`) || rel === "..")
    throw new Error("invalid_input_path");
  return p;
}
const result: Record<string, unknown> = {
  task: "T04",
  origin: "fixture",
  capture,
  environment: inspect(),
  command: `pnpm render:fixture ${capture}`,
};
try {
  const report = JSON.parse(readFileSync(captureFile("report.json"), "utf8"));
  const raw = captureFile("raw.webm");
  if (
    report.task !== "T02" ||
    report.origin !== "fixture" ||
    report.status !== "passed" ||
    report.sha256 !== hash(raw)
  )
    throw new Error("invalid_capture");
  const measured = analyze(raw, "capture");
  process.chdir(dir);
  const inputs = {
    intro: "intro.mp4",
    demo: "demo.webm",
    outro: "outro.mp4",
    font: "font.ttf",
    normalized: "normalized.mkv",
  };
  copyFileSync(raw, inputs.demo);
  copyFileSync("/System/Library/Fonts/Supplemental/Arial.ttf", inputs.font);
  for (const [name, color] of [
    ["intro", "0x23392f"],
    ["outro", "0x384956"],
  ]) {
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=640x360:r=24:d=18`,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      inputs[name as "intro" | "outro"],
    ]);
  }
  // Chrome can resize the tab during capture. Normalize in an isolated pass so reinitializing
  // a scale filter cannot reset the state of the timeline concat/trim filters.
  ffmpeg([
    "-copyts",
    "-i",
    inputs.demo,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-vf",
    "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-vsync",
    "0",
    "-enc_time_base",
    "1:1000",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "copy",
    inputs.normalized,
  ]);
  const digest = {
    intro: hash(inputs.intro),
    demo: hash(inputs.demo),
    outro: hash(inputs.outro),
    font: hash(inputs.font),
    normalized: hash(inputs.normalized),
  };
  const plan = fixturePlan(digest, measured.product[0]);
  validate(plan);
  writeFileSync("plan.json", JSON.stringify(plan, null, 2), { flag: "wx" });
  result.planSha256 = hash("plan.json");
  const outputs = [];
  for (const mode of ["preview", "export"] as const) {
    const frozen: unknown = JSON.parse(readFileSync("plan.json", "utf8"));
    validate(frozen);
    if (hash("plan.json") !== result.planSha256) throw new Error("stale_plan");
    for (const key of Object.keys(inputs) as (keyof typeof inputs)[])
      if (hash(inputs[key]) !== frozen.inputManifest[key]) throw new Error("stale_dependency");
    const width = mode === "preview" ? 640 : 1920,
      height = (width * 9) / 16;
    const graph: string[] = [];
    for (const [index, clip] of frozen.clips.entries()) {
      const source = clip.sourceRangeMs,
        range = clip.outputFrameRange;
      const frames = range.endFrameExclusive - range.startFrame;
      const start = source.inMs / 1000,
        end = source.outMs / 1000;
      // CFR quantization precedes trim so VFR tabs retain their displayed frame during still periods.
      graph.push(
        `[${index}:v]fps=30:start_time=0,trim=start_frame=${Math.round(start * 30)}:end_frame=${Math.round(end * 30)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`,
      );
      const original = frozen.audioTracks.some((track) => track.linkedVideoClipId === clip.id);
      const audio = original
        ? `[${index}:a]aresample=48000:first_pts=0,atrim=start_sample=${Math.round(start * 30) * 1600}:end_sample=${Math.round(end * 30) * 1600},asetpts=PTS-STARTPTS`
        : `anullsrc=r=48000:cl=mono,atrim=end_sample=${frames * 1600}`;
      graph.push(`${audio},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono[a${index}]`);
    }
    const overlay = frozen.overlays[0],
      range = overlay.outputFrameRange;
    writeFileSync("title.txt", overlay.text);
    graph.push(
      "[v0][v1][v2]concat=n=3:v=1:a=0,setpts=N/(30*TB)[sequence]",
      "[a0][a1][a2]concat=n=3:v=0:a=1[audio]",
      `[sequence]drawtext=fontfile=font.ttf:textfile=title.txt:expansion=none:fontsize=${Math.round(width / 22)}:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:enable='gte(n,${range.startFrame})*lt(n,${range.endFrameExclusive})'[video]`,
    );
    const temp = `${mode}.partial.mp4`;
    ffmpeg([
      "-copyts",
      "-i",
      inputs.intro,
      "-i",
      inputs.normalized,
      "-i",
      inputs.outro,
      "-filter_complex",
      graph.join(";"),
      "-map",
      "[video]",
      "-map",
      "[audio]",
      "-c:v",
      "libx264",
      "-threads",
      "4",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      temp,
    ]);
    const meta = probe(temp),
      v = meta.streams.find((s) => s.codec_type === "video"),
      a = meta.streams.find((s) => s.codec_type === "audio");
    const policy = frozen.outputPolicy;
    for (const s of [meta.format, ...meta.streams]) {
      const end = (Number(s.start_time || 0) + Number(s.duration)) * 1000;
      if (
        !Number.isFinite(end) ||
        Math.abs(end - policy.targetDurationMs) > 1000 / 30 ||
        end > policy.competitionMaxDurationMs
      )
        throw new Error(`duration_conflict ${end}`);
    }
    if (
      Number(v?.nb_frames) !== frozen.totalFrames ||
      v?.width !== width ||
      v.height !== height ||
      v.codec_name !== "h264" ||
      a?.codec_name !== "aac"
    )
      throw new Error("invalid_export_stream");
    ffmpeg(["-xerror", "-i", temp, "-f", "null", "-"]);
    const pcm = decodeAudio(temp),
      product = toneSpans(pcm, 660),
      markers = toneSpans(pcm, 1200);
    const demo = frozen.clips[1],
      required = frozen.audioTracks[0].requiredWindow;
    const expectedStart =
      (demo.outputFrameRange.startFrame * 1000) / 30 + required.inMs - demo.sourceRangeMs.inMs;
    if (
      product.length !== 1 ||
      Math.abs(product[0].startMs - expectedStart) > 20 ||
      Math.abs(product[0].endMs - product[0].startMs - (required.outMs - required.inMs)) > 20 ||
      markers.length
    )
      throw new Error(`invalid_export_audio ${JSON.stringify({ product, markers })}`);
    const path = `${mode}.mp4`;
    renameSync(temp, path);
    outputs.push({
      mode,
      path,
      sha256: hash(path),
      width,
      height,
      frames: Number(v.nb_frames),
      duration: meta.format.duration,
      product,
      markers,
    });
  }
  result.outputs = outputs;
  result.exit = 0;
  result.status = "passed";
} catch (e) {
  result.status = "failed";
  result.exit = 1;
  result.error = String(e);
  process.exitCode = 1;
  console.error(result.error);
} finally {
  writeFileSync(join(dir, "report.json"), JSON.stringify(result, null, 2));
  console.log(join(dir, "report.json"));
}
