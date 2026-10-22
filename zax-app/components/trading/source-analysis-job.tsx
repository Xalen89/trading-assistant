import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  activeSourceAnalysis,
  type SourceAnalysisJob as SourceAnalysisRecord,
  type SourceAnalysisCancel,
  type SourceAnalysisRetry,
  type SourceAnalysisStart,
} from "@/lib/trading/source-analysis-job-types";
import { C } from "./theme";
import { ActionButton, Card, SectionLabel } from "./ui";

export type SourceAnalysisJobApi = {
  start: (input: SourceAnalysisStart) => Promise<{ id: string }>;
  job: (input: {
    sourceId: string;
    id?: string;
  }) => Promise<SourceAnalysisRecord | null>;
  retry: (input: SourceAnalysisRetry) => Promise<{ id: string }>;
  cancel: (input: SourceAnalysisCancel) => Promise<{ id: string }>;
};

export type SourceAnalysisJobProps = {
  api: SourceAnalysisJobApi;
  sourceId: string;
  /** The version currently displayed by the authoritative source query. */
  sourceVersion: number;
  /** Lets the owning library screen refetch its authoritative source before retrying. */
  onReloadRequested?: () => void | Promise<void>;
  /** Called only after the saved, unapproved source revision has succeeded. */
  onSucceeded?: (job: SourceAnalysisRecord) => void;
};

const phaseLabel: Record<SourceAnalysisRecord["progressPhase"], string> = {
  queued: "Queued for source analysis.",
  claimed: "Worker claimed this source job.",
  "version-checking": "Checking the original source version.",
  "indexing-image": "Indexing image geometry without changing review status.",
  "analyzing-source": "Analyzing the retained original source.",
  "persisting-revision": "Saving an unapproved review revision.",
  succeeded: "Unapproved blueprint saved for review.",
  failed: "Analysis stopped without changing the source.",
  cancelled: "Analysis cancelled; no model result will be saved.",
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Source analysis could not be started. The source was not changed.";
}

/**
 * This is intentionally API-injected instead of importing a root router. The
 * parent owns root-router mounting and supplies owner-authenticated procedures.
 */
