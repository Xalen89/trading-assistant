export const PAPER_RISK_TEMPLATES = [0, 0.5, 1, 2] as const;

type PaperRiskTemplate = (typeof PAPER_RISK_TEMPLATES)[number];

const isPaperRiskTemplate = (riskPct: number): riskPct is PaperRiskTemplate =>
  PAPER_RISK_TEMPLATES.includes(riskPct as PaperRiskTemplate);

/** Keeps the approved manual reference risk instead of promoting 0.5% to 1%. */
export function normalizedPaperRiskPct(riskPct: number): PaperRiskTemplate {
  return isPaperRiskTemplate(riskPct) ? riskPct : 0.5;
}
