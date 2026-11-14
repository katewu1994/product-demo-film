import test from "node:test";
import assert from "node:assert/strict";
import { initialBudgets } from "../packages/contracts/project.ts";
test("five initial integer budgets cover the selected target including fractional percentages", () => {
  assert.deepEqual(initialBudgets(150000), [22500, 15000, 22500, 75000, 15000]);
  for (const ms of [120000, 150001, 180000])
    assert.equal(
      initialBudgets(ms).reduce((a, b) => a + b, 0),
      ms,
    );
});
