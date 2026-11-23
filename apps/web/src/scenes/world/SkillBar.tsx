import { useEffect, useState } from "react"
import type { RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import { useLanguage } from "../../i18n/useLanguage"
import { formatShortcutKey } from "../../input/shortcuts"
import { useGameSnapshot, useGameStore } from "../GameContext"
import type { RegionTargetedAbilityId, SkillBarAbilityId, SkillBarSlot } from "./skill-bar-state"
import "./skill-bar.css"

function SkillGlyph({ id }: { id: SkillBarAbilityId }) {
  switch (id) {
    case "hallucination-smoke":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 5 13h6l-2 9 10-12h-6z" fill="currentColor" fillOpacity=".24" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      </svg>
    case "distillation-defense":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5 20 6v6c0 5-3.5 8.5-8 9.8C7.5 20.5 4 17 4 12V6z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M8.5 12.2 11 14.7 15.8 9.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    case "nsfw-viral":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity=".28" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M12 2.5v3.5m0 12v3.5M2.5 12H6m12 0h3.5M5.3 5.3l2.5 2.5m8.4 8.4 2.5 2.5m0-13.4-2.5 2.5m-8.4 8.4-2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    case "public-statement":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10v4h3.5l5.5 4V6L7.5 10z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4M19 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    case "protocol-rebuild":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 10.5A7.5 7.5 0 0 1 17.8 6.8L20 9m0-4.5V9h-4.5M19.5 13.5A7.5 7.5 0 0 1 6.2 17.2L4 15m0 4.5V15h4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    case "market-subsidy":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 17.5 9.5 11.5l4 3.5 7-8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15.5 7h5v5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    case "cross-border-cloud":
      return <svg className="skill-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.6"/>
        <ellipse cx="12" cy="12" rx="3.8" ry="8.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M3.8 12h16.4M5.5 7.8h13M5.5 16.2h13" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
  }
}

export function SkillBar({
  slots,
  unit,
  focusedRegionId,
  targetingAbility,
  onTriggerSlot,
  onCastRegion,
  onCancelTarget,
}: {
  slots: readonly SkillBarSlot[]
  unit: number
  focusedRegionId: RegionId | null
  targetingAbility: RegionTargetedAbilityId | null
  onTriggerSlot: (slotIndex: 0 | 1 | 2 | 3 | 4) => void
  onCastRegion: (abilityId: RegionTargetedAbilityId, regionId: RegionId) => void
  onCancelTarget: () => void
}) {
  const store = useGameStore()
  const shortcuts = useGameSnapshot(state => state.shortcuts)
  const { ui, locale } = useLanguage()
  const [recentCast, setRecentCast] = useState<SkillBarAbilityId | null>(null)

  useEffect(() => {
    let timer = 0
    const off = store.on("action-used", ({ abilityId }) => {
      setRecentCast(abilityId)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setRecentCast(null), 520)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [store])

  const targetingSlot = targetingAbility ? slots.find(s => s.abilityId === targetingAbility) ?? null : null
  const leftPx = Math.max(10, Math.round(20 * unit))
  const bottomPx = Math.max(76, Math.round(138 * unit))
  const widthPx = Math.max(308, Math.round(348 * unit))

  return (
    <section
      className={`skill-bar-dock${targetingSlot ? " is-targeting" : ""}`}
      style={{ left: leftPx, bottom: bottomPx, width: widthPx }}
      aria-label={ui.ops.skillBar.label}
    >
      {targetingSlot && (
        <div className="skill-target-tray" role="group" aria-label={ui.ops.skillBar.selectTargetHint(targetingSlot.name)}>
          <div className="skill-target-head">
            <span>{ui.ops.skillBar.selectTargetHint(targetingSlot.name)}</span>
            <button type="button" className="skill-target-cancel" onClick={onCancelTarget}>
              {ui.ops.skillBar.cancelTarget}
            </button>
          </div>
          <div className="skill-target-pills">
            {targetingSlot.targets.map(target => {
              const isFocused = focusedRegionId === target.regionId
              return (
                <button
                  key={target.regionId}
                  type="button"
                  className={`skill-target-pill${isFocused ? " is-focused" : ""}${target.subsidized ? " is-subsidized" : ""}`}
                  disabled={target.status !== "available"}
                  onClick={() => onCastRegion(targetingSlot.abilityId as RegionTargetedAbilityId, target.regionId)}
                >
                  <strong>{target.name}</strong>
                  <small>{target.detail}</small>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="skill-bar-slots" role="toolbar" aria-label={ui.ops.skillBar.label}>
        {slots.map(slot => {
          const keycap = formatShortcutKey(shortcuts[slot.shortcutAction], locale, true)
          const isReady = slot.status === "available"
          const isCooling = slot.cooldownDays > 0
          const isActive = slot.activeDays > 0
          const isTargeting = targetingAbility === slot.abilityId
          const isFlashing = recentCast === slot.abilityId
          const cdPct = isCooling && slot.cooldownTotalDays > 0
            ? Math.min(100, Math.round((slot.cooldownDays / slot.cooldownTotalDays) * 100))
            : 0
          const tooltip = [
            `${slot.name} [${keycap}] · ${slot.costText} token`,
            slot.description,
            isActive ? ui.ops.factionAbilityActive(slot.activeDays) : null,
            slot.reason ?? ui.ops.skillBar.ready,
          ].filter(Boolean).join("\n")

          const cls = [
            "skill-slot",
            `is-${slot.kind}`,
            isReady ? "is-ready" : "is-disabled",
            isCooling ? "is-cooling" : "",
            isActive ? "is-active" : "",
            isTargeting ? "is-targeting" : "",
            isFlashing ? "is-cast" : "",
            slot.status === "tokens" ? "is-short-tokens" : "",
          ].filter(Boolean).join(" ")

          return (
            <button
              key={slot.abilityId}
              type="button"
              className={cls}
              data-skill-slot={slot.slotIndex + 1}
              data-ability={slot.abilityId}
              aria-label={`${slot.name} (${keycap}) · ${slot.costText} token · ${slot.reason ?? ui.ops.skillBar.ready}`}
              aria-pressed={slot.kind === "region" ? isTargeting : undefined}
              disabled={!isReady && !isTargeting}
              title={tooltip}
              onClick={() => onTriggerSlot(slot.slotIndex)}
            >
              <kbd className="skill-slot-key" aria-hidden="true">{keycap}</kbd>
              {isActive && <span className="skill-slot-active" aria-hidden="true">{ui.ops.skillBar.activeShort(slot.activeDays)}</span>}
              <SkillGlyph id={slot.abilityId}/>
              <span className="skill-slot-name">{slot.shortName}</span>
              <span className="skill-slot-cost">{slot.costText}</span>
              {isCooling && (
                <span className="skill-slot-cd" aria-hidden="true">
                  <i style={{ height: `${cdPct}%` }}/>
                  <b>{ui.ops.skillBar.cdShort(slot.cooldownDays)}</b>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
