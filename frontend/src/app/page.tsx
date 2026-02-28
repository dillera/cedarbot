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
} from "lucide-react";
import ChatMessageComponent from "./components/ChatMessage";
import HarnessPanel from "./components/HarnessPanel";
import PdfViolationReport, { PdfAnalysisResult } from "./components/PdfViolationReport";
import { ChatMessage, HarnessLogEntry, PolicyInfo } from "./types";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [harnessLogs, setHarnessLogs] = useState<HarnessLogEntry[]>([]);
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
  const [lastTokens, setLastTokens] = useState<{ input: number; output: number } | null>(null);
  const [totalTokens, setTotalTokens] = useState<{ input: number; output: number }>({ input: 0, output: 0 });

  // PDF state
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfResult, setPdfResult] = useState<PdfAnalysisResult | null>(null);
  const [pdfContext, setPdfContext] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  const clearMemory = useCallback(async () => {
    await fetch(`/api/chat/clear?session_id=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    setMemoryCount(0);
    setMessages([]);
    setHarnessLogs([]);
    setSelectedLogIndex(null);
    setLastTokens(null);
    setTotalTokens({ input: 0, output: 0 });
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
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-pdf", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data: PdfAnalysisResult = await res.json();
      setPdfResult(data);
    } catch {
      setPdfResult(null);
      setPdfFilename(null);
    } finally {
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
      setLoading(false);
      inputRef.current?.focus();
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
            onClick={clearMemory}
            title="Clear conversation memory"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
          <Link
            href="/policies"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <FileCode2 size={12} />
            <span>Edit Policies</span>
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
        </div>
      </header>

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
