"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  ScrollText,
  Filter,
  Pause,
  Play,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { LogEntry, LogLevel } from "../types";

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARNING", "ERROR"];

const LEVEL_COLORS: Record<
  LogLevel,
  { text: string; bg: string; border: string }
> = {
  DEBUG: {
    text: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
  },
  INFO: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  WARNING: {
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  ERROR: {
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
};

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LogLevel | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (levelFilter) params.set("level", levelFilter);
    params.set("limit", "200");
    try {
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch {
      /* network error — silent */
    }
  }, [levelFilter]);

  // Fetch on mount and when filter changes
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 2000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchLogs]);

  const clearLogs = async () => {
    await fetch("/api/logs/clear", { method: "DELETE" });
    fetchLogs();
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 bg-[var(--card)] border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft size={15} />
            <span>Back to Chat</span>
          </Link>
          <div className="w-px h-5 bg-[var(--border)]" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <ScrollText size={16} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[var(--foreground)]">
                System Logs
              </h1>
              <p className="text-[10px] text-[var(--muted)]">
                Structured event log &middot; In-memory ring buffer (500 max)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            {autoRefresh ? <Pause size={12} /> : <Play size={12} />}
            {autoRefresh ? "Pause" : "Resume"}
          </button>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </header>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2 bg-[var(--card)] border-b border-[var(--border)] text-xs flex-shrink-0">
        <Filter size={12} className="text-[var(--muted)]" />
        <button
          onClick={() => setLevelFilter(null)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            !levelFilter
              ? "bg-indigo-600 text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)] bg-[var(--background)]"
          }`}
        >
          All
        </button>
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() =>
              setLevelFilter(levelFilter === lvl ? null : lvl)
            }
            className={`px-2.5 py-1 rounded-md transition-colors ${
              levelFilter === lvl
                ? `${LEVEL_COLORS[lvl].bg} ${LEVEL_COLORS[lvl].text} border ${LEVEL_COLORS[lvl].border}`
                : "text-[var(--muted)] hover:text-[var(--foreground)] bg-[var(--background)]"
            }`}
          >
            {lvl}
          </button>
        ))}
        <span className="ml-auto text-[var(--muted)]">{total} entries</span>
        {autoRefresh && (
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* ── Log entries ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-5 py-3 space-y-1">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--muted)]">
              <ScrollText size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No log entries yet</p>
              <p className="text-xs mt-1">
                Events will appear here as the system processes requests
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const colors = LEVEL_COLORS[entry.level];
              const isExpanded = expandedId === entry.id;
              const time = new Date(entry.timestamp).toLocaleTimeString(
                "en-US",
                {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  fractionalSecondDigits: 3,
                },
              );

              return (
                <div
                  key={entry.id}
                  className={`rounded-lg border transition-colors ${
                    isExpanded ? colors.border : "border-transparent"
                  } ${colors.bg} hover:border-[var(--border)]`}
                >
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : entry.id)
                    }
                    className="w-full flex items-center gap-3 px-3 py-2 text-left"
                  >
                    {/* Timestamp */}
                    <span className="font-mono text-[11px] text-[var(--muted)] flex-shrink-0 w-24">
                      {time}
                    </span>
                    {/* Level badge */}
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.text} ${colors.bg} border ${colors.border} flex-shrink-0 w-16 text-center`}
                    >
                      {entry.level}
                    </span>
                    {/* Event tag */}
                    {entry.event && (
                      <span className="font-mono text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                        {entry.event}
                      </span>
                    )}
                    {/* Message */}
                    <span className="text-xs text-[var(--foreground)] truncate flex-1">
                      {entry.message}
                    </span>
                    {/* Expand indicator */}
                    {entry.data &&
                      (isExpanded ? (
                        <ChevronUp
                          size={12}
                          className="text-[var(--muted)] flex-shrink-0"
                        />
                      ) : (
                        <ChevronDown
                          size={12}
                          className="text-[var(--muted)] flex-shrink-0"
                        />
                      ))}
                  </button>

                  {/* Expanded data */}
                  {isExpanded && entry.data && (
                    <div className="px-3 pb-2 ml-24">
                      <pre className="text-[11px] font-mono text-[var(--muted)] bg-[var(--background)] rounded-lg p-3 overflow-x-auto border border-[var(--border)]">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
