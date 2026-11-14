import { Store } from "../../packages/storage/store.ts";
import { dataDir } from "../../packages/storage/paths.ts";
const store = new Store(dataDir());
const timer = setInterval(() => store.workOnce(), 250);
function stop() {
  clearInterval(timer);
  store.db.close();
  process.exit(0);
}
process.on("disconnect", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
