import { execFileSync } from "node:child_process";
import { mediaBinary } from "./tools.ts";

// Offline fixture probe only. Media times are container PTS, including any leading audio offset.
export function ffmpeg(args: string[]) {
  return execFileSync(
    mediaBinary("ffmpeg"),
    ["-hide_banner", "-loglevel", "error", "-nostdin", ...args],
    { maxBuffer: 32 * 1024 * 1024, timeout: 90000 },
  );
}
export function probe(path: string) {
  return JSON.parse(
    execFileSync(
      mediaBinary("ffprobe"),
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
      { encoding: "utf8" },
    ),
  ) as {
    streams: {
      index: number;
      codec_type: string;
      codec_name: string;
      nb_frames?: string;
      width?: number;
      height?: number;
      start_time?: string;
      duration?: string;
    }[];
    format: { duration?: string; start_time?: string };
  };
}
export type Span = { startMs: number; endMs: number };
export function toneSpans(pcm: Buffer, hz: number): Span[] {
  const sampleRate = 12000,
    block = 120;
  const spans: Span[] = [];
  for (let offset = 0; offset + block * 2 <= pcm.length; offset += block * 2) {
    let real = 0,
      imag = 0;
    for (let i = 0; i < block; i++) {
      const s = pcm.readInt16LE(offset + i * 2) / 32768,
        phase = (2 * Math.PI * hz * i) / sampleRate;
      real += s * Math.cos(phase);
      imag += s * Math.sin(phase);
    }
    if ((2 * Math.hypot(real, imag)) / block < 0.045) continue;
    const startMs = (offset / 2 / sampleRate) * 1000;
    const last = spans.at(-1);
    if (last && startMs - last.endMs < 5) last.endMs = startMs + 10;
    else spans.push({ startMs, endMs: startMs + 10 });
  }
  return spans.filter((s) => s.endMs - s.startMs >= 150);
}

export function decodeAudio(path: string) {
  return ffmpeg([
    "-copyts",
    "-i",
    path,
    "-map",
    "0:a:0",
    "-af",
    "aresample=12000:async=1:first_pts=0",
    "-ac",
    "1",
    "-f",
    "s16le",
    "pipe:1",
  ]);
}

export function analyze(path: string, kind: "source" | "capture") {
  const metadata = probe(path);
  if (!metadata.streams.some((s) => s.codec_type === "audio")) throw new Error("audio_track_missing");
  if (!metadata.streams.some((s) => s.codec_type === "video")) throw new Error("video_track_missing");
  const pcm = decodeAudio(path);
  const markers = toneSpans(pcm, 1200),
    product = toneSpans(pcm, 660);
  // Measure frame PTS and center luminance in one filter pass. Do not infer time from frame index.
  const frames = ffmpeg([
    "-copyts",
    "-i",
    path,
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    "crop=iw/4:ih/4,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-f",
    "null",
    "-enc_time_base",
    "1:1000",
    "-vsync",
    "0",
    "-",
  ]).toString();
  const flash: Span[] = [];
  let lit = false;
  for (const m of frames.matchAll(/pts_time:([\d.e+-]+)\s+lavfi\.signalstats\.YAVG=([\d.]+)/g)) {
    const ms = Number(m[1]) * 1000,
      bright = Number(m[2]) > 205;
    if (bright && !lit) flash.push({ startMs: ms, endMs: ms });
    if (lit && !bright) {
      const last = flash.at(-1);
      if (last) last.endMs = ms;
    }
    lit = bright;
  }
  const pulses = flash.filter((s) => s.endMs - s.startMs >= 150);
  const count = kind === "source" ? 1 : 2;
  if (markers.length !== count || pulses.length !== count)
    throw new Error(`av_sync_unverified ${JSON.stringify({ markers, pulses, product })}`);
  const offsetsMs = markers.map((s, i) => Math.round(s.startMs - pulses[i].startMs));
  if (offsetsMs.some((ms) => Math.abs(ms) > 80))
    throw new Error(`av_sync_out_of_range ${JSON.stringify({ offsetsMs, markers, pulses })}`);
  if (
    kind === "capture" &&
    (product.length !== 1 ||
      product[0].endMs - product[0].startMs < 1880 ||
      product[0].startMs <= markers[0].endMs ||
      product[0].endMs >= markers[1].startMs)
  )
    throw new Error(`expected_audio_not_detected ${JSON.stringify(product)}`);
  return { metadata, markers, pulses, offsetsMs, product };
}