export function SourceAnalysisJob({
  api,
  sourceId,
  sourceVersion,
  onReloadRequested,
  onSucceeded,
}: SourceAnalysisJobProps) {
  const [job, setJob] = useState<SourceAnalysisRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadRequested, setReloadRequested] = useState(false);
  const succeededId = useRef<string | undefined>(undefined);

  const load = useCallback(
    async (id?: string) => {
      try {
        const next = await api.job({ sourceId, ...(id ? { id } : {}) });
        setJob(next);
        setError(undefined);
        return next;
      } catch (nextError) {
        setError(errorMessage(nextError));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api, sourceId],
  );

  useEffect(() => {
    const initial = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(initial);
  }, [load]);

  useEffect(() => {
    if (!job || !activeSourceAnalysis(job.status)) return;
    const timer = setTimeout(() => {
      void load(job.id);
    }, 1_250);
    return () => clearTimeout(timer);
  }, [job, load]);

  useEffect(() => {
    if (job?.status !== "succeeded" || succeededId.current === job.id) return;
    succeededId.current = job.id;
    onSucceeded?.(job);
  }, [job, onSucceeded]);

  const start = useCallback(async () => {
    setMutating(true);
    setError(undefined);
    try {
      const created = await api.start({
        sourceId,
        expectedVersion: sourceVersion,
      });
      await load(created.id);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setMutating(false);
    }
  }, [api, load, sourceId, sourceVersion]);

  const retry = useCallback(async () => {
    if (!job) return;
    setMutating(true);
    setError(undefined);
    try {
      const next = await api.retry({
        id: job.id,
        sourceId,
        expectedVersion: sourceVersion,
      });
      await load(next.id);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setMutating(false);
    }
  }, [api, job, load, sourceId, sourceVersion]);

  const cancel = useCallback(async () => {
    if (!job) return;
    setMutating(true);
    setError(undefined);
    try {
      await api.cancel({ id: job.id, sourceId });
      await load(job.id);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setMutating(false);
    }
  }, [api, job, load, sourceId]);

  const reload = useCallback(async () => {
    setMutating(true);
    setError(undefined);
    try {
      await onReloadRequested?.();
      setReloadRequested(true);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setMutating(false);
    }
  }, [onReloadRequested]);

  const active = Boolean(job && activeSourceAnalysis(job.status));
  const retryAvailable = Boolean(
    job &&
    job.status === "failed" &&
    job.request.attempts < 2 &&
    job.result?.retryable !== false,
  );
  const sourceChangedSinceJob = Boolean(
    job && sourceVersion !== job.request.expectedVersion,
  );

  return (
    <Card>
      <SectionLabel>Source blueprint analysis</SectionLabel>
      <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
        Analyze the retained original and save only an unapproved review
        blueprint. This never activates a strategy or replaces source bytes.
      </Text>
      {loading ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
          }}
        >
          <ActivityIndicator color={C.lime} size="small" />
          <Text style={{ color: C.muted, fontSize: 12 }}>
            Checking latest source job…
          </Text>
        </View>
      ) : job ? (
        <View style={{ gap: 5, marginTop: 10 }}>
          <Text
            style={{
              color: active
                ? C.lime
                : job.status === "failed"
                  ? C.rose
                  : C.text,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {phaseLabel[job.progressPhase]}
          </Text>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
            Attempt {job.request.attempts} of 2 · original source v
            {job.request.expectedVersion}
          </Text>
          {job.status === "succeeded" ? (
            <Text style={{ color: C.lime, fontSize: 11, lineHeight: 16 }}>
              Saved as source v
              {job.result?.revisedSourceVersion ?? sourceVersion}. Review and
              accept separately; it remains unapproved.
            </Text>
          ) : null}
          {job.status === "cancelled" ? (
            <Text style={{ color: C.amber, fontSize: 11, lineHeight: 16 }}>
              A model call already started may finish, but this cancelled job
              cannot save its result.
            </Text>
          ) : null}
          {job.error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: C.rose, fontSize: 12, lineHeight: 18 }}
            >
              {job.error}
            </Text>
          ) : null}
          {job.status === "failed" && sourceChangedSinceJob ? (
            <Text style={{ color: C.amber, fontSize: 11, lineHeight: 16 }}>
              The authoritative source version changed. Reload it, then
              explicitly retry this same job once.
            </Text>
          ) : null}
          {job.status === "failed" && job.result?.blueprint ? (
            <Text style={{ color: C.amber, fontSize: 11, lineHeight: 16 }}>
              An unapproved proposal was retained in this failed job but was not
              saved over the newer source revision.
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>
          No prior analysis job for this source.
        </Text>
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: C.rose, fontSize: 12, lineHeight: 18, marginTop: 8 }}
        >
          {error}
        </Text>
      ) : null}
      {!job ||
      job.status === "succeeded" ||
      job.status === "cancelled" ||
      (job.status === "failed" && !retryAvailable) ? (
        <ActionButton
          compact
          label={
            mutating
              ? "Starting…"
              : job?.status === "failed"
                ? "Start new analysis"
                : "Analyze original source"
          }
          disabled={mutating || loading}
          onPress={() => void start()}
        />
      ) : retryAvailable ? (
        sourceChangedSinceJob && !reloadRequested ? (
          <ActionButton
            compact
            label={mutating ? "Reloading…" : "Reload current source"}
            disabled={mutating || active}
            onPress={() => void reload()}
          />
        ) : (
          <ActionButton
            compact
            label={mutating ? "Retrying…" : "Retry analysis once"}
            disabled={mutating || active}
            onPress={() => void retry()}
          />
        )
      ) : active ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          <Text style={{ color: C.muted, fontSize: 11 }}>
            This page polls while the finite in-process worker is active.
          </Text>
          <ActionButton
            compact
            kind="secondary"
            label={mutating ? "Cancelling…" : "Cancel analysis"}
            disabled={mutating}
            onPress={() => void cancel()}
          />
        </View>
      ) : null}
    </Card>
  );
}
