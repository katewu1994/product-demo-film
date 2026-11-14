import test from "node:test";
import assert from "node:assert/strict";
import { checkBinary } from "../scripts/doctor.ts";

test("doctor differentiates a working binary and a missing dependency", () => {
  assert.equal(checkBinary(process.execPath, ["--version"]).status, "available");
  assert.equal(checkBinary("/productfilm-missing-binary", ["--version"]).status, "blocked");
});
