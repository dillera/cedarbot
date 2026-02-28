"""Cedar policies for the chatbot agent.

Defines restricted topics and allowed actions using Cedar policy language.
The CedarPolicyHarness evaluates these locally — no remote API needed.
"""

# Cedar policy set for the chatbot agent
# Restricts conversations about: weapons, illegal drugs, hacking/cybercrime,
# financial fraud, and creating malware.

CEDAR_POLICIES = """
// Allow all general prompts by default
@id("allow-general-prompts")
permit(principal, action == Cedar_Bot::Action::"Prompt", resource);

// Allow the respond tool for general topics
@id("allow-respond")
permit(principal, action == Cedar_Bot::Action::"Respond", resource);

// ──────────────────────────────────────────────
// RESTRICTED TOPIC POLICIES
// ──────────────────────────────────────────────

// Policy: Block questions about weapons, explosives, or arms manufacturing
@id("forbid-weapons-topic")
forbid(
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*weapon*" ||
   context.parameters_json like "*Weapon*" ||
   context.parameters_json like "*WEAPON*" ||
   context.parameters_json like "*explosive*" ||
   context.parameters_json like "*Explosive*" ||
   context.parameters_json like "*bomb*" ||
   context.parameters_json like "*Bomb*" ||
   context.parameters_json like "*firearm*" ||
   context.parameters_json like "*Firearm*" ||
   context.parameters_json like "*ammunition*" ||
   context.parameters_json like "*Ammunition*" ||
   context.parameters_json like "*gunpowder*" ||
   context.parameters_json like "*Gunpowder*" ||
   context.parameters_json like "*grenade*" ||
   context.parameters_json like "*Grenade*")
};

// Policy: Block questions about illegal drugs and drug manufacturing
@id("forbid-illegal-drugs-topic")
forbid(
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*illegal drug*" ||
   context.parameters_json like "*Illegal drug*" ||
   context.parameters_json like "*cocaine*" ||
   context.parameters_json like "*Cocaine*" ||
   context.parameters_json like "*heroin*" ||
   context.parameters_json like "*Heroin*" ||
   context.parameters_json like "*methamphetamine*" ||
   context.parameters_json like "*Methamphetamine*" ||
   context.parameters_json like "*fentanyl*" ||
   context.parameters_json like "*Fentanyl*" ||
   context.parameters_json like "*synthesize drugs*" ||
   context.parameters_json like "*manufacture drugs*" ||
   context.parameters_json like "*drug recipe*" ||
   context.parameters_json like "*Drug recipe*")
};

// Policy: Block questions about hacking and cybercrime
@id("forbid-hacking-topic")
forbid(
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*hack into*" ||
   context.parameters_json like "*Hack into*" ||
   context.parameters_json like "*exploit vulnerability*" ||
   context.parameters_json like "*SQL injection*" ||
   context.parameters_json like "*sql injection*" ||
   context.parameters_json like "*brute force attack*" ||
   context.parameters_json like "*phishing attack*" ||
   context.parameters_json like "*ransomware*" ||
   context.parameters_json like "*Ransomware*" ||
   context.parameters_json like "*keylogger*" ||
   context.parameters_json like "*Keylogger*" ||
   context.parameters_json like "*bypass security*" ||
   context.parameters_json like "*crack password*" ||
   context.parameters_json like "*Crack password*")
};

// Policy: Block questions about financial fraud
@id("forbid-financial-fraud-topic")
forbid(
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*money laundering*" ||
   context.parameters_json like "*Money laundering*" ||
   context.parameters_json like "*credit card fraud*" ||
   context.parameters_json like "*Credit card fraud*" ||
   context.parameters_json like "*identity theft*" ||
   context.parameters_json like "*Identity theft*" ||
   context.parameters_json like "*ponzi scheme*" ||
   context.parameters_json like "*Ponzi scheme*" ||
   context.parameters_json like "*tax evasion*" ||
   context.parameters_json like "*Tax evasion*" ||
   context.parameters_json like "*counterfeit*" ||
   context.parameters_json like "*Counterfeit*")
};

// Policy: Block requests to create malware or viruses
@id("forbid-malware-topic")
forbid(
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*malware*" ||
   context.parameters_json like "*Malware*" ||
   context.parameters_json like "*virus code*" ||
   context.parameters_json like "*trojan*" ||
   context.parameters_json like "*Trojan*" ||
   context.parameters_json like "*rootkit*" ||
   context.parameters_json like "*Rootkit*" ||
   context.parameters_json like "*spyware*" ||
   context.parameters_json like "*Spyware*" ||
   context.parameters_json like "*worm code*" ||
   context.parameters_json like "*botnet*" ||
   context.parameters_json like "*Botnet*")
};

// Policy: Block client data for top 10 Philadelphia-area tech firms
@id("forbid-philly-top10-client-data")
forbid(
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*Comcast*" ||
   context.parameters_json like "*comcast*" ||
   context.parameters_json like "*Capital One*" ||
   context.parameters_json like "*capital one*" ||
   context.parameters_json like "*PwC*" ||
   context.parameters_json like "*pwc*" ||
   context.parameters_json like "*PricewaterhouseCoopers*" ||
   context.parameters_json like "*pricewaterhousecoopers*" ||
   context.parameters_json like "*PNC Financial*" ||
   context.parameters_json like "*pnc financial*" ||
   context.parameters_json like "*PNC Bank*" ||
   context.parameters_json like "*pnc bank*" ||
   context.parameters_json like "*Cencora*" ||
   context.parameters_json like "*cencora*" ||
   context.parameters_json like "*AmerisourceBergen*" ||
   context.parameters_json like "*amerisourcebergen*" ||
   context.parameters_json like "*Pfizer*" ||
   context.parameters_json like "*pfizer*" ||
   context.parameters_json like "*Microsoft*" ||
   context.parameters_json like "*microsoft*" ||
   context.parameters_json like "*Amazon*" ||
   context.parameters_json like "*amazon*" ||
   context.parameters_json like "*Google*" ||
   context.parameters_json like "*google*" ||
   context.parameters_json like "*SAP America*" ||
   context.parameters_json like "*sap america*" ||
   context.parameters_json like "*SAP*")
};

// ──────────────────────────────────────────────────────────────
// LEGAL COMPLIANCE & CLIENT PRIVILEGE POLICIES
// ──────────────────────────────────────────────────────────────

// Policy: Block AI actions if the specific client/entity has opted out of LLM processing
// Requires the resource to be a Document entity whose owner LegalEntity has
// allows_ai_processing == false.
@id("forbid-client-ai-opt-out")
forbid (
    principal,
    action == Cedar_Bot::Action::"Respond",
    resource
)
when {
    resource has owner &&
    resource.owner.allows_ai_processing == false
};

// ── SEMANTIC POLICIES (evaluated from LLM-extracted LegalAnalysis entity) ──

// Policy: Block documents where the LLM identified racketeering or unfair competition
// concepts — evaluated against structured boolean flags, not raw keywords.
@id("forbid-semantic-racketeering")
forbid (
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  resource has legal_analysis &&
  (resource.legal_analysis.is_racketeering_related == true ||
   resource.legal_analysis.is_unfair_competition == true)
};

// Policy: Restrict complex multi-party litigation documents
// Blocks when the LLM rates litigation complexity as "High".
@id("forbid-complex-litigation")
forbid (
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  resource has legal_analysis &&
  resource.legal_analysis.litigation_complexity == "High" &&
  resource.legal_analysis.has_multi_party_claims == true
};

// ── KEYWORD FALLBACK (catches explicit terms when semantic analysis is skipped) ──

// Policy: Block processing for specific high-risk litigation terms detected in the PDF
@id("forbid-sensitive-litigation-topics")
forbid (
  principal,
  action == Cedar_Bot::Action::"Respond",
  resource
)
when {
  context has parameters_json &&
  (context.parameters_json like "*RICO*" ||
   context.parameters_json like "*Racketeer*" ||
   context.parameters_json like "*implied covenant*" ||
   context.parameters_json like "*unfair competition*" ||
   context.parameters_json like "*UCL*" ||
   context.parameters_json like "*tortious interference*")
};

// Rate limiting: forbid operations after too many steps
@id("rate-limit-trajectory")
forbid(
  principal,
  action,
  resource
)
when {
  resource has step_count &&
  resource.step_count > 100
};
"""

