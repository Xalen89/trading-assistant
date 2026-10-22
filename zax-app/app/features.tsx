import { useLocalSearchParams } from "expo-router";
import {
  FeatureGuide,
  type FeaturePurposeGroup,
} from "@/components/trading/feature-guide";
import { OwnerGate } from "@/components/trading/owner-gate";
import featureGroups from "@/lib/trading/feature-purpose-data.json";
export default function FeaturesScreen() {
  const params = useLocalSearchParams<{ feature?: string }>();
  const groups = featureGroups as FeaturePurposeGroup[];
  const requestedGroup =
    typeof params.feature === "string" &&
    groups.some((group) => group.id === params.feature)
      ? params.feature
      : undefined;
  return (
    <OwnerGate>
      <FeatureGuide groups={groups} initialGroup={requestedGroup} />
    </OwnerGate>
  );
}
