import { QuantRuleEditor } from "@/components/trading/quant-rule-editor";
import { QuantRuleRunner } from "@/components/trading/quant-rule-runner";
import { OrbStrategyEditor } from "@/components/trading/orb-strategy-editor";
import { OrbAutoPaperControls } from "@/components/trading/orb-auto-paper";
import { SessionStrategyEditor } from "@/components/trading/session-strategy-editor";
import { SessionAutoControls } from "@/components/trading/session-auto-paper";
import { trpc } from "@/lib/trpc";
import { QuantWorkbench } from "@/components/trading/quant-workbench";
import { ConfluenceEditor } from "@/components/trading/confluence-editor";
import type { QuantFamily } from "@/lib/trading/quant-lab-types";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { type Factor, type Strategy, uid } from "@/lib/trading/model";
import {
  FOUNDRY_PRESETS,
  FOUNDRY_DATA_PREREQUISITES,
} from "@/lib/trading/foundry-suite";
import { ORB_SOURCE, ORB_STRATEGY } from "@/lib/trading/orb-presets";
import { resolveSetupFamily } from "@/lib/trading/setup-presets";
import { SESSION_STRATEGY_PRESETS } from "@/lib/trading/session-strategy-presets";
import { restoreStrategyRevision } from "@/lib/trading/strategies05-revision-restore";
import {
  sessionExecutionTimeframe,
  sessionStrategyConfigSchema,
} from "@/lib/trading/session-strategy-model";
import originalDisclaimer from "@/lib/trading/wr1-disclaimer.json";
import {
  ActionButton,
  Card,
  EmptyState,
  Header,
  Input,
  Pill,
  Screen,
  SectionLabel,
  Sheet,
  ToggleRow,
} from "@/components/trading/ui";
import { C } from "@/components/trading/theme";

const STRATEGY_LIMIT = 100;
const STRATEGY_LIMIT_NOTICE =
  "Strategy workspace limit100 reached. Reference catalog remains available; no existing or archived strategy was changed.";

