import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Strategy } from "@/lib/trading/model";
import {
  draftNoCodeQuantRule,
  validateNoCodeQuantRule,
  type NoCodeQuantAssetNode,
  type NoCodeQuantCondition,
  type NoCodeQuantConditionNode,
  type NoCodeQuantInverseVolWeightNode,
  type NoCodeQuantNode,
  type NoCodeQuantRule,
  type NoCodeQuantTopNNode,
} from "@/lib/trading/no-code-quant";
import { C } from "./theme";
import { ActionButton, Divider, Input, Pill, SectionLabel, Sheet } from "./ui";

type StrategyWithQuantRule = Strategy & { quantRule?: NoCodeQuantRule };

type QuantRuleEditorProps = {
  strategy: Strategy;
  visible: boolean;
  onClose: () => void;
  /** Persists a draft only. Evaluation, paper gating, and order placement are outside this editor. */
  onSave: (rule: NoCodeQuantRule) => void;
};

const MAX_EDITOR_CONDITIONS = 6;

function cloneAsset(asset: NoCodeQuantAssetNode): NoCodeQuantAssetNode {
  return { ...asset };
}

function cloneNode(node: NoCodeQuantNode): NoCodeQuantNode {
  if (node.type === "condition")
    return { ...node, condition: { ...node.condition }, child: cloneAsset(node.child) };
  return { ...node, children: node.children.map(cloneAsset) };
}

