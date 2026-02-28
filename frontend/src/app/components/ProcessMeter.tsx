"use client";

import {
  Radio,
  UserCheck,
  Shield,
  BrainCircuit,
  Database,
  CheckCircle2,
  SkipForward,
  XCircle,
  Loader2,
  Upload,
  FileSearch,
  FileText,
  Fingerprint,
} from "lucide-react";
import { PipelineStage } from "../types";

interface Props {
  stages: PipelineStage[];
  visible: boolean;
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  // Chat pipeline
  receive: Radio,
  session: UserCheck,
  policy: Shield,
  llm: BrainCircuit,
  memory: Database,
  complete: CheckCircle2,
  // PDF pipeline
  upload: Upload,
  parse: FileSearch,
  extract: FileText,
  owner: Fingerprint,
  semantic: BrainCircuit,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-red-400 border-red-500/40 bg-red-500/10",
  active: "text-red-400 border-red-500/50 bg-red-500/10 ring-2 ring-red-500/30",
  done: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  skipped: "text-[var(--muted)] border-[var(--border)] bg-[var(--background)] opacity-40",
  error: "text-red-400 border-red-500/40 bg-red-500/10",
};

const CONNECTOR_COLORS: Record<string, string> = {
  pending: "bg-red-500/30",
  active: "bg-red-500/50",
  done: "bg-emerald-500/50",
  skipped: "bg-[var(--border)] opacity-40",
  error: "bg-red-500/50",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "active") return <Loader2 size={10} className="animate-spin" />;
  if (status === "skipped") return <SkipForward size={10} />;
  if (status === "error") return <XCircle size={10} />;
  return null;
}

export default function ProcessMeter({ stages, visible }: Props) {
  if (!visible || stages.length === 0) return null;

  // Calculate progress percentage for the thermometer bar
  const total = stages.length;
  const doneCount = stages.filter(
    (s) => s.status === "done" || s.status === "skipped" || s.status === "error"
  ).length;
  const activeIdx = stages.findIndex((s) => s.status === "active");
  const progress =
    activeIdx >= 0
      ? ((activeIdx + 0.5) / total) * 100
      : (doneCount / total) * 100;

  // Total elapsed time from the "complete" stage
  const completeStage = stages.find((s) => s.id === "complete");
  const totalMs = completeStage?.duration_ms;
  const isFinished = doneCount === total;

  return (
    <div className="px-5 py-2.5 bg-[var(--card)] border-b border-[var(--border)] transition-all duration-300">
      {/* Thermometer bar */}
      <div className="relative h-1 rounded-full bg-[var(--border)] mb-3 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
            stages.some((s) => s.status === "active")
              ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
              : isFinished
              ? "bg-red-500"
              : "bg-red-500/40"
          }`}
          style={{ width: `${progress}%` }}
        />
        {/* Animated pulse on active */}
        {stages.some((s) => s.status === "active") && (
          <div
            className="absolute inset-y-0 rounded-full bg-red-400/40 animate-pulse"
            style={{ width: `${progress}%` }}
          />
        )}
      </div>

      {/* Stage nodes */}
      <div className="flex items-center justify-between">
        {stages.map((stage, idx) => {
          const Icon = STAGE_ICONS[stage.id] || CheckCircle2;
          const colorClass = STATUS_COLORS[stage.status] || STATUS_COLORS.pending;

          return (
            <div key={stage.id} className="flex items-center flex-1 last:flex-none">
              {/* Node */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all duration-300 ${colorClass}`}
                >
                  {stage.status === "active" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : stage.status === "skipped" ? (
                    <SkipForward size={11} />
                  ) : stage.status === "error" ? (
                    <XCircle size={11} />
                  ) : (
                    <Icon size={12} />
                  )}
                </div>
                <span className={`text-[10px] font-medium leading-tight text-center whitespace-nowrap transition-colors duration-300 ${
                  stage.status === "done"
                    ? "text-emerald-400"
                    : stage.status === "error"
                    ? "text-red-400"
                    : "text-red-400"
                }`}>
                  {stage.label}
                </span>
                {stage.duration_ms != null && stage.status !== "pending" && (
                  <span className={`text-[11px] font-mono font-semibold transition-colors duration-300 ${
                    stage.status === "done" ? "text-emerald-300" : "text-red-300"
                  }`}>
                    {stage.duration_ms < 1000
                      ? `${stage.duration_ms.toFixed(0)}ms`
                      : `${(stage.duration_ms / 1000).toFixed(2)}s`}
                  </span>
                )}
              </div>

              {/* Connector line */}
              {idx < stages.length - 1 && (
                <div className="flex-1 mx-1.5 flex items-center self-start mt-3.5">
                  <div
                    className={`h-0.5 w-full rounded-full transition-all duration-500 ${
                      CONNECTOR_COLORS[stage.status] || CONNECTOR_COLORS.pending
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Total time */}
      {totalMs != null && isFinished && (
        <div className="flex justify-end mt-1.5">
          <span className={`text-[12px] font-mono font-semibold px-2.5 py-0.5 rounded-full ${
            stages.some((s) => s.status === "error")
              ? "text-red-400 bg-red-500/10"
              : "text-emerald-300 bg-emerald-500/10"
          }`}>
            Total: {totalMs < 1000
              ? `${totalMs.toFixed(0)}ms`
              : `${(totalMs / 1000).toFixed(2)}s`}
          </span>
        </div>
      )}
    </div>
  );
}
