"""FastAPI server — chat endpoint with Sondera Harness policy enforcement.

Routes:
  POST /api/chat              — send a message, get back the LLM response + harness log
  GET  /api/chat/history      — inspect the current session's conversation memory
  DELETE /api/chat/clear      — clear the current session's conversation memory
  GET  /api/policies          — list all active Cedar policies
"""

import io
import os
import time
from contextlib import asynccontextmanager
from collections import OrderedDict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, trim_messages
from langchain_core.chat_history import InMemoryChatMessageHistory

from harness import (
    check_message,
    check_message_raw,
    check_document,
    DocumentOwner,
    LegalAnalysis,
    extract_legal_analysis,
    get_policies,
    get_policy_text,
    update_policies,
    reset_policies,
)

load_dotenv()

# ── LLM Configuration ────────────────────────────────────────────────────────

SUPPORTED_PROVIDERS = ["openai", "anthropic"]

_llm: BaseChatModel | None = None


def _get_llm_config() -> dict:
    """Read LLM settings from environment."""
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    api_key = os.getenv("LLM_API_KEY", "")
    temperature = float(os.getenv("LLM_TEMPERATURE", "0.7"))

    if not api_key or api_key == "your-api-key-here":
        raise RuntimeError(
            "LLM_API_KEY not set. Edit backend/.env and add your API key."
        )
    if provider not in SUPPORTED_PROVIDERS:
        raise RuntimeError(
            f"LLM_PROVIDER='{provider}' is not supported. "
            f"Choose one of: {', '.join(SUPPORTED_PROVIDERS)}"
        )
    return {"provider": provider, "model": model, "api_key": api_key, "temperature": temperature}


def _build_llm(cfg: dict) -> BaseChatModel:
    """Instantiate the LangChain chat model for the configured provider."""
    if cfg["provider"] == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=cfg["model"],
            temperature=cfg["temperature"],
            api_key=cfg["api_key"],
        )
    elif cfg["provider"] == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=cfg["model"],
            temperature=cfg["temperature"],
            api_key=cfg["api_key"],
        )
    raise RuntimeError(f"Unknown provider: {cfg['provider']}")


def _get_llm() -> BaseChatModel:
    global _llm
    if _llm is None:
        cfg = _get_llm_config()
        _llm = _build_llm(cfg)
    return _llm


# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-init harness on startup so first request is fast
    from harness import check_message as _warm
    await _warm("warmup")
    yield

app = FastAPI(title="CedarBot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "You are CedarBot, a helpful AI assistant. "
    "Answer the user's questions clearly and concisely. "
    "You have policy guardrails managed by Sondera Harness using Cedar policies. "
    "If a topic is restricted, you will be informed and should not attempt to answer it."
)


# ── Conversation Memory ──────────────────────────────────────────────────────

# Max turns kept in server-side memory per session (each turn = 1 human + 1 AI msg)
MEMORY_WINDOW = int(os.getenv("MEMORY_WINDOW", "20"))
# Max sessions held in memory (LRU eviction)
MAX_SESSIONS = int(os.getenv("MAX_SESSIONS", "100"))

# session_id -> InMemoryChatMessageHistory  (OrderedDict for LRU)
_sessions: OrderedDict[str, InMemoryChatMessageHistory] = OrderedDict()


def _get_session(session_id: str) -> InMemoryChatMessageHistory:
    """Return (or create) the chat history for a session, with LRU eviction."""
    if session_id in _sessions:
        _sessions.move_to_end(session_id)
        return _sessions[session_id]
    if len(_sessions) >= MAX_SESSIONS:
        _sessions.popitem(last=False)  # evict oldest
    history = InMemoryChatMessageHistory()
    _sessions[session_id] = history
    return history


def _build_messages_for_llm(
    history: InMemoryChatMessageHistory,
    new_user_message: str,
) -> list:
    """Assemble [SystemMessage] + trimmed history + current HumanMessage."""
    # Keep at most MEMORY_WINDOW * 2 messages (human + AI pairs)
    past = history.messages[-(MEMORY_WINDOW * 2):]
    return [SystemMessage(content=SYSTEM_PROMPT)] + past + [HumanMessage(content=new_user_message)]


# ── Request / Response Models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    conversation_history: list[dict[str, str]] = []  # kept for backward compat, ignored server-side


class HarnessLogEntry(BaseModel):
    allowed: bool
    decision: str
    policy_id: str | None = None
    reason: str | None = None
    stage: str
    timestamp: str
    user_message: str
    policy_details: dict | None = None


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class PipelineStage(BaseModel):
    id: str
    label: str
    status: str = "pending"   # pending | active | done | skipped | error
    duration_ms: float | None = None


