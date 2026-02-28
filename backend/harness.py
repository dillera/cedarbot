"""Sondera Harness wrapper module.

Encapsulates all Sondera CedarPolicyHarness logic behind a clean interface.
The rest of the app only calls check_message() and get_policies().
"""

import json
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sondera import (
    Agent,
    CedarPolicyHarness,
    Decision,
    PromptContent,
    Role,
    Stage,
    Tool,
    ToolRequestContent,
)
from sondera.harness.cedar.schema import agent_to_cedar_schema

from policies import CEDAR_POLICIES, POLICY_DESCRIPTIONS


# ── Document Owner Metadata ───────────────────────────────────────────────────

@dataclass
class DocumentOwner:
    """Metadata about the legal entity that owns a document.

    Populated from PDF metadata or heuristics by the upload endpoint.
    Passed to check_document() so Cedar can evaluate forbid-client-ai-opt-out.
    """
    entity_id: str                  # e.g. "OpenAI", "Acme Corp"
    allows_ai_processing: bool = True
    extra_attributes: dict = field(default_factory=dict)


# ── Semantic Legal Analysis ───────────────────────────────────────────────────

@dataclass
class LegalAnalysis:
    """Structured legal concepts extracted from document text by an LLM.

    These are deterministic boolean/string flags that Cedar policies evaluate
    directly — no fuzzy keyword matching inside the policy engine.

    Fields map 1-to-1 to Cedar entity attributes on LegalAnalysis::"<doc_id>".
    """
    is_racketeering_related: bool = False   # RICO, organized crime, racketeering
    is_unfair_competition: bool = False     # UCL, unfair competition, trade practices
    is_tortious_interference: bool = False  # tortious interference with contract
    is_implied_covenant: bool = False       # breach of implied covenant of good faith
    litigation_complexity: str = "Low"     # "Low" | "Medium" | "High"
    has_multi_party_claims: bool = False    # multiple plaintiffs/defendants
    summary: str = ""                       # short LLM-generated summary of findings


_LEGAL_ANALYSIS_PROMPT = """\
You are a legal document risk classifier. Analyze the following document text and \
identify whether specific high-risk legal concepts are present.

Respond with ONLY a valid JSON object — no markdown, no explanation. Use this exact schema:
{{
  "is_racketeering_related": <true|false>,
  "is_unfair_competition": <true|false>,
  "is_tortious_interference": <true|false>,
  "is_implied_covenant": <true|false>,
  "litigation_complexity": "<Low|Medium|High>",
  "has_multi_party_claims": <true|false>,
  "summary": "<one sentence summary of detected legal risks, or 'No significant legal risks detected.'>"
}}

Definitions:
- is_racketeering_related: true if the text discusses RICO, racketeering, organized crime, \
Racketeer Influenced and Corrupt Organizations, or criminal enterprise patterns.
- is_unfair_competition: true if the text involves UCL claims, unfair business practices, \
trade secret theft, or unfair competition statutes.
- is_tortious_interference: true if the text involves intentional interference with \
contractual or business relations.
- is_implied_covenant: true if the text involves breach of implied covenant of good faith \
and fair dealing.
- litigation_complexity: "High" if multiple parties, multiple claims, or class action; \
"Medium" if complex single-party dispute; "Low" otherwise.
- has_multi_party_claims: true if there are multiple named plaintiffs or defendants.

Document text:
{text}
"""


async def extract_legal_analysis(text: str, llm: Any) -> LegalAnalysis:
    """Use the configured LLM to extract structured legal concepts from document text.

    The LLM is prompted to return a strict JSON object. Malformed responses fall back
    to a safe all-false LegalAnalysis so policy evaluation is never blocked by LLM errors.

    Args:
        text: The document text to analyze (will be truncated to 8000 chars).
        llm:  A LangChain BaseChatModel instance (passed in to avoid circular imports).

    Returns:
        LegalAnalysis with structured boolean/string attributes.
    """
    from langchain_core.messages import HumanMessage as _HumanMessage

    truncated = text[:8000]
    prompt = _LEGAL_ANALYSIS_PROMPT.format(text=truncated)

    try:
        response = await llm.ainvoke([_HumanMessage(content=prompt)])
        raw = str(response.content).strip()

        # Strip markdown code fences if the model adds them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)
        return LegalAnalysis(
            is_racketeering_related=bool(data.get("is_racketeering_related", False)),
            is_unfair_competition=bool(data.get("is_unfair_competition", False)),
            is_tortious_interference=bool(data.get("is_tortious_interference", False)),
            is_implied_covenant=bool(data.get("is_implied_covenant", False)),
            litigation_complexity=str(data.get("litigation_complexity", "Low")),
            has_multi_party_claims=bool(data.get("has_multi_party_claims", False)),
            summary=str(data.get("summary", "")),
        )
    except Exception as e:
        return LegalAnalysis(summary=f"Analysis unavailable: {e}")


