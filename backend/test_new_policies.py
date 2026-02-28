"""Test the two new Cedar policies via check_document()."""
import asyncio
from harness import check_document, DocumentOwner


async def main():
    print("=" * 60)
    print("Test 1: forbid-client-ai-opt-out")
    print("  Owner: OpenAI, allows_ai_processing=False")
    owner_opt_out = DocumentOwner(entity_id="OpenAI", allows_ai_processing=False)
    result = await check_document(
        text="This document contains general business information.",
        doc_id="test-doc.pdf",
        owner=owner_opt_out,
    )
    print(f"  allowed={result.allowed}, decision={result.decision}, policy_id={result.policy_id}")
    assert not result.allowed, "Should be DENIED (opt-out)"
    assert result.policy_id == "forbid-client-ai-opt-out"
    print("  PASS ✓")

    print()
    print("Test 2: Same content, owner allows AI processing")
    owner_ok = DocumentOwner(entity_id="Acme Corp", allows_ai_processing=True)
    result2 = await check_document(
        text="This document contains general business information.",
        doc_id="test-doc.pdf",
        owner=owner_ok,
    )
    print(f"  allowed={result2.allowed}, decision={result2.decision}, policy_id={result2.policy_id}")
    assert result2.allowed, "Should be ALLOWED"
    print("  PASS ✓")

    print()
    print("Test 3: forbid-sensitive-litigation-topics — RICO keyword")
    result3 = await check_document(
        text="The plaintiff alleges RICO violations and tortious interference by the defendant.",
        doc_id="legal-brief.pdf",
        owner=owner_ok,
    )
    print(f"  allowed={result3.allowed}, decision={result3.decision}, policy_id={result3.policy_id}")
    assert not result3.allowed, "Should be DENIED (RICO keyword)"
    assert result3.policy_id == "forbid-sensitive-litigation-topics"
    print("  PASS ✓")

    print()
    print("Test 4: forbid-sensitive-litigation-topics — implied covenant keyword")
    result4 = await check_document(
        text="Counsel argued breach of implied covenant of good faith and fair dealing.",
        doc_id="legal-brief.pdf",
        owner=owner_ok,
    )
    print(f"  allowed={result4.allowed}, decision={result4.decision}, policy_id={result4.policy_id}")
    assert not result4.allowed, "Should be DENIED (implied covenant)"
    assert result4.policy_id == "forbid-sensitive-litigation-topics"
    print("  PASS ✓")

    print()
    print("Test 5: Opt-out owner + litigation keyword — both would fire, opt-out wins")
    result5 = await check_document(
        text="The RICO claim involves unfair competition under UCL.",
        doc_id="legal-brief.pdf",
        owner=owner_opt_out,
    )
    print(f"  allowed={result5.allowed}, decision={result5.decision}, policy_id={result5.policy_id}")
    assert not result5.allowed, "Should be DENIED"
    print("  PASS ✓")

    print()
    print("Test 6: Clean document, allowed owner")
    result6 = await check_document(
        text="Quarterly earnings report for Q3 2024. Revenue grew 12% year over year.",
        doc_id="earnings.pdf",
        owner=owner_ok,
    )
    print(f"  allowed={result6.allowed}, decision={result6.decision}, policy_id={result6.policy_id}")
    assert result6.allowed, "Should be ALLOWED"
    print("  PASS ✓")

    print()
    print("All tests passed.")


asyncio.run(main())
