import type { ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, maxContent } from "./theme";

export function Screen({
  children,
  scroll = true,
  pinned,
}: {
  children: ReactNode;
  scroll?: boolean;
  pinned?: ReactNode;
}) {
  const content = <View style={[styles.content, maxContent]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {pinned ? (
        <View
          style={[maxContent, { paddingHorizontal: 14, paddingVertical: 7 }]}
        >
          {pinned}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}
export function Pill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "lime" | "mint" | "rose" | "amber" | "muted";
}) {
  const color =
    tone === "lime"
      ? C.lime
      : tone === "mint"
        ? C.mint
        : tone === "rose"
          ? C.rose
          : tone === "amber"
            ? C.amber
            : C.muted;
  return (
    <View
      style={[
        styles.pill,
        { borderColor: color + "55", backgroundColor: color + "13" },
      ]}
    >
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}
export function ActionButton({
  label,
  onPress,
  kind = "primary",
  icon,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  compact?: boolean;
}) {
  const palette =
    kind === "primary"
      ? { bg: C.lime, text: C.black, border: C.lime }
      : kind === "danger"
        ? { bg: C.rose + "17", text: C.rose, border: C.rose + "88" }
        : kind === "ghost"
          ? { bg: "transparent", text: C.muted, border: C.border }
          : { bg: C.surface2, text: C.text, border: C.border };
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={compact ? 14 : 16} color={palette.text} />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          compact && styles.buttonTextCompact,
          { color: palette.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Ionicons name={icon} color={C.text} size={19} />
    </Pressable>
  );
}
export function Input({
  value,
  onChangeText,
  label,
  placeholder,
  keyboardType = "default",
  multiline = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}
export function ToggleRow({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggleRow,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.empty}>
      <Ionicons name="pulse-outline" size={22} color={C.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action}
    </Card>
  );
}
export function Sheet({
  visible,
  title,
  subtitle = "Paper workspace · changes stay local until saved",
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Text style={styles.sheetCaption}>{subtitle}</Text>
            </View>
            <IconButton icon="close" label="Close sheet" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScroll}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 22 },
  content: { flexGrow: 1, paddingHorizontal: 14, gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  title: {
    color: C.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    padding: 11,
    borderRadius: 4,
    gap: 8,
  },
  section: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.05,
    textTransform: "uppercase",
    marginTop: 4,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  button: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  buttonCompact: { minHeight: 34, paddingHorizontal: 9, borderRadius: 3 },
  buttonText: { fontSize: 12, fontWeight: "800" },
  buttonTextCompact: { fontSize: 10 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: { gap: 4 },
  inputLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  input: {
    color: C.text,
    backgroundColor: C.black + "66",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 13,
  },
  multiline: { height: 88, paddingTop: 10, textAlignVertical: "top" },
  toggleRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 5,
  },
  rowTitle: { color: C.text, fontSize: 13, fontWeight: "700" },
  rowDetail: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  switch: {
    width: 38,
    height: 23,
    padding: 3,
    borderRadius: 99,
    backgroundColor: C.border,
    justifyContent: "center",
  },
  switchOn: { backgroundColor: C.lime },
  knob: { width: 17, height: 17, backgroundColor: C.text, borderRadius: 20 },
  knobOn: { transform: [{ translateX: 15 }], backgroundColor: C.black },
  empty: { alignItems: "center", paddingVertical: 22 },
  emptyTitle: { color: C.text, fontWeight: "800", fontSize: 14 },
  emptyDetail: {
    color: C.muted,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 17,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "#00000099",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    maxHeight: "88%",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderColor: C.border,
    borderTopWidth: 1,
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  sheetCaption: { color: C.muted, fontSize: 10, marginTop: 3 },
  sheetScroll: {
    padding: 14,
    gap: 10,
    paddingBottom: Platform.OS === "web" ? 32 : 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: 2,
  },
});
