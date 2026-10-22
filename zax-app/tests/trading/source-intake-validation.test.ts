import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validateRetainedSourceBytes } from "../../server/trading/source-intake-validation";

// Local software fixture bytes only. No uploads, DB/storage, provider or model.
const fixtures = JSON.parse(
  execFileSync(
    process.env.PYTHON_EXECUTABLE || "python3",
    [
      "-c",
      [
        "import cv2, numpy as np, base64, json",
        "image = np.zeros((2,2,3), dtype=np.uint8)",
        "out = {}",
        "for extension, mime in [('.png','image/png'),('.jpg','image/jpeg'),('.webp','image/webp')]:",
        " ok, encoded = cv2.imencode(extension, image)",
        " if not ok: raise ValueError('fixture encoding failed')",
        " out[mime] = base64.b64encode(encoded).decode('ascii')",
        "print(json.dumps(out))",
      ].join("\n"),
    ],
    { timeout: 10_000, maxBuffer: 16_384, encoding: "utf8" },
  ),
) as Record<string, string>;

describe("local source decoder — generated software fixtures, no retention", () => {
  it("decodes complete bounded PNG, JPEG and WebP bytes with the installed worker", async () => {
    for (const [mime, encoded] of Object.entries(fixtures)) {
      await expect(
        validateRetainedSourceBytes(Buffer.from(encoded, "base64"), mime),
      ).resolves.toBeUndefined();
    }
  }, 20_000);

  it("rejects signature-only image and truncated PDF bytes before retention", async () => {
    await expect(
      validateRetainedSourceBytes(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).rejects.toThrow(/unreadable/);
    await expect(
      validateRetainedSourceBytes(
        Buffer.from("%PDF-1.7\ntruncated software fixture\n"),
        "application/pdf",
      ),
    ).rejects.toThrow(/could not be parsed/);
  });
});
