"use client";

import { Shield, ShieldAlert, ShieldCheck, FileText, ChevronDown, ChevronUp, AlertTriangle, Building2, BrainCircuit, BrainCog, Microscope } from "lucide-react";
import { useState } from "react";

interface PolicyDetails {
  name: string;
  description: string;
  restricted_keywords: string[];
}

interface PageResult {
  page: number;
  text_preview: string;
  allowed: boolean;
  decision: string;
  policy_id: string | null;
  reason: string | null;
  policy_details: PolicyDetails | null;
  legal_analysis?: LegalAnalysisResult | null;
}

interface LegalAnalysisResult {
  is_racketeering_related: boolean;
  is_unfair_competition: boolean;
  is_tortious_interference: boolean;
  is_implied_covenant: boolean;
  litigation_complexity: string;
  has_multi_party_claims: boolean;
  summary: string;
}

interface Violation {
  page: number;
  policy_id: string;
  reason: string;
  policy_details: PolicyDetails | null;
  text_preview: string;
  legal_analysis?: LegalAnalysisResult | null;
}

export interface DocumentOwner {
  entity_id: string;
  allows_ai_processing: boolean;
}

export interface PdfAnalysisResult {
  filename: string;
  total_pages: number;
  full_text: string;
  violated: boolean;
  violations: Violation[];
  pages: PageResult[];
  document_owner?: DocumentOwner;
}

interface Props {
  result: PdfAnalysisResult;
  onUseAsContext: () => void;
  onDismiss: () => void;
}

