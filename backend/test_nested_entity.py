"""Test whether cedar-python supports nested record attributes on entities."""
from cedar import Authorizer, Entity, EntityUid, Context, Request, PolicySet

# Try: Document with a nested record attribute for legal_analysis
doc_uid = EntityUid("Cedar_Bot::Document", "test-doc")
try:
    doc_entity = Entity(doc_uid, {
        "legal_analysis": {
            "is_racketeering_related": True,
            "is_unfair_competition": False,
            "litigation_complexity": "High",
        }
    })
    print("Nested record entity created OK")
except Exception as e:
    print(f"Nested record FAILED: {type(e).__name__}: {e}")

# Try: flat boolean attrs on Document
try:
    doc_entity2 = Entity(doc_uid, {
        "is_racketeering_related": True,
        "is_unfair_competition": False,
        "litigation_complexity": "High",
    })
    print("Flat attrs entity created OK")

    # Now test a policy that reads these flat attrs
    policy = """
permit(principal, action, resource);
forbid(principal, action, resource)
when {
  resource has is_racketeering_related &&
  resource.is_racketeering_related == true
};
"""
    ps = PolicySet(policy)
    auth = Authorizer()
    auth.upsert_entity(doc_entity2)

    req = Request(
        principal=EntityUid("Cedar_Bot::Agent", "cedar-bot"),
        action=EntityUid("Cedar_Bot::Action", "Respond"),
        resource=doc_uid,
        context=Context({}),
    )
    resp = auth.is_authorized(req, ps)
    print(f"Flat attr policy decision: {resp.decision}")
except Exception as e:
    print(f"Flat attrs FAILED: {type(e).__name__}: {e}")

# Try: LegalAnalysis as a separate entity, Document.legal_analysis points to it
try:
    la_uid = EntityUid("Cedar_Bot::LegalAnalysis", "test-doc-analysis")
    la_entity = Entity(la_uid, {
        "is_racketeering_related": True,
        "is_unfair_competition": False,
        "litigation_complexity": "High",
    })
    doc_entity3 = Entity(doc_uid, {"legal_analysis": la_uid})

    policy2 = """
permit(principal, action, resource);
forbid(principal, action, resource)
when {
  resource has legal_analysis &&
  resource.legal_analysis.is_racketeering_related == true
};
"""
    ps2 = PolicySet(policy2)
    auth2 = Authorizer()
    auth2.upsert_entity(la_entity)
    auth2.upsert_entity(doc_entity3)

    req2 = Request(
        principal=EntityUid("Cedar_Bot::Agent", "cedar-bot"),
        action=EntityUid("Cedar_Bot::Action", "Respond"),
        resource=doc_uid,
        context=Context({}),
    )
    resp2 = auth2.is_authorized(req2, ps2)
    print(f"EntityUid-linked LegalAnalysis policy decision: {resp2.decision}")
except Exception as e:
    print(f"EntityUid-linked approach FAILED: {type(e).__name__}: {e}")
