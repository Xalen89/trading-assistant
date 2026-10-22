import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useCollectionPageQuery } from "@/lib/trading/client";
import {
  collectionAlreadyImported,
  collectionRulebook,
  type CollectionEntry,
  type CollectionKey,
} from "@/lib/trading/collection-model";
import { ActionButton, Card, Input, Pill, Sheet } from "./ui";
import { C } from "./theme";
const labels = {
  all: "All sources",
  paperswithbacktest: "PWB",
  "quant-vault": "Quant Vault",
  "sgx-orderbook": "SGX methods",
};
export function StrategyCollections({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { workspace, update } = useWorkspace(),
    auth = useAuth(),
    [search, setSearch] = useState(""),
    [collection, setCollection] = useState<CollectionKey | "all">("all"),
    [offset, setOffset] = useState(0),
    [notice, setNotice] = useState<string>();
  const page = useCollectionPageQuery(
    { search, collection, offset, limit: 20 },
    visible && auth.isAuthenticated,
  );
  const add = (entry: CollectionEntry) => {
    if (collectionAlreadyImported(entry, workspace.strategies))
      return setNotice(
        "This canonical reference already exists, including archives. No duplicate or overwrite.",
      );
    if (workspace.strategies.length >= 100)
      return setNotice(
        "Working rulebook limit100 reached. All11374catalog references remain browsable without overloading your active workspace.",
      );
    const ref = collectionRulebook(entry);
    update((w) => ({ ...w, strategies: [...w.strategies, ref] }));
    setNotice(
      "Added one inactive reference-review rulebook. It is not executable/trained; full source rules, parameters, data and duplicate review are still required. Active analysis was not changed. Save your workspace explicitly.",
    );
  };
  const source = async (url: string) => {
    try {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        ![
          "github.com",
          "paperswithbacktest.com",
          "www.fmz.com",
          "fmz.com",
        ].includes(u.hostname)
      )
        throw new Error("Source URL is not in the verified public catalog.");
      await Linking.openURL(url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Source could not be opened.");
    }
  };
  return (
    <Sheet
      visible={visible}
      title="Strategy research collections"
      subtitle="All discovered sources · inactive references, not thousands of live strategies"
      onClose={onClose}
    >
      <Card>
        <Pill label="OWNER-ONLY · RULE REVIEW REQUIRED" tone="amber" />
        <Text style={styles.title}>
          One research shelf. Explicit provenance.
        </Text>
        <Text style={styles.body}>
          All public inventory records are retained. Full-rule semantic
          duplicates are not yet verified: similar names are not equivalent
          trading rules. Exact canonical identities prevent importing the same
          reference twice; different methods within one notebook remain
          separate. No source is activated or given a live success score just by
          being listed.
        </Text>
        {page.data?.summaries.map((s) => (
          <View key={s.collection}>
            <Text style={styles.title}>
              {s.label} · {s.entries.toLocaleString()} records
            </Text>
            <Text style={styles.meta}>
              {s.coverage}. {s.limitations}
            </Text>
          </View>
        ))}
      </Card>
      <Input
        label="Search names / source categories"
        value={search}
        onChangeText={(s) => {
          setSearch(s);
          setOffset(0);
        }}
        placeholder="EMA, market making, momentum, order book…"
      />
      <View style={styles.row}>
        {(Object.keys(labels) as (CollectionKey | "all")[]).map((c) => (
          <ActionButton
            key={c}
            compact
            label={labels[c]}
            kind={collection === c ? "primary" : "secondary"}
            onPress={() => {
              setCollection(c);
              setOffset(0);
            }}
          />
        ))}
      </View>
      {notice ? <Text style={styles.note}>{notice}</Text> : null}
      {page.isLoading ? (
        <Text style={styles.meta}>Loading your private collection page…</Text>
      ) : null}
      {page.error ? (
        <Card>
          <Text style={styles.note}>{page.error.message}</Text>
          <ActionButton
            compact
            kind="secondary"
            label="Retry collection query"
            onPress={() => void page.refetch()}
          />
        </Card>
      ) : null}
      {page.data ? (
        <>
          <Text style={styles.meta}>
            {page.data.total.toLocaleString()} matching references · showing
            {page.data.entries.length ? offset + 1 : 0}–
            {Math.min(offset + 20, page.data.total)}. Semantic de-duplication
            remains incomplete; no complete-source execution claim.
          </Text>
          {page.data.entries.map((e) => (
            <Card key={e.id}>
              <Text style={styles.title}>{e.name}</Text>
              <Pill
                label={`${labels[e.collection]} · ${e.ruleStatus.toUpperCase()}`}
                tone="amber"
              />
              <Text style={styles.meta}>{e.category}</Text>
              <Text style={styles.body}>
                {e.dataStatus} {e.licenseStatus}
              </Text>
              <View style={styles.row}>
                <ActionButton
                  compact
                  kind="secondary"
                  label="View source"
                  onPress={() => void source(e.url)}
                />
                <ActionButton
                  compact
                  label={
                    collectionAlreadyImported(e, workspace.strategies)
                      ? "Reference already saved"
                      : "Add inactive review reference"
                  }
                  disabled={collectionAlreadyImported(e, workspace.strategies)}
                  onPress={() => add(e)}
                />
              </View>
              {e.aliases.map((a, i) => (
                <ActionButton
                  key={`${a.url}-${i}`}
                  compact
                  kind="ghost"
                  label={`Source alias${i + 1} · ${labels[a.collection]}`}
                  onPress={() => void source(a.url)}
                />
              ))}
            </Card>
          ))}
          <View style={styles.row}>
            <ActionButton
              compact
              kind="secondary"
              label="Previous20"
              disabled={offset === 0}
              onPress={() => setOffset((v) => Math.max(0, v - 20))}
            />
            <ActionButton
              compact
              kind="secondary"
              label="Next20"
              disabled={offset + 20 >= page.data.total}
              onPress={() => setOffset((v) => v + 20)}
            />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  title: { color: C.text, fontWeight: "800", fontSize: 13 },
  body: { color: C.muted, fontSize: 11, lineHeight: 17 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 16 },
  note: { color: C.amber, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
