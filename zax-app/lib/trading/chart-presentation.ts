import type { Time, TickMarkType } from "lightweight-charts";
import type { PlotPriceLine } from "./lightweight-payload";

/** Display-only captions. The payload retains full canonical evidence and names. */
export function chartLineCaption(
  line: PlotPriceLine,
  showSetupLabels: boolean,
): string {
  if (line.origin === "paper") {
    switch (line.paperTone) {
      case "entry":
        return "Entry";
      case "stop":
        return line.label.includes("BREAK-EVEN") ? "SL · BE" : "SL";
      case "target":
        return "TP";
      case "partial":
        return "Partial";
      case "original":
        return line.id === "original-stop" ? "Prev SL" : "Prev TP";
    }
  }
  const label = line.label.trim();
  return showSetupLabels
    ? label.length > 22
      ? label.slice(0, 21) + "…"
      : label
    : "";
}

export function showChartLineBadge(
  line: PlotPriceLine,
  showSetupLabels: boolean,
): boolean {
  return (
    showSetupLabels ||
    (line.origin === "paper" &&
      (line.paperTone === "entry" ||
        line.paperTone === "stop" ||
        line.paperTone === "target"))
  );
}

/** TickMarkType's documented numeric values: Year 0, Month 1, Day 2, Time 3, Seconds 4. */
export function compactChartTick(
  time: Time,
  type: TickMarkType,
  locale = "en-US",
): string {
  if (typeof time !== "number" || !Number.isFinite(time)) return "";
  const options: Intl.DateTimeFormatOptions =
    type === 0
      ? { year: "numeric" }
      : type === 1
        ? { month: "short" }
        : type === 2
          ? { month: "short", day: "numeric" }
          : {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
              ...(type === 4 ? { second: "2-digit" as const } : {}),
            };
  return new Intl.DateTimeFormat(locale, options).format(new Date(time * 1000));
}
