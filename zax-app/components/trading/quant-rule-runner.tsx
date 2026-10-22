import { useState } from "react";
import { Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import type { Strategy, Timeframe } from "@/lib/trading/model";
import { ActionButton, Card, Pill } from "./ui";
import { C } from "./theme";
export function QuantRuleRunner({ strategy }: { strategy: Strategy }) {
  const run = trpc.quantRules.evaluate.useMutation();
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  if (!strategy.quantRule) return null;
  return (
    <Card>
      <Text style={{ color: C.text, fontWeight: "800" }}>
        Run your research rule
      </Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>
        Uses only named assets and actual completed bars. This draft checks
        conditions/ranks/weights; it does not create trades or imply a
        backtested strategy.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["1h", "4h", "1d", "1w"] as const).map((tf) => (
          <ActionButton
            key={tf}
            compact
            label={tf}
            kind={tf === timeframe ? "primary" : "secondary"}
            onPress={() => {
              setTimeframe(tf);
              run.reset();
            }}
          />
        ))}
      </View>
      <ActionButton
        label={
          run.isPending
            ? "Fetching actual sources…"
            : "Evaluate rule on real data"
        }
        disabled={run.isPending}
        onPress={() =>
          run.mutate({ rule: strategy.quantRule!, timeframe, bars: 900 })
        }
      />
      {run.error ? (
        <Text style={{ color: C.rose }}>{run.error.message}</Text>
      ) : null}
      {run.data ? (
        <View style={{ gap: 8 }}>
          <Pill
            label={
              run.data.status === "ready"
                ? "Research evaluated"
                : "Missing source / warmup"
            }
            tone={run.data.status === "ready" ? "mint" : "amber"}
          />
          {run.data.conditionResults.map((r) => (
            <Text key={r.nodeId} style={{ color: C.muted }}>
              {r.symbol} · {r.kind}:{" "}
              {r.met === null ? "unknown" : r.met ? "met" : "not met"} ·{" "}
              {r.value === null ? "—" : r.value.toFixed(4)}
            </Text>
          ))}
          {run.data.selections.map((s) => (
            <Text key={s.nodeId} style={{ color: C.muted }}>
              Top {s.topN}: {s.selectedSymbols.join(", ")}
            </Text>
          ))}
          {run.data.allocations.map((a) => (
            <Text key={a.nodeId} style={{ color: C.muted }}>
              Inverse-vol weights:{" "}
              {a.weights
                .map((w) => `${w.symbol} ${(w.weight * 100).toFixed(1)}%`)
                .join(" · ")}
            </Text>
          ))}
          {run.data.issues.map((issue, i) => (
            <Text key={i} style={{ color: C.amber }}>
              {issue}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
