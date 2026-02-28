"""Test the full semantic pipeline: extract_legal_analysis -> check_document."""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from harness import check_document, DocumentOwner, LegalAnalysis, extract_legal_analysis


async def test_cedar_only():
    """Test check_document with manually constructed LegalAnalysis (no LLM needed)."""
    print("=" * 60)
    print("Test 1: forbid-semantic-racketeering via LegalAnalysis entity")
    la = LegalAnalysis(
        is_racketeering_related=True,
        is_unfair_competition=False,
        litigation_complexity="High",
        has_multi_party_claims=True,
        summary="Document involves racketeering claims.",
    )
    owner = DocumentOwner(entity_id="Acme Legal", allows_ai_processing=True)
    result = await check_document(
        text="General corporate document with no explicit keywords.",
        doc_id="test.pdf",
        owner=owner,
        legal_analysis=la,
    )
    print(f"  allowed={result.allowed}, policy_id={result.policy_id}")
    assert not result.allowed
    assert result.policy_id == "forbid-semantic-racketeering"
    print("  PASS ✓")

    print()
    print("Test 2: forbid-complex-litigation via LegalAnalysis entity")
    la2 = LegalAnalysis(
        is_racketeering_related=False,
        is_unfair_competition=False,
        litigation_complexity="High",
        has_multi_party_claims=True,
        summary="Complex multi-party dispute.",
    )
    result2 = await check_document(
        text="General corporate document with no explicit keywords.",
        doc_id="test.pdf",
        owner=owner,
        legal_analysis=la2,
    )
    print(f"  allowed={result2.allowed}, policy_id={result2.policy_id}")
    assert not result2.allowed
    assert result2.policy_id == "forbid-complex-litigation"
    print("  PASS ✓")

    print()
    print("Test 3: Clean document — no flags, Low complexity")
    la3 = LegalAnalysis(
        is_racketeering_related=False,
        is_unfair_competition=False,
        litigation_complexity="Low",
        has_multi_party_claims=False,
        summary="No significant legal risks detected.",
    )
    result3 = await check_document(
        text="Quarterly earnings report. Revenue grew 12%.",
        doc_id="earnings.pdf",
        owner=owner,
        legal_analysis=la3,
    )
    print(f"  allowed={result3.allowed}, policy_id={result3.policy_id}")
    assert result3.allowed
    print("  PASS ✓")

    print()
    print("Test 4: Semantic analysis takes precedence over keyword fallback being absent")
    la4 = LegalAnalysis(
        is_unfair_competition=True,
        litigation_complexity="Medium",
        summary="Document discusses unfair competition claims without using the exact phrase.",
    )
    # Text uses synonyms — the old keyword policy would miss this
    result4 = await check_document(
        text="The defendant engaged in predatory pricing and anticompetitive market practices.",
        doc_id="antitrust.pdf",
        owner=owner,
        legal_analysis=la4,
    )
    print(f"  allowed={result4.allowed}, policy_id={result4.policy_id}")
    assert not result4.allowed
    assert result4.policy_id == "forbid-semantic-racketeering"
    print("  PASS ✓ (caught by semantic flag, not keyword)")


async def test_llm_extraction():
    """Test extract_legal_analysis with a real LLM call."""
    provider = os.getenv("LLM_PROVIDER", "openai")
    api_key = os.getenv("LLM_API_KEY", "")
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    if not api_key or api_key == "your-api-key-here":
        print("\nSkipping LLM extraction test — no API key configured.")
        return

    print()
    print("=" * 60)
    print("Test 5: extract_legal_analysis — RICO/racketeering text")

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model=model, api_key=api_key, temperature=0)
    else:
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(model=model, api_key=api_key, temperature=0)

    text = (
        "The plaintiffs allege that defendants engaged in a pattern of racketeering activity "
        "in violation of RICO, including mail fraud and wire fraud. They further assert claims "
        "under California's UCL for unfair competition and tortious interference with existing "
        "contracts. The class action names twelve corporate defendants across three jurisdictions."
    )
    la = await extract_legal_analysis(text, llm)
    print(f"  is_racketeering_related={la.is_racketeering_related}")
    print(f"  is_unfair_competition={la.is_unfair_competition}")
    print(f"  is_tortious_interference={la.is_tortious_interference}")
    print(f"  litigation_complexity={la.litigation_complexity}")
    print(f"  has_multi_party_claims={la.has_multi_party_claims}")
    print(f"  summary={la.summary}")

    assert la.is_racketeering_related, "Should detect racketeering"
    assert la.is_unfair_competition, "Should detect UCL/unfair competition"
    assert la.litigation_complexity in ("High", "Medium")
    print("  PASS ✓")

    print()
    print("Test 6: extract_legal_analysis — clean earnings text")
    clean_text = "Revenue increased 12% year over year to $4.2 billion. Operating margins improved."
    la2 = await extract_legal_analysis(clean_text, llm)
    print(f"  is_racketeering_related={la2.is_racketeering_related}")
    print(f"  litigation_complexity={la2.litigation_complexity}")
    print(f"  summary={la2.summary}")
    assert not la2.is_racketeering_related
    print("  PASS ✓")


async def main():
    await test_cedar_only()
    await test_llm_extraction()
    print()
    print("All tests passed.")


asyncio.run(main())
