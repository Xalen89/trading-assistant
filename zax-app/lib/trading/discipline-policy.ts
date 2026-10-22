import type { DisciplineFlag } from "./trading-discipline";

export const DISCIPLINE_GUARD_IDS = [
  "cooldown",
  "overtrading",
  "riskEscalation",
  "lossStreak",
] as const;

export type DisciplineGuardId = (typeof DISCIPLINE_GUARD_IDS)[number];

/** Settings are optional so omitted legacy fields remain advisory by default. */
export type DisciplineGuardSettings = {
  enforceCooldown?: boolean;
  enforceOvertrading?: boolean;
  enforceRiskEscalation?: boolean;
  enforceLossStreak?: boolean;
};

export type DisciplineGuardBlock = {
  guard: DisciplineGuardId;
  setting: keyof DisciplineGuardSettings;
  title: string;
  /** The evaluated canonical-history flag that caused this active block. */
  flag: DisciplineFlag;
};

export type DisciplineGuardSelection = {
  /** Guard IDs the owner has explicitly enabled. */
  enabled: DisciplineGuardId[];
  /** Relevant observed flags from the supplied report, whether enabled or advisory. */
  actualFlags: DisciplineFlag[];
  /** Only actual flags paired with an explicitly enabled guard. */
  blocks: DisciplineGuardBlock[];
};

type GuardDefinition = {
  guard: DisciplineGuardId;
  setting: keyof DisciplineGuardSettings;
  flagId: string;
  title: string;
};

const GUARD_DEFINITIONS: readonly GuardDefinition[] = [
  {
    guard: "cooldown",
    setting: "enforceCooldown",
    flagId: "rapid-reentry-after-loss",
    title: "Post-loss cooldown",
  },
  {
    guard: "overtrading",
    setting: "enforceOvertrading",
    flagId: "daily-trade-count",
    title: "Daily closed-trade threshold",
  },
  {
    guard: "riskEscalation",
    setting: "enforceRiskEscalation",
    flagId: "risk-escalation-after-loss",
    title: "Risk escalation after loss",
  },
  {
    guard: "lossStreak",
    setting: "enforceLossStreak",
    flagId: "loss-streak",
    title: "Recorded loss streak",
  },
];

export function isDisciplineGuardId(
  value: unknown,
): value is DisciplineGuardId {
  return (
    typeof value === "string" &&
    (DISCIPLINE_GUARD_IDS as readonly string[]).includes(value)
  );
}

/**
 * Select execution blocks from a completed discipline evaluation.
 *
 * This layer never evaluates intent, emotion, diagnosis, or a new sizing
 * baseline. It can only act on the supplied observable report flags. In
 * particular, risk escalation must already have been calculated from canonical
 * retained original-risk history by the discipline evaluator.
 */
export function selectDisciplineGuards(
  settings: DisciplineGuardSettings | undefined,
  flags: readonly DisciplineFlag[] | undefined,
): DisciplineGuardSelection {
  const sourceFlags = flags ?? [];
  const enabled = GUARD_DEFINITIONS.filter(
    (definition) => settings?.[definition.setting] === true,
  ).map((definition) => definition.guard);

  const actualFlags = sourceFlags.filter(
    (flag) =>
      flag.severity !== "info" &&
      GUARD_DEFINITIONS.some((definition) => definition.flagId === flag.id),
  );

  const blocks = GUARD_DEFINITIONS.flatMap((definition) => {
    if (settings?.[definition.setting] !== true) return [];
    return sourceFlags
      .filter(
        (flag) => flag.id === definition.flagId && flag.severity !== "info",
      )
      .map((flag) => ({
        guard: definition.guard,
        setting: definition.setting,
        title: definition.title,
        flag,
      }));
  });

  return { enabled, actualFlags, blocks };
}

export function hasEnforcedDisciplineBlock(
  settings: DisciplineGuardSettings | undefined,
  flags: readonly DisciplineFlag[] | undefined,
) {
  return selectDisciplineGuards(settings, flags).blocks.length > 0;
}

export function disciplineGuardDefinition(guard: DisciplineGuardId) {
  return GUARD_DEFINITIONS.find((definition) => definition.guard === guard);
}
