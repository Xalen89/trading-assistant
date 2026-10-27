import { spawnSync } from "node:child_process";
import {
  constants,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--skip-python")) {
  console.error("Usage: pnpm run setup [--skip-python]");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error("[setup] A required command failed; setup is incomplete.");
    process.exit(1);
  }
}

function pnpm(args) {
  // Reuse the pnpm that launched this script, including Corepack installations.
  run(process.execPath, [process.env.npm_execpath, ...args]);
}

pnpm(["install", "--frozen-lockfile"]);
if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env", constants.COPYFILE_EXCL);
  if (process.platform === "win32") {
    writeFileSync(
      ".env",
      readFileSync(".env", "utf8").replace(
        ".venv/bin/python",
        ".venv/Scripts/python.exe",
      ),
    );
  }
  console.log(
    "[setup] Created .env. Fill in the required values, then rerun pnpm run setup.",
  );
}
pnpm(["verify:setup", "--config-only"]);
await import("dotenv/config");

if (!args.includes("--skip-python")) {
  const localPython =
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python";
  const python = process.env.PYTHON_EXECUTABLE || "python3";
  if (resolve(python) === resolve(localPython) && !existsSync(localPython)) {
    run(process.platform === "win32" ? "python" : "python3", [
      "-m",
      "venv",
      ".venv",
    ]);
  }
  run(python, ["-m", "pip", "install", "-r", "python/requirements.txt"]);
}
pnpm(["db:migrate"]);
pnpm([
  "verify:setup",
  ...(args.includes("--skip-python") ? ["--skip-python"] : []),
]);
console.log("[setup] Complete. Start development with pnpm dev.");