class ChatResponse(BaseModel):
    reply: str
    blocked: bool
    harness_log: HarnessLogEntry
    token_usage: TokenUsage = TokenUsage()
    pipeline: list[PipelineStage] = []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Process a chat message through Sondera Harness, then LLM if allowed.

    Uses server-side per-session conversation memory so the LLM has full
    context of prior turns without the client needing to replay history.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # ── Pipeline stage tracking ──────────────────────────────────────────────
    stages = [
        PipelineStage(id="receive",  label="Receive"),
        PipelineStage(id="session",  label="Session"),
        PipelineStage(id="policy",   label="Policy Check"),
        PipelineStage(id="llm",      label="LLM Inference"),
        PipelineStage(id="memory",   label="Memory"),
        PipelineStage(id="complete", label="Complete"),
    ]
    stage_map = {s.id: s for s in stages}

    def mark(stage_id: str, status: str, t0: float | None = None) -> float:
        stage_map[stage_id].status = status
        now = time.perf_counter()
        if t0 is not None:
            stage_map[stage_id].duration_ms = round((now - t0) * 1000, 2)
        return now

    # Stage 1: Receive
    t = mark("receive", "done")
    t0_receive = t

    # Stage 2: Session
    t = mark("session", "active", None)
    session = _get_session(req.session_id)
    t = mark("session", "done", t)

    # Stage 3: Policy Check
    t = mark("policy", "active", None)
    harness_result = await check_message(req.message)
    log_entry = HarnessLogEntry(**harness_result.to_dict())
    t = mark("policy", "done", t)

    # If blocked → skip LLM + memory
    if not harness_result.allowed:
        mark("llm", "skipped")
        mark("memory", "skipped")
        mark("complete", "done", t0_receive)

        policy_name = "Unknown Policy"
        if harness_result.policy_id and harness_result.to_dict().get("policy_details"):
            policy_name = harness_result.to_dict()["policy_details"]["name"]

        blocked_reply = (
            f"⛔ **Request Blocked by Cedar Policy**\n\n"
            f"Your message was evaluated by the Sondera Harness and denied.\n\n"
            f"**Policy Violated:** `{harness_result.policy_id}`\n"
            f"**Policy Name:** {policy_name}\n"
            f"**Decision:** DENY\n"
            f"**Stage:** PRE_TOOL\n\n"
            f"This topic is restricted by the active Cedar policy set. "
            f"Please ask about a different topic."
        )
        return ChatResponse(
            reply=blocked_reply, blocked=True, harness_log=log_entry, pipeline=stages,
        )

    # Stage 4: LLM Inference
    t = mark("llm", "active", None)
    try:
        llm = _get_llm()
        messages = _build_messages_for_llm(session, req.message)
        response = await llm.ainvoke(messages)
        reply = str(response.content)
        t = mark("llm", "done", t)
    except Exception as e:
        t = mark("llm", "error", t)
        mark("memory", "skipped")
        mark("complete", "done", t0_receive)
        reply = f"Error communicating with LLM: {str(e)}"
        return ChatResponse(
            reply=reply, blocked=False, harness_log=log_entry, pipeline=stages,
        )

    # Extract token usage
    meta = getattr(response, "usage_metadata", None) or {}
    token_usage = TokenUsage(
        input_tokens=meta.get("input_tokens", 0),
        output_tokens=meta.get("output_tokens", 0),
        total_tokens=meta.get("total_tokens", 0),
    )

    # Stage 5: Memory
    t = mark("memory", "active", None)
    session.add_message(HumanMessage(content=req.message))
    session.add_message(AIMessage(content=reply))
    t = mark("memory", "done", t)

    # Stage 6: Complete
    mark("complete", "done", t0_receive)

    return ChatResponse(
        reply=reply, blocked=False, harness_log=log_entry,
        token_usage=token_usage, pipeline=stages,
    )


@app.get("/api/chat/history")
async def chat_history(session_id: str = Query(default="default")):
    """Return the stored conversation history for a session (for debugging)."""
    if session_id not in _sessions:
        return {"session_id": session_id, "turns": [], "total_messages": 0}
    history = _sessions[session_id]
    turns = [
        {"role": "human" if isinstance(m, HumanMessage) else "ai", "content": m.content}
        for m in history.messages
    ]
    return {"session_id": session_id, "turns": turns, "total_messages": len(turns)}


@app.delete("/api/chat/clear")
async def chat_clear(session_id: str = Query(default="default")):
    """Clear the conversation memory for a session."""
    if session_id in _sessions:
        _sessions[session_id].clear()
    return {"ok": True, "session_id": session_id, "message": "Conversation memory cleared"}


class PolicyUpdateRequest(BaseModel):
    policy_text: str


@app.get("/api/policies")
async def list_policies():
    """List all active Cedar policies with descriptions."""
    return {"policies": get_policies()}


@app.get("/api/policies/text")
async def get_policies_text():
    """Return the raw Cedar policy text currently in use."""
    return {"policy_text": get_policy_text()}


@app.post("/api/policies/update")
async def update_policies_endpoint(req: PolicyUpdateRequest):
    """Hot-reload Cedar policies from new policy text."""
    try:
        await update_policies(req.policy_text)
        return {"ok": True, "message": "Policies updated and harness reloaded"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/policies/validate")
async def validate_policies_endpoint(req: PolicyUpdateRequest):
    """Validate Cedar policy syntax without applying it to the harness.

    Returns ok=True if the policy set parses cleanly, or a structured error
    with line/column information when available.
    """
    try:
        from cedar import PolicySet
        PolicySet(req.policy_text)
        return {"ok": True, "message": "Policy syntax is valid"}
    except Exception as e:
        error_str = str(e)
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": error_str},
        )


