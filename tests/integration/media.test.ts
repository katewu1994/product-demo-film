import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, ffmpeg } from "../../packages/capture/measurement.ts";

test("decode distinguishes missing, silent and delayed audio and rejects absent product sound between markers", () => {
  const dir = mkdtempSync(join(tmpdir(), "ProductFilm media "));
  function media(name: string, audio?: string, twice = false) {
    const path = join(dir, `${name}.mkv`);
    const pulses = `between(t,0.5,0.9)${twice ? "+between(t,2,2.4)" : ""}`;
    const args = ["-f", "lavfi", "-i", "color=c=black:s=160x90:r=30:d=3"];
    if (audio) args.push("-f", "lavfi", "-i", `aevalsrc=${audio}:s=48000:d=3`, "-c:a", "pcm_s16le");
    ffmpeg([
      ...args,
      "-vf",
      `drawbox=color=white:t=fill:enable='${pulses}'`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path,
    ]);
    return path;
  }
  assert.throws(() => analyze(media("missing"), "source"), /audio_track_missing/);
  assert.throws(() => analyze(media("silent", "0"), "source"), /av_sync_unverified/);
  assert.throws(
    () => analyze(media("delayed", "0.15*sin(2*PI*1200*t)*between(t\\,0.7\\,1.1)"), "source"),
    /av_sync_out_of_range/,
  );
  assert.throws(
    () =>
      analyze(
        media("no product", "0.15*sin(2*PI*1200*t)*(between(t\\,0.5\\,0.9)+between(t\\,2\\,2.4))", true),
        "capture",
      ),
    /expected_audio_not_detected/,
  );
});
