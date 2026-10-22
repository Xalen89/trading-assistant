import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = process.cwd();
const directory = resolve(root, process.argv[2] ?? "web-dist");
if (!existsSync(resolve(directory, "index.html"))) {
  throw new Error("Expo must export index.html before recording the release");
}
const sourceDirectories = [
  "app",
  "components",
  "constants",
  "hooks",
  "lib",
  "server",
  "assets",
  "python",
  "scripts",
];
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__pycache__") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (
      entry.isFile() &&
      /\.(?:tsx?|jsx?|mjs|cjs|json|css|py|txt|svg|png|jpe?g|webp|woff2?|ttf)$/.test(
        entry.name,
      )
    ) {
      files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
}
for (const path of sourceDirectories) {
  const absolute = resolve(root, path);
  if (existsSync(absolute)) collect(absolute);
}
for (const path of [
  "package.json",
  "pnpm-lock.yaml",
  ".npmrc",
  "app.config.ts",
  "babel.config.js",
  "metro.config.js",
  "tsconfig.json",
  "global.css",
  "Dockerfile",
]) {
  if (existsSync(resolve(root, path))) files.push(path);
}
const hash = createHash("sha256");
for (const path of [...new Set(files)].sort()) {
  hash.update(path + "\0");
  hash.update(readFileSync(resolve(root, path)));
  hash.update("\0");
}
const release = {
  app: "Zax",
  schemaVersion: 1,
  sourceFingerprint: "sha256:" + hash.digest("hex"),
};
writeFileSync(
  resolve(directory, "zax-release.json"),
  JSON.stringify(release) + "\n",
);
console.log(JSON.stringify(release));
