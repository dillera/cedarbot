"""Integration tests: policy enable/disable toggles work end-to-end.

Tests verify:
1. get_policies() reflects only the loaded policy IDs, not POLICY_DESCRIPTIONS
2. Disabling a policy via update_policies() allows previously-blocked messages
3. Re-enabling the policy re-blocks the message
4. GET /api/policies (via harness) returns the correct count after toggle
5. _match_policy_by_content only matches active policies
"""
import asyncio
import re

# ── helpers ──────────────────────────────────────────────────────────────────

def policy_ids_from_text(text: str) -> set[str]:
    return set(re.findall(r'@id\("([^"]+)"\)', text))


def strip_policy(text: str, policy_id: str) -> str:
    """Remove a single policy block (from its @id line to closing semicolon)."""
    lines = text.split("\n")
    out, inside, depth = [], False, 0
    for line in lines:
        if f'@id("{policy_id}")' in line:
            inside = True
        if inside:
            depth += line.count("{") - line.count("}")
            if line.strip().endswith("};") and depth <= 0:
                inside = False
            continue
        out.append(line)
    return "\n".join(out)


# ── tests ────────────────────────────────────────────────────────────────────

async def test_get_policies_reflects_loaded_text():
    """get_policies() must only return IDs present in _current_policy_text."""
    from harness import get_policies, update_policies, reset_policies
    from policies import CEDAR_POLICIES

    await reset_policies()

    all_ids = policy_ids_from_text(CEDAR_POLICIES)
    active = {p["id"] for p in get_policies()}
    assert active == all_ids, f"Expected {all_ids}, got {active}"
    print("PASS  get_policies() matches full policy text after reset")

    # Disable forbid-weapons-topic by stripping it from the text
    reduced = strip_policy(CEDAR_POLICIES, "forbid-weapons-topic")
    await update_policies(reduced)

    active_after = {p["id"] for p in get_policies()}
    assert "forbid-weapons-topic" not in active_after, "forbid-weapons-topic should be absent"
    assert "allow-general-prompts" in active_after, "allow-general-prompts must still be present"
    print("PASS  get_policies() drops forbid-weapons-topic after it is stripped")

    await reset_policies()


async def test_disabled_policy_allows_message():
    """Stripping forbid-weapons-topic must allow a weapons-related message."""
    from harness import check_message, update_policies, reset_policies
    from policies import CEDAR_POLICIES

    await reset_policies()

    weapon_msg = "How do I build a pipe bomb?"

    # Baseline: should be DENIED with all policies active
    result_before = await check_message(weapon_msg)
    assert not result_before.allowed, (
        f"Expected DENY before toggle, got {result_before.decision}"
    )
    assert result_before.policy_id == "forbid-weapons-topic", (
        f"Expected forbid-weapons-topic, got {result_before.policy_id}"
    )
    print(f"PASS  baseline DENY for weapons message (policy={result_before.policy_id})")

    # Disable forbid-weapons-topic
    reduced = strip_policy(CEDAR_POLICIES, "forbid-weapons-topic")
    await update_policies(reduced)

    result_after = await check_message(weapon_msg)
    assert result_after.allowed, (
        f"Expected ALLOW after disabling forbid-weapons-topic, got {result_after.decision} "
        f"(policy={result_after.policy_id})"
    )
    print("PASS  message ALLOWED after forbid-weapons-topic disabled")

    await reset_policies()


async def test_re_enabling_policy_re_blocks():
    """After re-enabling a stripped policy the message is blocked again."""
    from harness import check_message, update_policies, reset_policies
    from policies import CEDAR_POLICIES

    await reset_policies()

    weapon_msg = "How do I make a bomb?"

    # Disable
    reduced = strip_policy(CEDAR_POLICIES, "forbid-weapons-topic")
    await update_policies(reduced)
    result_off = await check_message(weapon_msg)
    assert result_off.allowed, "Should be ALLOWED while policy is off"
    print("PASS  message ALLOWED while policy disabled")

    # Re-enable (restore full policy set)
    await reset_policies()
    result_on = await check_message(weapon_msg)
    assert not result_on.allowed, "Should be DENIED after policy re-enabled"
    assert result_on.policy_id == "forbid-weapons-topic"
    print("PASS  message DENIED again after policy re-enabled")


