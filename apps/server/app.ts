import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import files from "@fastify/static";
import {
  draftSchema,
  editSchema,
  revisionSchema,
  type Draft,
} from "../../packages/contracts/project.ts";
import { type Store, Problem } from "../../packages/storage/store.ts";

export function server(store: Store) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  const session = randomBytes(32).toString("hex");
  app.addHook("onRequest", async (req, reply) => {
    const port = req.raw.socket.localPort || 4317;
    const host = `127.0.0.1:${port}`;
    if (
      req.headers.host !== host ||
      (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      throw new Problem(403, "origin_forbidden", "只允许本地同源访问");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (req.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      if (req.url !== "/api/v1/session" && req.headers["x-productfilm-session"] !== session)
        throw new Problem(403, "invalid_session", "本地会话已更新，请重新连接");
    }
  });
  app.setErrorHandler((err: Error & { validation?: unknown; statusCode?: number }, _req, reply) => {
    if (err instanceof Problem)
      return reply.code(err.status).send({
        code: err.code,
        message: err.message,
        currentRevision: err.currentRevision,
        details: {},
        retryable: false,
      });
    const status = err.statusCode ?? 500;
    return reply.code(status).send({
      code: status < 500 ? "invalid_request" : "internal_error",
      message: status < 500 ? "输入不符合项目契约" : "本地服务未能完成操作",
      details: {},
      retryable: false,
    });
  });
  app.get("/api/v1/session", () => ({ session }));
  app.get("/api/v1/projects", () => store.list());
  app.post<{ Body: Draft }>("/api/v1/projects", { schema: { body: draftSchema } }, (req, reply) =>
    reply.code(201).send(store.save(req.body)),
  );
  type Params = { id: string };
  app.get<{ Params: Params }>("/api/v1/projects/:id", (req) => store.project(req.params.id));
  app.put<{ Params: Params; Body: { expectedRevision: number; draft: Draft } }>(
    "/api/v1/projects/:id",
    { schema: { body: editSchema } },
    (req) => store.save(req.body.draft, req.params.id, req.body.expectedRevision),
  );
  app.get<{ Params: Params }>("/api/v1/projects/:id/jobs", (req) => store.jobs(req.params.id));
  app.post<{ Params: Params; Body: { expectedRevision: number } }>(
    "/api/v1/projects/:id/checks",
    {
      schema: {
        body: {
          type: "object",
          required: ["expectedRevision"],
          additionalProperties: false,
          properties: { expectedRevision: revisionSchema },
        },
      },
    },
    (req, reply) => {
      const key = req.headers["idempotency-key"];
      if (typeof key !== "string" || !/^[\w-]{1,100}$/.test(key))
        throw new Problem(400, "invalid_key", "请提供请求标识");
      const jobId = store.enqueue(req.params.id, req.body.expectedRevision, key);
      return reply.code(202).send({ jobId });
    },
  );
  app.register(files, {
    root: fileURLToPath(new URL("../web/dist/", import.meta.url)),
    index: "index.html",
  });
  app.addHook("onClose", async () => store.db.close());
  return app;
}
