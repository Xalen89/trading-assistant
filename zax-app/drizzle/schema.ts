import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar, uniqueIndex,index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tradingWorkspaces = mysqlTable('trading_workspaces', {
  userId: int('userId').primaryKey(),
  revision: int('revision').notNull().default(1),
  payload: json('payload').notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export const tradingSources = mysqlTable('trading_sources', {
  id: varchar('id', {length:100}).primaryKey(),
  userId: int('userId').notNull(),
  objectKey: varchar('objectKey', {length:512}).notNull(),
  mime: varchar('mime', {length:100}).notNull(),
  filename: varchar('filename', {length:256}).notNull(),
  metadata: json('metadata').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const tradingDevices = mysqlTable('trading_devices', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  token: varchar('token', {length:256}).notNull(),
  platform: varchar('platform', {length:12}).notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, t => [uniqueIndex('trading_device_token').on(t.token)]);

export const tradingAlertEvents = mysqlTable('trading_alert_events', {
  id: varchar('id', {length:128}).primaryKey(),
  userId: int('userId').notNull(),
  ruleId: varchar('ruleId', {length:100}).notNull(),
  payload: json('payload').notNull(),
  delivery: varchar('delivery', {length:32}).notNull().default('pending'),
  receiptId: varchar('receiptId', {length:256}),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const tradingSchedules = mysqlTable('trading_schedules', {
  taskUid: varchar('taskUid', {length:128}).primaryKey(),
  userId: int('userId').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const tradingReferenceVersions = mysqlTable('trading_reference_versions', {
  id: varchar('id', {length:180}).primaryKey(),
  userId: int('userId').notNull(),
  patternId: varchar('patternId', {length:100}).notNull(),
  version: int('version').notNull(),
  payload: json('payload').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const tradingVectors = mysqlTable('trading_vectors', {
  id: varchar('id', { length: 180 }).primaryKey(),
  userId: int('userId').notNull(),
  patternId: varchar('patternId', { length: 100 }).notNull(),
  sourceHash: varchar('sourceHash', { length: 64 }).notNull(),
  descriptorVersion: varchar('descriptorVersion', { length: 100 }).notNull(),
  encryptedVector: text('encryptedVector').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});
export const tradingResearchJobs = mysqlTable('trading_research_jobs', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: int('userId').notNull(),
  kind: varchar('kind', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  request: json('request').notNull(),
  result: json('result'),
  error: text('error'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export const tradingMarketHistory=mysqlTable('trading_market_history',{
 id:varchar('id',{length:180}).primaryKey(),userId:int('userId').notNull(),market:varchar('market',{length:100}).notNull(),timeframe:varchar('timeframe',{length:10}).notNull(),barTime:varchar('barTime',{length:24}).notNull(),payload:json('payload').notNull(),source:text('source').notNull(),createdAt:timestamp('createdAt').defaultNow().notNull(),
},t=>[index('market_tape_owner_tf_time').on(t.userId,t.market,t.timeframe,t.barTime)]);
export const tradingSetupSnapshots=mysqlTable('trading_setup_snapshots',{
 id:varchar('id',{length:100}).primaryKey(),userId:int('userId').notNull(),market:varchar('market',{length:100}).notNull(),timeframe:varchar('timeframe',{length:10}).notNull(),selectionKey:varchar('selectionKey',{length:128}).notNull(),payload:json('payload').notNull(),createdAt:timestamp('createdAt').defaultNow().notNull(),
},t=>[index('setup_owner_selection_time').on(t.userId,t.selectionKey,t.createdAt)]);
export const tradingPaperProposals=mysqlTable('trading_paper_proposals',{
 id:varchar('id',{length:100}).primaryKey(),userId:int('userId').notNull(),market:varchar('market',{length:100}).notNull(),payload:json('payload').notNull(),createdAt:timestamp('createdAt').defaultNow().notNull(),
});
export const tradingPaperTrades=mysqlTable('trading_paper_trades',{
 id:varchar('id',{length:180}).primaryKey(),tradeId:varchar('tradeId',{length:100}).notNull(),userId:int('userId').notNull(),version:int('version').notNull(),status:varchar('status',{length:16}).notNull(),payload:json('payload').notNull(),createdAt:timestamp('createdAt').defaultNow().notNull(),updatedAt:timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
},t=>[index('paper_owner_status_time').on(t.userId,t.status,t.createdAt)]);
export const tradingPaperEvents=mysqlTable('trading_paper_events',{
 id:varchar('id',{length:180}).primaryKey(),userId:int('userId').notNull(),tradeId:varchar('tradeId',{length:100}).notNull(),version:int('version').notNull(),payload:json('payload').notNull(),createdAt:timestamp('createdAt').defaultNow().notNull(),
},t=>[index('paper_owner_trade_version').on(t.userId,t.tradeId,t.version)]);

export const tradingScenarioDirections = mysqlTable('trading_scenario_directions', {
  id: varchar('id', {length:128}).primaryKey(),
  userId: int('userId').notNull(),
  ruleId: varchar('ruleId', {length:100}).notNull(),
  payload: json('payload').notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, t => [uniqueIndex('scenario_direction_owner_rule').on(t.userId, t.ruleId)]);

/** Owner-scoped app state; scenario keys use a separate owner/app-bound encrypted envelope only, never plaintext. */
export const tradingRuntimeState = mysqlTable('trading_runtime_state', {
  id: varchar('id', { length: 180 }).primaryKey(),
  userId: int('userId').notNull(),
  kind: varchar('kind', { length: 32 }).notNull(),
  payload: json('payload').notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, t => [index('runtime_owner_kind_updated').on(t.userId, t.kind, t.updatedAt)]);
