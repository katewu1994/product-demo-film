import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { server } from "../../apps/server/app.ts";
import { emptyDraft } from "../../packages/contracts/project.ts";
import { Store } from "../../packages/storage/store.ts";

test("revision, queued snapshot, fencing and independent projects survive reopening", () => {
  const root = mkdtempSync(join(tmpdir(), "productfilm-db-"));
  const first = new Store(root),
    a = first.save({ ...emptyDraft(), title: "甲" }),
    b = first.save({ ...emptyDraft(), title: "乙" });
  const job = first.enqueue(a.id, 1, "single");
  assert.equal(job, first.enqueue(a.id, 1, "single"));
  const draft = { ...a, narration: { ...a.narration, proof: "新版" } };
  const changed = first.save(draft, a.id, 1);
  assert.deepEqual(
    changed.sections.map((s) => s.revision),
    [1, 1, 1, 2, 1],
  );
  assert.throws(() => first.save(draft, a.id, 1), { code: "revision_conflict", currentRevision: 2 });
  assert.throws(() => first.enqueue(a.id, 2, "single"), { code: "idempotency_conflict" });
  first.db.prepare("UPDATE jobs SET state='running',attempt=1,leaseUntil=0 WHERE id=?").run(job);
  first.db.close();
  const reopened = new Store(root);
  assert.equal(reopened.project(a.id).narration.proof, "新版");
  assert.equal(reopened.project(b.id).narration.proof, "");
  assert.equal(reopened.workOnce(), true);
  assert.equal(reopened.workOnce(), false);
  assert.equal(reopened.jobs(a.id)[0].attempt, 2);
  assert.equal(reopened.jobs(a.id)[0].state, "succeeded");
  assert.deepEqual(reopened.jobs(b.id), []);
  const artifact = reopened.db.prepare("SELECT * FROM artifacts WHERE jobId=?").get(job);
  assert.ok(artifact);
  const bytes = readFileSync(join(root, String(artifact.relativePath)));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
  assert.equal(JSON.parse(bytes.toString()).revision, 1);
  reopened.db.close();
});

test("API validates local host, origin, session, strict schema and write revisions", async () => {
  const app = server(new Store(mkdtempSync(join(tmpdir(), "productfilm-api-"))));
  try {
    const headers = { host: "127.0.0.1:4317" };
    const url = "/api/v1/projects";
    assert.equal((await app.inject({ url, headers })).statusCode, 403);
    assert.equal(
      (await app.inject({ url: "/api/v1/session", headers: { host: "other.test:4317" } })).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/v1/session",
          headers: { ...headers, origin: "https://other.test" },
        })
      ).statusCode,
      403,
    );
    const session = (await app.inject({ url: "/api/v1/session", headers })).json().session;
    const local = { ...headers, "x-productfilm-session": session },
      draft = { ...emptyDraft(), title: "项目" };
    const post = (body: object) => app.inject({ method: "POST", url, headers: local, payload: body });
    assert.equal((await post({ ...draft, extra: true })).statusCode, 400);
    assert.equal((await post({ ...draft, targetDurationMs: 180001 })).statusCode, 400);
    const created = await post(draft);
    assert.equal(created.statusCode, 201);
    const update = () =>
      app.inject({
        method: "PUT",
        url: `${url}/${created.json().id}`,
        headers: local,
        payload: { expectedRevision: 1, draft },
      });
    assert.equal((await update()).statusCode, 200);
    const conflict = await update();
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().currentRevision, 2);
  } finally {
    await app.close();
  }
});