function LegalAnalysisBadges({ la }: { la: LegalAnalysisResult }) {
  const flags = [
    { key: "is_racketeering_related", label: "Racketeering", value: la.is_racketeering_related },
    { key: "is_unfair_competition", label: "Unfair Competition", value: la.is_unfair_competition },
    { key: "is_tortious_interference", label: "Tortious Interference", value: la.is_tortious_interference },
    { key: "is_implied_covenant", label: "Implied Covenant", value: la.is_implied_covenant },
    { key: "has_multi_party_claims", label: "Multi-Party", value: la.has_multi_party_claims },
  ];
  const activeFlags = flags.filter((f) => f.value);
  const complexityColor =
    la.litigation_complexity === "High" ? "text-red-400 bg-red-500/10 border-red-500/20" :
    la.litigation_complexity === "Medium" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";

  return (
    <div className="mt-2">
      {la.summary && (
        <p className="text-[11px] text-violet-300 flex items-start gap-1.5 mb-1.5">
          <Microscope size={10} className="mt-0.5 flex-shrink-0" />
          <span>{la.summary}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <span className={`text-[10px] font-mono border px-1.5 py-0.5 rounded-full ${complexityColor}`}>
          {la.litigation_complexity} complexity
        </span>
        {activeFlags.map((f) => (
          <span key={f.key} className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
            {f.label}
          </span>
        ))}
        {activeFlags.length === 0 && la.litigation_complexity === "Low" && (
          <span className="text-[10px] text-[var(--muted)]">
            No semantic risk flags detected
          </span>
        )}
      </div>
    </div>
  );
}

export default function PdfViolationReport({ result, onUseAsContext, onDismiss }: Props) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [showAllPages, setShowAllPages] = useState(false);

  const togglePage = (page: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const violatedPages = result.pages.filter((p) => !p.allowed);
  const cleanPages = result.pages.filter((p) => p.allowed);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden text-sm my-3">
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] ${result.violated ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${result.violated ? "bg-red-500/20" : "bg-emerald-500/20"}`}>
          {result.violated
            ? <ShieldAlert size={18} className="text-red-400" />
            : <ShieldCheck size={18} className="text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText size={13} className="text-[var(--muted)] flex-shrink-0" />
            <span className="font-semibold text-[var(--foreground)] truncate">{result.filename}</span>
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {result.total_pages} page{result.total_pages !== 1 ? "s" : ""} scanned
            {result.violated
              ? ` · ${result.violations.length} policy violation${result.violations.length !== 1 ? "s" : ""} detected`
              : " · No policy violations found"}
          </p>
          {result.document_owner && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[10px] text-[var(--muted)] bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                <Building2 size={9} />
                <span className="font-mono">{result.document_owner.entity_id}</span>
              </span>
              {result.document_owner.allows_ai_processing ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <BrainCircuit size={9} />
                  AI processing allowed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                  <BrainCog size={9} />
                  AI processing opted out
                </span>
              )}
            </div>
          )}
        </div>
        <button onClick={onDismiss} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xs px-2 py-1 rounded transition-colors">
          ✕
        </button>
      </div>

      {/* Violations summary */}
      {result.violated && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} />
            Policy Violations
          </h3>
          <div className="space-y-2">
            {result.violations.map((v, i) => (
              <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Shield size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                        {v.policy_id}
                      </span>
                      <span className="text-xs text-[var(--muted)]">Page {v.page}</span>
                    </div>
                    {v.policy_details && (
                      <p className="text-xs text-[var(--foreground)] mt-1 font-medium">
                        {v.policy_details.name}
                      </p>
                    )}
                    {v.policy_details && (
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {v.policy_details.description}
                      </p>
                    )}
                    {v.text_preview && (
                      <p className="text-xs text-[var(--muted)] mt-1 italic border-l-2 border-red-500/30 pl-2 line-clamp-2">
                        &ldquo;{v.text_preview}&rdquo;
                      </p>
                    )}
                    {v.legal_analysis && (
                      <LegalAnalysisBadges la={v.legal_analysis} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Page-by-page breakdown */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <button
          onClick={() => setShowAllPages(!showAllPages)}
          className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {showAllPages ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showAllPages ? "Hide" : "Show"} page-by-page breakdown
          <span className="ml-1 text-emerald-400">{cleanPages.length} clean</span>
          {violatedPages.length > 0 && (
            <span className="text-red-400">· {violatedPages.length} flagged</span>
          )}
        </button>

        {showAllPages && (
          <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {result.pages.map((page) => (
              <div key={page.page} className={`rounded-lg border overflow-hidden ${page.allowed ? "border-[var(--border)]" : "border-red-500/30"}`}>
                <button
                  onClick={() => togglePage(page.page)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${page.allowed ? "hover:bg-[var(--background)]" : "bg-red-500/5 hover:bg-red-500/10"}`}
                >
                  {page.allowed
                    ? <ShieldCheck size={12} className="text-emerald-400 flex-shrink-0" />
                    : <ShieldAlert size={12} className="text-red-400 flex-shrink-0" />}
                  <span className="text-xs font-medium text-[var(--foreground)]">Page {page.page}</span>
                  {!page.allowed && page.policy_id && (
                    <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                      {page.policy_id}
                    </span>
                  )}
                  <span className="ml-auto">
                    {expandedPages.has(page.page) ? <ChevronUp size={10} className="text-[var(--muted)]" /> : <ChevronDown size={10} className="text-[var(--muted)]" />}
                  </span>
                </button>
                {expandedPages.has(page.page) && (
                  <div className="px-3 pb-2 border-t border-[var(--border)] pt-2 space-y-1.5">
                    {page.text_preview && (
                      <p className="text-[11px] text-[var(--muted)] italic">{page.text_preview}&hellip;</p>
                    )}
                    {page.legal_analysis && (
                      <LegalAnalysisBadges la={page.legal_analysis} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 flex items-center gap-3">
        {result.violated ? (
          <>
            <div className="flex-1 text-xs text-[var(--muted)]">
              The PDF contains restricted content. You can still use the clean portions as context.
            </div>
            <button
              onClick={onUseAsContext}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors font-medium"
            >
              Use as context anyway
            </button>
          </>
        ) : (
          <>
            <div className="flex-1 text-xs text-emerald-400">
              ✓ All pages passed policy checks. PDF is ready to use as context.
            </div>
            <button
              onClick={onUseAsContext}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors font-medium"
            >
              Use as context
            </button>
          </>
        )}
      </div>
    </div>
  );
}
