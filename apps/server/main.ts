import { fork } from "node:child_process";
import { server } from "./app.ts";
import { Store } from "../../packages/storage/store.ts";
import { dataDir } from "../../packages/storage/paths.ts";

const app = server(new Store(dataDir()));
const address = await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.PRODUCTFILM_PORT ?? 4317),
});
const worker = fork(new URL("../worker/main.ts", import.meta.url), [], {
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});
console.log("ProductFilm", address);
let closing = false;
async function stop(code: number) {
  if (closing) return;
  closing = true;
  worker.kill("SIGTERM");
  await app.close();
  process.exitCode = code;
}
worker.on("exit", () => {
  if (!closing) void stop(1);
});
process.on("SIGTERM", () => void stop(0));
process.on("SIGINT", () => void stop(0));
