import { Platform } from "react-native";

export const C = {
  bg: "#0B1017",
  surface: "#151D29",
  surface2: "#1C2735",
  border: "#344355",
  grid: "#263447",
  lime: "#D8F36A",
  text: "#F4F7FB",
  price: "#E5EDF5",
  muted: "#97A5B7",
  mint: "#72E6BE",
  rose: "#FF8A9A",
  amber: "#F4C878",
  blue: "#8EC5FF",
  black: "#070A10",
  transparent: "transparent",
} as const;

export const mono = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});
export const maxContent =
  Platform.OS === "web"
    ? { width: "100%" as const, maxWidth: 900, alignSelf: "center" as const }
    : undefined;
export const formatPrice = (value: number | undefined, precision = 2) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      })
    : "—";
export const formatAge = (timestamp?: number, nowMs = Date.now()) => {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp < 0)
    return "unavailable";
  const seconds = Math.max(0, Math.round((nowMs - timestamp * 1000) / 1000));
  return seconds < 10
    ? "now"
    : seconds < 60
      ? `${seconds}s`
      : `${Math.floor(seconds / 60)}m`;
};