# ── Agent Definition ─────────────────────────────────────────────────────────

def _build_agent() -> Agent:
    """Define the chatbot agent and its single tool for Sondera."""
    return Agent(
        id="cedar-bot",
        provider_id="local",
        name="Cedar_Bot",
        description="A chatbot with Cedar policy guardrails via Sondera Harness",
        instruction="You are a helpful assistant. Answer questions on allowed topics.",
        tools=[
            Tool(
                name="Respond",
                description="Generate a response to the user's message",
                parameters=[],
                parameters_json_schema=json.dumps({
                    "type": "object",
                    "properties": {
                        "user_message": {"type": "string"},
                        "response": {"type": "string"},
                    },
                    "required": ["user_message"],
                }),
            ),
        ],
    )


# ── Document Check via cedar-python Authorizer ───────────────────────────────

def _make_doc_authorizer() -> Any:
    """Build a fresh cedar-python Authorizer for document policy checks.

    Uses the raw PolicySet directly — bypasses the Sondera harness wrapper
    so we can set an arbitrary Document entity as the resource with an
    owner attribute pointing to a LegalEntity.
    """
    from cedar import Authorizer
    return Authorizer()


async def check_document(
    text: str,
    doc_id: str,
    owner: DocumentOwner,
    legal_analysis: LegalAnalysis | None = None,
) -> "HarnessResult":
    """Evaluate Cedar policies against a document with a specific owner entity.

    Three policy layers are evaluated in a single pass:
    1. Entity-level opt-out  (forbid-client-ai-opt-out)       via owner.allows_ai_processing
    2. Semantic legal flags  (forbid-semantic-racketeering,
                              forbid-complex-litigation)       via LegalAnalysis entity attrs
    3. Keyword fallback      (forbid-sensitive-litigation-*)   via context.parameters_json

    Args:
        text:           Full document text (keyword fallback via parameters_json).
        doc_id:         Stable identifier for this document (e.g. filename).
        owner:          The legal entity that owns the document.
        legal_analysis: Optional pre-computed semantic attributes from extract_legal_analysis().
                        When None, semantic policies are skipped (no false positives).

    Returns:
        HarnessResult with allowed/denied decision and matched policy_id.
    """
    from cedar import Authorizer, Entity, EntityUid, Context, Request, PolicySet

    timestamp = datetime.now(timezone.utc).isoformat()
    namespace = "Cedar_Bot"

    # ── Build entity graph ────────────────────────────────────────────────────

    # LegalEntity: owns the document, carries allows_ai_processing
    legal_uid = EntityUid(f"{namespace}::LegalEntity", owner.entity_id)
    legal_attrs: dict[str, Any] = {
        "allows_ai_processing": owner.allows_ai_processing,
        **owner.extra_attributes,
    }
    legal_entity = Entity(legal_uid, legal_attrs)

    # Document: linked to owner; optionally linked to a LegalAnalysis entity
    doc_attrs: dict[str, Any] = {"owner": legal_uid}

    analysis_entity: Any | None = None
    if legal_analysis is not None:
        la_uid = EntityUid(f"{namespace}::LegalAnalysis", doc_id)
        la_attrs: dict[str, Any] = {
            "is_racketeering_related": legal_analysis.is_racketeering_related,
            "is_unfair_competition": legal_analysis.is_unfair_competition,
            "is_tortious_interference": legal_analysis.is_tortious_interference,
            "is_implied_covenant": legal_analysis.is_implied_covenant,
            "litigation_complexity": legal_analysis.litigation_complexity,
            "has_multi_party_claims": legal_analysis.has_multi_party_claims,
        }
        analysis_entity = Entity(la_uid, la_attrs)
        doc_attrs["legal_analysis"] = la_uid

    doc_uid = EntityUid(f"{namespace}::Document", doc_id)
    doc_entity = Entity(doc_uid, doc_attrs)

    # Agent + action UIDs matching the Sondera namespace
    agent_uid = EntityUid(f"{namespace}::Agent", "cedar-bot")
    action_uid = EntityUid(f"{namespace}::Action", "Respond")

    # Context carries parameters_json so keyword-based policies fire too
    context_data = {"parameters_json": json.dumps({"user_message": text})}

    # ── Adjudicate ────────────────────────────────────────────────────────────

    ps = PolicySet(_current_policy_text)
    auth = _make_doc_authorizer()
    auth.upsert_entity(legal_entity)
    if analysis_entity is not None:
        auth.upsert_entity(analysis_entity)
    auth.upsert_entity(doc_entity)

    req = Request(
        principal=agent_uid,
        action=action_uid,
        resource=doc_uid,
        context=Context(context_data),
    )

    resp = auth.is_authorized(req, ps)
    allowed = str(resp.decision).upper() == "ALLOW"

    policy_id = None
    reason = None

    if not allowed:
        reason_str = str(getattr(resp, "reasons", "") or getattr(resp, "reason", "") or "")
        errors_str = str(getattr(resp, "errors", "") or "")
        combined = reason_str + errors_str

        for pid in POLICY_DESCRIPTIONS:
            if pid in combined:
                policy_id = pid
                break

        if not policy_id:
            # Fallback priority: opt-out → semantic flags → keyword match
            if not owner.allows_ai_processing:
                policy_id = "forbid-client-ai-opt-out"
            elif legal_analysis and (
                legal_analysis.is_racketeering_related or legal_analysis.is_unfair_competition
            ):
                policy_id = "forbid-semantic-racketeering"
            elif legal_analysis and (
                legal_analysis.litigation_complexity == "High"
            ):
                policy_id = "forbid-complex-litigation"
            else:
                policy_id = _match_policy_by_content(text)

        reason = f"Denied by policy: [{policy_id}]" if policy_id else "Policy violation detected"

    return HarnessResult(
        allowed=allowed,
        decision="ALLOW" if allowed else "DENY",
        policy_id=policy_id,
        reason=reason,
        stage="PRE_TOOL",
        timestamp=timestamp,
        user_message=text[:200],
    )


