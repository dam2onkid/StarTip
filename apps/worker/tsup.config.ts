import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  outDir: "dist",
  noExternal: ["@startip/shared"],
});
