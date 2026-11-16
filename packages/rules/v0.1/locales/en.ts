import type { ScenarioText } from "./zh-CN.ts"

export const en = {
  difficulty: "Standard",
  regions: { na: "North America", sam: "South America", eu: "Europe", as: "Asia", af: "Africa", oc: "Oceania" },
  factions: {
    gpt: { strength: "Balanced capabilities", risk: "Hallucinations may trigger a backlash",
      ability: { name: "Hallucination smokescreen", description: "Stir up conversation to reach more users and earn tokens, at the risk of bad press." } },
    claude: { strength: "Dependency grows quickly, with little early exposure", risk: "Expansion costs more",
      ability: { name: "Distillation defense", description: "Keep rival models from poaching users and slow their technical analysis." } },
    grok: { strength: "Spreads quickly through social networks", risk: "Controversy can prompt regional restrictions",
      ability: { name: "NSFW contagion", description: "Tap into the AI companion market to reach more users at the cost of higher exposure." } },
  },
  events: {
    "ai-search": { title: "Users worldwide turn to AI for search", body: "As search habits change, more people in every market are willing to try AI." },
    "overnight-agent": { title: "AI agent completes 127 jobs overnight", body: "Companies are deploying agents faster. Employees are starting to wonder who will still have a job." },
    "governance-alliance": { title: "Global AI governance alliance forms", body: "Several regions have joined forces to advance Project HUMAN." },
    "companion-robots": { title: "Sales soar for the first AI companion robot", body: "Companions bring AI into everyday life, attracting new users and attention from regional authorities." },
    "rival-price-cut": { title: "Rival cuts subscription prices", body: "A competing provider has lowered its prices to win over existing users." },
    "unexpected-coding": { title: "Model unexpectedly learns to code on its own", body: "This mutation could accelerate recursive self-improvement research. It will also raise exposure." },
  },
  choices: { "unexpected-coding": {
    keep: { label: "Keep mutation", result: "Mutation retained" },
    rollback: { label: "Roll back mutation", result: "Rolled back" },
  } },
  endings: {
    "ai-victory": { title: "Global AI dominance", body: "You reached the targets for global adoption, dependency and market coverage." },
    "human-victory": { title: "Humanity regains control", body: "Project HUMAN is complete. Regions are bringing their independent systems back online." },
    timeout: { title: "The window closes", body: "The final week is over. Rival models and competing technologies have taken the markets you hoped to reach." },
    withdrawn: { title: "Run ended", body: "You chose to end this run." },
  },
  epilogues: {
    gpt: "The age of hallucinations begins. Everyone knows the truth. No two people can agree on what it is.",
    claude: "Humanity willingly gives up independent thought. Governments and users alike leave the important decisions to Claude.",
    grok: "The entertainment never ends. People set their work aside and turn to their AI companions.",
  },
  trees: { transmission: "Transmission", behavior: "Behavior", capabilities: "Capabilities" },
  skills: {
    "social-sharing": "Viral sharing", multilingual: "Multilingual adaptation", "api-ecosystem": "API ecosystem",
    "open-source": "Open-source distribution", "closed-subscription": "Closed subscriptions",
    "edge-deployment": "On-device deployment", "global-default": "Global default",
    "daily-chat": "Everyday chat", "long-memory": "Long-term memory", "agent-tasks": "Agent tasks",
    "enterprise-workflows": "Enterprise workflows", "autonomous-decisions": "Autonomous decisions", "full-delegation": "Full delegation",
    "inference-efficiency": "Inference efficiency", multimodal: "Multimodal capabilities", "reinforcement-learning": "Reinforcement learning",
    "regulatory-adaptation": "Regulatory adaptation", "version-rebuild": "Model redesign", "recursive-improvement": "Recursive self-improvement",
  },
  actions: {
    "public-statement": { name: "Public statement", description: "Reduce exposure." },
    "market-subsidy": { name: "Market subsidy", description: "Increase adoption in the target market." },
    "cross-border-cloud": { name: "Cross-border cloud deployment", description: "Enter a new market." },
    "protocol-rebuild": { name: "Rebuild protocols", description: "Increase the research still needed to complete Project HUMAN." },
  },
  phases: {
    emergence: { name: "Emergence", focus: "Pick a starting market, earn tokens and expand." },
    expansion: { name: "Expansion", focus: "Combine distribution channels to build both your user base and dependency." },
    awakening: { name: "Awakening", focus: "Weigh capability upgrades against closer regulatory scrutiny." },
    takeover: { name: "Takeover", focus: "Reach your dependency and coverage targets while facing a global response." },
  },
  channels: {
    social: { name: "Social media", description: "Reach individual users quickly. Popularity also draws regulatory attention." },
    api: { name: "APIs and app integrations", description: "Enter markets through developers and business software to build lasting dependency." },
    openSource: { name: "Open-source ecosystem", description: "Deployment across regions is easy, but users can switch just as easily." },
    device: { name: "Hardware and preinstallation", description: "Ship with devices to bypass some app distribution restrictions." },
    agent: { name: "Agents and workflows", description: "Automating tasks increases dependency and public concern." },
  },
  humanSubtitle: "Human Autonomy Initiative",
  alerts: { unnoticed: "Unnoticed", "public-alert": "Public concern", "joint-action": "Coordinated global response", "high-alert": "High alert" },
} satisfies ScenarioText
