import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { SourcePreview } from "./source-preview";

export function OwnedSourcePreview({
  sourceId,
  evidence,
}: {
  sourceId: string;
  evidence?: string;
}) {
  const utils = trpc.useUtils();
  const api = useMemo(
    () => ({
      info: (input: { sourceId: string; evidence?: string }) =>
        utils.sourcePreview.info.fetch(input),
      page: (input: {
        sourceId: string;
        page?: number;
        maxDimension?: number;
      }) => utils.sourcePreview.page.fetch(input),
      text: (input: { sourceId: string; page?: number; evidence?: string }) =>
        utils.sourcePreview.text.fetch(input),
    }),
    [utils],
  );
  return (
    <SourcePreview
      key={sourceId}
      api={api}
      sourceId={sourceId}
      evidence={evidence}
    />
  );
}
