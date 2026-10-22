import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme";

type DisclosureProps = {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

/** A thumb-sized, accessible reveal for supporting trading detail. */
export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? "Collapse" : "Expand"} details`}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {summary ? (
            <Text style={styles.summary} numberOfLines={open ? undefined : 2}>
              {summary}
            </Text>
          ) : null}
        </View>
        <View style={styles.icon}>
          <Text style={styles.iconText}>{open ? "−" : "+"}</Text>
        </View>
      </Pressable>
      {open ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    backgroundColor: C.surface,
    overflow: "hidden",
  },
  trigger: {
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  copy: { flex: 1, gap: 2 },
  title: { color: C.text, fontSize: 13, fontWeight: "800" },
  summary: { color: C.muted, fontSize: 10, lineHeight: 14 },
  icon: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
  },
  iconText: { color: C.lime, fontSize: 18, lineHeight: 21, fontWeight: "700" },
  content: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    padding: 11,
    gap: 9,
  },
});
