export const actions = [
  { id: "public-statement", name: "公关澄清", cost: 10, target: "global", description: "降低暴露度。" },
  { id: "market-subsidy", name: "市场补贴", cost: 12, target: "market", description: "提高目标市场的普及率。" },
  { id: "cross-border-cloud", name: "跨境云部署", cost: 8, target: "market", description: "进入一个尚未覆盖的市场。" },
  { id: "protocol-rebuild", name: "协议重构", cost: 22, target: "global", description: "增加 Project HUMAN 的剩余研究需求。" },
] as const

export type ActionDefinition = typeof actions[number]
export type ActionId = ActionDefinition["id"]

export function actionById(id: string): ActionDefinition | undefined {
  return actions.find(action => action.id === id)
}
