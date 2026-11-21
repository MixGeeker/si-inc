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
    <symbol id="plane" viewBox="0 0 32 32"><path fill="currentColor" d="M14.3 4.7c0-3.6 3.4-3.6 3.4 0l.6 7.4 12 6.9v2.5l-12-3.2-.4 7 3.8 2.7v1.5L16 28l-5.7 1.5V28l3.8-2.7-.4-7-12 3.2V19l12-6.9z"/></symbol>
    <symbol id="anchor" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="6" r="3"/><path d="M16 9v18M11.5 12h9M3 16c1 7 6 10 13 12 7-2 12-5 13-12M3 16l-.4 5.5M3 16l4.5 2M29 16l.4 5.5M29 16l-4.5 2"/></g></symbol>
    <symbol id="bio" viewBox="0 0 64 64"><g fill="currentColor">
      {[0,120,240].map(a=><path key={a} transform={`rotate(${a} 32 32)`} d="M27.4 3.2C15.8 6 12.2 21.6 22.1 29.9c1.8 1.5 4.1 2.7 6.7 3l1-4.4C22 25.7 20 18.2 23.3 12.3c1.3-2.3 3.5-4.1 6.2-5.2L31.5 2zM36.6 3.2C48.2 6 51.8 21.6 41.9 29.9c-1.8 1.5-4.1 2.7-6.7 3l-1-4.4c7.8-2.8 9.8-10.3 6.5-16.2-1.3-2.3-3.5-4.1-6.2-5.2L32.5 2z"/>)}
      <circle cx="32" cy="32" r="3.2"/></g><circle cx="32" cy="32" r="15" stroke="currentColor" fill="none" strokeWidth="2.2" strokeDasharray="19 12.4"/></symbol>
    <symbol id="skull" viewBox="0 0 32 32"><path fill="currentColor" fillRule="evenodd" d="M16 2C7 2 3 7.8 3.7 15.4c.4 4.5 2.5 6.4 6.3 7.8l1.4 5 3 .5.5-3 .6 3.7h2.1l.6-3.7.6 3 3-.5 1.4-5c3.8-1.4 5.8-3.3 6.2-7.8C30 7.8 25 2 16 2zM8.5 13l6 1.6c.3 4.2-3.9 5.5-5.8 3.3C7.9 17 7.5 15.2 8.5 13zm15 0c1 2.2.6 4-.2 4.9-1.9 2.2-6 .9-5.8-3.3zM16 18l-2.1 4h4.2z"/></symbol>
    <symbol id="dna" viewBox="0 0 32 32"><g stroke="currentColor" fill="none" strokeWidth="1.9" strokeLinecap="round"><path d="M6 1c0 13 20 15 20 30M26 1C26 14 6 17 6 31M7 3h18M9 7h14m-11 4h8M9 25h14M7 29h18m-13-8h8"/></g></symbol>
    <symbol id="flask" viewBox="0 0 32 32"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M11 2h10m-8 0v10L4 27q-1 2 2 2h20q2 0 1-2l-9-15V2M9 21h14"/></symbol>
    <symbol id="hexes" viewBox="0 0 54 32"><g fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m4 12 4-7h9l4 7-4 7H8zm18 6 3-6h8l4 6-4 6h-8zm15 5 3-5h6l4 5-4 5h-6z"/></g></symbol>
    <symbol id="token" viewBox="0 0 32 32"><path fill="none" stroke="currentColor" strokeWidth="2" d="m16 2 12 7v14l-12 7-12-7V9z M12 9v14h5a4 4 0 0 0 0-8h-5 5a3 3 0 0 0 0-6z"/></symbol>
    <symbol id="users" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13" cy="9" r="5"/><path d="M3 28v-4a10 10 0 0 1 20 0v4z M22 5a5 5 0 0 1 0 9m3 4a8 8 0 0 1 4 8"/></g></symbol>
    <symbol id="link" viewBox="0 0 32 32"><path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="m13 12 6-6a5 5 0 0 1 7 7l-6 6m-1 1-6 6a5 5 0 0 1-7-7l6-6m0 7 8-8"/></symbol>
    <symbol id="ship" viewBox="0 0 52 18"><path d="m0 11 9-6h31l11 5-6 5H8z" fill="#213c46"/><path d="m3 9 8-6h28l9 5-5 4H10z" fill="#cbd8d8"/><path d="M12 4h11v5H12zm13 0h11v5H25z" fill="#ab553b"/><path d="M36 3h5v7h-5z" fill="#f9faf1"/></symbol>
    <linearGradient id="hud-glass" x2=".15" y2="1" gradientUnits="objectBoundingBox"><stop style={{ stopColor: "var(--hud-glass-0)" }} stopOpacity=".36"/><stop offset=".05" style={{ stopColor: "var(--hud-glass-1)" }} stopOpacity=".14"/><stop offset=".16" style={{ stopColor: "var(--hud-glass-2)" }} stopOpacity=".82"/><stop offset=".6" style={{ stopColor: "var(--hud-glass-3)" }} stopOpacity=".88"/><stop offset="1" style={{ stopColor: "var(--hud-glass-4)" }} stopOpacity=".94"/></linearGradient>
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
