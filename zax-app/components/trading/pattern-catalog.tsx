import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  PATTERN_CATALOG,
  type CatalogEntry,
} from "@/lib/trading/pattern-catalog";
import { useWorkspace } from "@/hooks/use-workspace";
import { uid, type Pattern } from "@/lib/trading/model";
import { ActionButton, Card, Input, Pill, Sheet } from "./ui";
import { C } from "./theme";
const categories = [
  "All",
  "PD arrays",
  "Candlesticks",
  "Chart structure",
  "Indicator styles",
] as const;
export function PatternCatalog({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { workspace, update } = useWorkspace(),
    [term, setTerm] = useState(""),
    [category, setCategory] = useState<string>("All"),
    [selected, setSelected] = useState<CatalogEntry>(),
    [notice, setNotice] = useState<string>();
  const shown = useMemo(
    () =>
      PATTERN_CATALOG.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          `${p.name} ${p.definition} ${p.tags.join(" ")}`
            .toLowerCase()
            .includes(term.toLowerCase()),
      ),
    [term, category],
  );
  const present = (p: CatalogEntry) =>
    workspace.patterns.some((item) => item.tags.includes(`catalog:${p.id}`));
  const add = (p: CatalogEntry) => {
    if (present(p)) return;
    if(workspace.patterns.length>=500)return setNotice('Pattern workspace limit500 reached. The catalog remains browsable; no reference or upload was overwritten.');
    const pattern: Pattern = {
      id: uid("catalog"),
      name: p.name,
      kind: p.category === "Indicator styles" ? "style" : "pattern",
      strategyId: workspace.activeStrategyId,
      market: workspace.market,
      timeframe: workspace.timeframe,
      tags: [...p.tags, `catalog:${p.id}`, "catalog reference"],
      notes: `${p.definition}\nSupport: ${p.support}\nSource: ${p.source}`,
      description: `Reference definition — not an uploaded image or trained visual detector. ${p.support}`,
      rules: [
        p.definition,
        `Review prerequisite: ${p.support}`,
        `Source: ${p.source}`,
      ],
      status: "review",
      version: 1,
      createdAt: Date.now(),
      feedback: [],
    };
    update((w) => ({ ...w, patterns: [pattern, ...w.patterns] }));
    setNotice(
      `${p.name} added as a review-only local reference. Save to cloud explicitly to retain it there; no active strategy changed.`,
    );
  };
  const addMissing = () => {
    const entries = PATTERN_CATALOG.filter((p) => !present(p));
    if(workspace.patterns.length+entries.length>500)return setNotice(`Need room for${entries.length}references; current private workspace supports500patterns/styles. Nothing added or overwritten; catalog remains available.`);
    const at = Date.now();
    update((w) => ({
      ...w,
      patterns: [
        ...entries.map((p) => ({
          id: uid("catalog"),
          name: p.name,
          kind:
            p.category === "Indicator styles"
              ? ("style" as const)
              : ("pattern" as const),
          strategyId: w.activeStrategyId,
          market: w.market,
          timeframe: w.timeframe,
          tags: [...p.tags, `catalog:${p.id}`, "catalog reference"],
          notes: `${p.definition}\nSupport: ${p.support}\nSource: ${p.source}`,
          description: `Reference definition — not an uploaded image or trained visual detector. ${p.support}`,
          rules: [
            p.definition,
            `Review prerequisite: ${p.support}`,
            `Source: ${p.source}`,
          ],
          status: "review" as const,
          version: 1,
          createdAt: at,
          feedback: [],
        })),
        ...w.patterns,
      ],
    }));
    setNotice(
      `${entries.length} missing review-only catalog references added without overwriting uploads, personal styles or active selection. Save to cloud explicitly.`,
    );
  };
  return (
    <Sheet
      visible={visible}
      title={`Pattern reference catalog · ${PATTERN_CATALOG.length}`}
      onClose={onClose}
    >
      <Card>
        <Text style={styles.title}>Definitions, not instant training</Text>
        <Text style={styles.body}>
          A bounded catalog of common families, uploaded-source PD arrays and
          verified GitHub references. Not every named pattern has an automatic
          detector. Catalog additions have no source image/vector and never
          create probability or a paper order.
        </Text>
        <ActionButton
          compact
          kind="secondary"
          label="Add all missing references for review"
          onPress={addMissing}
        />
      </Card>
      <Input
        value={term}
        onChangeText={setTerm}
        placeholder="FVG, IFVG CE, hammer, MACD, flag…"
      />
      <View style={styles.rail}>
        {categories.map((c) => (
          <ActionButton
            key={c}
            compact
            label={c}
            kind={category === c ? "primary" : "secondary"}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      {notice ? (
        <Card>
          <Text style={styles.notice}>{notice}</Text>
        </Card>
      ) : null}
      <Text style={styles.meta}>
        {shown.length} matching reference definitions · your uploads remain
        separate
      </Text>
      {shown.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => setSelected(selected?.id === p.id ? undefined : p)}
        >
          <Card>
            <View style={styles.head}>
              <Text style={styles.title}>{p.name}</Text>
              <Pill label={p.category.toUpperCase()} tone="muted" />
            </View>
            <Text style={styles.body}>{p.definition}</Text>
            <Text style={styles.notice}>{p.support}</Text>
            {selected?.id === p.id ? (
              <>
                <Text style={styles.meta}>{p.source}</Text>
                {p.source.startsWith("https://") ? (
                  <ActionButton
                    compact
                    label="Read source / license"
                    kind="secondary"
                    onPress={() => {
                      const url = p.source.match(/https:\/\/\S+/)?.[0];
                      if (url) void Linking.openURL(url);
                    }}
                  />
                ) : null}
                <ActionButton
                  compact
                  label={
                    present(p)
                      ? "Already in your library"
                      : "Add review-only reference"
                  }
                  disabled={present(p)}
                  onPress={() => add(p)}
                />
              </>
            ) : (
              <Text style={styles.meta}>Tap for source and library action</Text>
            )}
          </Card>
        </Pressable>
      ))}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 13, fontWeight: "800", color: C.text, flex: 1 },
  body: { color: C.text, fontSize: 11, lineHeight: 17 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 15 },
  notice: { color: C.amber, fontSize: 10, lineHeight: 16 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rail: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
});
