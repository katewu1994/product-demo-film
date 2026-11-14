import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const dataDir = () =>
  resolve(
    process.env.PRODUCTFILM_DATA_DIR ||
      (process.platform === "darwin"
        ? join(homedir(), "Library/Application Support/ProductFilm")
        : join(homedir(), ".local/share/productfilm")),
  );
