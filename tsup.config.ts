import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli-main": "src/cli-main.ts",
    "sdk/index": "src/sdk/index.ts",
  },
  format: ["cjs"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  bundle: true,
  dts: true,
  shims: false,
});
