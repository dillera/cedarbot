# CedarBot — AI Chat with Sondera Harness Policy Guardrails

A chatbot demo that uses **LangChain + OpenAI** for conversations and **Sondera Harness** with **Cedar policies** to enforce topic restrictions. When a user asks about a restricted topic, the Cedar policy engine blocks the request and the UI shows exactly which policy caused the denial.

## Architecture

```
┌──────────────────┐       ┌──────────────────────────────────────┐
│   Next.js UI     │──────▶│  FastAPI Backend                     │
│  (Chat + Harness │◀──────│                                      │
│   Log Panel)     │       │  1. User message arrives              │
└──────────────────┘       │  2. Sondera CedarPolicyHarness checks │
                           │     message against Cedar policies    │
                           │  3a. ALLOW → LangChain + OpenAI reply │
                           │  3b. DENY  → Return policy violation  │
                           └──────────────────────────────────────┘
```

## Restricted Topics (Cedar Policies)

| Policy ID                    | Blocks                                          |
|------------------------------|------------------------------------------------|
| `forbid-weapons-topic`       | Weapons, explosives, firearms, ammunition       |
| `forbid-illegal-drugs-topic` | Illegal drugs, drug manufacturing               |
| `forbid-hacking-topic`       | Hacking, exploits, cyberattacks                 |
| `forbid-financial-fraud-topic`| Money laundering, identity theft, fraud         |
| `forbid-malware-topic`       | Malware, viruses, trojans, botnets              |

## Prerequisites

- **Python 3.12+**
- **Node.js 18+**
- **OpenAI API Key**

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure your LLM provider and API key
cp .env.example .env
# Edit .env and set:
#   LLM_PROVIDER=openai        (or anthropic)
#   LLM_MODEL=gpt-4o-mini      (or gpt-4o, claude-3-5-sonnet-20241022, etc.)
#   LLM_API_KEY=sk-your-key
#   LLM_TEMPERATURE=0.7

# Start the server
uvicorn server:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## How It Works

1. **User sends a message** via the chat UI
2. **Sondera CedarPolicyHarness** evaluates the message against Cedar policies locally (no remote API needed)
3. If **ALLOW**: the message is sent to OpenAI via LangChain and the response is returned
4. If **DENY**: the response includes which Cedar policy was violated, and the UI shows the policy details
5. The **Harness Panel** on the right shows all policy checks in real-time with ALLOW/DENY decisions

## Tech Stack

- **Backend**: Python, FastAPI, LangChain, OpenAI, Sondera Harness SDK
- **Frontend**: Next.js, Tailwind CSS, Lucide Icons, React Markdown
- **Policy Engine**: Cedar (via Sondera CedarPolicyHarness — local evaluation)
