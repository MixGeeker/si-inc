import type { DecisionEffect } from "../../../../../packages/rules/v0.1/events/decisions"
import { useLanguage } from "../../i18n/useLanguage"

export function EventEffects({ effect }: { effect: DecisionEffect }) {
  const { ui, number } = useLanguage()
  const sign = (value: number) => `${value > 0 ? "+" : ""}${number.format(value)}`
  const empty = effect.tokens === 0 && effect.corpus === 0 && effect.humanBps === 0
  return <span className="narrative-effects">
    {effect.tokens !== 0 && <span className={effect.tokens > 0 ? "effect-gain" : "effect-cost"}>{sign(effect.tokens)} token</span>}
    {effect.corpus !== 0 && <span className={effect.corpus > 0 ? "effect-gain" : "effect-cost"}>{ui.narrative.corpusChange(sign(effect.corpus))}</span>}
    {effect.humanBps !== 0 && <span className={effect.humanBps > 0 ? "effect-risk" : "effect-gain"}>{ui.narrative.humanChange(sign(effect.humanBps / 100))}</span>}
    {empty && <span className="effect-neutral">{ui.narrative.noChange}</span>}
  </span>
}
