import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url)),
);
let revision = "local";
try {
  revision = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {}
const build = { version, revision };
export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(build) },
  plugins: [
    {
      name: "cadence-build-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify(build) + "\n",
        });
      },
      configureServer(server) {
        server.middlewares.use("/version.json", (_request, response) => {
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-cache");
          response.end(JSON.stringify(build));
        });
      },
    },
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
