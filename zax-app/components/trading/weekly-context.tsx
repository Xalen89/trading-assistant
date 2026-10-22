import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import { sessionContext } from "@/lib/trading/engine";
import { dailyContextUnavailableMessage } from "@/lib/trading/weekly-context-copy";
import {
  clockTimezonesOrDefault,
  fixedOffsetHours,
  fixedOffsetTimeZone,
  getTimeZoneClocks,
  getTimeZoneClock,
  isClockTimezoneConfiguration,
} from "@/lib/trading/time-zone-clocks";
import type { SetupAnalysis } from "@/lib/trading/setup-model";
import { Disclosure } from "./disclosure";
import { ActionButton } from "./ui";
import { C, formatPrice, mono } from "./theme";

type WeeklyContextProps = {
  analysis?: SetupAnalysis;
  timezone: string;
  precision: number;
};

type TimezoneDraftState = { sourceKey: string; values: string[] };

const STRATEGY_TIME_PRESETS = [
  { timezone: "America/New_York", label: "New York (DST)" },
  { timezone: "UTC", label: "UTC" },
  { timezone: "Etc/GMT+5", label: "Fixed UTC−5" },
  { timezone: "Etc/GMT+4", label: "Fixed UTC−4" },
] as const;

function strategyTimezoneLabel(value: string) {
  if (value === "America/New_York") return "New York (DST-aware)";
  const offset = fixedOffsetHours(value);
  if (offset === 0) return "UTC";
  if (offset !== undefined)
    return `Fixed UTC${offset < 0 ? "−" : "+"}${Math.abs(offset)}`;
  return value;
}

function fixedOffsetDraftValue(timezone: string) {
  const offset = fixedOffsetHours(timezone);
  return offset === undefined ? "" : String(offset);
}

