import { DisciplineGuardControl } from "./discipline-guard-control";
import {
  paperFormGeometryError,
  paperFormRiskReward,
  paperTargetAtR,
  parsePaperFormValues,
} from "@/lib/trading/paper-form";
import { normalizedPaperRiskPct } from "@/lib/trading/paper-risk-template";
import { useTradingMarket, usePaperOrderMutation } from "@/lib/trading/client";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Trade } from "@/lib/trading/model";
import type { PaperProposal } from "@/lib/trading/setup-model";
import { ActionButton, Card, Input, Pill, Sheet, ToggleRow } from "./ui";
import { C } from "./theme";
import { DisciplinePanel } from "./discipline-panel";

type PaperPlanSheetProps = {
  visible: boolean;
  proposal?: PaperProposal;
  market: string;
  precision: number;
  riskPct: number;
  defaultAutoManage?: boolean;
  proposalLoading?: boolean;
  proposalError?: string;
  onClose: () => void;
  onRetry?: () => void;
  onRiskPctChange: (riskPct: number) => void;
  onAutoManageChange?: (value: boolean) => void;
  onTradeCreated: (trade: Trade) => void;
};

const numberText = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : "";
const serverRiskCap = (proposal: PaperProposal | undefined) => {
  const value = (
    proposal as (PaperProposal & { effectiveRiskCapPct?: unknown }) | undefined
  )?.effectiveRiskCapPct;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
};

