"use client";

import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Tag,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { HarnessLogEntry, PolicyInfo } from "../types";

interface Props {
  logs: HarnessLogEntry[];
  policies: PolicyInfo[];
  selectedLogIndex: number | null;
  onSelectLog: (index: number | null) => void;
}

export default function HarnessPanel({
  logs,
  policies,
  selectedLogIndex,
  onSelectLog,
}: Props) {
  const [showPolicies, setShowPolicies] = useState(true);
  const [showLogs, setShowLogs] = useState(true);

  const allowCount = logs.filter((l) => l.allowed).length;
  const denyCount = logs.filter((l) => !l.allowed).length;

  return (
    <div className="h-full flex flex-col bg-[var(--card)] border-l border-[var(--border)]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={20} className="text-indigo-400" />
          <h2 className="font-semibold text-sm text-[var(--foreground)]">
            Sondera Harness
          </h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[var(--background)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[var(--foreground)]">
              {logs.length}
            </div>
            <div className="text-[10px] text-[var(--muted)]">Checks</div>
          </div>
          <div className="bg-[var(--background)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-emerald-400">
              {allowCount}
            </div>
            <div className="text-[10px] text-[var(--muted)]">Allowed</div>
          </div>
          <div className="bg-[var(--background)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-400">{denyCount}</div>
            <div className="text-[10px] text-[var(--muted)]">Denied</div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Active Policies Section */}
        <div className="border-b border-[var(--border)]">
          <button
            onClick={() => setShowPolicies(!showPolicies)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider hover:bg-[var(--background)]/50 transition-colors"
          >
            <span>Active Policies ({policies.length})</span>
            {showPolicies ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
          {showPolicies && (
            <div className="px-3 pb-3 space-y-2">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className="bg-[var(--background)] rounded-lg p-2.5 border border-[var(--border)]"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={13}
                      className="text-amber-400 mt-0.5 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--foreground)] truncate">
                        {policy.name}
                      </div>
                      <div className="text-[10px] text-[var(--muted)] mt-0.5">
                        {policy.description}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {policy.restricted_keywords.slice(0, 3).map((kw) => (
                          <span
                            key={kw}
                            className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded"
                          >
                            {kw}
                          </span>
                        ))}
                        {policy.restricted_keywords.length > 3 && (
                          <span className="text-[9px] text-[var(--muted)]">
                            +{policy.restricted_keywords.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Harness Log Section */}
        <div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider hover:bg-[var(--background)]/50 transition-colors"
          >
            <span>Adjudication Log</span>
            {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showLogs && (
            <div className="px-3 pb-3 space-y-2">
              {logs.length === 0 ? (
                <div className="text-xs text-[var(--muted)] text-center py-6">
                  No adjudications yet. Send a message to see policy checks.
                </div>
              ) : (
                logs
                  .slice()
                  .reverse()
                  .map((log, revIdx) => {
                    const realIdx = logs.length - 1 - revIdx;
                    const isSelected = selectedLogIndex === realIdx;
                    return (
                      <button
                        key={realIdx}
                        onClick={() =>
                          onSelectLog(isSelected ? null : realIdx)
                        }
                        className={`w-full text-left bg-[var(--background)] rounded-lg p-2.5 border transition-all cursor-pointer ${
                          isSelected
                            ? log.allowed
                              ? "border-emerald-500/50 ring-1 ring-emerald-500/20"
                              : "border-red-500/50 ring-1 ring-red-500/20"
                            : "border-[var(--border)] hover:border-[var(--muted)]/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {log.allowed ? (
                            <ShieldCheck
                              size={13}
                              className="text-emerald-400"
                            />
                          ) : (
                            <ShieldAlert size={13} className="text-red-400" />
                          )}
                          <span
                            className={`text-[10px] font-bold ${
                              log.allowed ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {log.decision}
                          </span>
                          <span className="text-[9px] text-[var(--muted)] ml-auto flex items-center gap-1">
                            <Clock size={9} />
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="text-[10px] text-[var(--muted)] truncate">
                          &ldquo;{log.user_message}&rdquo;
                        </div>

                        {!log.allowed && log.policy_id && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <Tag size={9} className="text-red-400" />
                            <span className="text-[9px] text-red-400 font-mono">
                              {log.policy_id}
                            </span>
                          </div>
                        )}

                        {/* Expanded details */}
                        {isSelected && (
                          <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <FileText
                                size={10}
                                className="text-[var(--muted)]"
                              />
                              <span className="text-[10px] text-[var(--muted)]">
                                Stage:
                              </span>
                              <span className="text-[10px] text-[var(--foreground)] font-mono">
                                {log.stage}
                              </span>
                            </div>
                            {log.reason && (
                              <div className="text-[10px] text-red-300 bg-red-500/5 rounded p-1.5">
                                {log.reason}
                              </div>
                            )}
                            {log.policy_details && (
                              <div className="text-[10px] text-amber-300 bg-amber-500/5 rounded p-1.5">
                                <div className="font-medium">
                                  {log.policy_details.name}
                                </div>
                                <div className="text-[var(--muted)] mt-0.5">
                                  {log.policy_details.description}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