export function WeeklyContext({
  analysis,
  timezone,
  precision,
}: WeeklyContextProps) {
  const { workspace, update } = useWorkspace();
  const [now, setNow] = useState(Date.now);
  const configuredTimezones = useMemo(
    () => clockTimezonesOrDefault(workspace.settings.clockTimezones),
    [workspace.settings.clockTimezones],
  );
  const configuredTimezoneKey = configuredTimezones.join("|");
  const [timezoneDraftState, setTimezoneDraftState] =
    useState<TimezoneDraftState>(() => ({
      sourceKey: configuredTimezoneKey,
      values: configuredTimezones,
    }));
  const [clockNotice, setClockNotice] = useState<string>();
  const [strategyNotice, setStrategyNotice] = useState<string>();
  const [fixedOffsetDraftState, setFixedOffsetDraftState] = useState(() => ({
    timezone,
    value: fixedOffsetDraftValue(timezone),
  }));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const timezoneDrafts =
    timezoneDraftState.sourceKey === configuredTimezoneKey
      ? timezoneDraftState.values
      : configuredTimezones;
  const fixedOffsetDraft =
    fixedOffsetDraftState.timezone === timezone
      ? fixedOffsetDraftState.value
      : fixedOffsetDraftValue(timezone);
  const profile = analysis?.profile;
  const bias = profile?.bias ?? "Unknown";
  const tone =
    bias === "Bullish"
      ? C.mint
      : bias === "Bearish"
        ? C.rose
        : bias === "Neutral"
          ? C.blue
          : C.muted;
  const session = sessionContext(new Date(now), timezone);
  const clocks = useMemo(
    () => getTimeZoneClocks(configuredTimezones, new Date(now)),
    [configuredTimezones, now],
  );
  const strategyClock = useMemo(
    () => getTimeZoneClock(timezone, new Date(now)),
    [now, timezone],
  );
  const deviceTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "device timezone unavailable";
  const daily = analysis?.previousDay;
  const dailyUnavailableMessage = dailyContextUnavailableMessage(profile);
  const london = session.session.startsWith("London");
  const ny = session.session === "New York AM";

  const applyClockTimezones = () => {
    const candidate = timezoneDrafts.map((value) => value.trim());
    if (!isClockTimezoneConfiguration(candidate)) {
      setClockNotice(
        "Enter exactly three supported IANA timezone names, for example Europe/London or America/New_York.",
      );
      return;
    }
    update((current) => ({
      ...current,
      settings: { ...current.settings, clockTimezones: candidate },
    }));
    setClockNotice(
      "Display clocks updated in this workspace. They do not change the strategy clock or session rules.",
    );
  };

  const setStrategyTimezone = (nextTimezone: string) => {
    update((current) => ({
      ...current,
      settings: {
        ...current.settings,
        timezone: nextTimezone as typeof current.settings.timezone,
      },
    }));
    setStrategyNotice(
      `Strategy time set to ${strategyTimezoneLabel(nextTimezone)}. Source bar timestamps are unchanged.`,
    );
  };

  const applyFixedOffset = () => {
    const offsetHours = Number(fixedOffsetDraft);
    const nextTimezone = fixedOffsetTimeZone(offsetHours);
    if (!nextTimezone) {
      setStrategyNotice(
        "Enter a whole fixed UTC offset from −12 through +14 hours.",
      );
      return;
    }
    setStrategyTimezone(nextTimezone);
  };

  return (
    <View style={[styles.strip, { borderColor: tone + "77" }]}>
      <View style={styles.summaryRow}>
        <View style={styles.profileSummary}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={styles.label}
          >
            CLOSED BARS
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={[styles.bias, { color: tone }]}
          >
            {bias.toUpperCase()}
          </Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.daySummary}>
          <Text style={styles.label}>PREVIOUS PROVIDER DAY</Text>
          {daily ? (
            <Text style={styles.dailyPrice} numberOfLines={1}>
              PDH {formatPrice(daily.high, precision)} · PDL{" "}
              {formatPrice(daily.low, precision)}
            </Text>
          ) : (
            <Text numberOfLines={2} style={styles.unavailable}>
              {dailyUnavailableMessage}
            </Text>
          )}
        </View>
      </View>
      <Disclosure
        title="Historical profile & clocks"
        summary="Formula, sources, as-of records, and strategy/device time bases"
      >
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>HISTORICAL PROFILE</Text>
          <Text style={styles.detail}>
            {profile?.basis ??
              "Unknown until the setup engine receives eligible completed history."}
          </Text>
          <Text style={styles.small}>
            As of{" "}
            {profile?.asOf
              ? new Date(profile.asOf * 1000).toLocaleString()
              : "unavailable"}{" "}
            · {profile?.source ?? "setup history unavailable"}
          </Text>
          {profile?.explanation ? (
            <Text style={styles.small}>{profile.explanation}</Text>
          ) : null}
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>PREVIOUS PROVIDER DAY</Text>
          {daily ? (
            <>
              <Text style={styles.detail}>
                PDH {formatPrice(daily.high, precision)} · PDL{" "}
                {formatPrice(daily.low, precision)}
              </Text>
              <Text style={styles.small}>
                Completed at {new Date(daily.at * 1000).toLocaleString()} ·{" "}
                {daily.source}
              </Text>
            </>
          ) : (
            <Text style={styles.unavailable}>{dailyUnavailableMessage}</Text>
          )}
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>TIME BASIS</Text>
          <View style={styles.clocks}>
            {clocks.map((clock) => {
              const activeLondon = clock.timeZone === "Europe/London" && london;
              const activeNewYork = clock.timeZone === "America/New_York" && ny;
              return (
                <Text
                  key={clock.timeZone}
                  style={[
                    styles.clock,
                    {
                      color: activeLondon
                        ? C.mint
                        : activeNewYork
                          ? C.blue
                          : C.muted,
                    },
                  ]}
                >
                  {clock.label} {clock.time} · {clock.abbreviation} ·{" "}
                  {clock.utcOffset}
                </Text>
              );
            })}
          </View>
          <Text style={styles.small}>
            Strategy clock: {strategyTimezoneLabel(timezone)} ·{" "}
            {strategyClock.abbreviation} · {strategyClock.utcOffset} · Current
            window: {session.session}
          </Text>
          <Text style={styles.small}>Device timezone: {deviceTimezone}</Text>
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>STRATEGY TIME INTERPRETATION</Text>
          <Text style={styles.small}>
            Choose New York (DST-aware), UTC, or a fixed UTC offset for session
            labelling and evaluation.
          </Text>
          <View style={styles.strategyChoices}>
            {STRATEGY_TIME_PRESETS.map((preset) => (
              <ActionButton
                key={preset.timezone}
                compact
                kind={timezone === preset.timezone ? "primary" : "secondary"}
                label={preset.label}
                onPress={() => setStrategyTimezone(preset.timezone)}
              />
            ))}
          </View>
          <Text style={styles.offsetLabel}>
            Fixed UTC offset (whole hours −12 to +14)
          </Text>
          <View style={styles.offsetRow}>
            <TextInput
              accessibilityLabel="Fixed strategy UTC offset from minus 12 through plus 14 hours"
              keyboardType="numbers-and-punctuation"
              maxLength={3}
              onChangeText={(value) =>
                setFixedOffsetDraftState({ timezone, value })
              }
              placeholder="e.g. -5"
              placeholderTextColor={C.muted}
              value={fixedOffsetDraft}
              style={[styles.timezoneInput, styles.offsetInput]}
            />
            <ActionButton
              compact
              kind="secondary"
              label="Apply fixed offset"
              onPress={applyFixedOffset}
            />
          </View>
          <Text style={styles.strategySemantics}>
            Changes how sessions are labelled and evaluated. Source bar
            timestamps are unchanged.
          </Text>
          {strategyNotice ? (
            <Text style={styles.small} accessibilityLiveRegion="polite">
              {strategyNotice}
            </Text>
          ) : null}
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>DISPLAY CLOCKS (3)</Text>
          <Text style={styles.small}>
            Set three supported IANA timezones. These are display-only clocks;
            strategy time remains the separate option above.
          </Text>
          {timezoneDrafts.map((value, index) => (
            <TextInput
              key={`clock-timezone-${index}`}
              accessibilityLabel={`Display clock ${index + 1} IANA timezone`}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(next) =>
                setTimezoneDraftState((current) => {
                  const values =
                    current.sourceKey === configuredTimezoneKey
                      ? current.values
                      : configuredTimezones;
                  return {
                    sourceKey: configuredTimezoneKey,
                    values: values.map((item, itemIndex) =>
                      itemIndex === index ? next : item,
                    ),
                  };
                })
              }
              placeholder={`Clock ${index + 1} timezone`}
              placeholderTextColor={C.muted}
              value={value}
              style={styles.timezoneInput}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply display clock timezones"
            onPress={applyClockTimezones}
            style={({ pressed }) => [
              styles.applyClocks,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.applyClocksText}>Apply display clocks</Text>
          </Pressable>
          {clockNotice ? <Text style={styles.small}>{clockNotice}</Text> : null}
        </View>
      </Disclosure>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: 8,
    padding: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderRadius: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 3,
  },
  profileSummary: { flexShrink: 1, gap: 2, maxWidth: 110, minWidth: 70 },
  daySummary: { flex: 1, gap: 2 },
  rule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: C.border,
  },
  label: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    lineHeight: 11,
  },
  bias: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  detailBlock: { gap: 4 },
  detailLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.75,
  },
  detail: { color: C.text, fontSize: 10, lineHeight: 14 },
  small: { color: C.muted, fontSize: 9, lineHeight: 13 },
  unavailable: { color: C.amber, fontSize: 9, lineHeight: 13 },
  dailyPrice: {
    color: C.price,
    fontFamily: mono,
    fontSize: 9,
    fontWeight: "700",
  },
  clocks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  clock: { fontFamily: mono, fontSize: 9, fontWeight: "800" },
  strategyChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  offsetLabel: { color: C.text, fontSize: 10, fontWeight: "700" },
  offsetRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  offsetInput: { flex: 1 },
  strategySemantics: { color: C.blue, fontSize: 10, lineHeight: 14 },
  timezoneInput: {
    minHeight: 34,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 3,
    borderColor: C.border,
    backgroundColor: C.black + "55",
    color: C.text,
    fontFamily: mono,
    fontSize: 10,
  },
  applyClocks: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 3,
    borderColor: C.blue + "88",
    backgroundColor: C.blue + "17",
  },
  applyClocksText: { color: C.blue, fontSize: 10, fontWeight: "800" },
});
