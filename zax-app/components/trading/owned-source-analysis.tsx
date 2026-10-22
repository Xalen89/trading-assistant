import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { SourceAnalysisJob } from "./source-analysis-job";
import type {
  SourceAnalysisCancel,
  SourceAnalysisStart,
  SourceAnalysisRetry,
} from "@/lib/trading/source-analysis-job-types";

export function OwnedSourceAnalysis({
  sourceId,
  sourceVersion,
  onReload,
}: {
  sourceId: string;
  sourceVersion: number;
  onReload: () => void | Promise<void>;
}) {
  const utils = trpc.useUtils();
  const start = trpc.sourceAnalysis.start.useMutation();
  const retry = trpc.sourceAnalysis.retry.useMutation();
  const cancel = trpc.sourceAnalysis.cancel.useMutation();
  const startMutation = start.mutateAsync,
    retryMutation = retry.mutateAsync,
    cancelMutation = cancel.mutateAsync;
  const api = useMemo(
    () => ({
      start: (input: SourceAnalysisStart) => startMutation(input),
      job: (input: { sourceId: string; id?: string }) =>
        utils.sourceAnalysis.job.fetch(input),
      retry: (input: SourceAnalysisRetry) => retryMutation(input),
      cancel: (input: SourceAnalysisCancel) => cancelMutation(input),
    }),
    [startMutation, retryMutation, cancelMutation, utils],
  );
  return (
    <SourceAnalysisJob
      key={sourceId}
      api={api}
      sourceId={sourceId}
      sourceVersion={sourceVersion}
      onReloadRequested={onReload}
      onSucceeded={() => void onReload()}
    />
  );
}
