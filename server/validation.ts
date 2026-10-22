import { ApiError, instruments, timeframes, type Instrument, type Timeframe, type Strategy, type Trade, type PriceQuery } from './types.js';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 2000, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new ApiError(400, `Invalid ${name}.`);
  return value;
}
export function number(value: unknown, name: string, min = 0, max = 1e12): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ApiError(400, `Invalid ${name}.`);
  return value;
}
export function instrument(value: unknown): Instrument {
  if (!instruments.includes(value as Instrument)) throw new ApiError(400, 'Instrument must be NAS100 or XAUUSD.');
  return value as Instrument;
}
export function timeframe(value: unknown): Timeframe {
  if (!timeframes.includes(value as Timeframe)) throw new ApiError(400, 'Unsupported timeframe.');
  return value as Timeframe;
}
export function identifier(value: unknown): string {
  const id = text(value, 'id', 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new ApiError(400, 'Invalid id.');
  return id;
}
export function iso(value: unknown, name: string): string {
  const date = text(value, name, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date))) throw new ApiError(400, `Invalid ${name}; use an ISO timestamp with timezone.`);
  const normalized = new Date(date).toISOString();
  // Date.parse normalizes impossible calendar days, which are not valid inputs.
  const localDate = new Date(Date.parse(date.slice(0, 19) + 'Z')).toISOString().slice(0, 10);
  if (localDate !== date.slice(0, 10)) throw new ApiError(400, `Invalid ${name}.`);
  return normalized;
}
export function dateRange(from: unknown, to: unknown): { from: string; to: string } {
  const start = iso(from, 'from'); const end = iso(to, 'to');
  if (Date.parse(start) >= Date.parse(end) || Date.parse(end) - Date.parse(start) > 366 * 86400000) throw new ApiError(400, 'Date range must be positive and at most 366 days.');
  if (Date.parse(end) > Date.now()) throw new ApiError(400, 'Date range cannot end in the future.');
  return { from: start, to: end };
}
export function stringList(value: unknown, name: string, count = 30, size = 500): string[] {
  if (!Array.isArray(value) || value.length > count) throw new ApiError(400, `Invalid ${name}.`);
  return value.map(v => text(v, name, size));
}
export function strategyInput(value: unknown): Omit<Strategy, 'id'> & { id?: string } {
  const data = record(value);
  const raw = record(data.parameters);
  if (Object.keys(raw).length > 40) throw new ApiError(400, 'Too many parameters.');
  const parameters: Strategy['parameters'] = Object.create(null) as Strategy['parameters'];
  for (const [key, val] of Object.entries(raw)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(key)) throw new ApiError(400, 'Invalid parameter name.');
    if (typeof val === 'number') parameters[key] = number(val, 'parameter', -1e12);
    else if (typeof val === 'boolean') parameters[key] = val;
    else parameters[key] = text(val, 'parameter', 500, true);
  }
  return { ...(data.id === undefined ? {} : { id: identifier(data.id) }), name: text(data.name, 'name', 100),
    description: text(data.description, 'description', 4000, true), rules: stringList(data.rules, 'rules'), parameters };
}
export function tradeInput(value: unknown): Omit<Trade, 'id'> {
  const data = record(value);
  if (data.direction !== 'long' && data.direction !== 'short') throw new ApiError(400, 'Invalid direction.');
  const entryTime = iso(data.entryTime, 'entryTime'); const exitTime = iso(data.exitTime, 'exitTime');
  if (Date.parse(exitTime) < Date.parse(entryTime) || Date.parse(exitTime) > Date.now()) throw new ApiError(400, 'Trades must be closed and dates chronological, not future.');
  const trade: Omit<Trade, 'id'> = {
    strategyId: identifier(data.strategyId), instrument: instrument(data.instrument), timeframe: timeframe(data.timeframe),
    direction: data.direction, entry: number(data.entry, 'entry', Number.MIN_VALUE, 1e8),
    exit: number(data.exit, 'exit', Number.MIN_VALUE, 1e8), quantity: number(data.quantity, 'quantity', Number.MIN_VALUE, 1e8),
    entryTime, exitTime, notes: text(data.notes ?? '', 'notes', 4000, true),
  };
  for (const key of ['stopLoss', 'takeProfit', 'riskAmount'] as const) {
    if (data[key] !== undefined) trade[key] = number(data[key], key, Number.MIN_VALUE, 1e8);
  }
  if (trade.stopLoss !== undefined && (trade.direction === 'long' ? trade.stopLoss >= trade.entry : trade.stopLoss <= trade.entry)) throw new ApiError(400, 'Stop loss must be on the loss side of entry.');
  if (trade.takeProfit !== undefined && (trade.direction === 'long' ? trade.takeProfit <= trade.entry : trade.takeProfit >= trade.entry)) throw new ApiError(400, 'Take profit must be on the profit side of entry.');
  return trade;
}
export function priceInput(query: Record<string, unknown>): PriceQuery {
  const rawLimit = query.limit ?? '300';
  if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) throw new ApiError(400, 'Invalid limit.');
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 1000) throw new ApiError(400, 'Limit must be between 1 and 1000.');
  const result: PriceQuery = { instrument: instrument(query.instrument), timeframe: timeframe(query.timeframe), limit };
  if (query.from !== undefined) result.from = iso(query.from, 'from');
  if (query.to !== undefined) result.to = iso(query.to, 'to');
  if (result.to && Date.parse(result.to) > Date.now()) throw new ApiError(400, 'to cannot be in the future.');
  if (result.from && result.to) dateRange(result.from, result.to);
  if (result.from && !result.to) dateRange(result.from, new Date().toISOString());
  return result;
}
