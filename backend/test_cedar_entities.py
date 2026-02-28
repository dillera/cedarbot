"""Probe cedar-python entity + request API."""
from cedar import Authorizer, Entity, EntityUid, Context, Request, PolicySet

legal_uid = EntityUid("Cedar_Bot::LegalEntity", "OpenAI")
legal_entity = Entity(legal_uid, {"allows_ai_processing": False})

doc_uid = EntityUid("Cedar_Bot::Document", "doc-001")
doc_entity = Entity(doc_uid, {"owner": legal_uid, "classification": "confidential"})

policy = """
permit(principal, action, resource);
forbid(principal, action, resource)
when { resource has owner && resource.owner.allows_ai_processing == false };
"""
ps = PolicySet(policy)
auth = Authorizer()
auth.upsert_entity(legal_entity)
auth.upsert_entity(doc_entity)

agent_uid = EntityUid("Cedar_Bot::Agent", "cedar-bot")
action_uid = EntityUid("Cedar_Bot::Action", "Respond")

req = Request(
    principal=agent_uid,
    action=action_uid,
    resource=doc_uid,
    context=Context({}),
)
resp = auth.is_authorized(req, ps)
print("Decision:", resp.decision)
print("Errors:", resp.errors if hasattr(resp, "errors") else "n/a")
