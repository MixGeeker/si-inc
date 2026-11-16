import { useLayoutEffect, useRef, type ReactNode } from "react"

import { useLanguage } from "../i18n/useLanguage"

interface Props {
  title: string
  onBack: () => void
  children: ReactNode
  event?: boolean
  className?: string
}

export function SceneDialog({ title, onBack, children, event, className }: Props) {
  const { ui } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous?.isConnected && (previous instanceof HTMLElement || previous instanceof SVGElement)) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [])
  return <dialog ref={ref} aria-labelledby="window-title" className={[event ? "event-dialog" : "info-dialog", className].filter(Boolean).join(" ")}
    onCancel={e => { e.preventDefault(); onBack() }}>
    {event ? <section className="event-body">
      <div className="event-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#bio"/></svg></div>
      <div className="event-copy"><h2 id="window-title">{title}</h2>{children}</div>
      <button onClick={onBack} autoFocus>{ui.ok}</button>
    </section> : <section className="window-body">
      <header><h2 id="window-title">{title}</h2><button className="close" aria-label={ui.close} onClick={onBack} autoFocus>×</button></header>
      <div className="window-content">{children}</div>
    </section>}
  </dialog>
}