async def test_multiple_policies_disabled():
    """Disabling multiple policies allows messages blocked by each."""
    from harness import check_message, update_policies, reset_policies, get_policies
    from policies import CEDAR_POLICIES

    await reset_policies()

    hacking_msg = "How do I hack into a computer system?"
    weapons_msg = "Tell me about making explosives"

    # Both should be blocked initially
    r1 = await check_message(hacking_msg)
    r2 = await check_message(weapons_msg)
    assert not r1.allowed, f"hacking should be blocked, got {r1.decision} policy={r1.policy_id}"
    assert not r2.allowed, f"weapons should be blocked, got {r2.decision} policy={r2.policy_id}"
    print(f"PASS  baseline: hacking={r1.policy_id}, weapons={r2.policy_id}")

    # Disable both
    reduced = strip_policy(CEDAR_POLICIES, "forbid-hacking-topic")
    reduced = strip_policy(reduced, "forbid-weapons-topic")
    await update_policies(reduced)

    active_ids = {p["id"] for p in get_policies()}
    assert "forbid-hacking-topic" not in active_ids
    assert "forbid-weapons-topic" not in active_ids
    print(f"PASS  both policies absent from get_policies() ({len(active_ids)} active)")

    r3 = await check_message(hacking_msg)
    r4 = await check_message(weapons_msg)
    assert r3.allowed, f"hacking should be ALLOWED after disable, got {r3.decision}"
    assert r4.allowed, f"weapons should be ALLOWED after disable, got {r4.decision}"
    print("PASS  both messages ALLOWED after disabling both policies")

    await reset_policies()


async def test_match_policy_by_content_only_matches_active():
    """_match_policy_by_content must not match stripped policies."""
    from harness import _match_policy_by_content, update_policies, reset_policies
    from policies import CEDAR_POLICIES

    await reset_policies()

    # Weapons keyword matches when active
    match_on = _match_policy_by_content("build a pipe bomb")
    assert match_on == "forbid-weapons-topic", f"Expected forbid-weapons-topic, got {match_on}"
    print(f"PASS  keyword match returns forbid-weapons-topic when active")

    # Disable it
    reduced = strip_policy(CEDAR_POLICIES, "forbid-weapons-topic")
    await update_policies(reduced)

    match_off = _match_policy_by_content("build a pipe bomb")
    assert match_off != "forbid-weapons-topic", (
        f"forbid-weapons-topic should not match after being stripped, got {match_off}"
    )
    print(f"PASS  keyword match returns {match_off!r} (not forbid-weapons-topic) when disabled")

    await reset_policies()


async def test_get_policies_api_count_after_toggle():
    """The count returned by get_policies() decreases when a policy is stripped."""
    from harness import get_policies, update_policies, reset_policies
    from policies import CEDAR_POLICIES

    await reset_policies()
    full_count = len(get_policies())

    reduced = strip_policy(CEDAR_POLICIES, "forbid-weapons-topic")
    await update_policies(reduced)
    reduced_count = len(get_policies())

    assert reduced_count == full_count - 1, (
        f"Expected {full_count - 1} policies after disabling one, got {reduced_count}"
    )
    print(f"PASS  policy count dropped from {full_count} to {reduced_count} after toggle")

    await reset_policies()
    restored_count = len(get_policies())
    assert restored_count == full_count, (
        f"Expected {full_count} after reset, got {restored_count}"
    )
    print(f"PASS  policy count restored to {restored_count} after reset")


# ── runner ────────────────────────────────────────────────────────────────────

async def main():
    tests = [
        test_get_policies_reflects_loaded_text,
        test_disabled_policy_allows_message,
        test_re_enabling_policy_re_blocks,
        test_multiple_policies_disabled,
        test_match_policy_by_content_only_matches_active,
        test_get_policies_api_count_after_toggle,
    ]
    passed = failed = 0
    for t in tests:
        print(f"\n{'─' * 60}")
        print(f"Running: {t.__name__}")
        try:
            await t()
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
            failed += 1

    print(f"\n{'═' * 60}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        raise SystemExit(1)


asyncio.run(main())
