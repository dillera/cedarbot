export interface HarnessLogEntry {
  allowed: boolean;
  decision: string;
  policy_id: string | null;
  reason: string | null;
  stage: string;
  timestamp: string;
  user_message: string;
  policy_details: {
    name: string;
    description: string;
    restricted_keywords: string[];
  } | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocked: boolean;
  harnessLog?: HarnessLogEntry;
  timestamp: string;
}

export interface PolicyInfo {
  id: string;
  name: string;
  description: string;
  restricted_keywords: string[];
}

export interface PipelineStage {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "skipped" | "error";
  duration_ms: number | null;
}

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  logger: string;
  message: string;
  event: string | null;
  data: Record<string, unknown> | null;
}