/** The sheet never creates a local fill. A durable trade is appended only from the backend response. */
function PaperPlanForm({
  visible,
  proposal,
  market,
  precision,
  riskPct,
  defaultAutoManage = false,
  proposalLoading,
  proposalError,
  onClose,
  onRetry,
  onRiskPctChange,
  onAutoManageChange,
  onTradeCreated,
}: PaperPlanSheetProps) {
  const selectedMarket = useTradingMarket(market);
  const order = usePaperOrderMutation();
  const [entry, setEntry] = useState(() => numberText(proposal?.entry));
  const [stop, setStop] = useState(() => numberText(proposal?.stop));
  const [target, setTarget] = useState(() => numberText(proposal?.target));
  const [quantity, setQuantity] = useState(() =>
    numberText(proposal?.quantity),
  );
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [autoManage, setAutoManage] = useState(() =>
    Boolean(defaultAutoManage),
  );
  const [entryMode, setEntryMode] = useState<"practice" | "strategy">(
    "practice",
  );
  const [advanced, setAdvanced] = useState(false);
  const [targetMode, setTargetMode] = useState<"rr" | "price">("rr");
  const [rr, setRR] = useState("2");
  const [thought, setThought] = useState("");
  const [message, setMessage] = useState<string>();

  // The parent re-requests an immutable proposal; this component never
  // resizes it. Keep the approved 0.5% reference template intact.
  useEffect(() => {
    const normalizedRiskPct = normalizedPaperRiskPct(riskPct);
    if (visible && normalizedRiskPct !== riskPct)
      onRiskPctChange(normalizedRiskPct);
  }, [onRiskPctChange, riskPct, visible]);

  const values = useMemo(
    () =>
      parsePaperFormValues({
        entry,
        stop,
        target,
        quantity,
      }),
    [entry, stop, target, quantity],
  );
  const actualRR = useMemo(
    () =>
      paperFormRiskReward({
        market: selectedMarket,
        side: proposal?.side,
        ...values,
      }),
    [proposal?.side, selectedMarket, values],
  );
  const geometryError = useMemo(
    () =>
      paperFormGeometryError({
        market: selectedMarket,
        side: proposal?.side,
        ...values,
      }),
    [proposal?.side, selectedMarket, values],
  );
  const availabilityBlocker = proposalLoading
    ? "Refreshing bracket against the current server quote. Confirmation remains disabled until that request finishes."
    : proposalError
      ? `Source history / proposal unavailable: ${proposalError}`
      : !proposal
        ? "No paper proposal is available yet. Request a Buy or Sell plan from the chart, then retry if the request did not finish."
        : undefined;
  const gates = proposal?.analysis.confluenceEvaluations || {};
  const effectiveRiskCapPct = serverRiskCap(proposal);
  const flags =
    proposal?.strategyIds.map((id) =>
      Boolean(gates[id]?.strategyEntryEligible && gates[id]?.snapshot.trigger),
    ) || [];
  const gatePassed =
    flags.length > 0 &&
    (proposal?.analysis.combination === "any"
      ? flags.some(Boolean)
      : flags.every(Boolean));
  const modeBlocker =
    entryMode === "strategy" && !gatePassed
      ? "Strategy mode requires approved, fresh, same-direction confluence gates. Configure/save a gate in Strategies and refresh the proposal; manual practice remains available."
      : undefined;
  const confirmationBlocker =
    message || availabilityBlocker || geometryError || modeBlocker;
  const recastTarget = (nextEntry: string, nextStop: string, nextRR = rr) => {
    if (targetMode !== "rr") return;
    const targetAtSelectedR = paperTargetAtR({
      market: selectedMarket,
      side: proposal?.side,
      entry: Number(nextEntry),
      stop: Number(nextStop),
      rr: Number(nextRR),
    });
    if (targetAtSelectedR !== undefined)
      setTarget(numberText(targetAtSelectedR));
  };
  const chooseRR = (nextRR: string) => {
    setRR(nextRR);
    setTargetMode("rr");
    const targetAtSelectedR = paperTargetAtR({
      market: selectedMarket,
      side: proposal?.side,
      entry: Number(entry),
      stop: Number(stop),
      rr: Number(nextRR),
    });
    if (targetAtSelectedR !== undefined)
      setTarget(numberText(targetAtSelectedR));
    setMessage(undefined);
  };
  const restoreProposalDefaults = () => {
    if (!proposal) return;
    setEntry(numberText(proposal.entry));
    setStop(numberText(proposal.stop));
    setTarget(numberText(proposal.target));
    setQuantity(numberText(proposal.quantity));
    setRR("2");
    setTargetMode("rr");
    setMessage(undefined);
  };
  const submit = async () => {
    const error = geometryError;
    if (error) return setMessage(error);
    const selectedRR = Number(rr);
    if (
      targetMode === "rr" &&
      (!Number.isFinite(selectedRR) || selectedRR <= 0)
    )
      return setMessage(
        "Choose a positive R:R value or enter a direct target price.",
      );
    if (!proposal?.id)
      return setMessage(
        "Proposal source is missing. Confirmation is disabled until the server returns an immutable proposal ID.",
      );
    try {
      setMessage(undefined);
      const trade = await order.mutateAsync({
        proposalId: proposal.id,
        ...values,
        orderType,
        entryMode,
        autoManage,
        targetMode,
        rr: targetMode === "rr" ? selectedRR : undefined,
        journal: thought.trim() ? { pretradeThoughts: thought.trim() } : {},
      });
      onTradeCreated(trade);
      onClose();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Paper order could not be saved. No fill was created locally.",
      );
    }
  };
  const canConfirm =
    Boolean(proposal?.id) &&
    !proposalLoading &&
    !order.isPending &&
    !geometryError &&
    !availabilityBlocker &&
    !modeBlocker &&
    (targetMode !== "rr" || (Number.isFinite(Number(rr)) && Number(rr) > 0));

  return (
    <Sheet
      visible={visible}
      title="Paper plan review"
      subtitle="Fresh server draft → confirm a private simulated order; no broker trade"
      onClose={onClose}
    >
      <View style={styles.head}>
        <Pill
          label={
            proposal
              ? `${proposal.side.toUpperCase()} · PAPER ONLY`
              : "AWAITING PROPOSAL"
          }
          tone={
            proposal?.side === "long"
              ? "mint"
              : proposal?.side === "short"
                ? "rose"
                : "amber"
          }
        />
        {proposal ? (
          <Text style={styles.market}>
            {market} · {proposal.strategyIds.length} strategy snapshot
            {proposal.strategyIds.length === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
      <Card>
        <Text style={styles.title}>Paper mode</Text>
        <View style={styles.choices}>
          <ActionButton
            compact
            label="Manual practice"
            kind={entryMode === "practice" ? "primary" : "secondary"}
            onPress={() => setEntryMode("practice")}
          />
          <ActionButton
            compact
            label="Gated strategy"
            kind={entryMode === "strategy" ? "primary" : "secondary"}
            onPress={() => setEntryMode("strategy")}
          />
        </View>
        <Text style={styles.detail}>
          {entryMode === "practice"
            ? "Discretionary practice with risk/quote checks; not represented as a valid strategy signal."
            : "Server independently rechecks current approved rules before saving. AI cannot bypass this gate."}
        </Text>
        {entryMode === "strategy"
          ? Object.entries(gates).map(([id, g]) => (
              <Text key={id} style={styles.detail}>
                {id}:{" "}
                {g.deterministicScore === null
                  ? "pending"
                  : `${g.deterministicScore}/100`}{" "}
                · gate {g.threshold} ·{" "}
                {g.strategyEntryEligible ? "eligible" : "blocked"}
              </Text>
            ))
          : null}
      </Card>
      <DisciplinePanel
        compact
        proposedRisk={proposal?.initialRisk}
        market={market}
        side={proposal?.side}
      />
      <Card>
        <Text style={styles.title}>Risk template</Text>
        <Text style={styles.detail}>
          Choosing a template requests a fresh immutable server proposal. 0.5%
          is a sizing recommendation, not a fixed-units limit. {"\n"}
          {effectiveRiskCapPct === undefined
            ? "Fixed units — any size; the server-provided cap will appear with the proposal."
            : `Fixed units — any size; server caps at ${effectiveRiskCapPct}% of equity.`}
        </Text>
        <View style={styles.choices}>
          {(
            [
              [0.5, "0.5% risk"],
              [1, "1% risk"],
              [2, "2% risk"],
              [0, "Fixed units"],
            ] as const
          ).map(([value, label]) => (
            <ActionButton
              key={value}
              compact
              label={label}
              kind={riskPct === value ? "primary" : "secondary"}
              disabled={proposalLoading}
              onPress={() => onRiskPctChange(value)}
            />
          ))}
        </View>
        {proposalLoading ? (
          <Text style={styles.note}>
            Refreshing bracket against the current server quote…
          </Text>
        ) : null}
      </Card>
      {proposalError ? (
        <Card>
          <Text style={styles.note}>
            Source history / proposal unavailable: {proposalError}
          </Text>
          <Text style={styles.detail}>
            No local fallback or synthetic plan was created. Review source
            availability and try again.
          </Text>
        </Card>
      ) : null}
      {!proposal && !proposalLoading && !proposalError ? (
        <Card>
          <Text style={styles.detail}>
            Request a Buy or Sell plan from the chart. The backend uses a fresh
            selected-market quote and eligible setup evidence.
          </Text>
        </Card>
      ) : null}
      {confirmationBlocker ? (
        <Card>
          <Text style={styles.title}>Confirmation status</Text>
          <Text style={styles.note}>{confirmationBlocker}</Text>
          {onRetry && !proposalLoading && !proposal ? (
            <ActionButton
              compact
              label="Retry paper proposal"
              kind="secondary"
              onPress={onRetry}
            />
          ) : null}
        </Card>
      ) : null}
      {proposal ? (
        <>
          <Card>
            <Text style={styles.title}>Ticket</Text>
            <Input
              label={`Entry (${market})`}
              value={entry}
              onChangeText={(value) => {
                setEntry(value);
                recastTarget(value, stop);
                setMessage(undefined);
              }}
              keyboardType="numeric"
            />
            <Input
              label="Stop / invalidation"
              value={stop}
              onChangeText={(value) => {
                setStop(value);
                recastTarget(entry, value);
                setMessage(undefined);
              }}
              keyboardType="numeric"
            />
            <Text style={styles.label}>
              TARGET / R:R {actualRR ? `${actualRR.toFixed(2)}R` : "—"}
            </Text>
            <View style={styles.choices}>
              {["1", "2", "3"].map((value) => (
                <ActionButton
                  key={value}
                  compact
                  label={`${value}R`}
                  kind={
                    targetMode === "rr" && rr === value
                      ? "primary"
                      : "secondary"
                  }
                  onPress={() => chooseRR(value)}
                />
              ))}
            </View>
            <Input
              label="Custom R:R (positive)"
              value={rr}
              onChangeText={chooseRR}
              keyboardType="numeric"
            />
            <Input
              label={`Target price (${market})`}
              value={target}
              onChangeText={(value) => {
                setTarget(value);
                setTargetMode("price");
                setMessage(undefined);
              }}
              keyboardType="numeric"
            />
            <Text style={styles.provenance}>
              {targetMode === "rr"
                ? "Explicit RR target follows a fresh market entry using server valuation math."
                : "Edited absolute target is preserved; it is never silently rewritten on a fresh quote."}
            </Text>
            <Input
              label="Paper quantity / units"
              value={quantity}
              onChangeText={(value) => {
                setQuantity(value);
                setMessage(undefined);
              }}
              keyboardType="numeric"
            />
            <Text style={styles.provenance}>
              Proposal {proposal.id || "not issued"}. Entry, geometry, sizing,
              freshness, ownership, daily cap, and idempotency are rechecked by
              the paper backend.
            </Text>
            <ActionButton
              compact
              label="Restore server bracket & selected risk"
              kind="secondary"
              disabled={proposalLoading || order.isPending}
              onPress={restoreProposalDefaults}
            />
            <Text style={styles.provenance}>
              Restore the immutable proposal. An unchanged percentage template
              is resized only by the server against a fresh side quote.
            </Text>
          </Card>
          <Card>
            <Text style={styles.title}>Your optional pre-trade thoughts</Text>
            <Input
              label="Optional notes"
              value={thought}
              onChangeText={setThought}
              multiline
            />
          </Card>
          <Card>
            <ActionButton
              compact
              label={advanced ? "Hide advanced" : "Advanced"}
              kind="secondary"
              onPress={() => setAdvanced((current) => !current)}
            />
            {advanced ? (
              <View style={styles.advanced}>
                <DisciplineGuardControl />
                <View style={styles.choices}>
                  {(["market", "limit"] as const).map((value) => (
                    <ActionButton
                      key={value}
                      compact
                      label={
                        value === "market" ? "Market-style" : "Limit pending"
                      }
                      kind={orderType === value ? "primary" : "secondary"}
                      onPress={() => setOrderType(value)}
                    />
                  ))}
                </View>
                <ToggleRow
                  label="Paper bracket management"
                  detail="Foreground only until a verified server processing heartbeat is available. Optional paper-only stop/target, partial and break-even handling. Pending limit entry observation is separate; no broker order is sent."
                  value={autoManage}
                  onChange={(value) => {
                    setAutoManage(value);
                    onAutoManageChange?.(value);
                  }}
                />
              </View>
            ) : null}
          </Card>
          {!proposal.id ? (
            <Text style={styles.note}>
              Proposal source ID missing — confirmation cannot be enabled.
            </Text>
          ) : null}
          <ActionButton
            label={
              order.isPending
                ? "Saving paper order…"
                : `Confirm ${proposal.side.toUpperCase()} paper order`
            }
            disabled={!canConfirm}
            onPress={() => void submit()}
          />
          <Text style={styles.provenance}>
            Confirmation creates only a simulated owner-scoped paper trade. No
            broker order or position modification is made; read-only source
            checks and paper records are used.
          </Text>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  market: { color: C.muted, fontSize: 10, textAlign: "right", flex: 1 },
  title: { color: C.text, fontSize: 14, fontWeight: "900" },
  detail: { color: C.text, fontSize: 11, lineHeight: 16 },
  note: { color: C.amber, fontSize: 11, lineHeight: 16 },
  provenance: { color: C.muted, fontSize: 10, lineHeight: 15 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  label: { color: C.muted, fontSize: 8, letterSpacing: 0.6, fontWeight: "800" },
  advanced: { gap: 10, marginTop: 10 },
});

export function PaperPlanSheet(props: PaperPlanSheetProps) {
  return (
    <PaperPlanForm key={props.proposal?.id || "awaiting-source"} {...props} />
  );
}
