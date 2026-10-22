import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AiCoach } from "@/components/trading/ai-coach";
import { OwnerGate } from "@/components/trading/owner-gate";
import { C } from "@/components/trading/theme";
import { Header } from "@/components/trading/ui";

export default function CoachScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    initialQuestion?: string;
    question?: string;
    prompt?: string;
    sourceId?: string;
    scope?: string;
  }>();
  const scope =
    firstRouteValue(params.scope) === "library" ? "library" : "general";
  const sourceId =
    scope === "library"
      ? cleanSourceId(firstRouteValue(params.sourceId))
      : undefined;
  const initialQuestion =
    firstRouteValue(params.initialQuestion) ||
    firstRouteValue(params.question) ||
    firstRouteValue(params.prompt);
  return (
    <OwnerGate>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.back,
              { opacity: pressed ? 0.68 : 1 },
            ]}
          >
            <Ionicons color={C.text} name="chevron-back" size={20} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <Header
              title="Zax Coach"
              subtitle="Private learning conversation"
            />
          </View>
        </View>
        <AiCoach
          initialQuestion={initialQuestion}
          scope={scope}
          sourceId={sourceId}
        />
      </SafeAreaView>
    </OwnerGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  back: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 5,
  },
  backText: { color: C.text, fontSize: 12, fontWeight: "800" },
  titleWrap: { flex: 1 },
});

function firstRouteValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function cleanSourceId(value?: string) {
  const sourceId = value?.trim();
  return sourceId && sourceId.length <= 100 ? sourceId : undefined;
}
