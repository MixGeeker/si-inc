import { endings, victoryEpilogues } from "../endings/standard.ts"
import { decisions } from "../events/decisions.ts"
import { news } from "../events/news.ts"
import { competition } from "../events/competition.ts"
import { actions } from "../evolution/actions.ts"
import { trees } from "../evolution/trees.ts"
import { factions } from "../factions/roster.ts"
import { projectHuman } from "../opposition/project-human.ts"
import { phases } from "../progression/phases.ts"
import { standardScenario } from "../scenario.ts"
import { channels } from "../world/channels.ts"
import { regions } from "../world/regions.ts"

function byId<T extends { id: string }, V>(items: readonly T[], text: (item: T) => V) {
  return Object.fromEntries(items.map(item => [item.id, text(item)])) as Record<T["id"], V>
}

function byKey<K extends string, T, V>(items: Record<K, T>, text: (item: T) => V) {
  return Object.fromEntries((Object.keys(items) as K[]).map(key => [key, text(items[key])])) as Record<K, V>
}

const description = (item: { name: string; description: string }) => ({ name: item.name, description: item.description })
const titleBody = (item: { title: string; body: string }) => ({ title: item.title, body: item.body })
const skills = trees.flatMap(tree => tree.skills)

// The original authored text is the Chinese catalog. Keep rule values in their source modules.
export const zhCN = {
  difficulty: standardScenario.difficulty.name,
  regions: byKey(regions, r => r.name),
  factions: byKey(factions, f => ({ strength: f.strength, risk: f.risk, ability: description(f.ability) })),
  events: {
    ...byId([...news, ...competition], titleBody),
    ...byKey(decisions, d => ({ title: d.title, body: d.prompt })),
  },
  choices: byKey(decisions, d => byId(d.choices, c => ({ label: c.label, result: c.result }))),
  eventDetails: byKey(decisions, d => ({ source: d.source, scope: d.scope })),
  endings: { ...endings, withdrawn: { title: "已结束本局", body: "本局由玩家主动结束。" } },
  epilogues: victoryEpilogues,
  trees: byId(trees, t => t.name),
  skills: byId(skills, s => s.name),
  skillDescriptions: byId(skills, s => s.description),
  actions: byId(actions, description),
  phases: byId(phases, p => ({ name: p.name, focus: p.focus })),
  channels,
  humanSubtitle: projectHuman.subtitle,
  alerts: byId(projectHuman.alertLevels, level => level.title),
}

// Preserve IDs and required fields while allowing each language to supply its own prose.
type Translated<T> = T extends string ? string : { [K in keyof T]: Translated<T[K]> }
export type ScenarioText = Translated<typeof zhCN>
