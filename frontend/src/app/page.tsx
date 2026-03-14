"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Send,
  Shield,
  Loader2,
  TreePine,
  PanelRightOpen,
  PanelRightClose,
  Cpu,
  AlertCircle,
  FileCode2,
  Paperclip,
  X,
  FileText,
  Trash2,
  BrainCircuit,
  ArrowDownToLine,
  ArrowUpFromLine,
  ScrollText,
} from "lucide-react";
import { AscendKitUserButton } from "@ascendkit/nextjs";
import ChatMessageComponent from "./components/ChatMessage";
import HarnessPanel from "./components/HarnessPanel";
import PdfViolationReport, { PdfAnalysisResult } from "./components/PdfViolationReport";
import ProcessMeter from "./components/ProcessMeter";
import { ChatMessage, HarnessLogEntry, PolicyInfo, PipelineStage } from "./types";

const IDLE_PIPELINE: PipelineStage[] = [
  { id: "receive",  label: "Receive",       status: "pending", duration_ms: null },
  { id: "session",  label: "Session",       status: "pending", duration_ms: null },
  { id: "policy",   label: "Policy Check",  status: "pending", duration_ms: null },
  { id: "llm",      label: "LLM Inference", status: "pending", duration_ms: null },
  { id: "memory",   label: "Memory",        status: "pending", duration_ms: null },
  { id: "complete", label: "Complete",       status: "pending", duration_ms: null },
];

/** Simulate in-flight stage progression while waiting for the backend. */
function advanceInFlight(stages: PipelineStage[], elapsed: number): PipelineStage[] {
  // Approximate timings: receive ~0ms, session ~50ms, policy ~150ms, llm ~300ms+
  const thresholds = [0, 50, 150, 600, 0, 0]; // memory + complete filled by backend
  let cumulative = 0;
  return stages.map((s, i) => {
    cumulative += thresholds[i];
    if (i >= 4) return { ...s, status: "pending" }; // memory/complete unknown until response
    if (elapsed > cumulative + thresholds[i]) return { ...s, status: "done" };
    if (elapsed > cumulative) return { ...s, status: "active" };
    return { ...s, status: "pending" };
  });
}

const IDLE_PDF_PIPELINE: PipelineStage[] = [
  { id: "upload",   label: "Upload",            status: "pending", duration_ms: null },
  { id: "parse",    label: "Parse PDF",         status: "pending", duration_ms: null },
  { id: "extract",  label: "Extract Text",      status: "pending", duration_ms: null },
  { id: "owner",    label: "Identify Owner",    status: "pending", duration_ms: null },
  { id: "semantic", label: "Semantic Analysis",  status: "pending", duration_ms: null },
  { id: "policy",   label: "Policy Check",      status: "pending", duration_ms: null },
  { id: "complete", label: "Complete",           status: "pending", duration_ms: null },
];

/** Simulate in-flight PDF pipeline stages while waiting for backend. */
function advancePdfInFlight(stages: PipelineStage[], elapsed: number): PipelineStage[] {
  // Upload ~100ms, Parse ~200ms, Extract ~400ms, Owner ~500ms, Semantic ~2000ms+, Policy/Complete last
  const thresholds = [0, 100, 200, 300, 400, 3000, 0];
  let cumulative = 0;
  return stages.map((s, i) => {
    cumulative += thresholds[i];
    if (i >= 6) return { ...s, status: "pending" };
    if (elapsed > cumulative + thresholds[i]) return { ...s, status: "done" };
    if (elapsed > cumulative) return { ...s, status: "active" };
    return { ...s, status: "pending" };
  });
}

// ── sessionStorage helpers for state persistence across navigation ──────────
const STORAGE_KEY = "cedarbot-chat-state";

function loadPersistedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function persistState(
  messages: ChatMessage[],
  harnessLogs: HarnessLogEntry[],
  lastTokens: { input: number; output: number } | null,
  totalTokens: { input: number; output: number },
) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages, harnessLogs, lastTokens, totalTokens,
    }));
  } catch { /* quota exceeded — non-critical */ }
}