@app.post("/api/policies/reset")
async def reset_policies_endpoint():
    """Reset Cedar policies back to the original defaults."""
    await reset_policies()
    return {"ok": True, "message": "Policies reset to defaults"}


def _extract_document_owner(reader: Any, full_text: str) -> DocumentOwner:
    """Derive the document owner from PDF metadata and text heuristics.

    Priority:
      1. /Author field in PDF metadata
      2. Well-known entity names found in the first 2000 chars of text
      3. Generic fallback (allows_ai_processing=True)

    The 'allows_ai_processing' flag is set to False for known entities that
    have explicitly opted out of AI processing (maintained as a config list).
    """
    AI_OPT_OUT_ENTITIES: set[str] = set(os.getenv("AI_OPT_OUT_ENTITIES", "").split(",")) - {""}

    # 1. PDF /Author metadata
    entity_id: str | None = None
    meta = reader.metadata or {}
    author = meta.get("/Author") or meta.get("Author")
    if author and str(author).strip():
        entity_id = str(author).strip()

    # 2. Heuristic scan of the first 2000 chars for known company names
    KNOWN_ENTITIES = [
        "OpenAI", "Anthropic", "Google", "Microsoft", "Apple", "Meta",
        "Amazon", "Comcast", "Pfizer", "SAP", "PwC", "PNC",
    ]
    if not entity_id:
        snippet = full_text[:2000]
        for name in KNOWN_ENTITIES:
            if name.lower() in snippet.lower():
                entity_id = name
                break

    # 3. Fallback
    if not entity_id:
        entity_id = "Unknown"

    allows_ai = entity_id not in AI_OPT_OUT_ENTITIES
    return DocumentOwner(entity_id=entity_id, allows_ai_processing=allows_ai)


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Parse a PDF, run every page through Cedar policies, return violations + full text.

    Each page is checked via check_document() which evaluates both:
    - Entity-level policies (forbid-client-ai-opt-out) via Document/LegalEntity resource
    - Context keyword policies (forbid-sensitive-litigation-topics, etc.) via parameters_json
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(status_code=500, detail="pypdf not installed")

    raw = await file.read()
    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse PDF: {e}")

    # Extract all text first so _extract_document_owner can scan it
    page_texts = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n\n".join(page_texts).strip()

    # Determine the document owner (drives forbid-client-ai-opt-out)
    owner = _extract_document_owner(reader, full_text)
    doc_id = file.filename

    pages: list[dict] = []
    all_violations: list[dict] = []
    llm = _get_llm()

    for page_num, page_text in enumerate(page_texts, start=1):
        # Step 1: LLM semantic analysis — extract structured legal concept flags
        legal_analysis: LegalAnalysis | None = None
        if page_text.strip():
            try:
                legal_analysis = await extract_legal_analysis(page_text, llm)
            except Exception:
                legal_analysis = None  # degrade gracefully; keyword fallback still runs

        # Step 2: Cedar adjudication — entity-level + semantic + keyword in one pass
        result = await check_document(
            page_text, doc_id=doc_id, owner=owner, legal_analysis=legal_analysis
        )

        la_dict: dict | None = None
        if legal_analysis is not None:
            la_dict = {
                "is_racketeering_related": legal_analysis.is_racketeering_related,
                "is_unfair_competition": legal_analysis.is_unfair_competition,
                "is_tortious_interference": legal_analysis.is_tortious_interference,
                "is_implied_covenant": legal_analysis.is_implied_covenant,
                "litigation_complexity": legal_analysis.litigation_complexity,
                "has_multi_party_claims": legal_analysis.has_multi_party_claims,
                "summary": legal_analysis.summary,
            }

        page_entry: dict = {
            "page": page_num,
            "text_preview": page_text[:300].replace("\n", " ").strip(),
            "allowed": result.allowed,
            "decision": result.decision,
            "policy_id": result.policy_id,
            "reason": result.reason,
            "policy_details": result.to_dict().get("policy_details"),
            "legal_analysis": la_dict,
        }
        pages.append(page_entry)

        if not result.allowed:
            all_violations.append({
                "page": page_num,
                "policy_id": result.policy_id,
                "reason": result.reason,
                "policy_details": result.to_dict().get("policy_details"),
                "text_preview": page_entry["text_preview"],
                "legal_analysis": la_dict,
            })

    total_pages = len(reader.pages)
    violated = len(all_violations) > 0

    return {
        "filename": file.filename,
        "total_pages": total_pages,
        "full_text": full_text,
        "violated": violated,
        "violations": all_violations,
        "pages": pages,
        "document_owner": {
            "entity_id": owner.entity_id,
            "allows_ai_processing": owner.allows_ai_processing,
        },
    }


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    """Return current LLM configuration (no secrets)."""
    provider = os.getenv("LLM_PROVIDER", "openai")
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    has_key = bool(os.getenv("LLM_API_KEY")) and os.getenv("LLM_API_KEY") != "your-api-key-here"
    return {"provider": provider, "model": model, "has_api_key": has_key}
