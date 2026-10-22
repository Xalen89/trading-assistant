import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ActionButton, Card, Sheet } from "./ui";
import { C } from "./theme";
const lessons = [
  {
    name: "Risk before entry",
    body: "Define an invalidation price before sizing. Planned dollar risk equals quantity × stop distance × the verified instrument point value. Size against your chosen risk budget, not the amount you want to win back. A stop can slip; a planned risk limit is not a guarantee. Paper valuations and account money are not brokerage fills.",
    practice:
      "Can I describe the invalidation and dollar loss without looking at the profit target?",
  },
  {
    name: "Trigger versus confluence",
    body: "A trigger is one explicitly defined event. Independent confluences provide context; they are not additional names for the same trigger. Weights must sum to 100, and pending/stale evidence cannot approve strategy entry. A checklist score is not a calibrated win probability. Manual practice is deliberately labelled differently from a gated strategy trade.",
    practice:
      "Which fact would falsify my setup, and which conditions are genuinely independent?",
  },
  {
    name: "Price, costs and reward",
    body: "Risk/reward is target distance divided by stop distance; it does not tell you the chance of winning. Account for spread, commissions, slippage and financing. Check source timestamps and whether an instrument’s contract/point value is actually verified. Public single-venue crypto depth is not consolidated NBBO, queue position or proof a limit order would fill.",
    practice:
      "Would this plan still make sense after reasonable costs and worse execution?",
  },
  {
    name: "Structure and uncertainty",
    body: "Distinguish completed-bar evidence from a forming candle. A liquidity sweep, FVG, order block or moving-average condition is a testable description, not a promise. Align your timeframe and source, and say when higher-timeframe, macro or event evidence is missing. A historical ghost is actual past continuation mapped for comparison, not tomorrow’s price.",
    practice:
      "What is observed, what is inferred, and what is simply unavailable?",
  },
  {
    name: "After a loss",
    body: "Loss-chasing is observable in behavior, not a diagnosis. Notice rapid re-entry, bigger risk after losses, an urge to recover, and repeated changes to rules. Pause, step away, name the emotion, and compare the next plan to the original playbook. Use the optional server-enforced post-loss pause if you want a stronger boundary. A cooldown or AI reply does not certify readiness.",
    practice:
      "If my previous trade did not exist, would I still take this one with the same risk?",
  },
  {
    name: "Review without fooling yourself",
    body: "Keep the original entry/SL/TP and entry-time checklist. Review process separately from outcome. A profitable mistake is still a process error, and a well-executed loss is not automatically a bad model. Compare present/absent confluences and regimes only with enough samples; reserve untouched future data. Paper, imported and sparse observed-quote statistics must remain honestly labelled.",
    practice:
      "Did I follow the rule, what evidence was available then, and what will I change only after a documented review?",
  },
];
export function TradingLessons() {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<number | null>(null),
    router = useRouter();
  const lesson = selected === null ? undefined : lessons[selected];
  return (
    <Card>
      <ActionButton
        compact
        kind="secondary"
        label={
          open
            ? "Hide trading foundations"
            : "Learn trading · process before profit"
        }
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <View style={{ gap: 6, marginTop: 10 }}>
          {lessons.map((l, i) => (
            <ActionButton
              key={l.name}
              compact
              kind="ghost"
              label={l.name}
              onPress={() => setSelected(i)}
            />
          ))}
        </View>
      ) : null}
      <Sheet
        visible={Boolean(lesson)}
        title={lesson?.name || "Trading lesson"}
        onClose={() => setSelected(null)}
      >
        {lesson ? (
          <>
            <Text style={{ color: C.text, fontSize: 14, lineHeight: 22 }}>
              {lesson.body}
            </Text>
            <Text
              style={{
                color: C.amber,
                fontSize: 14,
                lineHeight: 22,
                marginVertical: 14,
              }}
            >
              Reflection: {lesson.practice}
            </Text>
            <ActionButton
              kind="secondary"
              label="Ask my AI coach"
              onPress={() => {
                setSelected(null);
                router.push({
                  pathname: "/coach",
                  params: {
                    initialQuestion: `Teach me ${lesson.name.toLowerCase()} and help me answer: ${lesson.practice}`,
                  },
                });
              }}
            />
            <Text style={{ color: C.muted, fontSize: 11, marginTop: 12 }}>
              Educational practice; no promise of profitability or execution
              approval.
            </Text>
          </>
        ) : null}
      </Sheet>
    </Card>
  );
}
