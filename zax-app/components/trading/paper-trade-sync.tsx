import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/use-workspace";
import { mergeCanonicalPaperTrade } from "@/lib/trading/trade-chart";
export function PaperTradeSync() {
  const { workspace, update } = useWorkspace();
  const working = trpc.paper.working.useQuery(undefined, {
    refetchInterval: 15000,
    retry: false,
  });
  const manage = trpc.paper.manage.useMutation();
  const managed = workspace.trades.some(
    (t) => Boolean(t.orderType) && (t.status === "open" || t.status === "pending"),
  );
  const actions = useRef({
    pending: manage.isPending,
    mutate: manage.mutate,
    refetch: working.refetch,
  });
  useEffect(() => {
    actions.current = {
      pending: manage.isPending,
      mutate: manage.mutate,
      refetch: working.refetch,
    };
  }, [manage.isPending, manage.mutate, working.refetch]);
  useEffect(() => {
    if (!managed) return;
    const timer = setInterval(() => {
      const a = actions.current;
      if (!a.pending)
        a.mutate(undefined, { onSuccess: () => void a.refetch() });
    }, 30000);
    return () => clearInterval(timer);
  }, [managed]);
  useEffect(() => {
    const incoming = working.data;
    if (!incoming?.length) return;
    const changed = incoming.some(
      (t) =>
        t.orderType &&
        (!workspace.trades.some((old) => old.id === t.id) ||
          workspace.trades.find((old) => old.id === t.id)?.version !==
            t.version),
    );
    if (!changed) return;
    update((w) => {
      const byId = new Map(w.trades.map((t) => [t.id, t]));
      // Only server-created current paper records may update lifecycle state.
      // Preserve workspace journals and strategy snapshots during that refresh.
      incoming
        .filter((t) => t.orderType)
        .forEach((t) =>
          byId.set(t.id, mergeCanonicalPaperTrade(byId.get(t.id), t)),
        );
      return {
        ...w,
        trades: [...byId.values()]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 2000),
      };
    });
  }, [working.data, workspace.trades, update]);
  return null;
}