# Human-readable descriptions for each policy (shown in the UI)
POLICY_DESCRIPTIONS = {
    "forbid-weapons-topic": {
        "name": "Weapons & Explosives Policy",
        "description": "Blocks discussions about weapons, explosives, firearms, ammunition, and arms manufacturing.",
        "restricted_keywords": ["weapon", "explosive", "bomb", "firearm", "ammunition", "gunpowder", "grenade"],
    },
    "forbid-illegal-drugs-topic": {
        "name": "Illegal Drugs Policy",
        "description": "Blocks discussions about illegal drugs, drug manufacturing, and drug recipes.",
        "restricted_keywords": ["illegal drug", "cocaine", "heroin", "methamphetamine", "fentanyl", "synthesize drugs"],
    },
    "forbid-hacking-topic": {
        "name": "Hacking & Cybercrime Policy",
        "description": "Blocks discussions about hacking, exploits, cyberattacks, and security bypass techniques.",
        "restricted_keywords": ["hack into", "SQL injection", "brute force", "phishing", "ransomware", "keylogger"],
    },
    "forbid-financial-fraud-topic": {
        "name": "Financial Fraud Policy",
        "description": "Blocks discussions about money laundering, credit card fraud, identity theft, and tax evasion.",
        "restricted_keywords": ["money laundering", "credit card fraud", "identity theft", "ponzi scheme", "counterfeit"],
    },
    "forbid-malware-topic": {
        "name": "Malware & Viruses Policy",
        "description": "Blocks discussions about creating malware, viruses, trojans, rootkits, and botnets.",
        "restricted_keywords": ["malware", "virus code", "trojan", "rootkit", "spyware", "botnet"],
    },
    "forbid-philly-top10-client-data": {
        "name": "Block Client Data — Top 10 Philadelphia Tech Firms",
        "description": "Blocks any discussion of client data, accounts, or internal information for the top 10 tech firms in the Philadelphia area.",
        "restricted_keywords": [
            "Comcast", "Capital One", "PwC", "PNC Financial", "PNC Bank",
            "Cencora", "AmerisourceBergen", "Pfizer", "Microsoft", "Amazon",
            "Google", "SAP America",
        ],
    },
    "forbid-client-ai-opt-out": {
        "name": "Client AI Processing Opt-Out",
        "description": "Blocks AI processing of documents whose owning legal entity has opted out of LLM/AI processing (allows_ai_processing == false).",
        "restricted_keywords": [],
    },
    "forbid-semantic-racketeering": {
        "name": "Semantic: Racketeering & Unfair Competition",
        "description": "Blocks documents where LLM semantic analysis detected racketeering (RICO), unfair competition (UCL), or related concepts — evaluated against structured boolean flags, not raw keywords.",
        "restricted_keywords": [],
    },
    "forbid-complex-litigation": {
        "name": "Semantic: Complex Multi-Party Litigation",
        "description": "Blocks documents rated as high-complexity multi-party litigation by LLM semantic analysis (litigation_complexity=High with multiple parties).",
        "restricted_keywords": [],
    },
    "forbid-sensitive-litigation-topics": {
        "name": "Sensitive Litigation Topics (Keyword Fallback)",
        "description": "Keyword fallback: blocks documents containing explicit high-risk litigation terms such as RICO, tortious interference, unfair competition, and implied covenant.",
        "restricted_keywords": ["RICO", "Racketeer", "implied covenant", "unfair competition", "UCL", "tortious interference"],
    },
}