function cloneRule(rule: NoCodeQuantRule): NoCodeQuantRule {
  return {
    ...rule,
    root: { ...rule.root, children: rule.root.children.map(cloneNode) },
  };
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function asNumber(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function shortKind(kind: NoCodeQuantCondition["kind"]): string {
  if (kind === "cumulative-return") return "Cumulative return";
  return kind === "rsi" ? "RSI" : "Trend averages";
}

function matchingNode<T extends NoCodeQuantNode["type"]>(
  nodes: readonly NoCodeQuantNode[],
  type: T,
): Extract<NoCodeQuantNode, { type: T }> | undefined {
  return nodes.find((node) => node.type === type) as
    | Extract<NoCodeQuantNode, { type: T }>
    | undefined;
}

function AssetInput({
  asset,
  label,
  onChange,
}: {
  asset: NoCodeQuantAssetNode;
  label: string;
  onChange: (symbol: string) => void;
}) {
  return (
    <Input
      label={label}
      value={asset.symbol}
      onChangeText={(value) => onChange(value.toUpperCase())}
      placeholder="Exact symbol in your supplied source, e.g. SPY"
    />
  );
}

function ConditionCard({
  node,
  onChange,
  onRemove,
  removable,
}: {
  node: NoCodeQuantConditionNode;
  onChange: (next: NoCodeQuantConditionNode) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const changeKind = (kind: NoCodeQuantCondition["kind"]) => {
    const condition: NoCodeQuantCondition =
      kind === "trend"
        ? { kind, fastBars: 20, slowBars: 50, comparison: "above" }
        : kind === "rsi"
          ? { kind, lookbackBars: 14, level: 50, comparison: "above" }
          : { kind, lookbackBars: 20, threshold: 0, comparison: "above" };
    onChange({ ...node, condition });
  };
  const condition = node.condition;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Closed-bar condition</Text>
          <Text style={styles.meta}>
            One explicit source asset; no chart setting or quote is inherited.
          </Text>
        </View>
        {removable ? (
          <ActionButton label="Remove" compact kind="ghost" onPress={onRemove} />
        ) : null}
      </View>
      <View style={styles.choiceRow}>
        {(["trend", "rsi", "cumulative-return"] as const).map((kind) => (
          <ActionButton
            key={kind}
            label={shortKind(kind)}
            compact
            kind={condition.kind === kind ? "primary" : "secondary"}
            onPress={() => changeKind(kind)}
          />
        ))}
      </View>
      <AssetInput
        asset={node.child}
        label="Source asset"
        onChange={(symbol) => onChange({ ...node, child: { ...node.child, symbol } })}
      />
      {condition.kind === "trend" ? (
        <View style={styles.fields}>
          <Input
            label="Fast average bars"
            keyboardType="numeric"
            value={String(condition.fastBars)}
            onChangeText={(value) =>
              onChange({
                ...node,
                condition: { ...condition, fastBars: asNumber(value) },
              })
            }
          />
          <Input
            label="Slow average bars"
            keyboardType="numeric"
            value={String(condition.slowBars)}
            onChangeText={(value) =>
              onChange({
                ...node,
                condition: { ...condition, slowBars: asNumber(value) },
              })
            }
          />
        </View>
      ) : (
        <View style={styles.fields}>
          <Input
            label="Lookback bars"
            keyboardType="numeric"
            value={String(condition.lookbackBars)}
            onChangeText={(value) =>
              onChange({
                ...node,
                condition: { ...condition, lookbackBars: asNumber(value) },
              })
            }
          />
          <Input
            label={condition.kind === "rsi" ? "RSI level" : "Return threshold (decimal)"}
            keyboardType="numeric"
            value={String(condition.kind === "rsi" ? condition.level : condition.threshold)}
            onChangeText={(value) =>
              onChange({
                ...node,
                condition:
                  condition.kind === "rsi"
                    ? { ...condition, level: asNumber(value) }
                    : { ...condition, threshold: asNumber(value) },
              })
            }
          />
        </View>
      )}
      <View style={styles.choiceRow}>
        {(["above", "below"] as const).map((comparison) => (
          <ActionButton
            key={comparison}
            label={comparison === "above" ? "Is above" : "Is below"}
            compact
            kind={condition.comparison === comparison ? "primary" : "secondary"}
            onPress={() => onChange({ ...node, condition: { ...condition, comparison } })}
          />
        ))}
      </View>
      <Text style={styles.note}>
        {condition.kind === "trend"
          ? "Compares the two trailing close averages at the final supplied closed bar."
          : condition.kind === "rsi"
            ? "Uses simple trailing close-to-close RSI; no intrabar value is read."
            : "Compares final closed price with the close exactly this many supplied bars earlier."}
      </Text>
    </View>
  );
}

function AssetGroup({
  node,
  title,
  description,
  topN,
  onChange,
}: {
  node: NoCodeQuantTopNNode | NoCodeQuantInverseVolWeightNode;
  title: string;
  description: string;
  topN?: boolean;
  onChange: (node: NoCodeQuantTopNNode | NoCodeQuantInverseVolWeightNode) => void;
}) {
  const updateAsset = (assetId: string, symbol: string) =>
    onChange({
      ...node,
      children: node.children.map((asset) =>
        asset.id === assetId ? { ...asset, symbol: symbol.toUpperCase() } : asset,
      ),
    });
  const addAsset = () => {
    if (node.children.length >= 8) return;
    onChange({
      ...node,
      children: [...node.children, { type: "asset", id: id("asset"), symbol: "" }],
    });
  };
  const removeAsset = (assetId: string) => {
    if (node.children.length <= 1) return;
    const children = node.children.filter((asset) => asset.id !== assetId);
    onChange(
      node.type === "topN"
        ? { ...node, children, topN: Math.min(node.topN, children.length) }
        : { ...node, children },
    );
  };
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.meta}>{description}</Text>
        </View>
        <Pill label="FIXED UNIVERSE" tone="muted" />
      </View>
      <View style={styles.fields}>
        <Input
          label="Lookback bars"
          keyboardType="numeric"
          value={String(node.lookbackBars)}
          onChangeText={(value) => onChange({ ...node, lookbackBars: asNumber(value) })}
        />
        {topN && node.type === "topN" ? (
          <Input
            label="Select top N"
            keyboardType="numeric"
            value={String(node.topN)}
            onChangeText={(value) => onChange({ ...node, topN: asNumber(value) })}
          />
        ) : null}
      </View>
      {node.children.map((asset, index) => (
        <View key={asset.id} style={styles.assetLine}>
          <View style={{ flex: 1 }}>
            <AssetInput
              asset={asset}
              label={`Universe asset ${index + 1}`}
              onChange={(symbol) => updateAsset(asset.id, symbol)}
            />
          </View>
          <ActionButton
            label="−"
            compact
            kind="ghost"
            disabled={node.children.length <= 1}
            onPress={() => removeAsset(asset.id)}
          />
        </View>
      ))}
      <ActionButton
        label="Add explicit asset"
        compact
        kind="secondary"
        disabled={node.children.length >= 8}
        onPress={addAsset}
      />
      <Text style={styles.note}>
        {topN
          ? "Ranks only these supplied symbols by trailing cumulative return; ties resolve alphabetically."
          : "Weights only these supplied symbols as inverse trailing close-to-close volatility; zero or missing history is excluded rather than estimated."}
      </Text>
    </View>
  );
}

