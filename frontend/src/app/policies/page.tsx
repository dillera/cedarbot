"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  FlaskConical,
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  ShieldOff,
  ScrollText,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface PolicyInfo {
  id: string;
  name: string;
  description: string;
  restricted_keywords: string[];
}

interface PolicyBlock {
  id: string;           // parsed from @id("...") annotation
  enabled: boolean;
  cedar: string;        // full Cedar text for this single policy block
  dirty: boolean;       // edited since last apply
  lintStatus: "idle" | "checking" | "ok" | "error";
  lintMessage: string;
}

type ApplyStatus = "idle" | "saving" | "success" | "error";

// ── Cedar text parser ────────────────────────────────────────────────────────

/**
 * Split a raw Cedar policy file into individual PolicyBlock objects.
 * Each block starts at an @id(...) annotation and ends just before the next
 * @id(...) or end-of-string.  Comment-only sections (no @id) are discarded.
 */
function parsePolicyBlocks(raw: string): PolicyBlock[] {
  // Split on lines that start an @id annotation
  const lines = raw.split("\n");
  const blocks: PolicyBlock[] = [];
  let current: string[] = [];
  let currentId: string | null = null;

  const flush = () => {
    if (currentId) {
      blocks.push({
        id: currentId,
        enabled: true,
        cedar: current.join("\n").trim(),
        dirty: false,
        lintStatus: "idle",
        lintMessage: "",
      });
    }
    current = [];
    currentId = null;
  };

  for (const line of lines) {
    const idMatch = line.match(/@id\("([^"]+)"\)/);
    if (idMatch) {
      flush();
      currentId = idMatch[1];
    }
    if (currentId) current.push(line);
  }
  flush();
  return blocks;
}

/** Recompose enabled policy blocks back into a single Cedar text. */
function composePolicyText(blocks: PolicyBlock[]): string {
  return blocks
    .filter((b) => b.enabled)
    .map((b) => b.cedar)
    .join("\n\n");
}

/** Generate a fresh unique policy ID. */
function newPolicyId(): string {
  return `custom-policy-${Date.now()}`;
}

const NEW_POLICY_TEMPLATE = `@id("custom-policy-new")
forbid (
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  context.parameters_json like "*keyword*"
};`;

// ── PolicyCard component ─────────────────────────────────────────────────────

interface PolicyCardProps {
  block: PolicyBlock;
  info: PolicyInfo | undefined;
  onChange: (id: string, patch: Partial<PolicyBlock>) => void;
  onDelete: (id: string) => void;
}

