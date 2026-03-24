import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  bundle: true,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
