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
