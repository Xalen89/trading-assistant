import { describe, expect, it } from "vitest";
import {
  buildPurgedHoldoutFold,
  buildPurgedValidationPlan,
} from "../../lib/trading/purged-validation";

const events = Array.from({ length: 12 }, (_, index) => ({
  start: index,
  end: index + 2,
}));
const labels = Array.from({ length: 12 }, (_, index) =>
  index % 2 ? (-1 as const) : (1 as const),
);

const overlaps = (
  left: { start: number; end: number },
  right: { start: number; end: number },
) => left.start <= right.end && right.start <= left.end;

describe("independent purged validation", () => {
  it("purges every training label interval that overlaps a test label and embargoes after each tested block", () => {
    const plan = buildPurgedValidationPlan(events, {
      mode: "cpcv",
      labels,
      embargoPct: 0.25,
      maxFolds: 10,
    });
    // Five groups and two test groups yields all C(5,2)=10 combinations.
    expect(plan.groupCount).toBe(5);
    expect(plan.fittingJobs).toBe(10);
    expect(plan.embargoRows).toBe(3);
    const fold = plan.folds.find(
      (item) => item.testGroupIds.join(",") === "1,3",
    );
    expect(fold).toBeDefined();
    // Group 1 covers rows 2-3: row 1 ends at 3 and must be overlap-purged.
    expect(fold?.purgedIndices).toContain(1);
    // The percentage embargo immediately after rows 2-3 removes rows 4-6.
    expect(fold?.embargoedIndices).toEqual(
      expect.arrayContaining([4, 5, 6]),
    );
    for (const trainIndex of fold?.trainingIndices ?? []) {
      for (const testIndex of fold?.testIndices ?? []) {
        expect(overlaps(events[trainIndex], events[testIndex])).toBe(false);
      }
    }
  });

  it("reports exact class counts and keeps combinatorial work within the requested all-combinations cap", () => {
    const plan = buildPurgedValidationPlan(events, {
      mode: "cpcv",
      labels,
      embargoPct: 0,
      maxFolds: 15,
    });
    expect(plan.groupCount).toBe(6);
    expect(plan.testGroupsPerFold).toBe(2);
    expect(plan.fittingJobs).toBe(15);
    for (const fold of plan.folds) {
      expect(fold.trainingClassCounts.total).toBe(
        fold.trainingClassCounts.negative + fold.trainingClassCounts.positive,
      );
      expect(fold.testClassCounts.total).toBe(
        fold.testClassCounts.negative + fold.testClassCounts.positive,
      );
      expect(fold.trainingIndices).toHaveLength(
        fold.trainingClassCounts.total,
      );
      expect(fold.testIndices).toHaveLength(fold.testClassCounts.total);
    }
  });

  it("keeps walk-forward training strictly before each test fold and protects an explicit latest holdout", () => {
    const plan = buildPurgedValidationPlan(events, {
      mode: "walk-forward",
      labels,
      embargoPct: 0.1,
      maxFolds: 8,
    });
    for (const fold of plan.folds) {
      expect(Math.max(...fold.trainingIndices)).toBeLessThan(
        Math.min(...fold.testIndices),
      );
      for (const trainIndex of fold.trainingIndices) {
        for (const testIndex of fold.testIndices) {
          expect(overlaps(events[trainIndex], events[testIndex])).toBe(false);
        }
      }
    }

    const holdout = buildPurgedHoldoutFold(events, labels, [9, 10, 11], 0.1);
    expect(holdout.trainingIndices).not.toEqual(
      expect.arrayContaining([9, 10, 11]),
    );
    for (const trainIndex of holdout.trainingIndices) {
      for (const testIndex of holdout.testIndices) {
        expect(overlaps(events[trainIndex], events[testIndex])).toBe(false);
      }
    }
  });
});
