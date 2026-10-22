import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { tradingSources, tradingVectors } from "../../drizzle/schema";
import {
  DESCRIPTOR_DIMENSIONS,
  DESCRIPTOR_VERSION,
  type VisualSearch,
} from "../../lib/trading/research";
import type { Candle, Pattern } from "../../lib/trading/model";
import { isGenericLibrarySource } from "../../lib/trading/source-purpose";
import {
  dbRequired,
  decryptFile,
  encryptFile,
  getSource,
  publicSourcePattern,
} from "./repository";
import { pythonCache, runPython } from "./python";

export function validateVector(base64: string): Buffer {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== DESCRIPTOR_DIMENSIONS * 4)
    throw new Error("Invalid visual descriptor dimensions.");
  let norm = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const n = bytes.readFloatLE(i);
    if (!Number.isFinite(n))
      throw new Error("Invalid visual descriptor values.");
    norm += n * n;
  }
  if (Math.abs(norm - 1) > 0.01)
    throw new Error("Visual descriptor is not normalized.");
  return bytes;
}
export async function indexImage(
  userId: number,
  pattern: Pattern,
  bytes: Buffer,
): Promise<void> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const output = await runPython<{
    vectorBase64: string;
    descriptorVersion: string;
    dimensions: number;
    sourceHash: string;
  }>("pattern_indexer", {
    operation: "index",
    owner: String(userId),
    dbPath: pythonCache,
    patternId: pattern.id,
    version: pattern.version,
    sourceHash: hash,
    imageBase64: bytes.toString("base64"),
  });
  if (
    output.descriptorVersion !== DESCRIPTOR_VERSION ||
    output.sourceHash !== hash
  )
    throw new Error("Visual descriptor provenance mismatch.");
  const vector = validateVector(output.vectorBase64),
    db = await dbRequired();
  await db
    .insert(tradingVectors)
    .values({
      id: `${userId}:${pattern.id}:${DESCRIPTOR_VERSION}`,
      userId,
      patternId: pattern.id,
      sourceHash: hash,
      descriptorVersion: DESCRIPTOR_VERSION,
      encryptedVector: encryptFile(vector).toString("base64"),
    })
    .onDuplicateKeyUpdate({
      set: {
        sourceHash: hash,
        encryptedVector: encryptFile(vector).toString("base64"),
      },
    });
  pattern.visualIndex = {
    status: "indexed",
    descriptorVersion: DESCRIPTOR_VERSION,
    sourceHash: hash,
    indexedAt: Date.now(),
  };
}
export async function reindexSource(userId: number, id: string) {
  const source = await getSource(userId, id),
    pattern = source.metadata;
  if (!source.mime.startsWith("image/"))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Visual indexing supports image sources only.",
    });
  if (!isGenericLibrarySource(pattern))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This private screenshot source is reserved for its dedicated review and cannot be visually indexed.",
    });
  await indexImage(userId, pattern, Buffer.from(source.base64, "base64"));
  const db = await dbRequired();
  const changed = await db
    .update(tradingSources)
    .set({ metadata: pattern })
    .where(
      and(
        eq(tradingSources.id, id),
        eq(tradingSources.userId, userId),
        sql`JSON_EXTRACT(${tradingSources.metadata}, '$.version') = ${pattern.version}`,
      ),
    );
  if (changed[0].affectedRows !== 1)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Source changed while indexing; reload the current definition. No source revision was overwritten.",
    });
  return publicSourcePattern(pattern);
}
export async function visualSearch(
  userId: number,
  query: {
    imageBase64?: string;
    candles?: Candle[];
    strategyId?: string;
    market?: string;
    timeframe?: string;
  },
): Promise<VisualSearch> {
  const db = await dbRequired();
  const rows = await db
    .select({ vector: tradingVectors, source: tradingSources })
    .from(tradingVectors)
    .innerJoin(
      tradingSources,
      and(
        eq(tradingSources.id, tradingVectors.patternId),
        eq(tradingSources.userId, userId),
      ),
    )
    .where(
      and(
        eq(tradingVectors.userId, userId),
        eq(tradingVectors.descriptorVersion, DESCRIPTOR_VERSION),
      ),
    )
    .limit(501);
  if (rows.length > 500)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Visual library exceeds the bounded 500-reference scan.",
    });
  const candidates = rows
    .map((row) => ({
      vector: row.vector,
      pattern: row.source.metadata as Pattern,
    }))
    .filter(
      ({ pattern }) =>
        isGenericLibrarySource(pattern) &&
        pattern.status === "ready" &&
        (!query.strategyId || pattern.strategyId === query.strategyId) &&
        (!query.market || pattern.market === query.market) &&
        (!query.timeframe || pattern.timeframe === query.timeframe),
    );
  const limitations =
    "OpenCV cosine similarity compares chart geometry, not FVG semantics, confluence certainty or trade success. Themes/crops/axes can dominate; confirm references manually.";
  if (!candidates.length)
    return {
      results: [],
      examined: 0,
      limitations:
        "No indexed, reviewed images in this scope. Upload/accept or reindex a relevant reference. " +
        limitations,
    };
  const descriptors = candidates.map(({ vector, pattern }) => ({
    patternId: pattern.id,
    version: pattern.version,
    sourceHash: vector.sourceHash,
    descriptorVersion: vector.descriptorVersion,
    vectorBase64: validateVector(
      decryptFile(Buffer.from(vector.encryptedVector, "base64")).toString(
        "base64",
      ),
    ).toString("base64"),
  }));
  const output = await runPython<{
    results: { patternId: string; version: number; similarity: number }[];
    examined: number;
  }>("pattern_indexer", {
    operation: "query",
    owner: String(userId),
    dbPath: pythonCache,
    candidates: descriptors,
    topK: 5,
    imageBase64: query.imageBase64,
    candles: query.candles,
  });
  return {
    examined: candidates.length,
    limitations,
    results: output.results.flatMap((result) => {
      const candidate = candidates.find(
        (c) =>
          c.pattern.id === result.patternId &&
          c.pattern.version === result.version,
      );
      if (
        !candidate ||
        !Number.isFinite(result.similarity) ||
        result.similarity < 0 ||
        result.similarity > 1
      )
        return [];
      const p = candidate.pattern;
      return [
        {
          patternId: p.id,
          name: p.name,
          strategyId: p.strategyId,
          sourceVersion: p.version,
          similarity: result.similarity,
          descriptorVersion: DESCRIPTOR_VERSION,
          reference: {
            id: p.id,
            name: p.name,
            version: p.version,
            description: p.description || p.notes,
            rules: p.rules || [],
            filename: p.filename,
          },
        },
      ];
    }),
  };
}
