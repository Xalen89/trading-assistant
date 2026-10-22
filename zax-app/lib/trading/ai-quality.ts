export const AI_QUALITIES = ["efficient", "deep"] as const;
export type AIQuality = (typeof AI_QUALITIES)[number];

/** Unknown/legacy local settings never opt an owner into the premium tier. */
export function resolveAIQuality(value: unknown): AIQuality {
  return value === "deep" ? "deep" : "efficient";
}

export function aiQualityLabel(quality: AIQuality) {
  return quality === "deep" ? "Deep analysis" : "Efficient";
}
