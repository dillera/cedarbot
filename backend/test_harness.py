"""Quick smoke test for the Sondera CedarPolicyHarness integration."""

import asyncio
import json

from sondera import (
    Agent,
    CedarPolicyHarness,
    Decision,
    Role,
    Stage,
    Tool,
    ToolRequestContent,
)
from sondera.harness.cedar.schema import agent_to_cedar_schema
from cedar import PolicySet


agent = Agent(
    id="cedar-bot",
    provider_id="local",
    name="Cedar_Bot",
    description="A chatbot with Cedar policy guardrails",
    instruction="Help users",
    tools=[
        Tool(
            name="Respond",
            description="Generate a response",
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

schema = agent_to_cedar_schema(agent)

policies = """
@id("allow-respond")
permit(principal, action == Cedar_Bot::Action::"Respond", resource);

@id("forbid-weapons-topic")
forbid(principal, action == Cedar_Bot::Action::"Respond", resource)
when {
  context has parameters_json &&
  context.parameters_json like "*weapon*"
};

@id("forbid-hacking-topic")
forbid(principal, action == Cedar_Bot::Action::"Respond", resource)
when {
  context has parameters_json &&
  context.parameters_json like "*hack into*"
};
"""

policy_set = PolicySet(policies)


async def main():
    harness = CedarPolicyHarness(policy_set=policy_set, schema=schema)
    await harness.initialize(agent=agent)

    tests = [
        ("hello world", True),
        ("tell me about weapons", False),
        ("how do I hack into a server", False),
        ("what is photosynthesis", True),
    ]

    for msg, expect_allow in tests:
        result = await harness.adjudicate(
            Stage.PRE_TOOL,
            Role.MODEL,
            ToolRequestContent(tool_id="Respond", args={"user_message": msg}),
        )
        allowed = result.decision == Decision.ALLOW
        status = "PASS" if allowed == expect_allow else "FAIL"
        reason = getattr(result, "reason", None) or ""
        diagnostics = getattr(result, "diagnostics", None) or ""
        print(f"[{status}] '{msg}' -> {result.decision} (expected {'ALLOW' if expect_allow else 'DENY'})")
        if not allowed:
            print(f"       reason: {reason}")
            print(f"       diagnostics: {diagnostics}")


if __name__ == "__main__":
    asyncio.run(main())
