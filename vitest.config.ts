import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
