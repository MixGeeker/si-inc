import type { ReactNode } from "react"

function LineSymbol({ id, children }: { id: string; children: ReactNode }) {
  return <symbol id={id} viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round">{children}</g></symbol>
}

export function Symbols() {
  return <defs>
    <LineSymbol id="lab-danger"><path d="m12 3 10 18H2zm0 6v5m0 3v.1"/></LineSymbol>
    <LineSymbol id="lab-fork"><circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="6" r="2"/>
      <path d="M7 7v10m11-9c0 6-11 3-11 9"/></LineSymbol>
    <LineSymbol id="lab-chat"><path d="M3 4h18v12H9l-6 4zM7 8h10m-10 4h6"/></LineSymbol>
    <LineSymbol id="lab-cycle"><path d="M4 10a8 8 0 0 1 14-4l2 3m0-5v5h-5M20 14a8 8 0 0 1-14 4l-2-3m0 5v-5h5"/></LineSymbol>
    <symbol id="lab-lock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5.5" y="10" width="13" height="10.5" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></g></symbol>
    <symbol id="lab-clock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v6l4 2"/></g></symbol>
    <symbol id="lab-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2" d="m4.5 12 5 5L20 6.5"/></symbol>
    <symbol id="lab-branch" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 12h4V5h6m-6 7v7h6"/><circle cx="4" cy="12" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="18" cy="19" r="2"/></g></symbol>
    <symbol id="lab-chip" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5.5" y="5.5" width="13" height="13" rx="1"/><rect x="9" y="9" width="6" height="6"/>
      <path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/></g></symbol>
    <symbol id="flask" viewBox="0 0 32 32"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M11 2h10m-8 0v10L4 27q-1 2 2 2h20q2 0 1-2l-9-15V2M9 21h14"/></symbol>
    <symbol id="hexes" viewBox="0 0 54 32"><g fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m4 12 4-7h9l4 7-4 7H8zm18 6 3-6h8l4 6-4 6h-8zm15 5 3-5h6l4 5-4 5h-6z"/></g></symbol>
    <symbol id="token" viewBox="0 0 32 32"><path fill="none" stroke="currentColor" strokeWidth="2" d="m16 2 12 7v14l-12 7-12-7V9z M12 9v14h5a4 4 0 0 0 0-8h-5 5a3 3 0 0 0 0-6z"/></symbol>
    <linearGradient id="hud-glass" x2=".15" y2="1" gradientUnits="objectBoundingBox"><stop style={{ stopColor: "var(--hud-glass-0)" }} stopOpacity=".36"/><stop offset=".05" style={{ stopColor: "var(--hud-glass-1)" }} stopOpacity=".14"/><stop offset=".16" style={{ stopColor: "var(--hud-glass-2)", stopOpacity: "var(--hud-glass-2-alpha)" }}/><stop offset=".6" style={{ stopColor: "var(--hud-glass-3)", stopOpacity: "var(--hud-glass-3-alpha)" }}/><stop offset="1" style={{ stopColor: "var(--hud-glass-4)", stopOpacity: "var(--hud-glass-4-alpha)" }}/></linearGradient>
    <linearGradient id="bezel-glass" x2="0" y2="1"><stop style={{ stopColor: "var(--hud-bezel-0)" }} stopOpacity=".3"/><stop offset=".22" style={{ stopColor: "var(--hud-bezel-1)" }} stopOpacity=".1"/><stop offset="1" style={{ stopColor: "var(--hud-bezel-2)" }} stopOpacity=".4"/></linearGradient>
    <linearGradient id="hud-blue" x2="0" y2="1"><stop style={{ stopColor: "var(--hud-blue-0)" }}/><stop offset=".5" style={{ stopColor: "var(--hud-blue-1)" }}/><stop offset="1" style={{ stopColor: "var(--hud-blue-2)" }}/></linearGradient>
    <linearGradient id="hud-red" x2="0" y2="1"><stop style={{ stopColor: "var(--hud-red-0)" }}/><stop offset=".45" style={{ stopColor: "var(--hud-red-1)" }}/><stop offset="1" style={{ stopColor: "var(--hud-red-2)" }}/></linearGradient>
    <filter id="edge-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="edge-bloom" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="11"/></filter>
    <pattern id="panel-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="var(--hud-grid)" strokeWidth=".4" opacity=".14"/></pattern>
    <pattern id="vents" width="10" height="10" patternUnits="userSpaceOnUse"><path d="m-2 2 4-4m0 12 8-8" stroke="var(--hud-vents)" opacity=".24" strokeWidth="2"/></pattern>
    <pattern id="rule" width="44" height="30" patternUnits="userSpaceOnUse"><path d="M1 0v12m8-12v5m9-5v5m9-5v5m9-5v5" stroke="var(--hud-rule)" opacity=".32" strokeWidth="1"/></pattern>
  </defs>
}
export function Glyph({name,x,y,size,width=size,height=size}:{name:string;x:number;y:number;size?:number;width?:number;height?:number}) {
  return <use href={`#${name}`} x={x} y={y} width={width} height={height}/>
}
