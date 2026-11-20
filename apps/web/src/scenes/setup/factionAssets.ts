import gpt from "../../../../../assets/ai-logos/companies/openai-blossom.svg"
import claude from "../../../../../assets/ai-logos/products/claude.svg"
import grok from "../../../../../assets/ai-logos/products/grok.png"
import type { FactionId } from "../../../../../packages/rules/v0.1/factions/roster"

export const factionLogos: Readonly<Record<FactionId, string>> = { gpt, claude, grok }
