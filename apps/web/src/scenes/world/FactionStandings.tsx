import { factionStandings } from "../../../../../packages/game/operations"
import type { RunState } from "../../../../../packages/game/run"
import { factions } from "../../../../../packages/rules/v0.1/factions/roster"
import type { RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import { useLanguage } from "../../i18n/useLanguage"
import { formatCompactPeople } from "./hudContent"

export function FactionStandings({ run, regionId }: { run: RunState; regionId?: RegionId }) {
  const { ui, locale, number } = useLanguage()
  const standings = factionStandings(run, regionId)
  const rows = regionId ? standings.filter(row => row.immersed || row.synthetics || row.centers) : standings
  if (!rows.length) return null
  return <details open>
    <summary>{ui.ops.factionStandings}</summary>
    <dl className="readings">{rows.map(({ factionId, isPlayer, immersed, synthetics, centers }) => {
      const { name } = factions[factionId]
      return <div key={factionId}>
        <dt>{isPlayer ? ui.ops.playerFaction(name) : name}</dt>
        <dd>{ui.ops.factionActivity(formatCompactPeople(immersed, locale, number), formatCompactPeople(synthetics, locale, number), centers)}</dd>
      </div>
    })}</dl>
  </details>
}
