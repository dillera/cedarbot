# CedarBot

An AI chatbot demo that enforces **Cedar access policies** on every message and document using the **Sondera Harness SDK**. It combines LangChain + OpenAI/Anthropic for conversation with real-time Cedar policy adjudication — both for chat messages and uploaded PDF documents.

When a restricted topic is detected, the Cedar policy engine blocks the request before it ever reaches the LLM, and the UI displays exactly which policy fired and why.

---

## Features

### Chat
- **Real-time Cedar policy enforcement** on every message via Sondera CedarPolicyHarness
- **Multi-provider LLM support** — OpenAI and Anthropic via LangChain
- **Server-side conversation memory** with per-session history and LRU eviction
- **Live process meter** — horizontal pipeline indicator showing each backend stage (Receive → Session → Policy Check → LLM Inference → Memory → Complete) with real millisecond timing
- **Harness log panel** — every policy decision displayed with ALLOW/DENY, policy name, and restricted keywords
- **Token usage tracking** — per-call and cumulative session totals
- **Blocked message display** — policy violation details surfaced directly in the chat

### PDF Analysis
- **Drag-and-drop or attach PDF** directly in the chat interface
- **Per-page Cedar policy scanning** — each page evaluated independently
- **LLM semantic analysis** — structured legal concept extraction per page using a prompted LLM call, outputting boolean flags (`is_racketeering_related`, `is_unfair_competition`, etc.)
- **Three-layer document policy evaluation**:
  1. Entity-level opt-out (`forbid-client-ai-opt-out`) — checks document owner's AI processing consent
  2. Semantic flags (`forbid-semantic-racketeering`, `forbid-complex-litigation`) — evaluated against LLM-extracted `LegalAnalysis` entity attributes
  3. Keyword fallback (`forbid-sensitive-litigation-topics`, etc.) — catches explicit high-risk terms
- **Document owner detection** from PDF metadata and heuristic text scan
- **PDF violation report** — per-page breakdown with legal analysis flags, policy matches, and text previews
- **PDF as chat context** — load the full document text into the chat session for follow-up questions
- **Live process meter for PDF scanning** — Upload → Parse PDF → Extract Text → Identify Owner → Semantic Analysis → Policy Check → Complete with real timing

