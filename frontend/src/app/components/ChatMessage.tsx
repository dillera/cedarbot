"use client";

import { Bot, User, ShieldAlert, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ChatMessage as ChatMessageType } from "../types";

interface Props {
  message: ChatMessageType;
  onViewLog: (message: ChatMessageType) => void;
}

export default function ChatMessage({ message, onViewLog }: Props) {
  const isUser = message.role === "user";
  const isBlocked = message.blocked;

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-1 ${
            isBlocked
              ? "bg-red-500/20 text-red-400"
              : "bg-indigo-500/20 text-indigo-400"
          }`}
        >
          <Bot size={18} />
        </div>
      )}

      <div className={`max-w-[75%] flex flex-col gap-1.5`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo-600 text-white rounded-br-md"
              : isBlocked
              ? "bg-red-950/50 border border-red-500/30 text-red-200 rounded-bl-md"
              : "bg-[var(--card)] border border-[var(--border)] text-[var(--card-foreground)] rounded-bl-md"
          }`}
        >
          <div className="chat-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>

        {/* Harness badge */}
        {!isUser && message.harnessLog && (
          <button
            onClick={() => onViewLog(message)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg w-fit transition-colors cursor-pointer ${
              isBlocked
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            {isBlocked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
            <span>
              {isBlocked
                ? `Blocked by ${message.harnessLog.policy_id}`
                : "Policy: ALLOW"}
            </span>
          </button>
        )}

        <span className="text-[10px] text-[var(--muted)] px-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-600/30 text-indigo-300 flex items-center justify-center mt-1">
          <User size={18} />
        </div>
      )}
    </div>
  );
}