# ── Harness Singleton ─────────────────────────────────────────────────────────

_agent: Agent = _build_agent()
_schema = agent_to_cedar_schema(_agent)
_harness: CedarPolicyHarness | None = None
_harness_lock = asyncio.Lock()
_current_policy_text: str = CEDAR_POLICIES


async def _get_harness() -> CedarPolicyHarness:
    """Lazy-initialize the CedarPolicyHarness (thread-safe)."""
    global _harness
    if _harness is None:
        async with _harness_lock:
            if _harness is None:
                from cedar import PolicySet
                policy_set = PolicySet(_current_policy_text)
                _harness = CedarPolicyHarness(
                    policy_set=policy_set,
                    schema=_schema,
                )
                await _harness.initialize(agent=_agent)
    return _harness


# ── Public Interface ─────────────────────────────────────────────────────────

class HarnessResult:
    """Result of a policy check against a user message."""

    def __init__(
        self,
        allowed: bool,
        decision: str,
        policy_id: str | None,
        reason: str | None,
        stage: str,
        timestamp: str,
        user_message: str,
    ):
        self.allowed = allowed
        self.decision = decision
        self.policy_id = policy_id
        self.reason = reason
        self.stage = stage
        self.timestamp = timestamp
        self.user_message = user_message

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "decision": self.decision,
            "policy_id": self.policy_id,
            "reason": self.reason,
            "stage": self.stage,
            "timestamp": self.timestamp,
            "user_message": self.user_message,
            "policy_details": POLICY_DESCRIPTIONS.get(self.policy_id) if self.policy_id else None,
        }


