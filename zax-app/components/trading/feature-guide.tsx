import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen, Header, Input, Card, ActionButton } from "./ui";
import { C } from "./theme";
import { glossaryForGroup } from "@/lib/trading/glossary";

export const GUIDE_REVIEW_DATE = "18 October 2026";

const STATUS_DETAILS = {
  Operational:
    "A documented current service check exists for this capability; that does not establish device or statistical validation.",
  "Data required":
    "Current source, entitlement, owner record, or input data is needed; absent data is a boundary, not a result.",
  "Deployment required":
    "The documented delivery path needs deployed native/server configuration or a physical delivery check.",
  "Qualification required":
    "A research result exists, but edge, calibration, or predictive usefulness has not been qualified.",
  "Device test required":
    "The documented source path has no physical-device verification recorded in this guide.",
} as const;

export type GuideStatus = keyof typeof STATUS_DETAILS;

export type FeaturePurpose = {
  name: string;
  purpose: string;
  location: string;
  how_to_use: string;
  output: string;
  next_action: string;
  status: GuideStatus;
  limits: string;
};
export type FeaturePurposeGroup = {
  id: string;
  name: string;
  guide_note: string;
  features: FeaturePurpose[];
};
type VisibleFeature = FeaturePurpose & { featureIndex: number };
type VisibleGroup = Omit<FeaturePurposeGroup, "features"> & {
  groupIndex: number;
  features: VisibleFeature[];
};

