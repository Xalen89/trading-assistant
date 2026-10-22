import { useState } from "react";
import { Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { ActionButton, Card, Pill } from "./ui";
import { C } from "./theme";
export function LearningDashboard() {
  const [open, setOpen] = useState(false),
    report = trpc.coach.analytics.useQuery(undefined, {
      enabled: open,
      retry: false,
    });
  const data = report.data?.analytics;
  return (
    <Card>
      <ActionButton
        compact
        kind="secondary"
        label={
          open
            ? "Hide learning review"
            : "Learning review · your actual paper records"
        }
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          {report.isLoading ? (
            <Text style={{ color: C.text }}>
              Reading canonical paper records…
            </Text>
          ) : null}
          {report.error ? (
            <Text style={{ color: C.rose }}>{report.error.message}</Text>
          ) : null}
          {data ? (
            <>
              <Pill label="PAPER DATA · DESCRIPTIVE ONLY" tone="amber" />
              <Text style={{ color: C.text, fontSize: 13 }}>
                {data.outcomeCoverage.eligibleClosedOutcomes} eligible closed
                outcomes · {data.outcomeCoverage.entryFeatures.available}{" "}
                entry-feature snapshots ·{" "}
                {data.outcomeCoverage.confluenceSnapshots.available} confluence
                snapshots
              </Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>
                Fewer than 100 outcomes per comparison remains insufficient.
                Even a larger paper sample does not prove live edge; no
                automatic rule promotion or legacy snapshot backfill.
              </Text>
              {data.scoreBuckets.map((b) => (
                <Text key={b.label} style={{ color: C.text, fontSize: 12 }}>
                  Score {b.label}: {b.metrics.count} outcomes ·{" "}
                  {b.metrics.winRate === null
                    ? "rate withheld"
                    : `${b.metrics.winRate.toFixed(1)}% descriptive wins`}{" "}
                  ·{" "}
                  {b.metrics.expectancyR === null
                    ? "expectancy withheld"
                    : `${b.metrics.expectancyR.toFixed(2)}R observed expectancy`}
                </Text>
              ))}
              {data.humanRuleProposals.slice(0, 4).map((p, i) => (
                <View key={i}>
                  <Text style={{ color: C.amber, fontSize: 12 }}>
                    {p.title}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    {p.basis} {p.action} Human review only.
                  </Text>
                </View>
              ))}
              <Text style={{ color: C.muted, fontSize: 11 }}>
                {report.data?.scope}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