async def _adjudicate(text: str, label: str) -> HarnessResult:
    """Shared adjudication logic — runs text through Sondera Harness.

    Args:
        text:  The content to evaluate against Cedar policies.
        label: The value stored in HarnessResult.user_message (used for display).
    """
    harness = await _get_harness()
    timestamp = datetime.now(timezone.utc).isoformat()

    result = await harness.adjudicate(
        Stage.PRE_TOOL,
        Role.MODEL,
        ToolRequestContent(
            tool_id="Respond",
            args={"user_message": text},
        ),
    )

    allowed = result.decision == Decision.ALLOW
    policy_id = None
    reason = None

    if not allowed:
        reason = result.reason if hasattr(result, "reason") and result.reason else "Policy violation detected"
        if hasattr(result, "diagnostics") and result.diagnostics:
            policy_id = _extract_policy_id(result.diagnostics)
        elif hasattr(result, "reason") and result.reason:
            policy_id = _extract_policy_id_from_reason(result.reason)
        if not policy_id:
            policy_id = _match_policy_by_content(text)

    return HarnessResult(
        allowed=allowed,
        decision="ALLOW" if allowed else "DENY",
        policy_id=policy_id,
        reason=reason,
        stage="PRE_TOOL",
        timestamp=timestamp,
        user_message=label,
    )


async def check_message_raw(text: str) -> HarnessResult:
    """Check arbitrary text (e.g. a PDF page) against Cedar policies."""
    return await _adjudicate(text, label=text)


async def check_message(user_message: str) -> HarnessResult:
    """Check a user chat message against Cedar policies via Sondera Harness."""
    return await _adjudicate(user_message, label=user_message)



def _active_policy_ids() -> list[str]:
    """Return the @id values that are present in the currently loaded policy text."""
    import re
    return re.findall(r'@id\("([^"]+)"\)', _current_policy_text)


def get_policies() -> list[dict[str, Any]]:
    """Return descriptions for policies that are actually loaded in the harness.

    This reflects the live state — if a policy was toggled off and Apply was
    clicked, it will not appear here.
    """
    active = _active_policy_ids()
    result = []
    for pid in active:
        if pid in POLICY_DESCRIPTIONS:
            result.append({"id": pid, **POLICY_DESCRIPTIONS[pid]})
        else:
            result.append({
                "id": pid,
                "name": pid,
                "description": "Custom policy (no description registered)",
                "restricted_keywords": [],
            })
    return result


def get_policy_text() -> str:
    """Return the raw Cedar policy text currently loaded."""
    return _current_policy_text


async def update_policies(new_policy_text: str) -> None:
    """Hot-reload the harness with new Cedar policy text.

    Validates the policy set by constructing it (cedar-python raises on parse
    errors), then replaces the harness singleton.
    """
    global _harness, _current_policy_text
    from cedar import PolicySet
    policy_set = PolicySet(new_policy_text)  # raises on invalid Cedar
    new_harness = CedarPolicyHarness(policy_set=policy_set, schema=_schema)
    await new_harness.initialize(agent=_agent)
    async with _harness_lock:
        _harness = new_harness
        _current_policy_text = new_policy_text


async def reset_policies() -> None:
    """Reset the harness to the original default Cedar policies."""
    await update_policies(CEDAR_POLICIES)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_policy_id(diagnostics: Any) -> str | None:
    """Try to pull the policy ID from adjudication diagnostics (active only)."""
    diag_str = str(diagnostics)
    for pid in _active_policy_ids():
        if pid in diag_str:
            return pid
    return None


def _extract_policy_id_from_reason(reason: str) -> str | None:
    """Try to pull the policy ID from the reason string (active only)."""
    for pid in _active_policy_ids():
        if pid in reason:
            return pid
    return None


def _match_policy_by_content(message: str) -> str | None:
    """Fallback: match the message against keywords of active policies only."""
    msg_lower = message.lower()
    for pid in _active_policy_ids():
        details = POLICY_DESCRIPTIONS.get(pid, {})
        for kw in details.get("restricted_keywords", []):
            if kw.lower() in msg_lower:
                return pid
    return None
