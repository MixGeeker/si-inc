import { useLayoutEffect, useRef, type ReactNode } from "react"

import { useLanguage } from "../i18n/useLanguage"

interface Props {
  title: string
  onBack: () => void
  children: ReactNode
  className?: string
  headerDetail?: ReactNode
}

export function SceneDialog({ title, onBack, children, className, headerDetail }: Props) {
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
  return <dialog ref={ref} aria-labelledby="window-title" className={["info-dialog", className].filter(Boolean).join(" ")}
    onCancel={e => { e.preventDefault(); onBack() }}>
    <section className="window-body">
      <header><h2 id="window-title">{title}</h2>{headerDetail}<button className="close" aria-label={ui.close} onClick={onBack} autoFocus>×</button></header>
      <div className="window-content">{children}</div>
    </section>
  </dialog>
}
