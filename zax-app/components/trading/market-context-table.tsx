import { Text, View, StyleSheet } from "react-native";
import { Card, Pill } from "./ui";
import { C } from "./theme";
type Row = Record<string, unknown>;
const value = (r: Row, keys: string[]) => {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null) return String(r[k]);
  }
  return "—";
};
export function MarketContextTable({
  events,
  cot,
}: {
  events: Row[];
  cot: Row[];
}) {
  return (
    <Card>
      <Text style={styles.title}>Dated economic & positioning context</Text>
      <Text style={styles.note}>
        Source-reported records; coverage may be partial and not specific to the
        selected broker instrument. COT is dated futures positioning, not spot
        holdings or live flow.
      </Text>
      {events.slice(0, 10).map((r, i) => {
        const impact = value(r, ["impact"]),
          high = /high/i.test(impact),
          medium = /medium|moderate/i.test(impact);
        return (
          <View key={`e${i}`} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {value(r, ["event", "name", "title"])}
              </Text>
              <Text style={styles.note}>
                {r.timeKnown === false
                  ? `${value(r, ["date", "datetime"]).slice(0, 10)} · date only; publication time unknown`
                  : value(r, ["date", "datetime"])}{" "}
                · {value(r, ["country", "currency"])}
              </Text>
              <Text style={styles.note}>
                Actual {value(r, ["actual"])} / Expected{" "}
                {value(r, ["estimate", "forecast"])} / Prior{" "}
                {value(r, ["previous"])}
              </Text>
              {r.source ? (
                <Text style={styles.note}>{String(r.source)}</Text>
              ) : null}
              {r.importanceSource ? (
                <Text style={styles.note}>{String(r.importanceSource)}</Text>
              ) : null}
            </View>
            <Pill
              label={impact}
              tone={
                high
                  ? "rose"
                  : medium
                    ? "amber"
                    : /low/i.test(impact)
                      ? "mint"
                      : "muted"
              }
            />
          </View>
        );
      })}
      {cot.slice(0, 6).map((r, i) => (
        <View key={`c${i}`} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {value(r, ["name", "symbol", "market"])}
            </Text>
            <Text style={styles.note}>
              Report {value(r, ["date", "reportDate"])}
            </Text>
            <Text style={styles.note}>
              Commercial long{" "}
              {value(r, ["commercialLong", "commLong", "commLongAll"])} · short{" "}
              {value(r, ["commercialShort", "commShort", "commShortAll"])}
            </Text>
            {r.source ? (
              <Text style={styles.note}>{String(r.source)}</Text>
            ) : null}
            {r.releaseVintage === "unknown" ? (
              <Text style={styles.note}>
                Publication timestamp/vintage unknown; report date is not live
                positioning.
              </Text>
            ) : null}
            {r.contractUnits ? (
              <Text style={styles.note}>
                Reported units: {String(r.contractUnits)}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
const styles = StyleSheet.create({
  title: { color: C.text, fontSize: 14, fontWeight: "800" },
  name: { color: C.text, fontSize: 12 },
  note: { color: C.muted, fontSize: 10, lineHeight: 15 },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: C.border,
  },
});
