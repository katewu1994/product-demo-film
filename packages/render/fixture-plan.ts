import Ajv from "ajv";
import type { Span } from "../capture/measurement.ts";

const clipIds = ["intro", "demo", "outro"] as const;
type ClipId = (typeof clipIds)[number];
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" },
  frame = { type: "integer", minimum: 0 };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const frameRange = object({ startFrame: frame, endFrameExclusive: frame });
const msRange = object({ inMs: frame, outMs: frame });
const fixed = <T>(value: T) => ({ const: value });
const schema = object({
  schemaVersion: fixed("1.0"),
  purpose: fixed("validation_sample"),
  origin: fixed("fixture"),
  timelineRevision: fixed(1),
  outputPolicy: object({
    targetDurationMs: fixed(30000),
    competitionMaxDurationMs: fixed(180000),
    maxDurationErrorFrames: fixed(1),
  }),
  timebase: object({ fpsNum: fixed(30), fpsDen: fixed(1) }),
  totalFrames: fixed(900),
  clips: {
    type: "array",
    minItems: 3,
    maxItems: 3,
    items: object({ id: { enum: clipIds }, sourceRangeMs: msRange, outputFrameRange: frameRange }),
  },
  audioTracks: {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: object({
      role: fixed("product_audio"),
      linkedVideoClipId: fixed("demo"),
      requiredWindow: msRange,
    }),
  },
  overlays: {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: object({
      text: { type: "string", minLength: 1, maxLength: 120 },
      outputFrameRange: frameRange,
    }),
  },
  inputManifest: object({
    intro: digest,
    demo: digest,
    outro: digest,
    font: digest,
    normalized: digest,
  }),
});
const check = new Ajv().compile(schema);
type Range = { startFrame: number; endFrameExclusive: number };
type Clip = { id: ClipId; sourceRangeMs: { inMs: number; outMs: number }; outputFrameRange: Range };
export function fixturePlan(hashes: Record<ClipId | "font" | "normalized", string>, window: Span) {
  const first = 360;
  // Enclose the entire sound in whole output frames, quantizing once at the boundaries.
  const sourceStart = Math.floor((window.startMs * 30) / 1000);
  const sourceEnd = Math.ceil((window.endMs * 30) / 1000);
  const next = first + sourceEnd - sourceStart;
  function clip(id: ClipId, sourceFrame: number, startFrame: number, endFrameExclusive: number): Clip {
    return {
      id,
      sourceRangeMs: {
        inMs: Math.round((sourceFrame * 1000) / 30),
        outMs: Math.round(((sourceFrame + endFrameExclusive - startFrame) * 1000) / 30),
      },
      outputFrameRange: { startFrame, endFrameExclusive },
    };
  }
  return {
    schemaVersion: "1.0",
    purpose: "validation_sample",
    origin: "fixture",
    timelineRevision: 1,
    outputPolicy: {
      targetDurationMs: 30000,
      competitionMaxDurationMs: 180000,
      maxDurationErrorFrames: 1,
    },
    timebase: { fpsNum: 30, fpsDen: 1 },
    totalFrames: 900,
    clips: [
      clip("intro", 0, 0, first),
      clip("demo", sourceStart, first, next),
      clip("outro", 0, next, 900),
    ],
    audioTracks: [
      {
        role: "product_audio",
        linkedVideoClipId: "demo",
        requiredWindow: { inMs: window.startMs, outMs: window.endMs },
      },
    ],
    overlays: [
      {
        text: "ProductFilm / Audio capture test",
        outputFrameRange: { startFrame: 0, endFrameExclusive: 120 },
      },
    ],
    inputManifest: hashes,
  };
}
export type FixturePlan = ReturnType<typeof fixturePlan>;
export function validate(plan: unknown): asserts plan is FixturePlan {
  if (!check(plan)) throw new Error(`invalid_plan ${JSON.stringify(check.errors)}`);
  const p = plan as FixturePlan;
  let cursor = 0;
  for (const [i, clip] of p.clips.entries()) {
    const { startFrame, endFrameExclusive } = clip.outputFrameRange,
      { inMs, outMs } = clip.sourceRangeMs;
    const frames = endFrameExclusive - startFrame;
    if (
      clip.id !== clipIds[i] ||
      startFrame !== cursor ||
      frames <= 0 ||
      outMs <= inMs ||
      Math.abs((frames * 1000) / 30 - (outMs - inMs)) > 1
    )
      throw new Error("duration_conflict");
    cursor = endFrameExclusive;
  }
  const window = p.audioTracks[0].requiredWindow,
    range = p.clips[1].sourceRangeMs;
  if (window.inMs >= window.outMs || range.inMs > window.inMs || range.outMs < window.outMs)
    throw new Error("expected_audio_window_cut");
  const overlay = p.overlays[0].outputFrameRange;
  if (
    cursor !== p.totalFrames ||
    overlay.endFrameExclusive <= overlay.startFrame ||
    overlay.endFrameExclusive > cursor
  )
    throw new Error("duration_conflict");
}
