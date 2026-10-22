import { OwnedSourcePreview } from "@/components/trading/owned-source-preview";
import { TradeScreenshotPanel } from "./trade-screenshot-panel";
import { useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/use-workspace";
import type { Trade } from "@/lib/trading/model";
import type { PaperProposal } from "@/lib/trading/setup-model";
import { tradeMetrics } from "@/lib/trading/engine";
import { mergeCanonicalPaperTrade } from "@/lib/trading/trade-chart";
import {
  usePaperCloseMutation,
  usePaperDetailQuery,
  usePaperEditMutation,
  usePaperHistoryQuery,
} from "@/lib/trading/client";
import {
  ActionButton,
  Card,
  Input,
  Pill,
  SectionLabel,
  Sheet,
  ToggleRow,
} from "./ui";
import { C, formatPrice } from "./theme";
export function StoredPaperHistory() {
  const [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<Trade>(),
    [message, setMessage] = useState<string>();
  const { update } = useWorkspace(),
    utils = trpc.useUtils(),
    cancel = trpc.paper.cancel.useMutation(),
    history = usePaperHistoryQuery(undefined, cursor);
  const cancelPending = (trade: Trade) => {
    const text = `Cancel the pending ${trade.market} paper plan? A fresh source quote will be required before its terminal cancellation is saved. It will never create a paper fill or broker action.`;
    const apply = async () => {
      try {
        const next = await cancel.mutateAsync({
          id: trade.id,
          version: trade.version || 1,
        });
        update((w) => ({
          ...w,
          trades: w.trades.map((item) =>
            item.id === next.id ? mergeCanonicalPaperTrade(item, next) : item,
          ),
        }));
        setSelected((current) => (current?.id === next.id ? next : current));
        void utils.paper.invalidate();
        setMessage(
          "Pending paper plan cancelled. No fill or broker action was created.",
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Paper cancellation failed.",
        );
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(text)) void apply();
    } else
      Alert.alert("Cancel pending paper plan", text, [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: () => void apply(),
        },
      ]);
  };
  return (
    <Card>
      <SectionLabel>Full retained paper history</SectionLabel>
      <Text style={{ color: C.muted, fontSize: 12 }}>
        Paginated durable logs and immutable event snapshots; this is not broker
        account history.
      </Text>
      {history.data?.trades.map((t) => (
        <View key={t.id} style={{ gap: 6 }}>
          <ActionButton
            label={`${t.market} ${t.side} · ${t.status} · ${new Date(t.createdAt).toLocaleDateString()}`}
            compact
            kind="ghost"
            onPress={() => setSelected(t)}
          />
          {t.status === "pending" ? (
            <ActionButton
              label="Cancel pending paper plan"
              compact
              kind="danger"
              disabled={cancel.isPending}
              onPress={() => cancelPending(t)}
            />
          ) : null}
        </View>
      ))}
      {message ? <Text style={{ color: C.amber }}>{message}</Text> : null}
      {history.error ? (
        <Text style={{ color: C.rose }}>{history.error.message}</Text>
      ) : null}
      {!history.data?.trades.length ? (
        <Text style={{ color: C.muted }}>
          No durable paper entries yet. Chart-created orders save immediately;
          manual local logs archive on explicit cloud save.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {cursor ? (
          <ActionButton
            label="Latest"
            compact
            kind="secondary"
            onPress={() => setCursor(undefined)}
          />
        ) : null}
        {history.data?.nextCursor ? (
          <ActionButton
            label="Earlier trades"
            compact
            kind="secondary"
            onPress={() => setCursor(history.data!.nextCursor)}
          />
        ) : null}
      </View>
      {selected ? (
        <ManagedPaperDetail
          key={selected.id}
          trade={selected}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </Card>
  );
}
export function ManagedPaperDetail({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose: () => void;
}) {
  const { update } = useWorkspace(),
    details = usePaperDetailQuery(trade.id),
    edit = usePaperEditMutation(),
    close = usePaperCloseMutation(),
    cancel = trpc.paper.cancel.useMutation(),
    utils = trpc.useUtils();
  const processing = trpc.paper.processing.useQuery({tradeId:trade.id},{retry:false,refetchInterval:60000});
  const current = details.data?.trade
      ? mergeCanonicalPaperTrade(trade, details.data.trade)
      : trade,
    proposal = details.data?.proposal as PaperProposal | undefined;
  const [stop, setStop] = useState(() => String(trade.stop)),
    [target, setTarget] = useState(() => String(trade.target)),
    [auto, setAuto] = useState(() => Boolean(trade.autoManage)),
    [review, setReview] = useState(() => trade.review || ""),
    [message, setMessage] = useState<string>();
  const [dirty, setDirty] = useState({
      stop: false,
      target: false,
      auto: false,
      review: false,
    }),
    [baseVersion, setBaseVersion] = useState(trade.version || 1);
  const mark = (field: keyof typeof dirty) => {
    if (!Object.values(dirty).some(Boolean))
      setBaseVersion(current.version || 1);
    setDirty((d) => ({ ...d, [field]: true }));
  };
  const sync = (next: Trade) => {
    update((w) => ({
      ...w,
      trades: w.trades.some((t) => t.id === next.id)
        ? w.trades.map((t) =>
            t.id === next.id ? mergeCanonicalPaperTrade(t, next) : t,
          )
        : [next, ...w.trades],
    }));
    void utils.paper.invalidate();
  };
  const save = async () => {
    try {
      const next = await edit.mutateAsync({
        id: current.id,
        version: Object.values(dirty).some(Boolean)
          ? baseVersion
          : current.version || 1,
        stop: dirty.stop ? Number(stop) : current.stop,
        target: dirty.target ? Number(target) : current.target,
        autoManage: dirty.auto ? auto : Boolean(current.autoManage),
        review: dirty.review ? review : current.review,
      });
      sync(next);
      setDirty({ stop: false, target: false, auto: false, review: false });
      setBaseVersion(next.version || 1);
      setMessage(
        "Saved as a new immutable paper revision; original risk and user journal are unchanged.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Paper update failed.");
    }
  };
  const exit = async () => {
    try {
      sync(
        await close.mutateAsync({
          id: current.id,
          version: current.version || 1,
        }),
      );
      setMessage(
        "Paper position exited using its actual source quote. Broker positions were not changed.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Paper exit failed.");
    }
  };
  const cancelPending = () => {
    const text = `Cancel the pending ${current.market} paper plan? A fresh source quote will be required before its terminal cancellation is saved. It will never create a paper fill or broker action.`;
    const apply = async () => {
      try {
        sync(
          await cancel.mutateAsync({
            id: current.id,
            version: current.version || 1,
          }),
        );
        setDirty({ stop: false, target: false, auto: false, review: false });
        setMessage(
          "Pending paper plan cancelled. No fill or broker action was created.",
        );
      } catch (e) {
        setMessage(
          e instanceof Error ? e.message : "Paper cancellation failed.",
        );
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(text)) void apply();
    } else
      Alert.alert("Cancel pending paper plan", text, [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: () => void apply(),
        },
      ]);
  };
  const isCancelled = current.status === "cancelled",
    isTerminal = current.status === "closed" || isCancelled;
  const metrics = tradeMetrics(current);
  return (
    <Sheet visible title="Retained paper trade & deep dive" onClose={onClose}>
      <Pill
        label={`${current.status.toUpperCase()} · PAPER v${current.version || 1}`}
        tone="amber"
      />
      {!isTerminal ? <Pill label="FOREGROUND ONLY" tone="amber" /> : null}
      <Text style={{ color: C.text, fontWeight: "800", fontSize: 17 }}>
        {current.market} {current.side.toUpperCase()}
      </Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>
        Entry {formatPrice(current.entry)} · original SL{" "}
        {formatPrice(current.originalStop ?? current.stop)} · original risk $
        {Number(current.initialRisk ?? metrics.risk).toFixed(2)} · remaining{" "}
        {current.quantity} / {current.initialQuantity ?? current.quantity} units
      </Text>
      <TradeScreenshotPanel
        renderSourcePreview={(source,evidence) => <OwnedSourcePreview sourceId={source.id} evidence={evidence} />}
        tradeId={current.id}
        initialStage={
          current.status === "closed"
            ? "after"
            : current.status === "open"
              ? "during"
              : "before"
        }
        compact
      />
      {isCancelled ? (
        <Text style={{ color: C.muted, fontSize: 12 }}>
          Cancelled before a paper fill. This terminal plan contributes no P/L,
          drawdown, or open risk.
        </Text>
      ) : current.status === "closed" ? (
        <Text style={{ color: (metrics.pnl || 0) >= 0 ? C.mint : C.rose }}>
          Recorded net paper P/L ${metrics.pnl?.toFixed(2)} ·{" "}
          {metrics.r?.toFixed(2)} original R
        </Text>
      ) : (
        <>
          <Input
            label="Working stop (editable)"
            value={dirty.stop ? stop : String(current.stop)}
            onChangeText={(v) => {
              mark("stop");
              setStop(v);
            }}
            keyboardType="numeric"
          />
          <Input
            label="Working target (editable)"
            value={dirty.target ? target : String(current.target)}
            onChangeText={(v) => {
              mark("target");
              setTarget(v);
            }}
            keyboardType="numeric"
          />
          <Pill
            label={
              current.autoManage && processing.data?.serverChecked
                ? "Server checked"
                : "Foreground only"
            }
            tone={
              current.autoManage && processing.data?.serverChecked
                ? "mint"
                : "amber"
            }
          />
          {processing.data?.lastCompletedAt ? (
            <Text style={{ color: C.muted, fontSize: 11 }}>
              Last scheduled check: {new Date(processing.data.lastCompletedAt).toLocaleString()}
            </Text>
          ) : null}
          <ToggleRow
            label="Opt-in paper bracket management"
            detail={processing.data?.message || "Foreground only — checking deployed processing evidence. No broker orders."}
            value={dirty.auto ? auto : Boolean(current.autoManage)}
            onChange={(v) => {
              mark("auto");
              setAuto(v);
            }}
          />
          <ActionButton
            label="Close paper at source quote"
            kind="danger"
            disabled={current.status !== "open" || close.isPending}
            onPress={exit}
          />
          {current.status === "pending" ? (
            <ActionButton
              label={
                cancel.isPending
                  ? "Cancelling pending plan…"
                  : "Cancel pending paper plan"
              }
              kind="danger"
              disabled={cancel.isPending}
              onPress={cancelPending}
            />
          ) : null}
        </>
      )}
      <SectionLabel>Your original pre-trade journal</SectionLabel>
      {Object.entries(current.journal).map(([key, value]) => (
        <View key={key}>
          <Text style={{ color: C.muted, fontSize: 10 }}>{key}</Text>
          <Text style={{ color: C.text, fontSize: 12, lineHeight: 18 }}>
            {value || "Not recorded"}
          </Text>
        </View>
      ))}
      {proposal ? (
        <>
          <SectionLabel>
            Generated inspection guide · not your thoughts
          </SectionLabel>
          <Text style={{ color: C.muted, fontSize: 12 }}>
            {proposal.checklist.purpose}
          </Text>
          {Object.entries(proposal.checklist)
            .filter(([key]) => key !== "purpose")
            .map(([key, value]) => (
              <Text
                key={key}
                style={{ color: C.text, fontSize: 12, lineHeight: 19 }}
              >
                {key}: {value}
              </Text>
            ))}
          <Text style={{ color: C.muted, fontSize: 11 }}>
            Source models:{" "}
            {proposal.strategyIds
              .map((id, i) => `${id} v${proposal.strategyVersions[i]}`)
              .join(" · ")}
            . {proposal.analysis?.estimate.label}
          </Text>
        </>
      ) : null}
      <Input
        label="Post-trade review"
        value={dirty.review ? review : current.review || ""}
        onChangeText={(v) => {
          mark("review");
          setReview(v);
        }}
        multiline
      />
      <ActionButton
        label={
          edit.isPending ? "Saving revision…" : "Save bracket / review revision"
        }
        disabled={
          edit.isPending || !details.data || (isTerminal && !dirty.review)
        }
        onPress={save}
      />
      {message ? (
        <Text style={{ color: C.amber, fontSize: 12 }}>{message}</Text>
      ) : null}
      <SectionLabel>Recorded events</SectionLabel>
      {current.events?.map((e) => (
        <Text
          key={e.id}
          style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}
        >
          {new Date(e.at).toLocaleString()} · {e.kind}
          {e.price ? ` @ ${formatPrice(e.price)}` : ""} · {e.note}
        </Text>
      ))}
      <SectionLabel>Version trail</SectionLabel>
      <Text style={{ color: C.muted, fontSize: 11 }}>
        {details.data?.revisions
          .map(
            (r) =>
              `v${r.version}: ${r.status}, working SL ${formatPrice(r.stop)}, TP ${formatPrice(r.target)}`,
          )
          .join("\n") || "Loading retained revisions…"}
      </Text>
      {details.error ? (
        <Text style={{ color: C.rose }}>{details.error.message}</Text>
      ) : null}
    </Sheet>
  );
}
