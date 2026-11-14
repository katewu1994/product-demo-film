import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  editable,
  initialBudgets,
  sectionOrder,
  type Draft,
  type Job,
  type Project,
} from "../contracts/project.ts";

export class Problem extends Error {
  status: number;
  code: string;
  currentRevision?: number;
  constructor(status: number, code: string, message: string, revision?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.currentRevision = revision;
  }
}

export class Store {
  db: DatabaseSync;
  root: string;
  constructor(root: string) {
    this.root = root;
    const dbPath = join(root, "db", "productfilm.sqlite");
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL");
    this.transaction(() => {
      const v = this.db.prepare("PRAGMA user_version").get()?.user_version;
      if (v === 1) return;
      if (v !== 0) throw new Error("数据库版本尚不受支持");
      this.db.exec(`
        CREATE TABLE projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updatedAt TEXT NOT NULL, title TEXT NOT NULL);
        CREATE TABLE revisions(projectId TEXT REFERENCES projects(id), revision INTEGER, snapshot TEXT NOT NULL, PRIMARY KEY(projectId,revision));
        CREATE TABLE events(seq INTEGER PRIMARY KEY, projectId TEXT REFERENCES projects(id), revision INTEGER NOT NULL, jobId TEXT, kind TEXT NOT NULL, at TEXT NOT NULL);
        CREATE TABLE jobs(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), inputRevision INTEGER NOT NULL, requestKey TEXT NOT NULL,
          state TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, leaseUntil INTEGER, createdAt TEXT NOT NULL, error TEXT,
          UNIQUE(projectId,requestKey), FOREIGN KEY(projectId,inputRevision) REFERENCES revisions(projectId,revision));
        CREATE TABLE artifacts(jobId TEXT PRIMARY KEY REFERENCES jobs(id), relativePath TEXT NOT NULL, sha256 TEXT NOT NULL, sizeBytes INTEGER NOT NULL, origin TEXT NOT NULL);
        PRAGMA user_version=1;`);
    });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  list() {
    return this.db.prepare("SELECT * FROM projects ORDER BY updatedAt DESC,id").all();
  }
  project(id: string, revision?: number): Project {
    const row = this.db
      .prepare(
        "SELECT snapshot FROM revisions WHERE projectId=? AND revision=COALESCE(?,(SELECT revision FROM projects WHERE id=?))",
      )
      .get(id, revision ?? null, id);
    if (!row) throw new Problem(404, "project_not_found", "找不到项目或版本");
    return JSON.parse(String(row.snapshot));
  }
  save(draft: Draft, id?: string, expected?: number): Project {
    return this.transaction(() => {
      const old = id ? this.project(id) : undefined;
      if (old && old.revision !== expected)
        throw new Problem(409, "revision_conflict", "另一窗口已保存新版本，请重新载入", old.revision);
      const pid = id ?? randomUUID(),
        now = new Date().toISOString();
      const budgets = initialBudgets(draft.targetDurationMs);
      const project: Project = {
        ...editable(draft),
        title: draft.title.trim(),
        schemaVersion: "1.0",
        id: pid,
        revision: (old?.revision ?? 0) + 1,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        output: {
          targetDurationMs: draft.targetDurationMs,
          competitionMaxDurationMs: 180000,
          width: 1920,
          height: 1080,
          timebase: { fpsNum: 30, fpsDen: 1 },
          videoCodec: "h264",
          audioCodec: "aac",
          container: "mp4",
        },
        sections: sectionOrder.map((section, i) => {
          const prev = old?.sections[i],
            narrationText = draft.narration[section],
            budgetMs = budgets[i];
          const changed = !prev || prev.narrationText !== narrationText || prev.budgetMs !== budgetMs;
          return {
            id: section,
            revision: (prev?.revision ?? 0) + Number(changed),
            narrationText,
            budgetMs,
          };
        }),
      };
      this.db
        .prepare(
          "INSERT INTO projects VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updatedAt=excluded.updatedAt,title=excluded.title",
        )
        .run(pid, project.revision, now, project.title);
      this.db
        .prepare("INSERT INTO revisions VALUES(?,?,?)")
        .run(pid, project.revision, JSON.stringify(project));
      this.event(pid, project.revision, null, "project_saved");
      return project;
    });
  }
  event(pid: string, revision: number, jobId: string | null, kind: string) {
    this.db
      .prepare("INSERT INTO events(projectId,revision,jobId,kind,at) VALUES(?,?,?,?,?)")
      .run(pid, revision, jobId, kind, new Date().toISOString());
  }
  jobs(pid: string): Job[] {
    this.project(pid);
    return this.db
      .prepare(
        "SELECT id,projectId,inputRevision,state,attempt,createdAt,error FROM jobs WHERE projectId=? ORDER BY createdAt DESC,rowid DESC",
      )
      .all(pid) as unknown as Job[];
  }
  enqueue(pid: string, revision: number, key: string) {
    return this.transaction(() => {
      const existing = this.db
        .prepare("SELECT id,inputRevision FROM jobs WHERE projectId=? AND requestKey=?")
        .get(pid, key);
      if (existing) {
        if (existing.inputRevision !== revision)
          throw new Problem(409, "idempotency_conflict", "该请求已绑定另一版本");
        return String(existing.id);
      }
      const current = this.project(pid);
      if (current.revision !== revision)
        throw new Problem(409, "revision_conflict", "请载入当前版本", current.revision);
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO jobs(id,projectId,inputRevision,requestKey,state,createdAt) VALUES(?,?,?,?,'queued',?)",
        )
        .run(id, pid, revision, key, new Date().toISOString());
      this.event(pid, revision, id, "queued");
      return id;
    });
  }
  // This worker only handles the side-effect-free snapshot fixture.
  workOnce() {
    const job = this.transaction(() => {
      const row = this.db
        .prepare(`UPDATE jobs SET state='running',attempt=attempt+1,leaseUntil=?
        WHERE id=(SELECT id FROM jobs WHERE state='queued' OR (state='running' AND leaseUntil<=?) ORDER BY createdAt LIMIT 1)
        RETURNING id,projectId,inputRevision,attempt`)
        .get(Date.now() + 30000, Date.now());
      if (!row) return;
      const job = row as unknown as Job;
      this.event(job.projectId, job.inputRevision, job.id, "running");
      return job;
    });
    if (!job) return false;
    try {
      const project = this.project(job.projectId, job.inputRevision);
      const relativePath = join("jobs", job.id, String(job.attempt), "snapshot.json");
      const path = join(this.root, relativePath);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const bytes = Buffer.from(JSON.stringify(project));
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, bytes, { flag: "wx" });
      const actual = readFileSync(tmp);
      if (!actual.equals(bytes)) throw new Error("快照读回校验失败");
      const hash = createHash("sha256").update(actual).digest("hex");
      this.transaction(() => {
        const result = this.db
          .prepare(
            "UPDATE jobs SET state='succeeded',leaseUntil=NULL WHERE id=? AND attempt=? AND state='running' AND leaseUntil>?",
          )
          .run(job.id, job.attempt, Date.now());
        if (!result.changes) return;
        renameSync(tmp, path);
        this.db
          .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?)")
          .run(job.id, relativePath, hash, actual.length, "fixture");
        this.event(job.projectId, job.inputRevision, job.id, "succeeded");
      });
    } catch {
      this.transaction(() => {
        const r = this.db
          .prepare(
            "UPDATE jobs SET state='failed',leaseUntil=NULL,error='snapshot_write_failed' WHERE id=? AND attempt=? AND state='running' AND leaseUntil>?",
          )
          .run(job.id, job.attempt, Date.now());
        if (r.changes) this.event(job.projectId, job.inputRevision, job.id, "failed");
      });
    }
    return true;
  }
}