function snapshot(s: Strategy) {
  return {
    version: s.version,
    name: s.name,
    description: s.description,
    factors: s.factors.map((f) => ({ ...f })),
    kind: s.kind,
    source: s.source,
    setupFamily: s.setupFamily,
    color: s.color,
    visible: s.visible,
    archived: s.archived,
    orbConfig: s.orbConfig
      ? JSON.parse(JSON.stringify(s.orbConfig))
      : undefined,
    sessionConfig: s.sessionConfig
      ? JSON.parse(JSON.stringify(s.sessionConfig))
      : undefined,
    confluence: s.confluence
      ? JSON.parse(JSON.stringify(s.confluence))
      : undefined,
    at: Date.now(),
  };
}
export default function StrategiesScreen() {
  const [quantRuleOpen, setQuantRuleOpen] = useState(false);
  const { workspace, update, saveCloud, ownerAllowed, ready } = useWorkspace(),
    router = useRouter();
  const [gateOpen, setGateOpen] = useState(false);
  const [quantFamily, setQuantFamily] = useState<QuantFamily | null>(null);
  const [term, setTerm] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [editor, setEditor] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [ruleText, setRuleText] = useState(""),
    [editingId, setEditingId] = useState<string | null>(null),
    [disclaimerOpen, setDisclaimerOpen] = useState(false),
    [catalogCategory, setCatalogCategory] = useState<"all" | "session">("all"),
    [notice, setNotice] = useState<string>();
  const selected = workspace.strategies.find((s) => s.id === selectedId);
  // Family resolution, rather than the display name, determines ORB behavior.
  const selectedIsOrb = selected
    ? resolveSetupFamily(selected) === "orb"
    : false;
  const selectedSessionFamily = selected?.setupFamily;
  const selectedIsSession =
    selectedSessionFamily === "london-breakout" ||
    selectedSessionFamily === "initial-balance" ||
    selectedSessionFamily === "pdc-continuation";
  const gateAnalysis = trpc.setup.analyze.useQuery(
    {
      market: workspace.market,
      timeframe: workspace.timeframe,
      strategies: selected ? [selected] : [],
      strategyIds: selected ? [selected.id] : [],
      combination: "all",
      timezone: workspace.settings.timezone,
    },
    { enabled: gateOpen && Boolean(selected), retry: false },
  );
  const refinements = trpc.learning.refinement.useQuery(
    { strategy: selected || workspace.strategies[0] },
    { enabled: Boolean(selected), retry: false },
  );
  const strategies = useMemo(
    () =>
      workspace.strategies.filter(
        (s) =>
          !s.archived &&
          `${s.name} ${s.description}`
            .toLowerCase()
            .includes(term.toLowerCase()),
      ),
    [workspace.strategies, term],
  );
  const apply = (s: Strategy) => {
    const sessionConfig = sessionStrategyConfigSchema.safeParse(
      s.sessionConfig,
    );
    update((w) => ({
      ...w,
      strategies: w.strategies.map((item) =>
        item.id === s.id ? { ...item, visible: true } : item,
      ),
      activeStrategyId: s.id,
      timeframe: sessionConfig.success
        ? sessionExecutionTimeframe(sessionConfig.data)
        : resolveSetupFamily(s) === "orb"
          ? "1m"
          : w.timeframe,
      settings: { ...w.settings, analysisStrategyIds: [s.id] },
    }));
    setSelectedId(null);
    router.navigate("/");
  };
  const addReferenceModel = (preset: Strategy) => {
    if (workspace.strategies.some((strategy) => strategy.id === preset.id)) {
      setNotice(
        `${preset.name} is already in your library; the existing record was not changed.`,
      );
      return false;
    }
    const reference: Strategy = JSON.parse(JSON.stringify(preset));
    if (workspace.strategies.length >= STRATEGY_LIMIT) {
      setNotice(STRATEGY_LIMIT_NOTICE);
      return false;
    }
    update((workspace) => ({
      ...workspace,
      strategies: [...workspace.strategies, reference],
    }));
    setNotice(
      `${preset.name} was added as a separate source reference. Your active strategy was not changed.`,
    );
    return true;
  };
  const openOrb = () => {
    const existing = workspace.strategies.find(
      (strategy) => strategy.id === ORB_STRATEGY.id,
    );
    if (existing) return setSelectedId(existing.id);
    if (addReferenceModel(ORB_STRATEGY)) setSelectedId(ORB_STRATEGY.id);
  };
  const openSessionPreset = (preset: Strategy) => {
    const existing = workspace.strategies.find(
      (strategy) => strategy.id === preset.id,
    );
    if (existing) return setSelectedId(existing.id);
    if (addReferenceModel(preset)) setSelectedId(preset.id);
  };
  const addAllMissingSessionReferences = () => {
    const missing = SESSION_STRATEGY_PRESETS.filter(
      (preset) =>
        !workspace.strategies.some((strategy) => strategy.id === preset.id),
    );
    if (!missing.length) {
      setNotice(
        "All session and pivot source references are already in your library; nothing changed.",
      );
      return;
    }
    if (workspace.strategies.length + missing.length > STRATEGY_LIMIT) {
      setNotice(STRATEGY_LIMIT_NOTICE);
      return;
    }
    update((current) => ({
      ...current,
      strategies: [
        ...current.strategies,
        ...JSON.parse(JSON.stringify(missing)),
      ],
    }));
    setNotice(
      `${missing.length} missing session/pivot source reference${missing.length === 1 ? " was" : "s were"} added. Existing records and the active strategy were not changed.`,
    );
  };
  const watchSessionStrategy = (strategy: Strategy) => {
    if (!ownerAllowed || !ready) {
      setNotice(
        "Watch creation is available only in a ready, verified-owner workspace. No alert rule was created.",
      );
      return;
    }
    const parsed = sessionStrategyConfigSchema.safeParse(
      strategy.sessionConfig,
    );
    if (!parsed.success) {
      setNotice(
        "Save a valid session app configuration before creating a setup watch. No alert rule was created.",
      );
      return;
    }
    const timeframe = sessionExecutionTimeframe(parsed.data);
    const existing = workspace.alerts.find(
      (rule) =>
        rule.kind === "setup" &&
        rule.market === workspace.market &&
        rule.timeframe === timeframe &&
        rule.strategyId === strategy.id,
    );
    if (!existing && workspace.alerts.length >= 100) {
      setNotice(
        "Alert capacity reached (100). Remove an unused rule in Alerts before creating another; no rule was discarded.",
      );
      return;
    }
    update((current) => ({
      ...current,
      alerts: existing
        ? current.alerts.map((rule) =>
            rule.id === existing.id ? { ...rule, enabled: true } : rule,
          )
        : [
            {
              id: uid("alert"),
              name: `${strategy.name} · session setup watch`,
              market: current.market,
              timeframe,
              strategyId: strategy.id,
              kind: "setup",
              price: 0,
              enabled: true,
              cooldownMinutes: 30,
              createdAt: Date.now(),
            },
            ...current.alerts,
          ],
    }));
    setNotice(
      existing
        ? "Existing scoped session setup watch was explicitly re-enabled locally; no duplicate was created."
        : "Session setup watch was explicitly enabled locally. Save it to cloud and separately activate a published heartbeat/scan; native permission and actual push delivery are not verified.",
    );
  };
  const saveWorkspaceCloud = async () => {
    try {
      if (await saveCloud()) setNotice("Workspace saved to canonical cloud.");
      else
        setNotice(
          "Workspace remains local; canonical cloud save was not confirmed.",
        );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Workspace remains local; cloud save failed: ${error.message}`
          : "Workspace remains local; cloud save failed.",
      );
    }
  };
  const orbMatchesSearch =
    `${ORB_STRATEGY.name} ${ORB_STRATEGY.description} ${ORB_SOURCE}`
      .toLowerCase()
      .includes(term.toLowerCase());
  const sessionPresets = SESSION_STRATEGY_PRESETS.filter((preset) =>
    `${preset.name} ${preset.description} ${preset.source || ""}`
      .toLowerCase()
      .includes(term.toLowerCase()),
  );
  const change = (s: Strategy, recipe: (strategy: Strategy) => Strategy) => {
    if (s.kind === "reference")
      return setNotice(
        "Duplicate the source reference before changing its rules.",
      );
    update((w) => ({
      ...w,
      strategies: w.strategies.map((item) =>
        item.id === s.id
          ? {
              ...recipe(item),
              version: item.version + 1,
              history: [...(item.history || []), snapshot(item)].slice(-20),
            }
          : item,
      ),
    }));
  };
  const duplicate = (s: Strategy) => {
    if (workspace.strategies.length >= STRATEGY_LIMIT)
      return setNotice(STRATEGY_LIMIT_NOTICE);
    const copy: Strategy = {
      ...JSON.parse(JSON.stringify(s)),
      id: uid("strategy"),
      name: `${s.name} copy`,
      kind: "strategy",
      version: 1,
      history: [],
      source: `Personal copy of ${s.name} · source ${s.source || "personal"}`,
    };
    update((w) => ({
      ...w,
      strategies: [...w.strategies, copy],
      activeStrategyId: copy.id,
    }));
    setSelectedId(copy.id);
  };
  const edit = (s?: Strategy) => {
    setEditingId(s?.id || null);
    setName(s?.name || "");
    setDescription(s?.description || "");
    setRuleText(
      s?.factors.map((f) => f.description || f.name).join("\n") || "",
    );
    setEditor(true);
  };
  const save = () => {
    if (!name.trim()) return setNotice("Give the strategy a name.");
    const lines = ruleText
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 50);
    const old = workspace.strategies.find((s) => s.id === editingId);
    const factors: Factor[] = lines.map((rule, i) => ({
      id: old?.factors[i]?.id || uid("factor"),
      name: rule.slice(0, 140),
      description: rule,
      group: old?.factors[i]?.group || "Personal rule",
      weight: old?.factors[i]?.weight ?? 10,
      enabled: old?.factors[i]?.enabled ?? true,
    }));
    if (old)
      change(old, (s) => ({
        ...s,
        name: name.trim().slice(0, 150),
        description: description.slice(0, 10000),
        factors,
      }));
    else {
      const s: Strategy = {
        id: uid("strategy"),
        name: name.trim().slice(0, 150),
        description,
        color: "#8EC5FF",
        kind: "strategy",
        factors,
        visible: true,
        version: 1,
        history: [],
      };
      if (workspace.strategies.length >= STRATEGY_LIMIT)
        return setNotice(STRATEGY_LIMIT_NOTICE);
      update((w) => ({
        ...w,
        strategies: [...w.strategies, s],
        activeStrategyId: s.id,
      }));
    }
    setEditor(false);
  };
  const archive = (s: Strategy) => {
    update((w) => ({
      ...w,
      strategies: w.strategies.map((item) =>
        item.id === s.id ? { ...item, archived: true, visible: false } : item,
      ),
      activeStrategyId:
        w.activeStrategyId === s.id
          ? w.strategies.find((item) => item.id !== s.id && !item.archived)
              ?.id || "wr1"
          : w.activeStrategyId,
    }));
    setSelectedId(null);
  };
  return (
    <Screen>
      <Header
        title="Strategies"
        subtitle="Select / combine source styles on chart. Independent visibility."
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <ActionButton
              label="Guide"
              compact
              kind="ghost"
              onPress={() => router.navigate("/features")}
            />
            <ActionButton
              label="AI"
              compact
              kind="secondary"
              onPress={() => router.navigate("/coach")}
            />
            <ActionButton
              label="New"
              compact
              icon="add"
              onPress={() => edit()}
            />
          </View>
        }
      />
      <Card>
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder="Find a strategy, style or rulebook"
        />
        <ActionButton
          label="Photo-based search in My Library"
          kind="secondary"
          compact
          icon="images-outline"
          onPress={() => router.navigate("/library")}
        />
      </Card>
      {notice ? (
        <Card>
          <Text style={styles.notice}>{notice}</Text>
        </Card>
      ) : null}
      <SectionLabel>Rulebooks & reviewed styles</SectionLabel>
      <Card>
        <Text style={styles.title}>Catalog category</Text>
        <Text style={styles.meta}>
          Filter source references without changing your saved library, chart,
          market, overlays, or active strategy.
        </Text>
        <View style={styles.actions}>
          <ActionButton
            label="All source categories"
            compact
            kind={catalogCategory === "all" ? "primary" : "secondary"}
            onPress={() => setCatalogCategory("all")}
          />
          <ActionButton
            label="Session & pivot strategies"
            compact
            kind={catalogCategory === "session" ? "primary" : "secondary"}
            onPress={() => setCatalogCategory("session")}
          />
        </View>
      </Card>
      {catalogCategory === "all" && orbMatchesSearch ? (
        <Card style={{ borderColor: ORB_STRATEGY.color + "99" }}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Video strategy · ORB</Text>
              <Text style={styles.detail}>
                Source sequence: 08:00–08:15 EST candle → breakout → later 50%
                touch → later closed continuation; 09:00–11:00 EST entries. This
                is not a generic 09:30 model.
              </Text>
            </View>
            <Pill
              label={
                workspace.strategies.some((s) => s.id === ORB_STRATEGY.id)
                  ? "IN LIBRARY"
                  : "SOURCE REF"
              }
              tone="amber"
            />
          </View>
          <Text style={styles.source}>
            Source clip attribution · {ORB_SOURCE}
          </Text>
          <Text style={styles.detail}>
            Video rules stay separate from owner-approved app execution
            conventions. No 40–60% win rate is validated. Gold/Asia remains
            reference-only until its missing opening anchor and clocks are
            configured.
          </Text>
          <ActionButton
            label={
              workspace.strategies.some((s) => s.id === ORB_STRATEGY.id)
                ? "Configure ORB"
                : "Add ORB Strategy"
            }
            compact
            kind="secondary"
            onPress={openOrb}
          />
        </Card>
      ) : null}
      {(catalogCategory === "all" || catalogCategory === "session") &&
      sessionPresets.length ? (
        <Card style={{ borderColor: "#A78BFA99" }}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Session & pivot strategies</Text>
              <Text style={styles.detail}>
                London Breakout, Initial Balance and Red-to-Green / Green-to-Red
                source references. Each keeps original user rules distinct from
                owner-approved app defaults and remains unvalidated.
              </Text>
            </View>
            <Pill label="SOURCE REF" tone="amber" />
          </View>
          <Text style={styles.source}>
            Pasted_content_08.txt · source rules and labelled app conventions
            are separately reviewable.
          </Text>
          <ActionButton
            label="Add all missing session/pivot references"
            compact
            kind="secondary"
            onPress={addAllMissingSessionReferences}
          />
          <View style={styles.actions}>
            {sessionPresets.map((preset) => {
              const present = workspace.strategies.some(
                (strategy) => strategy.id === preset.id,
              );
              return (
                <ActionButton
                  key={preset.id}
                  label={
                    present ? `Configure ${preset.name}` : `Add ${preset.name}`
                  }
                  compact
                  kind="secondary"
                  onPress={() => openSessionPreset(preset)}
                />
              );
            })}
          </View>
        </Card>
      ) : null}
      {catalogCategory === "all" ? (
        <Card>
          <Text style={styles.title}>
            Requested strategy suite · {FOUNDRY_PRESETS.length} source models
          </Text>
          <Text style={styles.detail}>
            OB, STDV, Core, SMA, MACD, EMA, breakout and BB only in the preset
            catalog. These have different support levels; a source model is not
            validated edge. STDV uses the requested rolling VWAP ±2.5σ model.
            Numerical watch-only rules remain explicitly unready. Existing
            personal/uploads and older saved records are preserved below.
          </Text>
          <ActionButton
            label="Add all missing source references"
            compact
            kind="secondary"
            onPress={() => {
              const missing = FOUNDRY_PRESETS.filter(
                (p) => !workspace.strategies.some((s) => s.id === p.id),
              );
              if (
                workspace.strategies.filter((s) => !s.archived).length +
                  missing.length >
                STRATEGY_LIMIT
              )
                return setNotice(
                  `Need room for ${missing.length} references; 100 active and 500 archived strategy records have separate allowances. Nothing changed.`,
                );
              update((w) => ({
                ...w,
                strategies: [
                  ...w.strategies,
                  ...JSON.parse(JSON.stringify(missing)),
                ],
              }));
              setNotice(
                `${missing.length} separate references added; existing and archived records preserved.`,
              );
            }}
          />
          <View style={styles.actions}>
            {FOUNDRY_PRESETS.filter((preset) =>
              `${preset.name} ${preset.description}`
                .toLowerCase()
                .includes(term.toLowerCase()),
            ).map((preset) => {
              const present = workspace.strategies.some(
                (strategy) => strategy.id === preset.id,
              );
              return (
                <ActionButton
                  key={preset.id}
                  label={
                    present ? `${preset.name} in library` : `Add ${preset.name}`
                  }
                  compact
                  kind="secondary"
                  disabled={present}
                  onPress={() => addReferenceModel(preset)}
                />
              );
            })}
          </View>
        </Card>
      ) : null}
      <SectionLabel>Quantitative workbench</SectionLabel>
      <Text style={styles.detail}>
        Run real-data models; operational output and statistical validation are
        separate.
      </Text>
      {FOUNDRY_DATA_PREREQUISITES.map((family) => (
        <Card key={family.id}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{family.name}</Text>
              <Text style={styles.meta}>Inputs → model → sourced results</Text>
            </View>
            <ActionButton
              compact
              label="Run"
              kind="secondary"
              onPress={() => setQuantFamily(family.id as QuantFamily)}
            />
          </View>
        </Card>
      ))}
      {quantFamily ? (
        <QuantWorkbench
          key={quantFamily}
          visible
          initialFamily={quantFamily}
          onClose={() => setQuantFamily(null)}
        />
      ) : null}
      <ActionButton
        compact
        label="Save current workspace to cloud"
        kind="secondary"
        onPress={() => void saveWorkspaceCloud()}
      />
      <SectionLabel>Your saved rulebooks</SectionLabel>
      {strategies.length ? (
        strategies.map((s) => (
          <Pressable key={s.id} onPress={() => setSelectedId(s.id)}>
            <Card
              style={
                workspace.activeStrategyId === s.id
                  ? { borderColor: s.color }
                  : undefined
              }
            >
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{s.name}</Text>
                  <Text style={styles.detail}>{s.description}</Text>
                </View>
                <Pill
                  label={
                    s.kind === "reference"
                      ? "SOURCE REF"
                      : s.kind === "style"
                        ? "STYLE"
                        : "PERSONAL"
                  }
                  tone={s.kind === "reference" ? "amber" : "lime"}
                />
              </View>
              <Text style={styles.meta}>
                v{s.version} · {s.factors.filter((f) => f.enabled).length}/
                {s.factors.length} enabled factors · overlays{" "}
                {s.visible ? "ON" : "OFF"}
              </Text>
              {s.source ? <Text style={styles.source}>{s.source}</Text> : null}
              <ActionButton
                label="Apply to chart"
                compact
                kind="secondary"
                onPress={() => apply(s)}
              />
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="No matching rulebooks"
          detail="Add a personal strategy or search another name."
        />
      )}
      <Card>
        <Text style={styles.detail}>
          WR1 is one reference strategy from the shared PDF, not your personal
          system. Your rules and styles can coexist, be switched, and have
          overlays toggled on or off independently.
        </Text>
        <ActionButton
          label="Read original WR1 risk disclaimers"
          compact
          kind="secondary"
          onPress={() => setDisclaimerOpen(true)}
        />
      </Card>
      <Sheet
        visible={Boolean(selected)}
        title={selected?.name || "Strategy"}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <>
            <Pill
              label={`${selected.kind.toUpperCase()} · v${selected.version}`}
              tone="amber"
            />
            <Text style={styles.detail}>{selected.description}</Text>
            {selectedIsOrb ? (
              <OrbStrategyEditor
                key={`${selected.id}:${selected.version}`}
                strategy={selected}
                marketId={workspace.market}
                onSave={(orbConfig) => {
                  update((current) => ({
                    ...current,
                    strategies: current.strategies.map((strategy) =>
                      strategy.id === selected.id
                        ? {
                            ...strategy,
                            orbConfig,
                            confluence: undefined,
                            version: strategy.version + 1,
                            history: [
                              ...(strategy.history || []),
                              snapshot(strategy),
                            ].slice(-20),
                          }
                        : strategy,
                    ),
                  }));
                  setNotice(
                    "ORB app configuration saved locally as a new revision. Prior confluence approval was cleared; save to cloud explicitly when ready.",
                  );
                }}
              />
            ) : null}
            {selectedIsOrb ? (
              <OrbAutoPaperControls
                key={`${selected.id}:${selected.version}`}
                strategy={selected}
              />
            ) : null}
            {selectedIsSession ? (
              <SessionStrategyEditor
                key={`${selected.id}:${selected.version}:session`}
                strategy={selected}
                market={workspace.market}
                disabled={!ownerAllowed || !ready}
                onSave={(sessionConfig) => {
                  update((current) => ({
                    ...current,
                    strategies: current.strategies.map((strategy) =>
                      strategy.id === selected.id
                        ? {
                            ...strategy,
                            sessionConfig,
                            confluence: undefined,
                            version: strategy.version + 1,
                            history: [
                              ...(strategy.history || []),
                              snapshot(strategy),
                            ].slice(-20),
                          }
                        : strategy,
                    ),
                  }));
                  setNotice(
                    "Session app configuration saved locally as a new revision. Factors and prior configuration were retained in history; prior confluence approval was cleared. Save to cloud explicitly when ready.",
                  );
                }}
              />
            ) : null}
            {selectedIsSession ? (
              <SessionAutoControls
                key={`${selected.id}:${selected.version}:session-auto`}
                strategy={selected}
              />
            ) : null}
            <ToggleRow
              label="Show chart overlays"
              detail="Independent of which strategy is active for analysis"
              value={selected.visible}
              onChange={(visible) =>
                update((w) => ({
                  ...w,
                  strategies: w.strategies.map((s) =>
                    s.id === selected.id ? { ...s, visible } : s,
                  ),
                }))
              }
            />
            <ActionButton
              label="Apply strategy to chart"
              onPress={() => apply(selected)}
            />
            {selectedIsSession ? (
              <>
                <ActionButton
                  label="Watch this strategy"
                  kind="secondary"
                  disabled={!ownerAllowed || !ready}
                  onPress={() => watchSessionStrategy(selected)}
                />
                <Text style={styles.meta}>
                  Creates or explicitly re-enables one saved setup watch scoped
                  to the selected workspace market, this strategy ID, and its
                  configured execution timeframe. It does not create an
                  immediate job, public link, alert delivery, or actual order.
                  Foreground scanning versus a separately published heartbeat is
                  distinct; native permission and push delivery are not verified
                  here.
                </Text>
                {!ownerAllowed || !ready ? (
                  <Text style={styles.notice}>
                    A ready verified-owner workspace is required before a watch
                    can be explicitly enabled.
                  </Text>
                ) : null}
              </>
            ) : null}
            <ActionButton
              label="Duplicate as personal strategy"
              kind="secondary"
              onPress={() => duplicate(selected)}
            />
            {selected.kind !== "reference" ? (
              <View style={styles.actions}>
                <ActionButton
                  label="Edit rules"
                  compact
                  kind="secondary"
                  onPress={() => edit(selected)}
                />
                <ActionButton
                  label="Archive profile"
                  compact
                  kind="danger"
                  onPress={() => archive(selected)}
                />
              </View>
            ) : (
              <Text style={styles.notice}>
                Source factors are read-only. Duplicate this reference to
                customize them.
              </Text>
            )}
            <ActionButton
              label="Build no-code research rule"
              kind="secondary"
              onPress={() => setQuantRuleOpen(true)}
            />
            <QuantRuleRunner
              key={`${selected.id}:${selected.version}:${JSON.stringify(selected.quantRule)}`}
              strategy={selected}
            />
            {quantRuleOpen ? (
              <QuantRuleEditor
                visible
                strategy={selected}
                onClose={() => setQuantRuleOpen(false)}
                onSave={(rule) => {
                  update((w) => ({
                    ...w,
                    strategies: w.strategies.map((s) =>
                      s.id === selected.id ? { ...s, quantRule: rule } : s,
                    ),
                  }));
                  setQuantRuleOpen(false);
                  setNotice(
                    "Research draft saved. Evaluate its named sources separately; no strategy or gate was auto-approved.",
                  );
                }}
              />
            ) : null}
            <ActionButton
              label={
                selected.confluence
                  ? "Review approved confluence gate"
                  : "Configure confluence gate"
              }
              kind="secondary"
              onPress={() => setGateOpen(true)}
            />
            <Text style={styles.meta}>
              Native closed-OHLC subset with explicit personal
              weights/direction; not the full discretionary source or a
              calibrated probability. Approval is separate from source factors.
            </Text>
            {gateOpen && gateAnalysis.isLoading ? (
              <Text style={styles.meta}>
                Loading actual closed-bar conditions…
              </Text>
            ) : null}
            {gateOpen && gateAnalysis.error ? (
              <Text style={styles.notice}>{gateAnalysis.error.message}</Text>
            ) : null}
            {gateOpen && gateAnalysis.data ? (
              <ConfluenceEditor
                key={`${selected.id}:${gateAnalysis.data.asOf}`}
                visible
                strategy={selected}
                analysis={gateAnalysis.data}
                onClose={() => setGateOpen(false)}
                onSave={async (config) => {
                  const next = {
                    ...workspace,
                    strategies: workspace.strategies.map((s) =>
                      s.id === selected.id ? { ...s, confluence: config } : s,
                    ),
                  };
                  update(() => next);
                  setGateOpen(false);
                  try {
                    if (!(await saveCloud(next)))
                      throw new Error(
                        "Canonical cloud save failed; your approved gate remains local.",
                      );
                    setNotice(
                      "Approved personal gate saved to canonical cloud. Refresh a paper proposal before strategy mode.",
                    );
                  } catch (e) {
                    setNotice(
                      e instanceof Error
                        ? `Gate retained locally but cloud approval failed: ${e.message}`
                        : "Gate retained locally; save to cloud before strategy paper use.",
                    );
                  }
                }}
              />
            ) : null}
            <SectionLabel>Review-only refinement</SectionLabel>
            <Card>
              <Text style={styles.detail}>
                {refinements.data?.message ||
                  refinements.error?.message ||
                  "Checking retained outcomes for this exact version…"}
              </Text>
              <Text style={styles.meta}>{refinements.data?.limitations}</Text>
              {refinements.data?.proposals.map((p) => (
                <View key={p.factorId}>
                  <Text style={styles.detail}>
                    {p.name}: {p.before} → {p.weight}; present n={p.withCount},
                    absent n={p.withoutCount}, observed mean-R difference{" "}
                    {p.meanDifference.toFixed(2)}
                  </Text>
                  {selected.kind !== "reference" ? (
                    <ActionButton
                      label="Accept weight as new revision"
                      compact
                      kind="secondary"
                      onPress={() =>
                        change(selected, (s) => ({
                          ...s,
                          factors: s.factors.map((f) =>
                            f.id === p.factorId
                              ? { ...f, weight: p.weight }
                              : f,
                          ),
                        }))
                      }
                    />
                  ) : (
                    <Text style={styles.notice}>
                      Duplicate the source reference to review personal changes.
                    </Text>
                  )}
                </View>
              ))}
            </Card>
            <SectionLabel>Confluence rules and weights</SectionLabel>
            {selected.factors.map((f) => (
              <Card key={f.id}>
                <Text style={styles.title}>{f.name}</Text>
                <Text style={styles.meta}>
                  {f.group}
                  {f.page ? ` · WR1 PDF p.${f.page}` : ""}
                </Text>
                <Text style={styles.detail}>{f.description}</Text>
                {selected.kind !== "reference" ? (
                  <>
                    <ToggleRow
                      label="Include this factor"
                      value={f.enabled}
                      onChange={(enabled) =>
                        change(selected, (s) => ({
                          ...s,
                          factors: s.factors.map((item) =>
                            item.id === f.id ? { ...item, enabled } : item,
                          ),
                        }))
                      }
                    />
                    <Input
                      label="Weight (0–100)"
                      value={String(f.weight)}
                      onChangeText={(value) => {
                        const weight = Number(value);
                        if (
                          Number.isFinite(weight) &&
                          weight >= 0 &&
                          weight <= 100
                        )
                          change(selected, (s) => ({
                            ...s,
                            factors: s.factors.map((item) =>
                              item.id === f.id ? { ...item, weight } : item,
                            ),
                          }));
                      }}
                      keyboardType="numeric"
                    />
                  </>
                ) : (
                  <Text style={styles.meta}>
                    Source-reference factor · application weighting {f.weight};
                    these weights are not authored/validated WR1 probabilities.
                  </Text>
                )}
              </Card>
            ))}
            {selected.history?.length ? (
              <>
                <SectionLabel>Version review / explicit rollback</SectionLabel>
                {selected.history
                  .slice(-5)
                  .reverse()
                  .map((version, i) => (
                    <Card key={`${version.version}-${i}`}>
                      <Text style={styles.meta}>
                        Recorded v{version.version} ·{" "}
                        {new Date(version.at).toLocaleString()} ·{" "}
                        {version.factors.length} rules
                        {version.orbConfig ? " · ORB config" : ""}
                        {version.sessionConfig ? " · session config" : ""}
                      </Text>
                      <ActionButton
                        label={`Restore v${version.version} as a new revision`}
                        compact
                        kind="secondary"
                        onPress={() =>
                          change(selected, (s) =>
                            restoreStrategyRevision(s, version),
                          )
                        }
                      />
                    </Card>
                  ))}
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>
      <Sheet
        visible={editor}
        title={editingId ? "Edit personal rules" : "New personal strategy"}
        onClose={() => setEditor(false)}
      >
        <Input label="Strategy name" value={name} onChangeText={setName} />
        <Input
          label="Scope / sessions / entry model"
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Input
          label="Confluence rules — one per line"
          value={ruleText}
          onChangeText={setRuleText}
          multiline
        />
        <Text style={styles.meta}>
          Each rule becomes a reviewable factor. Weights start at 10 and can be
          adjusted. These saved manual factors are not the new sourced
          confluence gate. Saving an edit creates a version snapshot, not an
          automatic profitability claim or entry permission.
        </Text>
        <ActionButton label="Save strategy revision" onPress={save} />
      </Sheet>
      <Sheet
        visible={disclaimerOpen}
        title={originalDisclaimer.title}
        onClose={() => setDisclaimerOpen(false)}
      >
        <Text style={styles.source}>
          {originalDisclaimer.source} · quoted source text below, not
          app-authored advice
        </Text>
        <Text style={styles.detail}>{originalDisclaimer.text}</Text>
      </Sheet>
    </Screen>
  );
}
const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 8 },
  title: { color: C.text, fontWeight: "800", fontSize: 14 },
  detail: { color: C.text, fontSize: 12, lineHeight: 18 },
  meta: { color: C.muted, fontSize: 11, lineHeight: 17 },
  source: { color: C.amber, fontSize: 10, lineHeight: 16 },
  notice: { color: C.amber, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
