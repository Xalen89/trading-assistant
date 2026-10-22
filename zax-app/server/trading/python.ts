import { spawn } from "node:child_process";
import { mkdir, chmod } from "node:fs/promises";
import { resolve } from "node:path";
let active = false;
const waiters: (() => void)[] = [];
const MAX_OUTPUT = 3 * 1024 * 1024;
export const pythonCache = resolve(".cache", "chart-vectors", "vectors.sqlite");
export async function runPython<T>(
  script: "pattern_indexer" | "research_engine" | "orderbook_research",
  input: unknown,
  timeoutMs = 30000,
): Promise<T> {
  if (active && waiters.length >= 4)
    throw new Error("Research worker busy; try again after the current job.");
  if (active) await new Promise<void>((done) => waiters.push(done));
  else active = true;
  try {
    const payload = JSON.stringify(input);
    if (Buffer.byteLength(payload) > 13 * 1024 * 1024)
      throw new Error("Python input exceeded size limit.");
    await mkdir(resolve(".cache", "chart-vectors"), {
      recursive: true,
      mode: 0o700,
    });
    await chmod(resolve(".cache", "chart-vectors"), 0o700);
    return await new Promise<T>((done, fail) => {
      const child = spawn(
        process.env.PYTHON_EXECUTABLE || "python3",
        [resolve("python", script + ".py"), "--json"],
        {
          env: {
            NODE_ENV: process.env.NODE_ENV,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            HOME: process.env.HOME || "/tmp",
            PYTHONUNBUFFERED: "1",
            OPENBLAS_NUM_THREADS: "1",
            OMP_NUM_THREADS: "1",
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let output = "",
        stderr = "",
        settled = false;
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          child.kill("SIGKILL");
          fail(error);
        } else done(value!);
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error("Analysis worker timed out; no result was accepted."),
          ),
        Math.min(timeoutMs, 90000),
      );
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (Buffer.byteLength(output) > MAX_OUTPUT)
          finish(new Error("Analysis output exceeded limit."));
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 4000) stderr += chunk;
      });
      child.on("error", () =>
        finish(
          new Error(
            "Python worker unavailable. Install the pinned Python requirements.",
          ),
        ),
      );
      child.on("close", (code) => {
        if (code !== 0) {
          let knownMessage = "";
          if (script === "orderbook_research") {
            try {
              const e = JSON.parse(output);
              if (
                e.kind === "orderbook-ml" &&
                e.status === "error" &&
                typeof e.error?.message === "string"
              )
                knownMessage = e.error.message.slice(0, 500);
            } catch {
              /* Unknown output is not exposed. */
            }
          }
          finish(
            new Error(
              knownMessage ||
                stderr.trim().slice(0, 500) ||
                "Analysis worker failed.",
            ),
          );
          return;
        }
        try {
          finish(undefined, JSON.parse(output) as T);
        } catch {
          finish(new Error("Analysis worker returned invalid JSON."));
        }
      });
      child.stdin.on("error", () =>
        finish(new Error("Analysis worker could not read its input.")),
      );
      child.stdin.end(payload);
    });
  } finally {
    const next = waiters.shift();
    if (next) next();
    else active = false;
  }
}
