import type {
  AlertEvent,
  AlertRule,
  Strategy,
  Trade,
  Workspace,
} from "./model";
import {
  WORKSPACE_CAPACITY_LIMITS,
  workspaceCapacity,
} from "./workspace-capacity";

export const PORTABLE_FORMAT = "stratdesk-portable-v1";
export const MAX_PORTABLE_ARCHIVE_BYTES = 5 * 1024 * 1024;
export const MAX_PORTABLE_ENTRY_BYTES = 2 * 1024 * 1024;
export const PORTABLE_IMPORT_CONFIRMATION = "IMPORT PORTABLE WORKSPACE";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ALLOWED_IMPORT_FILES = new Set([
  "manifest.json",
  "workspace.json",
  "strategies.json",
  "rules.json",
  "journal.json",
  "library-metadata.json",
  "trades.csv",
  "events.csv",
  "README.txt",
]);
const SENSITIVE_KEY =
  /(key|internaluri|imageuri|objectkey|base64|cookie|token|secret|password|authorization|environment)/i;

type JsonRecord = Record<string, unknown>;
export type PortableArtifact = {
  filename: string;
  mime: "application/zip";
  bytes: Uint8Array;
  files: { path: string; bytes: number }[];
};
export type PortableImportPreview = {
  format: string;
  confirmation: typeof PORTABLE_IMPORT_CONFIRMATION;
  strategies: Strategy[];
  alerts: AlertRule[];
  levels: Workspace["levels"];
  closedTrades: Trade[];
  events: AlertEvent[];
  settings?: Workspace["settings"];
  paperStartingBalance?: number;
  sourceMetadataCount: number;
  skippedOpenOrPendingTrades: number;
  warnings: string[];
};

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function sanitizePortable(value: unknown, depth = 0): unknown {
  if (depth > 24) throw new Error("Export data is nested too deeply.");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value))
    return value.map((item) => sanitizePortable(item, depth + 1));
  const record = asRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, item]) => [key, sanitizePortable(item, depth + 1)])
      .filter(([, item]) => item !== undefined),
  );
}

/**
 * Portable archives move static workspace preferences, never execution consent.
 * Omitting both settings is the only backward-compatible default-off shape: the
 * strict consent schemas then cannot retain an arm, expiry, or closed-app flag.
 */
function withoutAutomaticPaperConsent(
  value: unknown,
): Workspace["settings"] | undefined {
  const sanitized = asRecord(sanitizePortable(value));
  if (!sanitized) return undefined;
  const {
    orbAutoPaper: _orbAutoPaper,
    sessionAutoPaper: _sessionAutoPaper,
    ...settings
  } = sanitized;
  return Object.keys(settings).length > 0
    ? (settings as Workspace["settings"])
    : undefined;
}

function stableJson(value: unknown) {
  return JSON.stringify(sanitizePortable(value), null, 2) + "\n";
}