function QuantRuleEditorForm({ strategy, visible, onClose, onSave }: QuantRuleEditorProps) {
  const existing = (strategy as StrategyWithQuantRule).quantRule;
  const [rule, setRule] = useState<NoCodeQuantRule>(() =>
    existing
      ? cloneRule(existing)
      : draftNoCodeQuantRule(`${strategy.name} closed-bar research`, strategy.id, strategy.version),
  );
  const [saveError, setSaveError] = useState<string>();
  const validation = useMemo(() => validateNoCodeQuantRule(rule), [rule]);
  const conditionNodes = rule.root.children.filter(
    (node): node is NoCodeQuantConditionNode => node.type === "condition",
  );
  const topN = matchingNode(rule.root.children, "topN");
  const inverseVol = matchingNode(rule.root.children, "inverseVolWeight");

  const update = (next: NoCodeQuantRule) => {
    setRule({
      ...next,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      status: "draft",
    });
    setSaveError(undefined);
  };
  const replaceNode = (nodeId: string, nextNode: NoCodeQuantNode) =>
    update({
      ...rule,
      root: {
        ...rule.root,
        children: rule.root.children.map((node) => (node.id === nodeId ? nextNode : node)),
      },
    });
  const removeCondition = (nodeId: string) =>
    update({
      ...rule,
      root: { ...rule.root, children: rule.root.children.filter((node) => node.id !== nodeId) },
    });
  const addCondition = () => {
    if (conditionNodes.length >= MAX_EDITOR_CONDITIONS) return;
    const suffix = id("condition");
    update({
      ...rule,
      root: {
        ...rule.root,
        children: [
          ...rule.root.children,
          {
            type: "condition",
            id: suffix,
            condition: { kind: "trend", fastBars: 20, slowBars: 50, comparison: "above" },
            child: { type: "asset", id: `${suffix}-asset`, symbol: "" },
          },
        ],
      },
    });
  };
  const save = () => {
    if (!validation.valid) {
      setSaveError(validation.issues[0] || "Resolve the draft before saving.");
      return;
    }
    // Saving a rule is intentionally not an evaluation, a source fetch, a gate override, or an order action.
    onSave({ ...cloneRule(rule), strategyId: strategy.id, strategyVersion: strategy.version, status: "draft" });
  };

  return (
    <Sheet
      visible={visible}
      title="No-code quant rule"
      subtitle="Closed-bar hypothetical research · draft only · no brokerage or automatic execution"
      onClose={onClose}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 3 }}>
          <SectionLabel>Bound strategy version</SectionLabel>
          <Text style={styles.title}>{strategy.name}</Text>
          <Text style={styles.detail}>
            This draft is bound to version {strategy.version}. Editing a strategy version requires reviewing and saving a new draft; a chart toggle is never changed here.
          </Text>
        </View>
        <Pill label="DRAFT" tone="amber" />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Purposeful, bounded rule builder</Text>
        <Text style={styles.detail}>
          Build a small tree from three reviewable condition types, an explicit fixed universe, top-N selection, and inverse-volatility weights. It evaluates only sourced closed bars supplied elsewhere. It does not connect to Composer, a broker, or a paid API.
        </Text>
      </View>

      <Input
        label="Draft name"
        value={rule.name}
        onChangeText={(name) => update({ ...rule, name })}
        placeholder="Describe the research hypothesis"
      />

      <SectionLabel>1 · Closed-bar conditions</SectionLabel>
      <Text style={styles.detail}>
        Each condition has its own named source asset. Conditions are transparent observations, not probability or entry claims.
      </Text>
      {conditionNodes.map((node) => (
        <ConditionCard
          key={node.id}
          node={node}
          removable={conditionNodes.length > 1}
          onChange={(next) => replaceNode(node.id, next)}
          onRemove={() => removeCondition(node.id)}
        />
      ))}
      <ActionButton
        label="Add condition"
        compact
        kind="secondary"
        disabled={conditionNodes.length >= MAX_EDITOR_CONDITIONS}
        onPress={addCondition}
      />

      <Divider />
      <SectionLabel>2 · Selection and weights</SectionLabel>
      <Text style={styles.detail}>
        These two independent children state how a supplied fixed universe would be ranked and weighted. They do not retrieve symbols or perform a rebalance.
      </Text>
      {topN ? (
        <AssetGroup
          node={topN}
          title="Top-N cumulative-return selection"
          description="Rank explicit assets using only their trailing closed bars."
          topN
          onChange={(next) => replaceNode(topN.id, next)}
        />
      ) : null}
      {inverseVol ? (
        <AssetGroup
          node={inverseVol}
          title="Inverse-volatility weight"
          description="Weight explicit assets from their trailing realized close-to-close volatility."
          onChange={(next) => replaceNode(inverseVol.id, next)}
        />
      ) : null}

      <Divider />
      <SectionLabel>3 · Review and save draft</SectionLabel>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Rule checks</Text>
        <Text style={styles.detail}>
          {validation.valid
            ? `${validation.assetSymbols.length} explicit asset${validation.assetSymbols.length === 1 ? "" : "s"} · compact tree valid`
            : `${validation.issues.length} item${validation.issues.length === 1 ? " needs" : "s need"} attention`}
        </Text>
        {!validation.valid
          ? validation.issues.slice(0, 3).map((issue) => (
              <Text key={issue} style={styles.errorText}>• {issue}</Text>
            ))
          : null}
      </View>
      {saveError ? <Text style={styles.errorText} accessibilityRole="alert">{saveError}</Text> : null}
      <ActionButton label="Save paper-research draft" icon="save-outline" disabled={!validation.valid} onPress={save} />
      <Text style={styles.caption}>
        Saving does not run the rule, change confluence eligibility, select a paper trade, submit an order, or alter chart settings. A separate supplied-data evaluator may later report hypothetical research only.
      </Text>
      <ActionButton label="Close" kind="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Reset unsaved local edits whenever this strategy/version editor session is opened. */
export function QuantRuleEditor(props: QuantRuleEditorProps) {
  const key = `${props.visible ? "open" : "closed"}:${props.strategy.id}:${props.strategy.version}:${JSON.stringify(props.strategy.quantRule)}`;
  return <QuantRuleEditorForm key={key} {...props} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { color: C.text, fontSize: 18, fontWeight: "800" },
  detail: { color: C.muted, fontSize: 11, lineHeight: 16 },
  note: { color: C.muted, fontSize: 10, lineHeight: 14 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  notice: { borderRadius: 4, borderWidth: 1, borderColor: C.amber + "88", backgroundColor: C.amber + "0D", padding: 10, gap: 4 },
  noticeTitle: { color: C.amber, fontSize: 12, fontWeight: "800" },
  card: { borderRadius: 4, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, padding: 10, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fields: { flexDirection: "row", gap: 8 },
  assetLine: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  summary: { borderRadius: 4, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, padding: 10, gap: 4 },
  summaryTitle: { color: C.text, fontSize: 11, fontWeight: "800" },
  errorText: { color: C.rose, fontSize: 10, lineHeight: 15 },
  caption: { color: C.muted, fontSize: 10, lineHeight: 14, textAlign: "center" },
});