export function FeatureGuide({
  groups,
  initialGroup,
}: {
  groups: FeaturePurposeGroup[];
  initialGroup?: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const groupOffsets = useRef<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | undefined>(() => initialGroup && groups.some(group=>group.id===initialGroup) ? initialGroup : undefined);
  const [openFeature, setOpenFeature] = useState<string>();
  const [instructionGroup, setInstructionGroup] = useState<string>();
  const [glossaryGroup, setGlossaryGroup] = useState<string>();

  useEffect(() => {
    if (!initialGroup || !groups.some((group) => group.id === initialGroup))
      return;
    const offset = groupOffsets.current[initialGroup];
    if (typeof offset === "number")
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          y: Math.max(offset - 8, 0),
          animated: false,
        }),
      );
  }, [groups, initialGroup]);

  const visible = useMemo<VisibleGroup[]>(() => {
    const term = search.trim().toLowerCase();
    return groups
      .map((group, groupIndex) => ({
        ...group,
        groupIndex,
        features: group.features
          .map((feature, featureIndex) => ({ ...feature, featureIndex }))
          .filter(
            (feature) =>
              !term ||
              `${group.name} ${group.guide_note} ${feature.name} ${feature.purpose} ${feature.location}`
                .toLowerCase()
                .includes(term),
          ),
      }))
      .filter((group) => group.features.length);
  }, [groups, search]);

  const jumpToGroup = (group: VisibleGroup) => {
    setOpen(group.id);
    setOpenFeature(undefined);
    router.setParams({ feature: group.id });
    const offset = groupOffsets.current[group.id];
    if (typeof offset === "number")
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          y: Math.max(offset - 8, 0),
          animated: true,
        }),
      );
  };
  const captureOffset = (id: string) => (event: LayoutChangeEvent) => {
    groupOffsets.current[id] = event.nativeEvent.layout.y;
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <Header
          title="Zax feature guide"
          subtitle="Search → module → details"
          right={
            <ActionButton
              label="Back"
              compact
              kind="secondary"
              onPress={() => router.back()}
            />
          }
        />
        <Input
          label="Search all 139 features"
          value={search}
          onChangeText={setSearch}
          placeholder="Try alerts, source version, CE, prompt or quote"
        />
        <View style={styles.indexHeader}>
          <Text style={styles.label}>MODULE INDEX</Text>
          <Text style={styles.note}>
            {visible.length} matching module{visible.length === 1 ? "" : "s"} ·
            stable bookmarks use each module ID
          </Text>
        </View>
        <View style={styles.indexButtons}>
          {visible.map((group) => {
            const number = String(group.groupIndex + 1).padStart(2, "0");
            return (
              <Pressable
                key={`index-${group.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Open ${number}: ${group.name}`}
                onPress={() => jumpToGroup(group)}
                style={({ pressed }) => [
                  styles.indexButton,
                  open === group.id && styles.indexButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.indexNumber}>{number}</Text>
                <Text style={styles.indexText} numberOfLines={2}>
                  {group.name}
                </Text>
                <Text style={styles.indexCount}>{group.features.length}</Text>
              </Pressable>
            );
          })}
        </View>
        <Card>
          <Text style={styles.label}>STATUS LEGEND · {GUIDE_REVIEW_DATE}</Text>
          {(Object.keys(STATUS_DETAILS) as GuideStatus[]).map((status) => (
            <Text key={status} style={styles.legendLine}>
              <Text style={styles.legendName}>{status}: </Text>
              {STATUS_DETAILS[status]}
            </Text>
          ))}
          <Text style={styles.note}>
            [P] Paper scope · [Q] Qualification · [S] Scenario · [D] Data state.
            A label describes the current evidence boundary; it does not turn a
            result into a verification claim.
          </Text>
        </Card>
        {visible.map((group) => {
          const number = String(group.groupIndex + 1).padStart(2, "0");
          const expanded = !!search.trim() || open === group.id;
          const glossary = glossaryForGroup(group.id);
          return (
            <View
              key={group.id}
              nativeID={`feature-group-${group.id}`}
              onLayout={captureOffset(group.id)}
              style={styles.group}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? undefined : group.id)}
                style={styles.groupHead}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {number}. {group.name}
                  </Text>
                  <Text style={styles.note}>
                    {group.features.length} matching feature
                    {group.features.length === 1 ? "" : "s"} · module ID:{" "}
                    {group.id}
                  </Text>
                </View>
                <Text style={styles.expand}>{expanded ? "−" : "+"}</Text>
              </Pressable>
              {expanded ? (
                <>
                  <View style={styles.groupActions}>
                    <ActionButton
                      label={
                        instructionGroup === group.id
                          ? "Hide module instructions"
                          : "Module instructions"
                      }
                      compact
                      kind="ghost"
                      onPress={() =>
                        setInstructionGroup((current) =>
                          current === group.id ? undefined : group.id,
                        )
                      }
                    />
                    {glossary.length ? (
                      <ActionButton
                        label={
                          glossaryGroup === group.id
                            ? "Hide glossary"
                            : `Glossary (${glossary.length})`
                        }
                        compact
                        kind="ghost"
                        onPress={() =>
                          setGlossaryGroup((current) =>
                            current === group.id ? undefined : group.id,
                          )
                        }
                      />
                    ) : null}
                  </View>
                  {instructionGroup === group.id ? (
                    <Card style={styles.expandCard}>
                      <Text style={styles.label}>HOW TO READ THIS MODULE</Text>
                      <Text style={styles.body}>{group.guide_note}</Text>
                    </Card>
                  ) : null}
                  {glossaryGroup === group.id ? (
                    <Card style={styles.expandCard}>
                      <Text style={styles.label}>MODULE GLOSSARY</Text>
                      {glossary.map((entry) => (
                        <Text key={entry.id} style={styles.body}>
                          <Text style={styles.glossaryTerm}>
                            {entry.term}.{" "}
                          </Text>
                          {entry.definition}
                        </Text>
                      ))}
                    </Card>
                  ) : null}
                  {group.features.map((feature) => {
                    const featureNumber = `${number}.${String(
                      feature.featureIndex + 1,
                    ).padStart(2, "0")}`;
                    const featureKey = `${group.id}:${feature.featureIndex}`;
                    const showDetails = openFeature === featureKey;
                    return (
                      <Card key={featureKey}>
                        <Text style={styles.feature}>
                          {featureNumber}. {feature.name}
                        </Text>
                        <Text style={styles.body}>{feature.purpose}</Text>
                        <View style={styles.statusRow}>
                          <Text style={styles.status}>{feature.status}</Text>
                        </View>
                        <ActionButton
                          label={showDetails ? "Hide details" : "Read details"}
                          compact
                          kind="ghost"
                          onPress={() =>
                            setOpenFeature((current) =>
                              current === featureKey ? undefined : featureKey,
                            )
                          }
                        />
                        {showDetails ? (
                          <>
                            <Text style={styles.label}>WHERE / HOW</Text>
                            <Text style={styles.body}>
                              {feature.location}. {feature.how_to_use}
                            </Text>
                            <Text style={styles.label}>
                              YOU GET / NEXT STEP
                            </Text>
                            <Text style={styles.body}>{feature.output}</Text>
                            <Text style={styles.body}>
                              {feature.next_action}
                            </Text>
                            <Text style={styles.label}>STATUS / LIMITS</Text>
                            <Text style={styles.note}>
                              {STATUS_DETAILS[feature.status]}
                            </Text>
                            <Text style={styles.note}>{feature.limits}</Text>
                          </>
                        ) : null}
                      </Card>
                    );
                  })}
                </>
              ) : null}
            </View>
          );
        })}
        {!visible.length ? (
          <Card>
            <Text style={styles.body}>
              No matching feature. Try a simpler term or clear the search.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, marginHorizontal: -14 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 22, gap: 10 },
  indexHeader: { gap: 2, marginTop: 2 },
  indexButtons: { gap: 6 },
  indexButton: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  indexButtonActive: {
    borderColor: C.lime + "99",
    backgroundColor: C.lime + "12",
  },
  pressed: { opacity: 0.72 },
  indexNumber: { color: C.lime, fontSize: 11, fontWeight: "800", width: 22 },
  indexText: { color: C.text, fontSize: 11, fontWeight: "700", flex: 1 },
  indexCount: { color: C.muted, fontSize: 10, fontWeight: "800" },
  group: { gap: 8 },
  groupHead: {
    minHeight: 58,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 4,
  },
  groupActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  expandCard: { gap: 8 },
  title: { color: C.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  feature: { color: C.lime, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  body: { color: C.text, fontSize: 12, lineHeight: 19 },
  note: { color: C.muted, fontSize: 11, lineHeight: 17, flexShrink: 1 },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 2,
  },
  statusRow: { flexDirection: "row" },
  status: {
    color: C.amber,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  legendLine: { color: C.muted, fontSize: 11, lineHeight: 17 },
  legendName: { color: C.amber, fontWeight: "800" },
  glossaryTerm: { color: C.lime, fontWeight: "800" },
  expand: { color: C.lime, fontSize: 22 },
});