function csvField(value: unknown) {
  const text =
    value === undefined || value === null
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(sanitizePortable(value))
          : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(headers: string[], rows: Record<string, unknown>[]) {
  return (
    [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => csvField(row[key])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}

function bytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function writeU16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function readU16(source: Uint8Array, offset: number) {
  if (offset + 2 > source.length)
    throw new Error("Portable archive is truncated.");
  return source[offset] | (source[offset + 1] << 8);
}

function readU32(source: Uint8Array, offset: number) {
  if (offset + 4 > source.length)
    throw new Error("Portable archive is truncated.");
  return (
    (source[offset] |
      (source[offset + 1] << 8) |
      (source[offset + 2] << 16) |
      (source[offset + 3] << 24)) >>>
    0
  );
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Creates a standards-compatible, store-only ZIP so no zip dependency is required. */
export function createStoredZip(entries: { path: string; data: Uint8Array }[]) {
  if (!entries.length || entries.length > 16)
    throw new Error("Portable archive entry count is invalid.");
  const names = new Set<string>();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.path))
      throw new Error("Portable archive contains an invalid file name.");
    if (names.has(entry.path))
      throw new Error("Portable archive contains duplicate file names.");
    names.add(entry.path);
    if (entry.data.byteLength > MAX_PORTABLE_ENTRY_BYTES)
      throw new Error(`${entry.path} exceeds the portable entry size limit.`);
    const name = encoder.encode(entry.path);
    const checksum = crc32(entry.data);
    const local = new Uint8Array(30 + name.length + entry.data.length);
    writeU32(local, 0, ZIP_LOCAL_SIGNATURE);
    writeU16(local, 4, 20);
    writeU16(local, 6, 0);
    writeU16(local, 8, 0); // store, never execute or inflate arbitrary data
    writeU16(local, 10, 0);
    writeU16(local, 12, 0);
    writeU32(local, 14, checksum);
    writeU32(local, 18, entry.data.length);
    writeU32(local, 22, entry.data.length);
    writeU16(local, 26, name.length);
    writeU16(local, 28, 0);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    locals.push(local);

    const directory = new Uint8Array(46 + name.length);
    writeU32(directory, 0, ZIP_CENTRAL_SIGNATURE);
    writeU16(directory, 4, 20);
    writeU16(directory, 6, 20);
    writeU16(directory, 8, 0);
    writeU16(directory, 10, 0);
    writeU16(directory, 12, 0);
    writeU16(directory, 14, 0);
    writeU32(directory, 16, checksum);
    writeU32(directory, 20, entry.data.length);
    writeU32(directory, 24, entry.data.length);
    writeU16(directory, 28, name.length);
    writeU16(directory, 30, 0);
    writeU16(directory, 32, 0);
    writeU16(directory, 34, 0);
    writeU16(directory, 36, 0);
    writeU32(directory, 38, 0);
    writeU32(directory, 42, offset);
    directory.set(name, 46);
    central.push(directory);
    offset += local.length;
  }

  const centralBytes = bytes(central);
  const end = new Uint8Array(22);
  writeU32(end, 0, ZIP_END_SIGNATURE);
  writeU16(end, 4, 0);
  writeU16(end, 6, 0);
  writeU16(end, 8, entries.length);
  writeU16(end, 10, entries.length);
  writeU32(end, 12, centralBytes.length);
  writeU32(end, 16, offset);
  writeU16(end, 20, 0);
  const archive = bytes([...locals, centralBytes, end]);
  if (archive.length > MAX_PORTABLE_ARCHIVE_BYTES)
    throw new Error("Portable archive exceeds the 5 MiB safety limit.");
  return archive;
}

/** Parses only the uncompressed ZIP shape produced by this app; compressed entries are rejected. */
export function parseStoredZip(archive: Uint8Array) {
  if (
    archive.byteLength < 22 ||
    archive.byteLength > MAX_PORTABLE_ARCHIVE_BYTES
  )
    throw new Error("Portable archive size is invalid.");
  let end = -1;
  for (
    let offset = archive.length - 22;
    offset >= Math.max(0, archive.length - 65_557);
    offset -= 1
  ) {
    if (readU32(archive, offset) === ZIP_END_SIGNATURE) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("Portable archive footer was not found.");
  const count = readU16(archive, end + 10);
  const centralSize = readU32(archive, end + 12);
  let cursor = readU32(archive, end + 16);
  if (count === 0 || count > 16 || cursor + centralSize > end)
    throw new Error("Portable archive directory is invalid.");
  const results = new Map<string, Uint8Array>();

  for (let index = 0; index < count; index += 1) {
    if (readU32(archive, cursor) !== ZIP_CENTRAL_SIGNATURE)
      throw new Error("Portable archive directory entry is invalid.");
    const method = readU16(archive, cursor + 10);
    const checksum = readU32(archive, cursor + 16);
    const compressedSize = readU32(archive, cursor + 20);
    const uncompressedSize = readU32(archive, cursor + 24);
    const nameLength = readU16(archive, cursor + 28);
    const extraLength = readU16(archive, cursor + 30);
    const commentLength = readU16(archive, cursor + 32);
    const localOffset = readU32(archive, cursor + 42);
    const name = decoder.decode(
      archive.slice(cursor + 46, cursor + 46 + nameLength),
    );
    if (!ALLOWED_IMPORT_FILES.has(name) || results.has(name))
      throw new Error(
        "Portable archive contains an unsupported or duplicate file.",
      );
    if (
      method !== 0 ||
      compressedSize !== uncompressedSize ||
      uncompressedSize > MAX_PORTABLE_ENTRY_BYTES
    )
      throw new Error(
        "Portable archive entries must be uncompressed and within size limits.",
      );
    if (readU32(archive, localOffset) !== ZIP_LOCAL_SIGNATURE)
      throw new Error("Portable archive local entry is invalid.");
    const localNameLength = readU16(archive, localOffset + 26);
    const localExtraLength = readU16(archive, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.slice(dataStart, dataStart + uncompressedSize);
    if (data.length !== uncompressedSize || crc32(data) !== checksum)
      throw new Error("Portable archive entry failed integrity validation.");
    results.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return results;
}

function exportFiles(workspace: Workspace, createdAt: number) {
  const tradeRows = workspace.trades.map((trade) => ({
    id: trade.id,
    status: trade.status,
    market: trade.market,
    side: trade.side,
    strategyId: trade.strategyId,
    strategyVersion: trade.strategyVersion,
    entry: trade.entry,
    exit: trade.exit,
    quantity: trade.quantity,
    realizedPnl: trade.realizedPnl,
    createdAt: trade.createdAt,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    review: trade.review,
  }));
  const eventRows = [
    ...workspace.events.map((event) => ({
      recordType: "alert-event",
      id: event.id,
      linkedRecordId: event.ruleId,
      kind: event.title,
      status: event.delivery,
      at: event.createdAt,
      note: event.body,
    })),
    ...workspace.trades.flatMap((trade) =>
      (trade.events ?? []).map((event) => ({
        recordType: "paper-event",
        id: event.id,
        linkedRecordId: trade.id,
        kind: event.kind,
        status: trade.status,
        at: event.at,
        note: event.note,
      })),
    ),
  ];
  const files = [
    {
      path: "README.txt",
      content:
        "Zax portable export\n\nContains CSV trades/events and JSON strategies, rules, journal, workspace settings, and library metadata. No cookies, keys, source bytes, internal URIs, or executable code are included. Import is preview-only until the exact confirmation is entered.\n",
    },
    {
      path: "strategies.json",
      content: stableJson({
        format: PORTABLE_FORMAT,
        strategies: workspace.strategies,
      }),
    },
    {
      path: "rules.json",
      content: stableJson({
        format: PORTABLE_FORMAT,
        alerts: workspace.alerts,
        levels: workspace.levels,
      }),
    },
    {
      path: "journal.json",
      content: stableJson({
        format: PORTABLE_FORMAT,
        trades: workspace.trades,
        events: workspace.events,
      }),
    },
    {
      path: "library-metadata.json",
      content: stableJson({
        format: PORTABLE_FORMAT,
        patterns: workspace.patterns,
        matches: workspace.matches,
        note: "Metadata only. Private original source bytes are intentionally excluded.",
      }),
    },
    {
      path: "workspace.json",
      content: stableJson({
        format: PORTABLE_FORMAT,
        workspace: {
          schemaVersion: workspace.schemaVersion,
          activeStrategyId: workspace.activeStrategyId,
          market: workspace.market,
          timeframe: workspace.timeframe,
          favorites: workspace.favorites,
          confirmations: workspace.confirmations,
          overlays: workspace.overlays,
          settings: withoutAutomaticPaperConsent(workspace.settings),
          paperStartingBalance: workspace.paperStartingBalance,
        },
      }),
    },
    {
      path: "trades.csv",
      content: csv(Object.keys(tradeRows[0] ?? { id: "" }), tradeRows),
    },
    {
      path: "events.csv",
      content: csv(
        Object.keys(
          eventRows[0] ?? {
            recordType: "",
            id: "",
            linkedRecordId: "",
            kind: "",
            status: "",
            at: "",
            note: "",
          },
        ),
        eventRows,
      ),
    },
  ];
  const manifest = {
    format: PORTABLE_FORMAT,
    createdAt,
    files: files.map((file) => file.path),
    note: "No environment values, cookies, keys, internal URIs, source bytes, or executable JavaScript are present.",
  };
  return [
    { path: "manifest.json", data: encoder.encode(stableJson(manifest)) },
    ...files.map((file) => ({
      path: file.path,
      data: encoder.encode(file.content),
    })),
  ];
}

export function createPortableExport(
  workspace: Workspace,
  createdAt = Date.now(),
): PortableArtifact {
  const files = exportFiles(workspace, createdAt);
  const date = new Date(createdAt).toISOString().slice(0, 10);
  return {
    filename: `stratdesk-export-${date}.zip`,
    mime: "application/zip",
    bytes: createStoredZip(files),
    files: files.map((file) => ({ path: file.path, bytes: file.data.length })),
  };
}

/** Browser download is intentionally DOM-guarded so native code never reaches a web-only API. */
export function downloadPortableExportOnWeb(artifact: PortableArtifact) {
  if (typeof document === "undefined" || typeof URL === "undefined")
    throw new Error("Web download is unavailable in this runtime.");
  const safeBytes = artifact.bytes.slice();
  const href = URL.createObjectURL(
    new Blob([safeBytes.buffer as ArrayBuffer], { type: artifact.mime }),
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = artifact.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function parseJsonFile(files: Map<string, Uint8Array>, name: string): unknown {
  const data = files.get(name);
  if (!data) return undefined;
  try {
    return JSON.parse(decoder.decode(data));
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }
}

function safeString(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function safeArray(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(
      "Portable import contains an oversized or invalid collection.",
    );
  return value;
}

function validStrategy(value: unknown): value is Strategy {
  const entry = asRecord(value);
  return Boolean(
    entry &&
    safeString(entry.id, 100) &&
    safeString(entry.name, 200) &&
    safeString(entry.description, 20_000) &&
    safeString(entry.color, 64) &&
    ["reference", "strategy", "style"].includes(String(entry.kind)) &&
    Number.isInteger(entry.version) &&
    (entry.archived === undefined || typeof entry.archived === "boolean") &&
    Array.isArray(entry.factors) &&
    entry.factors.length <= 100,
  );
}

function validAlert(value: unknown): value is AlertRule {
  const entry = asRecord(value);
  return Boolean(
    entry &&
    safeString(entry.id, 100) &&
    safeString(entry.name, 200) &&
    safeString(entry.strategyId, 100) &&
    safeString(entry.market, 100) &&
    typeof entry.enabled === "boolean" &&
    Number.isFinite(entry.createdAt),
  );
}

function validClosedTrade(value: unknown): value is Trade {
  const entry = asRecord(value);
  return Boolean(
    entry &&
    safeString(entry.id, 100) &&
    entry.status === "closed" &&
    safeString(entry.strategyId, 100) &&
    Number.isInteger(entry.strategyVersion) &&
    Number.isFinite(entry.createdAt),
  );
}

function validEvent(value: unknown): value is AlertEvent {
  const entry = asRecord(value);
  return Boolean(
    entry &&
    safeString(entry.id, 128) &&
    safeString(entry.ruleId, 100) &&
    safeString(entry.strategyId, 100) &&
    Number.isFinite(entry.createdAt),
  );
}

function validLevels(value: unknown): Workspace["levels"] {
  return safeArray(value, 500).filter((level) => {
    const entry = asRecord(level);
    return Boolean(
      entry && safeString(entry.id, 100) && safeString(entry.strategyId, 100),
    );
  }) as Workspace["levels"];
}

/**
 * Validates a bounded, data-only archive. It never evaluates imported text and
 * it deliberately stages only CLOSED trade history, never live or pending orders.
 */
export function previewPortableImport(
  archive: Uint8Array,
): PortableImportPreview {
  const files = parseStoredZip(archive);
  const manifest = asRecord(parseJsonFile(files, "manifest.json"));
  if (manifest?.format !== PORTABLE_FORMAT)
    throw new Error("This is not a supported StratDesk portable archive.");
  const strategyFile = asRecord(parseJsonFile(files, "strategies.json"));
  const rulesFile = asRecord(parseJsonFile(files, "rules.json"));
  const journalFile = asRecord(parseJsonFile(files, "journal.json"));
  const workspaceFile = asRecord(parseJsonFile(files, "workspace.json"));
  const libraryFile = asRecord(parseJsonFile(files, "library-metadata.json"));
  const rawStrategies = safeArray(strategyFile?.strategies ?? [], 600);
  const strategies = rawStrategies
    .filter(validStrategy)
    .map((item) => sanitizePortable(item) as Strategy);
  if (strategies.length !== rawStrategies.length)
    throw new Error("A strategy record is invalid.");
  const strategyCapacity = workspaceCapacity({
    strategies,
    patterns: [],
    alerts: [],
  });
  if (
    strategyCapacity.activeStrategies.used >
      WORKSPACE_CAPACITY_LIMITS.activeStrategies ||
    strategyCapacity.archivedStrategies.used >
      WORKSPACE_CAPACITY_LIMITS.archivedStrategies
  )
    throw new Error(
      "Imported strategies exceed the active or archived capacity.",
    );

  const rawAlerts = safeArray(
    rulesFile?.alerts ?? [],
    WORKSPACE_CAPACITY_LIMITS.alertRules,
  );
  const alerts = rawAlerts.filter(validAlert).map((item) => ({
    ...(sanitizePortable(item) as AlertRule),
    // Imported rules require deliberate re-enablement; importing never starts work.
    enabled: false,
  }));
  if (alerts.length !== rawAlerts.length)
    throw new Error("An alert rule is invalid.");
  const levels = validLevels(rulesFile?.levels ?? []);
  const rawTrades = safeArray(journalFile?.trades ?? [], 10_000);
  const closedTrades = rawTrades
    .filter(validClosedTrade)
    .map((item) => sanitizePortable(item) as Trade);
  const skippedOpenOrPendingTrades = rawTrades.length - closedTrades.length;
  const rawEvents = safeArray(journalFile?.events ?? [], 10_000);
  const events = rawEvents
    .filter(validEvent)
    .map((item) => sanitizePortable(item) as AlertEvent);
  if (events.length !== rawEvents.length)
    throw new Error("An event record is invalid.");
  const workspace = asRecord(workspaceFile?.workspace);
  const sourceMetadataCount = Array.isArray(libraryFile?.patterns)
    ? safeArray(libraryFile?.patterns, WORKSPACE_CAPACITY_LIMITS.sourceLibrary)
        .length
    : 0;
  const warnings = [
    "Import is data-only: no imported JavaScript is executed.",
    "Imported alert rules are disabled until you deliberately enable them.",
    "Imported automatic paper settings are removed; re-arm them explicitly after import.",
    "Imported source-library metadata does not include private originals; upload originals separately if needed.",
  ];
  if (skippedOpenOrPendingTrades)
    warnings.push(
      `${skippedOpenOrPendingTrades} open or pending trade record${skippedOpenOrPendingTrades === 1 ? " was" : "s were"} excluded. Import never creates paper orders.`,
    );

  return {
    format: PORTABLE_FORMAT,
    confirmation: PORTABLE_IMPORT_CONFIRMATION,
    strategies,
    alerts,
    levels,
    closedTrades,
    events,
    settings: withoutAutomaticPaperConsent(workspace?.settings),
    paperStartingBalance:
      typeof workspace?.paperStartingBalance === "number" &&
      Number.isFinite(workspace.paperStartingBalance)
        ? workspace.paperStartingBalance
        : undefined,
    sourceMetadataCount,
    skippedOpenOrPendingTrades,
    warnings,
  };
}

/**
 * Apply only after the UI has shown the preview and collected exact confirmation.
 * It only merges static records; it never calls an order endpoint or creates
 * pending/open paper trades.
 */
export function applyPortableImport(
  workspace: Workspace,
  preview: PortableImportPreview,
  confirmation: string,
): Workspace {
  if (confirmation !== PORTABLE_IMPORT_CONFIRMATION)
    throw new Error("Import confirmation did not match.");
  const strategyIds = new Set(
    workspace.strategies.map((strategy) => strategy.id),
  );
  const addedStrategies = preview.strategies.filter(
    (strategy) => !strategyIds.has(strategy.id),
  );
  const mergedStrategies = [...workspace.strategies, ...addedStrategies];
  const capacity = workspaceCapacity({
    strategies: mergedStrategies,
    patterns: workspace.patterns,
    alerts: workspace.alerts,
  });
  if (
    capacity.activeStrategies.used > WORKSPACE_CAPACITY_LIMITS.activeStrategies
  )
    throw new Error("Imported active strategies would exceed 100.");
  if (
    capacity.archivedStrategies.used >
    WORKSPACE_CAPACITY_LIMITS.archivedStrategies
  )
    throw new Error("Imported archived strategies would exceed 500.");
  const alertIds = new Set(workspace.alerts.map((alert) => alert.id));
  const tradeIds = new Set(workspace.trades.map((trade) => trade.id));
  const eventIds = new Set(workspace.events.map((event) => event.id));
  const mergedAlerts = [
    ...workspace.alerts,
    ...preview.alerts.filter((alert) => !alertIds.has(alert.id)),
  ];
  if (mergedAlerts.length > WORKSPACE_CAPACITY_LIMITS.alertRules)
    throw new Error("Imported alert rules would exceed 100.");
  // Defend this final boundary as well as previewing: callers cannot reintroduce
  // auto-paper consent by constructing a PortableImportPreview themselves.
  const importedSettings = withoutAutomaticPaperConsent(preview.settings);
  const currentSettings = withoutAutomaticPaperConsent(workspace.settings);

  return {
    ...workspace,
    strategies: mergedStrategies,
    alerts: mergedAlerts,
    levels: [
      ...workspace.levels,
      ...preview.levels.filter(
        (level) => !workspace.levels.some((current) => current.id === level.id),
      ),
    ],
    trades: [
      ...workspace.trades,
      ...preview.closedTrades.filter((trade) => !tradeIds.has(trade.id)),
    ],
    events: [
      ...workspace.events,
      ...preview.events.filter((event) => !eventIds.has(event.id)),
    ],
    settings: importedSettings ?? currentSettings ?? workspace.settings,
    paperStartingBalance:
      preview.paperStartingBalance ?? workspace.paperStartingBalance,
  };
}