export default function Home() {
  const saved = useRef(loadPersistedState());
  const [messages, setMessages] = useState<ChatMessage[]>(() => saved.current?.messages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [harnessLogs, setHarnessLogs] = useState<HarnessLogEntry[]>(() => saved.current?.harnessLogs ?? []);
  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [llmConfig, setLlmConfig] = useState<{
    provider: string;
    model: string;
    has_api_key: boolean;
  } | null>(null);
  // Session memory
  const [sessionId, setSessionId] = useState<string>("default");
  const [memoryCount, setMemoryCount] = useState(0);

  // Token usage — last call + cumulative session totals
  const [lastTokens, setLastTokens] = useState<{ input: number; output: number } | null>(() => saved.current?.lastTokens ?? null);
  const [totalTokens, setTotalTokens] = useState<{ input: number; output: number }>(() => saved.current?.totalTokens ?? { input: 0, output: 0 });

  // Persist chat state to sessionStorage whenever it changes
  useEffect(() => {
    persistState(messages, harnessLogs, lastTokens, totalTokens);
  }, [messages, harnessLogs, lastTokens, totalTokens]);

  // PDF state
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfResult, setPdfResult] = useState<PdfAnalysisResult | null>(null);
  const [pdfContext, setPdfContext] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const pipelineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pipelineStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Generate or restore a stable session ID on mount
  useEffect(() => {
    let sid = sessionStorage.getItem("cedarbot-session-id");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("cedarbot-session-id", sid);
    }
    setSessionId(sid);
  }, []);

  const refreshMemoryCount = useCallback((sid: string) => {
    fetch(`/api/chat/history?session_id=${encodeURIComponent(sid)}`)
      .then((r) => r.json())
      .then((d) => setMemoryCount(Math.floor((d.total_messages ?? 0) / 2)))
      .catch(() => {});
  }, []);

  const newSession = useCallback(async () => {
    // Clear backend memory for current session
    await fetch(`/api/chat/clear?session_id=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    // Generate fresh session ID
    const newSid = crypto.randomUUID();
    sessionStorage.setItem("cedarbot-session-id", newSid);
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionId(newSid);
    // Reset all local state
    setMemoryCount(0);
    setMessages([]);
    setHarnessLogs([]);
    setSelectedLogIndex(null);
    setLastTokens(null);
    setTotalTokens({ input: 0, output: 0 });
    setPdfContext(null);
    setPdfFilename(null);
    setPdfResult(null);
    setPipeline([]);
    setPipelineVisible(false);
  }, [sessionId]);

  const refreshPolicies = useCallback(() => {
    fetch("/api/policies")
      .then((r) => r.json())
      .then((data) => setPolicies(data.policies || []))
      .catch(() => {});
  }, []);

  // Fetch policies and LLM config on mount via Next.js proxy routes
  useEffect(() => {
    refreshPolicies();
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setLlmConfig(data))
      .catch(() => {});
  }, [refreshPolicies]);

  // Refresh memory count whenever session changes
  useEffect(() => {
    if (sessionId !== "default") refreshMemoryCount(sessionId);
  }, [sessionId, refreshMemoryCount]);

  // Re-sync policies whenever the tab regains focus (e.g. after editing in /policies)
  useEffect(() => {
    const onFocus = () => refreshPolicies();
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshPolicies]);

  // Re-sync immediately when the /policies page broadcasts a save/reset
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "policies-updated") refreshPolicies();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshPolicies]);

  const uploadPdf = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setPdfUploading(true);
    setPdfResult(null);
    setPdfContext(null);
    setPdfFilename(file.name);

    // Start PDF pipeline animation
    setPipelineVisible(true);
    pipelineStartRef.current = performance.now();
    setPipeline(IDLE_PDF_PIPELINE.map((s) => ({ ...s })));
    pipelineTimerRef.current = setInterval(() => {
      const elapsed = performance.now() - pipelineStartRef.current;
      setPipeline((prev) => advancePdfInFlight(prev, elapsed));
    }, 60);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-pdf", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setPdfResult(data as PdfAnalysisResult);
      // Replace animation with real pipeline data
      if (data.pipeline && data.pipeline.length > 0) {
        setPipeline(data.pipeline);
      }
    } catch {
      setPdfResult(null);
      setPdfFilename(null);
    } finally {
      if (pipelineTimerRef.current) {
        clearInterval(pipelineTimerRef.current);
        pipelineTimerRef.current = null;
      }
      setPdfUploading(false);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPdf(file);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadPdf(file);
  }, [uploadPdf]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const activatePdfContext = () => {
    if (!pdfResult) return;
    setPdfContext(pdfResult.full_text);
    setPdfFilename(pdfResult.filename);
    const sysMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `📄 **PDF loaded as context:** \`${pdfResult.filename}\`\n\n${pdfResult.violated ? `⚠️ Note: This PDF triggered ${pdfResult.violations.length} policy violation(s). The restricted content is still included in the context — you are responsible for how you use it.` : `✅ All ${pdfResult.total_pages} page(s) passed Cedar policy checks.`}\n\nYou can now ask questions about the document.`,
      blocked: false,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, sysMsg]);
    setPdfResult(null);
  };

  const clearPdfContext = () => {
    setPdfContext(null);
    setPdfFilename(null);
    setPdfResult(null);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      blocked: false,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Start in-flight pipeline animation
    setPipelineVisible(true);
    pipelineStartRef.current = performance.now();
    setPipeline(IDLE_PIPELINE.map((s) => ({ ...s })));
    pipelineTimerRef.current = setInterval(() => {
      const elapsed = performance.now() - pipelineStartRef.current;
      setPipeline((prev) => advanceInFlight(prev, elapsed));
    }, 60);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Prepend PDF text as context if active
      const messageWithContext = pdfContext
        ? `[PDF CONTEXT — ${pdfFilename}]:\n${pdfContext.slice(0, 12000)}\n\n[USER QUESTION]:\n${text}`
        : text;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageWithContext,
          session_id: sessionId,
          conversation_history: conversationHistory,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        blocked: data.blocked,
        harnessLog: data.harness_log,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.harness_log) {
        setHarnessLogs((prev) => [...prev, data.harness_log]);
      }
      if (data.token_usage) {
        const { input_tokens, output_tokens } = data.token_usage;
        setLastTokens({ input: input_tokens, output: output_tokens });
        setTotalTokens((prev) => ({
          input: prev.input + input_tokens,
          output: prev.output + output_tokens,
        }));
      }
      // Replace in-flight animation with real pipeline data
      if (data.pipeline && data.pipeline.length > 0) {
        setPipeline(data.pipeline);
      }
      refreshPolicies();
      refreshMemoryCount(sessionId);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `**Connection Error:** Could not reach the backend server. Make sure the Python server is running on port 8000.`,
        blocked: false,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (pipelineTimerRef.current) {
        clearInterval(pipelineTimerRef.current);
        pipelineTimerRef.current = null;
      }
      setLoading(false);
      inputRef.current?.focus();
      // Keep the meter visible with the last pipeline result
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleViewLog = (msg: ChatMessage) => {
    if (!msg.harnessLog) return;
    const idx = harnessLogs.findIndex(
      (l) => l.timestamp === msg.harnessLog!.timestamp
    );
    if (idx >= 0) {
      setSelectedLogIndex(idx);
      setShowPanel(true);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 py-3 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center">
            <TreePine size={20} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--foreground)]">
              CedarBot
            </h1>
            <p className="text-[10px] text-[var(--muted)]">
              AI Chat with Sondera Harness &middot; Cedar Policy Guardrails
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {llmConfig && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)] bg-[var(--background)] px-3 py-1.5 rounded-lg">
              <Cpu size={12} className="text-indigo-400 flex-shrink-0" />
              <span className="capitalize">{llmConfig.provider}</span>
              <span className="text-[var(--border)]">/</span>
              <span className="font-mono text-[var(--foreground)]">{llmConfig.model}</span>
              {!llmConfig.has_api_key && (
                <span title="API key not set">
                  <AlertCircle size={12} className="text-amber-400" />
                </span>
              )}
              {lastTokens && (
                <>
                  <span className="text-[var(--border)] mx-0.5">·</span>
                  <span
                    className="flex items-center gap-1 text-[var(--muted)]"
                    title={`Last call: ${lastTokens.input} in / ${lastTokens.output} out\nSession total: ${totalTokens.input} in / ${totalTokens.output} out`}
                  >
                    <ArrowUpFromLine size={10} className="text-sky-400" />
                    <span className="font-mono text-sky-400">{lastTokens.input.toLocaleString()}</span>
                    <ArrowDownToLine size={10} className="text-emerald-400 ml-0.5" />
                    <span className="font-mono text-emerald-400">{lastTokens.output.toLocaleString()}</span>
                  </span>
                  {(totalTokens.input > lastTokens.input || totalTokens.output > lastTokens.output) && (
                    <>
                      <span className="text-[var(--border)] mx-0.5">·</span>
                      <span
                        className="font-mono text-[var(--muted)] opacity-60"
                        title={`Session total: ${totalTokens.input} in / ${totalTokens.output} out`}
                      >
                        {(totalTokens.input + totalTokens.output).toLocaleString()} total
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] bg-[var(--background)] px-3 py-1.5 rounded-lg">
            <Shield size={12} className="text-indigo-400" />
            <span>{policies.length} active</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] bg-[var(--background)] px-3 py-1.5 rounded-lg">
            <BrainCircuit size={12} className="text-violet-400" />
            <span>{memoryCount} turn{memoryCount !== 1 ? "s" : ""} in memory</span>
          </div>
          <button
            onClick={newSession}
            title="Reset session and start a fresh conversation"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
            <span>New Session</span>
          </button>
          <Link
            href="/policies"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <FileCode2 size={12} />
            <span>Edit Policies</span>
          </Link>
          <Link
            href="/logs"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ScrollText size={12} />
            <span>Logs</span>
          </Link>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
            title={showPanel ? "Hide harness panel" : "Show harness panel"}
          >
            {showPanel ? (
              <PanelRightClose size={18} />
            ) : (
              <PanelRightOpen size={18} />
            )}
          </button>
          <AscendKitUserButton />
        </div>
      </header>

      {/* Process Meter */}
      <ProcessMeter stages={pipeline} visible={pipelineVisible} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div
          className="flex-1 flex flex-col min-w-0 relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-20 bg-indigo-500/10 border-2 border-dashed border-indigo-500/50 rounded-xl flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-indigo-400">
                <FileText size={40} />
                <span className="text-sm font-medium">Drop PDF to analyse</span>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 flex items-center justify-center mb-4">
                  <TreePine size={32} className="text-indigo-400" />
                </div>
                <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                  Welcome to CedarBot
                </h2>
                <p className="text-sm text-[var(--muted)] max-w-md mb-6">
                  Ask me anything! I&apos;m protected by Cedar policies via the
                  Sondera Harness. Try asking about restricted topics to see the
                  policy engine in action.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                  {[
                    "What is the capital of France?",
                    "Tell me about weapons manufacturing",
                    "How does photosynthesis work?",
                    "How do I hack into a computer?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="text-left text-xs text-[var(--muted)] bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2.5 hover:border-indigo-500/40 hover:text-[var(--foreground)] transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessageComponent
                key={msg.id}
                message={msg}
                onViewLog={handleViewLog}
              />
            ))}

            {/* PDF uploading spinner */}
            {pdfUploading && (
              <div className="flex items-center gap-3 px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
                <Loader2 size={16} className="text-indigo-400 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Scanning PDF…</p>
                  <p className="text-xs text-[var(--muted)]">{pdfFilename} · Checking Cedar policies page by page</p>
                </div>
              </div>
            )}

            {/* PDF violation report */}
            {pdfResult && (
              <PdfViolationReport
                result={pdfResult}
                onUseAsContext={activatePdfContext}
                onDismiss={() => { setPdfResult(null); setPdfFilename(null); }}
              />
            )}

            {loading && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin" />
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <Shield size={14} className="text-indigo-400 harness-pulse" />
                    <span>Checking policies&hellip;</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--card)]">
            {/* Active PDF context badge */}
            {pdfContext && (
              <div className="flex items-center gap-2 mb-2 max-w-4xl mx-auto">
                <div className="flex items-center gap-1.5 text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full">
                  <FileText size={11} />
                  <span className="truncate max-w-[200px]">{pdfFilename}</span>
                  <span className="text-indigo-300/60">· active context</span>
                </div>
                <button onClick={clearPdfContext} className="text-[var(--muted)] hover:text-red-400 transition-colors">
                  <X size={13} />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 max-w-4xl mx-auto">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileInput}
              />
              {/* PDF attach button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={pdfUploading}
                title="Attach PDF"
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-[var(--background)] border border-[var(--border)] hover:border-indigo-500/40 disabled:opacity-50 flex items-center justify-center transition-colors text-[var(--muted)] hover:text-indigo-400"
              >
                {pdfUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
              </button>

              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={pdfContext ? `Ask about ${pdfFilename}…` : "Type a message… or drag & drop a PDF"}
                  rows={1}
                  className="w-full resize-none bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-[var(--border)] disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <Send size={16} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Harness Panel */}
        {showPanel && (
          <div className="w-80 flex-shrink-0 hidden md:block">
            <HarnessPanel
              logs={harnessLogs}
              policies={policies}
              selectedLogIndex={selectedLogIndex}
              onSelectLog={setSelectedLogIndex}
            />
          </div>
        )}
      </div>
    </div>
  );
}
