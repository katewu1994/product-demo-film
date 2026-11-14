import test from "node:test";
import assert from "node:assert/strict";
import { fixturePlan, validate } from "../packages/render/fixture-plan.ts";
const digest = "0".repeat(64);
const plan = () =>
  fixturePlan(
    { intro: digest, demo: digest, outro: digest, font: digest, normalized: digest },
    { startMs: 2000, endMs: 4010 },
  );
test("fixture plan rejects gaps, clipped source audio and unexpected graph fields", () => {
  validate(plan());
  const gap = plan();
  gap.clips[1].outputFrameRange.startFrame++;
  assert.throws(() => validate(gap), /duration_conflict/);
  const cut = plan();
  cut.audioTracks[0].requiredWindow.outMs += 100;
  assert.throws(() => validate(cut), /expected_audio_window_cut/);
  assert.throws(() => validate({ ...plan(), filter: "unsupported" }), /invalid_plan/);
});
