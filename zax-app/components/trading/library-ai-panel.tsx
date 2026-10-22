import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  blueprintToReviewedStyle,
  type LibraryBlueprint,
} from "@/lib/trading/library-blueprint-types";
import type { Pattern, Strategy } from "@/lib/trading/model";
import { ActionButton, Card, Pill, SectionLabel } from "./ui";
import { Disclosure } from "./disclosure";
import { C } from "./theme";

export function LibraryAiPanel({
  source,
  onAccept,
  renderSourcePreview,
  coachImageAttachment,
}: {
  source: Pattern;
  onAccept: (strategy: Strategy) => void;
  /** Parent mounts SourcePreview after it has registered the sourcePreview router. */
  renderSourcePreview?: (source: Pattern, evidence?: string) => ReactNode;
  /** Set attached only when the parent-owned coach request included its bounded thumbnail. */
  coachImageAttachment?: { attached: boolean; label?: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const result: LibraryBlueprint | undefined = source.blueprint;
  const current =
    result?.sourceId === source.id && result.sourceVersion === source.version
      ? result
      : undefined;
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: C.text, fontSize: 14, fontWeight: "800" }}>
          Library AI
        </Text>
        <Pill label="REVIEW FIRST" tone="amber" />
      </View>
      <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
        The durable source-analysis panel queues unapproved blueprint work. This
        card shows only its persisted result after the job has completed.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        <ActionButton
          compact
          kind="secondary"
          label="Ask AI about this source"
          onPress={() =>
            router.navigate({
              pathname: "/coach",
              params: {
                sourceId: source.id,
                scope: "library",
                question:
                  "Explain this source’s strategy, trigger, confluences, risk and what is missing before I can use it.",
              },
            })
          }
        />
      </View>
      {!source.filename ? (
        <Text style={{ color: C.muted, fontSize: 11 }}>
          Manual definitions can be discussed; original-file reanalysis requires
          an uploaded source.
        </Text>
      ) : null}
      {renderSourcePreview && source.filename
        ? renderSourcePreview(source, current?.trigger.sourceExcerpt)
        : null}
      {source.mime?.startsWith("image/") ? (
        <Text
          style={{
            color: coachImageAttachment?.attached ? C.lime : C.muted,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {coachImageAttachment?.attached
            ? coachImageAttachment.label ||
              "Bounded original image attached to this coach request."
            : "A bounded 768px / 200KB image attachment is ready for a coach request when visual context is enabled."}
        </Text>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: C.rose, fontSize: 12, lineHeight: 18 }}
        >
          {error}
        </Text>
      ) : null}
      {current ? (
        <>
          <Text style={{ color: C.text, fontSize: 13, lineHeight: 19 }}>
            {current.summary}
          </Text>
          <Text style={{ color: C.muted, fontSize: 11 }}>
            Original source v{current.sourceVersion} · unapproved analysis ·{" "}
            {new Date(current.createdAt).toLocaleString()}
          </Text>
          <Disclosure
            title="Trigger & confluence blueprint"
            summary={`${current.conditions.length} extracted conditions`}
          >
            <SectionLabel>Trigger</SectionLabel>
            <Text style={{ color: C.text, fontSize: 12, lineHeight: 18 }}>
              {current.trigger.text}
            </Text>
            <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
              Evidence: {current.trigger.sourceExcerpt}
            </Text>
            {current.conditions.map((condition) => (
              <Card key={condition.id}>
                <Text
                  style={{ color: C.text, fontWeight: "700", fontSize: 12 }}
                >
                  {condition.name}
                </Text>
                <Text style={{ color: C.text, fontSize: 12, lineHeight: 18 }}>
                  {condition.predicate}
                </Text>
                <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
                  Source: {condition.dataSource} · {condition.automation} ·{" "}
                  {condition.weight.value === null
                    ? "Weight not stated"
                    : `${condition.weight.value} (${condition.weight.provenance})`}
                </Text>
                <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
                  {condition.sourceExcerpt}
                </Text>
              </Card>
            ))}
            <Text style={{ color: C.text, fontSize: 12, lineHeight: 18 }}>
              Entry: {current.entry}
              {"\n"}Invalidation: {current.invalidation}
              {"\n"}Targets: {current.targets}
              {"\n"}Risk: {current.risk}
            </Text>
            <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
              Indicators:{" "}
              {current.indicators
                .map(
                  (i) =>
                    `${i.name}: ${i.parameters.join(", ") || "not stated"}`,
                )
                .join("; ") || "Not stated"}
            </Text>
          </Disclosure>
          <Disclosure
            title="Missing inputs & ambiguities"
            summary={`${current.requiredData.length} data requirements`}
          >
            <Text style={{ color: C.amber, fontSize: 12, lineHeight: 18 }}>
              {[...current.requiredData, ...current.ambiguities].join("\n") ||
                "No additional ambiguity reported; owner review is still required."}
            </Text>
          </Disclosure>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
            Saving creates an inactive review style. It does not activate
            vague/manual conditions, execute uploaded code, validate edge or
            place an order. Configure supported rules and approve a gate before
            strategy-mode paper use.
          </Text>
          <ActionButton
            compact
            label="Accept as review style"
            onPress={() => {
              try {
                const proposal = blueprintToReviewedStyle(
                  current,
                  `${source.name} review`.slice(0, 150),
                );
                onAccept(proposal.strategy);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Blueprint could not be saved.",
                );
              }
            }}
          />
        </>
      ) : result ? (
        <Text style={{ color: C.amber, fontSize: 11 }}>
          Source version changed; reanalyze the current original before
          accepting this blueprint.
        </Text>
      ) : null}
    </Card>
  );
}
