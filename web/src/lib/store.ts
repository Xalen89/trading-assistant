"use client";

import { create } from "zustand";
import type { Instrument, Timeframe } from "./types";

type Workspace = {
  instrument: Instrument; timeframe: Timeframe; strategyId: string; overlays: boolean;
  setInstrument: (instrument: Instrument) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setStrategyId: (strategyId: string) => void;
  toggleOverlays: () => void;
};
export const useWorkspace = create<Workspace>((set) => ({
  instrument: "NAS100", timeframe: "15m", strategyId: "", overlays: true,
  setInstrument: (instrument) => set({ instrument }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setStrategyId: (strategyId) => set({ strategyId }),
  toggleOverlays: () => set((state) => ({ overlays: !state.overlays })),
}));
