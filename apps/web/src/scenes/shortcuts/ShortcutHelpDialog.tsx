import { useLanguage } from "../../i18n/useLanguage"
import { formatShortcutKey, shortcutGroups } from "../../input/shortcuts"
import { SceneDialog } from "../Dialog"
import { useGameSnapshot } from "../GameContext"
import "./shortcuts.css"

interface Props {
  onClose: () => void
  onOpenSettings?: () => void
}

export function ShortcutHelpDialog({ onClose, onOpenSettings }: Props) {
  const { ui, locale } = useLanguage()
  const shortcuts = useGameSnapshot(state => state.shortcuts)
  const text = ui.shortcuts

  return (
    <SceneDialog title={text.title} onBack={onClose} className="shortcut-help-dialog">
      <p className="shortcut-help-intro">{text.helpIntro}</p>
      <div className="shortcut-help-grid">
        {shortcutGroups.map(group => (
          <section key={group.id} className="shortcut-help-group" aria-label={text.groups[group.id]}>
            <h3>{text.groups[group.id]}</h3>
            <dl className="shortcut-help-list">
              {group.actions.map(action => (
                <div key={action} className="shortcut-help-row">
                  <dt>{text.actions[action]}</dt>
                  <dd><kbd className="keycap">{formatShortcutKey(shortcuts[action], locale)}</kbd></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section className="shortcut-help-group is-fixed" aria-label={text.fixedTitle}>
          <h3>{text.fixedTitle}</h3>
          <dl className="shortcut-help-list">
            <div className="shortcut-help-row">
              <dt>{text.fixedPan}</dt>
              <dd><kbd className="keycap is-fixed">{text.fixedPanKeys}</kbd></dd>
            </div>
            <div className="shortcut-help-row">
              <dt>{text.fixedZoom}</dt>
              <dd><kbd className="keycap is-fixed">{text.fixedZoomKeys}</kbd></dd>
            </div>
            <div className="shortcut-help-row">
              <dt>{text.fixedBack}</dt>
              <dd><kbd className="keycap is-fixed">{text.fixedBackKeys}</kbd></dd>
            </div>
            <div className="shortcut-help-row">
              <dt>{text.fixedTabs}</dt>
              <dd><kbd className="keycap is-fixed">{text.fixedTabsKeys}</kbd></dd>
            </div>
          </dl>
        </section>
      </div>
      <footer className="shortcut-help-footer">
        <span>{text.customizeHint}</span>
        <div className="shortcut-help-actions">
          {onOpenSettings && <button type="button" onClick={onOpenSettings}>{text.openSettings}</button>}
          <button type="button" onClick={onClose}>{ui.close}</button>
        </div>
      </footer>
    </SceneDialog>
  )
}