function PolicyCard({ block, info, onChange, onDelete }: PolicyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = block.cedar.split("\n").length;

  const handleLint = async () => {
    onChange(block.id, { lintStatus: "checking", lintMessage: "" });
    try {
      const res = await fetch("/api/policies/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_text: block.cedar }),
      });
      const data = await res.json();
      if (data.ok) {
        onChange(block.id, { lintStatus: "ok", lintMessage: "Syntax valid" });
      } else {
        onChange(block.id, { lintStatus: "error", lintMessage: data.error || "Syntax error" });
      }
    } catch {
      onChange(block.id, { lintStatus: "error", lintMessage: "Network error" });
    }
  };

  const isPermit = block.cedar.includes("permit(");
  const isForbid = block.cedar.includes("forbid(");

  return (
    <div className={`rounded-xl border transition-colors ${
      !block.enabled
        ? "border-[var(--border)] opacity-50"
        : block.dirty
        ? "border-amber-500/40"
        : block.lintStatus === "error"
        ? "border-red-500/40"
        : block.lintStatus === "ok"
        ? "border-emerald-500/30"
        : "border-[var(--border)]"
    } bg-[var(--card)]`}>

      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Enable/disable toggle */}
        <button
          onClick={() => onChange(block.id, { enabled: !block.enabled })}
          title={block.enabled ? "Disable policy" : "Enable policy"}
          className="flex-shrink-0 transition-colors"
        >
          {block.enabled
            ? <ToggleRight size={22} className="text-emerald-400" />
            : <ToggleLeft size={22} className="text-[var(--muted)]" />}
        </button>

        {/* Policy type icon + ID */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isPermit
              ? <ShieldCheck size={13} className="text-emerald-400 flex-shrink-0" />
              : isForbid
              ? <ShieldOff size={13} className="text-red-400 flex-shrink-0" />
              : <Shield size={13} className="text-amber-400 flex-shrink-0" />}
            <span className="font-mono text-xs text-[var(--foreground)] truncate font-medium">
              {info?.name || block.id}
            </span>
          </div>
          {info?.description && (
            <p className="text-[11px] text-[var(--muted)] mt-0.5 truncate">{info.description}</p>
          )}
          <code className="text-[10px] text-indigo-400 font-mono">@id(&quot;{block.id}&quot;)</code>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {block.dirty && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              <AlertTriangle size={9} />
              edited
            </span>
          )}
          {block.lintStatus === "ok" && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={9} />
              valid
            </span>
          )}
          {block.lintStatus === "error" && (
            <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              <XCircle size={9} />
              error
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-[var(--border)]">
          {/* Keywords */}
          {info?.restricted_keywords && info.restricted_keywords.length > 0 && (
            <div className="px-4 py-2 flex flex-wrap gap-1 border-b border-[var(--border)]">
              {info.restricted_keywords.map((kw) => (
                <span key={kw} className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono">
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Code editor */}
          <div className="flex overflow-hidden">
            <div className="select-none text-right px-2 py-3 text-[10px] font-mono text-[var(--border)] bg-[var(--background)] border-r border-[var(--border)] leading-[1.6rem] min-w-[2.5rem]">
              {block.cedar.split("\n").map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              value={block.cedar}
              onChange={(e) => onChange(block.id, {
                cedar: e.target.value,
                dirty: true,
                lintStatus: "idle",
                lintMessage: "",
              })}
              spellCheck={false}
              rows={lineCount + 1}
              className="flex-1 resize-none bg-[var(--background)] text-[var(--foreground)] font-mono text-xs leading-[1.6rem] px-3 py-3 focus:outline-none"
              style={{ tabSize: 2 }}
            />
          </div>

          {/* Lint error display */}
          {block.lintStatus === "error" && block.lintMessage && (
            <div className="mx-4 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-400 font-mono whitespace-pre-wrap">
              {block.lintMessage}
            </div>
          )}

          {/* Card actions */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--background)]">
            <div className="text-[10px] text-[var(--muted)]">{lineCount} lines</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDelete(block.id)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
              <button
                onClick={handleLint}
                disabled={block.lintStatus === "checking"}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors disabled:opacity-50"
              >
                {block.lintStatus === "checking"
                  ? <Loader2 size={12} className="animate-spin" />
                  : <FlaskConical size={12} />}
                Test syntax
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [blocks, setBlocks] = useState<PolicyBlock[]>([]);
  const [infos, setInfos] = useState<Record<string, PolicyInfo>>({});
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>("idle");
  const [applyMessage, setApplyMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // Load policy text + descriptions on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/policies/text").then((r) => r.json()),
      fetch("/api/policies").then((r) => r.json()),
    ]).then(([textData, policiesData]) => {
      const parsed = parsePolicyBlocks(textData.policy_text || "");
      setBlocks(parsed);
      const infoMap: Record<string, PolicyInfo> = {};
      for (const p of (policiesData.policies || []) as PolicyInfo[]) {
        infoMap[p.id] = p;
      }
      setInfos(infoMap);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<PolicyBlock>) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, ...patch } : b));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    if (!confirm(`Delete policy "${id}"? This cannot be undone without resetting defaults.`)) return;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setApplyStatus("idle");
  }, []);

  const addPolicy = () => {
    const id = newPolicyId();
    const cedar = NEW_POLICY_TEMPLATE.replace("custom-policy-new", id);
    setBlocks((prev) => [...prev, {
      id,
      enabled: true,
      cedar,
      dirty: true,
      lintStatus: "idle",
      lintMessage: "",
    }]);
  };

  const handleApply = async () => {
    setApplyStatus("saving");
    setApplyMessage("");
    const composed = composePolicyText(blocks);
    try {
      const res = await fetch("/api/policies/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_text: composed }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyStatus("success");
        setApplyMessage(data.message || "Policies applied");
        // Mark all blocks as clean
        setBlocks((prev) => prev.map((b) => ({ ...b, dirty: false })));
        // Refresh descriptions
        const refreshed = await fetch("/api/policies").then((r) => r.json());
        const infoMap: Record<string, PolicyInfo> = {};
        for (const p of (refreshed.policies || []) as PolicyInfo[]) {
          infoMap[p.id] = p;
        }
        setInfos(infoMap);
        localStorage.setItem("policies-updated", Date.now().toString());
      } else {
        setApplyStatus("error");
        setApplyMessage(data.detail || "Failed to apply policies");
      }
    } catch {
      setApplyStatus("error");
      setApplyMessage("Network error — could not reach the backend");
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all policies to the original defaults?")) return;
    setApplyStatus("saving");
    try {
      const res = await fetch("/api/policies/reset", { method: "POST" });
      if (res.ok) {
        const [textData, policiesData] = await Promise.all([
          fetch("/api/policies/text").then((r) => r.json()),
          fetch("/api/policies").then((r) => r.json()),
        ]);
        setBlocks(parsePolicyBlocks(textData.policy_text || ""));
        const infoMap: Record<string, PolicyInfo> = {};
        for (const p of (policiesData.policies || []) as PolicyInfo[]) {
          infoMap[p.id] = p;
        }
        setInfos(infoMap);
        setApplyStatus("success");
        setApplyMessage("Policies reset to defaults");
        localStorage.setItem("policies-updated", Date.now().toString());
      } else {
        const data = await res.json();
        setApplyStatus("error");
        setApplyMessage(data.detail || "Reset failed");
      }
    } catch {
      setApplyStatus("error");
      setApplyMessage("Network error");
    }
  };

  const enabledCount = blocks.filter((b) => b.enabled).length;
  const dirtyCount = blocks.filter((b) => b.dirty).length;
  const hasErrors = blocks.some((b) => b.lintStatus === "error");

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-[var(--card)] border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft size={15} />
            <span>Back to Chat</span>
          </Link>
          <Link
            href="/logs"
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ScrollText size={13} />
            <span>Logs</span>
          </Link>
          <div className="w-px h-5 bg-[var(--border)]" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Shield size={16} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[var(--foreground)]">Cedar Policy Editor</h1>
              <p className="text-[10px] text-[var(--muted)]">Sondera Harness · Live policy management</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status message */}
          {applyStatus !== "idle" && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ${
              applyStatus === "saving" ? "text-[var(--muted)] bg-[var(--background)]"
              : applyStatus === "success" ? "text-emerald-400 bg-emerald-500/10"
              : "text-red-400 bg-red-500/10"
            }`}>
              {applyStatus === "saving" && <Loader2 size={12} className="animate-spin" />}
              {applyStatus === "success" && <CheckCircle2 size={12} />}
              {applyStatus === "error" && <XCircle size={12} />}
              <span>{applyStatus === "saving" ? "Applying…" : applyMessage}</span>
            </div>
          )}

          <button
            onClick={handleReset}
            disabled={applyStatus === "saving"}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={13} />
            Reset defaults
          </button>

          <button
            onClick={addPolicy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-indigo-400 transition-colors border border-[var(--border)]"
          >
            <Plus size={13} />
            New policy
          </button>

          <button
            onClick={handleApply}
            disabled={applyStatus === "saving" || hasErrors}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-[var(--border)] disabled:cursor-not-allowed text-white transition-colors font-medium"
          >
            <Save size={13} />
            Apply Policies
          </button>
        </div>
      </header>

      {/* Sub-toolbar */}
      <div className="flex items-center gap-4 px-5 py-2 bg-[var(--card)] border-b border-[var(--border)] text-xs text-[var(--muted)] flex-shrink-0">
        <span>{blocks.length} policies total</span>
        <span className="text-[var(--border)]">·</span>
        <span className="text-emerald-400">{enabledCount} enabled</span>
        <span className="text-[var(--border)]">·</span>
        <span className="text-[var(--muted)]">{blocks.length - enabledCount} disabled</span>
        {dirtyCount > 0 && (
          <>
            <span className="text-[var(--border)]">·</span>
            <span className="text-amber-400 flex items-center gap-1">
              <AlertTriangle size={10} />
              {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
            </span>
          </>
        )}
        {hasErrors && (
          <>
            <span className="text-[var(--border)]">·</span>
            <span className="text-red-400 flex items-center gap-1">
              <XCircle size={10} />
              syntax errors — fix before applying
            </span>
          </>
        )}
        <span className="ml-auto text-[10px]">Changes applied live · no restart needed</span>
      </div>

      {/* Policy cards */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--muted)] gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading policies…</span>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-5 py-5 space-y-3">
            {blocks.map((block) => (
              <PolicyCard
                key={block.id}
                block={block}
                info={infos[block.id]}
                onChange={updateBlock}
                onDelete={deleteBlock}
              />
            ))}

            {/* Add policy button at bottom */}
            <button
              onClick={addPolicy}
              className="w-full py-3 rounded-xl border border-dashed border-[var(--border)] text-[var(--muted)] hover:text-indigo-400 hover:border-indigo-500/40 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              Add new policy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
