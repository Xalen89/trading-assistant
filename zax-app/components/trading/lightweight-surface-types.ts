import type { LightweightPayload } from "@/lib/trading/lightweight-payload";
import type {
  ChartCommand,
  ChartSurfaceEvent,
} from "@/lib/trading/chart-types";
export type ChartSurfaceHandle = { command: (command: ChartCommand) => void };
export type ChartSurfaceProps = {
  payload: LightweightPayload;
  height: number;
  onEvent: (event: ChartSurfaceEvent) => void;
};