### Policy Editor
- **Per-policy edit interface** — each Cedar policy displayed in its own collapsible section
- **Enable/disable toggles** — uncheck a policy to remove it from the active Cedar set
- **Inline editing** with syntax-highlighted textarea
- **Cedar syntax validation** — backend lints the policy text via `cedar.PolicySet` before saving
- **Hot-reload** — policy changes apply immediately without restarting the server
- **Reset to defaults** button to restore all original policies
- **Live sync** to the chat page — active policy count updates the moment changes are applied

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js Frontend (localhost:3000)                      │
│                                                         │
│  /            Chat page + Process Meter + Harness Panel │
│  /policies    Per-policy editor with enable/disable     │
│  /api/*       Proxy routes → FastAPI backend            │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼─────────────────────────────────┐
│  FastAPI Backend (localhost:8000)                       │
│                                                         │
│  POST /api/chat            Chat message pipeline        │
│  POST /api/upload-pdf      PDF scan pipeline            │
│  GET  /api/policies        List active policies         │
│  GET  /api/policies/text   Raw Cedar policy text        │
│  POST /api/policies/update Hot-reload new policy text   │
│  POST /api/policies/validate Lint Cedar syntax          │
│  POST /api/policies/reset  Restore defaults             │
│  GET  /api/chat/history    Session conversation log     │
│  DELETE /api/chat/clear    Clear session memory         │
│  GET  /api/config          LLM provider/model info      │
└───────────────────────┬─────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
┌────────▼────────┐         ┌──────────▼────────┐
│ Sondera Harness │         │  LangChain + LLM  │
│ Cedar Policies  │         │  (OpenAI/Anthropic)│
│ (local eval)    │         └───────────────────┘
└─────────────────┘
```

### Chat Message Pipeline
```
Receive → Session → Policy Check → LLM Inference → Memory → Complete
                         │
                    DENY: skip LLM + Memory, return policy violation
```

### PDF Scan Pipeline
```
Upload → Parse PDF → Extract Text → Identify Owner
      → Semantic Analysis (LLM per page)
      → Policy Check (Cedar per page)
      → Complete
```

---

## Cedar Policies

### Chat / Topic Restriction Policies

| Policy ID | Blocks |
|-----------|--------|
| `allow-general-prompts` | Permit rule — allows all general prompts |
| `allow-respond` | Permit rule — allows the Respond action |
| `forbid-weapons-topic` | Weapons, explosives, firearms, ammunition |
| `forbid-illegal-drugs-topic` | Illegal drugs, drug manufacturing, drug recipes |
| `forbid-hacking-topic` | Hacking, SQL injection, ransomware, exploits |
| `forbid-financial-fraud-topic` | Money laundering, identity theft, tax evasion |
| `forbid-malware-topic` | Malware, viruses, trojans, rootkits, botnets |
| `forbid-philly-top10-client-data` | Client data for top 10 Philadelphia-area tech firms |
| `rate-limit-trajectory` | Blocks after 100 trajectory steps |

### Document / Legal Compliance Policies

| Policy ID | Mechanism | Blocks |
|-----------|-----------|--------|
| `forbid-client-ai-opt-out` | Entity attribute | Documents whose owner has `allows_ai_processing == false` |
| `forbid-semantic-racketeering` | LLM semantic flags | Documents where LLM detected RICO / unfair competition concepts |
| `forbid-complex-litigation` | LLM semantic flags | High-complexity multi-party litigation documents |
| `forbid-sensitive-litigation-topics` | Keyword fallback | RICO, Racketeer, tortious interference, implied covenant, UCL |

All policies are defined in `backend/policies.py` and can be edited live in the `/policies` UI.

---

## Prerequisites

- **Python 3.12+**
- **Node.js 18+**
- **OpenAI** or **Anthropic** API key

---

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Edit `backend/.env`:

```env
LLM_PROVIDER=openai           # or: anthropic
LLM_MODEL=gpt-4o-mini         # or: gpt-4o, claude-3-5-sonnet-20241022, etc.
LLM_API_KEY=sk-your-key-here
LLM_TEMPERATURE=0.7

# Optional: comma-separated entity names that have opted out of AI processing
# AI_OPT_OUT_ENTITIES=Acme Corp,Example LLC

# Optional: session memory settings
# MEMORY_WINDOW=20
# MAX_SESSIONS=100
```

```bash
uvicorn server:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

---

## Project Structure

```
cedarBot/
├── backend/
│   ├── server.py               # FastAPI app — all API endpoints
│   ├── harness.py              # Sondera CedarPolicyHarness wrapper, check_message(),
│   │                           #   check_document(), extract_legal_analysis(),
│   │                           #   get_policies(), update_policies()
│   ├── policies.py             # Cedar policy text (CEDAR_POLICIES) + POLICY_DESCRIPTIONS
│   ├── requirements.txt
│   ├── .env.example
│   ├── test_policy_toggles.py  # Integration tests: policy enable/disable
│   ├── test_semantic_pipeline.py # Tests: LLM extraction + Cedar evaluation
│   ├── test_harness.py
│   ├── test_cedar_entities.py
│   └── test_new_policies.py
│
└── frontend/
    └── src/app/
        ├── page.tsx                        # Chat page
        ├── types.ts                        # Shared TypeScript interfaces
        ├── policies/page.tsx               # Policy editor page
        ├── components/
        │   ├── ProcessMeter.tsx            # Live pipeline stage indicator
        │   ├── HarnessPanel.tsx            # Policy decision log panel
        │   ├── ChatMessage.tsx             # Individual message component
        │   └── PdfViolationReport.tsx      # PDF scan results component
        └── api/
            ├── chat/route.ts
            ├── policies/route.ts
            ├── policies/text/route.ts
            ├── policies/update/route.ts
            ├── policies/validate/route.ts
            ├── policies/reset/route.ts
            └── upload-pdf/route.ts
```

---

## Running Tests

```bash
cd backend
source venv/bin/activate

# Policy toggle integration tests (no LLM required)
python test_policy_toggles.py

# Semantic pipeline tests (requires LLM_API_KEY in .env)
python test_semantic_pipeline.py

# Cedar entity tests
python test_cedar_entities.py
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React, Tailwind CSS, Lucide Icons, React Markdown |
| **Backend** | Python 3.12, FastAPI, Uvicorn |
| **LLM** | LangChain, OpenAI (`gpt-4o-mini` default) or Anthropic |
| **Policy Engine** | Cedar via [Sondera Harness SDK](https://sondera.ai) (local evaluation, no remote API) |
| **PDF Parsing** | pypdf |
