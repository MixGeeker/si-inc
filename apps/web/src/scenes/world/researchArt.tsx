import type { ReactElement } from "react"
import type { SkillId } from "../../../../../packages/rules/v0.1/evolution/trees"

// Cutouts keep each silhouette legible both as light on glass and as ink on an illuminated tile.
const silhouettes: Record<SkillId, ReactElement> = {
  "social-sharing": <path d="M2 27c1-11 6-18 17-19V2l12 11-12 11v-7C12 17 7 20 2 27Z"/>,
  multilingual: <g>
    <path d="M2 3h18a2 2 0 0 1 2 2v11h-7l-7 6v-6H3a2 2 0 0 1-2-2V5q0-2 1-2Z M5 7v2h4c-.5 1.3-1.5 2.4-3.2 3.6l1.3 1.6c1.4-.8 2.6-1.9 3.6-3.2l3.1 2.6 1.4-1.7-3.4-2.5.2-.4H17V7h-5V5H9.4v2Z"/>
    <path d="M17 18h6c1 0 1.5-.7 1.5-1.6V12H29q2 0 2 2v11q0 2-2 2h-1v4l-5-4h-9q-2 0-2-2v-3Z M20.2 25h2l.6-1.8h3L26.4 25h2.1L25 17h-1.6Zm3.2-3.4.9-2.3.9 2.3Z"/>
  </g>,
  "api-ecosystem": <g><path d="m2 15 8-8 2.7 2.7-5.3 5.3 5.3 5.3L10 23Zm28 0-8-8-2.7 2.7 5.3 5.3-5.3 5.3L22 23Z"/><path d="M17.6 3h3.6l-7 25h-3.6Z"/></g>,
  "remix-templates": <g><path d="M5 3h19v4H9v17H4V5q0-2 1-2Z"/><path d="M12 10h17v19H12z M17 21l3 1 1 4 1.5-4 3.5-1-3.5-1.5-1.5-3.8-1 3.8Z"/></g>,
  "device-preinstall": <path d="M9 1h14q3 0 3 3v24q0 3-3 3H9q-3 0-3-3V4q0-3 3-3Z M9 5v18h14V5h-3l-1 2h-6l-1-2Z M14 26v2h4v-2Z M14.5 9.5h3v4H21l-5 5-5-5h3.5Z"/>,
  "open-source": <g><path d="M7 8h3v11c2.6-3.3 6-3.4 9.2-5.4 1.8-1.1 2.4-2.9 2.4-5.5h3.1c0 4.1-1.5 6.9-4.2 8.4-3.2 1.9-8 2.5-10.6 6.5v3H7Z"/><path d="M8.5 1a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm15-3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-15 17a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></g>,
  "closed-subscription": <path d="M3 5h26q2 0 2 2v3H1V7q0-2 2-2Zm-2 9h30v11q0 2-2 2H3q-2 0-2-2Z M5 20v3h8v-3Zm17-1v4h5v-4Z"/>,
  "language-communities": <g><path d="M2 5c5-5 17-4 21 1 3 4 1 10-5 12l-1 4-5-3C3 19-1 12 2 5Z M7 9a1.5 1.5 0 1 0 0 .1Zm6 0a1.5 1.5 0 1 0 0 .1Zm6 0a1.5 1.5 0 1 0 0 .1Z"/><path d="M25 12c8 2 7 12 2 14l1 5-7-4c-4 0-7-1.3-9-4l6 2.5 2.2-5.5q4.3-2.3 4.8-8Z"/></g>,
  "plugin-market": <path d="M4 8h7c-1.8-3.2-.1-6 3.1-6s5 3 3.2 6H24v7c3.7-2.1 7-.3 7 3.1s-3.1 5.2-7 3.2V28h-7c2-3.7-.4-6.4-3.2-6.4-3 0-5.2 2.7-3.4 6.4H4v-7c3.8 1.9 6.5-.4 6.5-3.3 0-3.2-2.9-5.3-6.5-3.5Z"/>,
  "edge-deployment": <g><path d="M1 4h25v13h-4V8H5v12h13v4h-3v2h4v2H7v-2h4v-2H1Z"/><path d="M21 13h9q1 0 1 2v14q0 1.5-1.5 1.5h-8q-1.5 0-1.5-1.5V15q0-2 1-2Z M22 16v9h7v-9Z M24.5 27v1.2h2V27Z"/></g>,
  "device-handoff": <g><path d="M2 5h11v19H2Z M4 8v12h7V8Zm15 5h11v18H19Z M21 16v11h7V16Z"/><path d="M14 6h7V2l7 6-7 6v-4h-7ZM17 25h-5v-3l-6 5 6 5v-3h5Z"/></g>,
  "community-mirrors": <g><path d="M2 4h21v4H6v14H2Z"/><path d="M9 11h21v16H9Z M12 14v2h15v-2Zm0 5v2h6v-2Z M14 29h12v2H14Z"/></g>,
  "metered-billing": <path d="M6 2l3 2 3-2 3 2 3-2 3 2 3-2 3 2v26l-3-2-3 2-3-2-3 2-3-2-3 2-3-2Z M10 8v2.5h13V8Zm0 5v2.5h8V13Zm7 8v3h6v-3Z"/>,
  "trending-takeover": <g><path d="M2 13h7c5-1 10-4.7 16-10v23c-5.7-4.2-11.1-7.3-16-8H2Z M5 20h5l3.5 8.5-5.5.5Z"/><path d="m27 9 3-2 1.5 2.3-3.6 2.3Zm1 4h4v2.7h-4Zm-.5 4 4 2-1.4 2.5-3-2Z"/></g>,
  "offline-bundles": <path d="m2 10 13-7 5 2.6-13 7Zm7.4 4L23 7.2l6.8 3.5-13.4 6.9Zm-7.9-1.9 5.7 3V20l3.4 1.8v-4.9l4.2 2.2v12l-13.3-7Zm16 7L30.5 12v12l-13 7Z"/>,
  "group-purchasing": <path d="M10 5q0-3 3-3h6q3 0 3 3v3h7q2 0 2 2v5l-15 4-15-4v-5q0-2 2-2h7Zm3 0v3h6V5ZM1 18l12.5 3.3v2h5v-2L31 18v9q0 2-2 2H3q-2 0-2-2Z"/>,
  "global-default": <g><path d="M16 1a13.3 13.3 0 1 1-.1 0Zm-3.5 3.1L7.8 7.2l.7 3 3.2.7.9 3.1 2.8 1.2.9 2.7-2 2.9-.5 4.1-2.4-2.7.1-4.8-4.7-2.1-1.9-3.2c1.1-4.5 3.6-7.2 7.6-8.1Zm7.8 1 .5 2.9-2.5 2.4 1.7 2.2 3.3.2 1.9 3.9 2.3-1.6c.1-4.2-2.5-8.2-7.2-10Z"/><path d="M1.4 22.2c.4 6.8 18.4 4.5 28.7-5.5-1.9 6.1-11.7 11.6-20.3 12.2-6.5.6-10.5-2.3-8.4-6.7Z"/></g>,

  "daily-chat": <path d="M2 14C2 6 8.4 2 16.3 2 25 2 30 7 30 14s-6.2 12-14 12c-1.1 0-3-.1-4.3-.5L4 30l1.6-7.7A10.7 10.7 0 0 1 2 14Z M8 12a2 2 0 1 0 .1 0Zm8 0a2 2 0 1 0 .1 0Zm8 0a2 2 0 1 0 .1 0Z"/>,
  "tone-matching": <path d="M2 4h28v18H16L7 29v-7H2Z M5 12v2.4h5l2-3.3 3.2 8.5 3.7-7.8 1.1 2.6h6.8V12h-5l-2.8-6-3.6 7.9-3-8.1-3.8 6.2Z"/>,
  "long-memory": <g><ellipse cx="16" cy="6" rx="12" ry="4.6"/><path d="M4 9.5c5.5 4.6 18.5 4.6 24 0v5c-4 4.2-19 4.2-24 0Zm0 8c5.5 4.5 18.5 4.5 24 0v5c-4 4.2-19 4.2-24 0Zm0 8c5.5 4.5 18.5 4.5 24 0v1c-1.5 5.7-22 5.7-24 0Z"/></g>,
  "privacy-controls": <g><path d="M2 6h6v4H2Zm14 0h14v4H16ZM2 21h15v4H2Zm23 0h5v4h-5Z"/><path d="M9 3h6v10H9Zm9 15h6v10h-6Z"/></g>,
  "weekly-reports": <path d="M5 2h15l7 7v21H5Z M18 4v7h7Z M9 14v2.5h14V14Zm0 5v2.5h12V19Zm0 5v2h7v-2Z"/>,
  "chat-import": <g><path d="M2 3h24v13H13L6 22v-6H2Z M6 7v2h15V7Z"/><path d="M18 20h5v-4l8 7-8 7v-4h-7c-4 0-6-1-8-4 3 1 6-2 10-2Z"/></g>,
  "agent-tasks": <g><path d="M14 6h4v3h6q3 0 3 3v13q0 3-3 3H8q-3 0-3-3V12q0-3 3-3h6Z M9 15v4h4v-4Zm10 0v4h4v-4Zm-7 8v2h8v-2Z"/><circle cx="16" cy="4" r="3"/><path d="M1 14h3v9H1zm27 0h3v9h-3Z"/></g>,
  "lasting-companionship": <path d="M16 29C11 25 1 18 1 10.5 1 1 13 0 16 8c3-8 15-7 15 2.5C31 18 21 25 16 29Z M4 15v2h6.5l2-3.3 2.6 7.8 3.7-8.6 1.8 4H28v-2h-6l-3.5-7.4-3 8-2.3-6.4-4 5.9Z"/>,
  "human-approval": <path d="M11 8a5 5 0 1 1 10 0c0 3.2-2.2 5.7-2.2 8H24l4 5v3H4v-3l4-5h5.2c0-2.5-2.2-5-2.2-8ZM4 26h24v3H4Z"/>,
  "enterprise-workflows": <g><path d="M2 3h12v9H2zm17 17h12v9H19ZM5 14h3v9h9v3H5Z"/><path d="M16 6h9v6h4l-5.5 6-5.5-6h4V9h-6Z"/></g>,
  "team-seats": <g><circle cx="16" cy="8" r="5"/><circle cx="5.5" cy="11" r="3.5"/><circle cx="26.5" cy="11" r="3.5"/><path d="M7 27v-4c0-5 4.2-8 9-8s9 3 9 8v4ZM.5 25v-3c0-4 3.5-6 8-5-2 2-3.2 5-3.2 8Zm31 0h-4.8c0-3-1.2-6-3.2-8 4.5-1 8 1 8 5Z"/></g>,
  "memory-recap": <g><path d="M3 5l3 2A13 13 0 1 1 3 20h4.2a9 9 0 1 0 2-10.5l3.4 2-11 4Z"/><path d="M14 9h3v6l4.6 3.2-1.7 2.5L14 17Z"/></g>,
  "live-handoff": <path d="M2 16a14 14 0 0 1 28 0v6q0 7-9 8h-5v-4h5q5-.5 5-4v-1h-5V13h5a10 10 0 0 0-20 0h5v10H5q-3 0-3-3Z"/>,
  "autonomous-decisions": <path d="M13 2c5-1 11 1.5 12.2 7l.9 3.5 3.5 5.5h-4v5q0 2-2 2H19v5H8v-9C4.2 18 3 14 4 10 5 5.5 8.8 2.8 13 2Z M16 6l-6.5 9H14l-1 6 8-11h-4.7Z"/>,
  "full-delegation": <path d="m16 2 15 7-15 7L1 9Zm-14 12 14 6.5L30 14v4l-14 6.6L2 18Zm0 8 14 6.4L30 22v3L16 32 2 25Z"/>,
  "identity-registry": <path d="M2 5h28q1.5 0 1.5 2v19q0 2-2 2h-27Q1 28 1 26V7q0-2 1-2Z M11 10a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM5 23h12c0-7.5-12-7.5-12 0Zm15-12v2.5h7V11Zm0 5v2.5h7V16Zm0 5v2h4v-2Z"/>,
  "continuous-persona": <path d="M1 16c0-8 7.3-12.5 13.5-6.5L16 11l-2.8 3.1-1.7-1.7C7.6 8.5 4.6 12.8 4.6 16c0 4 4.1 7 7.8 2.4l7-8.7C25.4 3.5 32 9 32 16s-6.3 12.4-12.4 6.5l-2.5-2.6 2.9-3.2 2.4 2.6c3.1 3.3 6.1.1 6.1-3.3 0-3.9-3.7-7.1-7.1-3l-6.8 8.6C8.3 29.2 1 23.9 1 16Z"/>,

  "inference-efficiency": <g><path d="M7 6h19v20H7Z M11 10v12h11V10Z M13 12h7v8h-7Z"/><path d="M9 1h2.5v4H9zm6 0h2.5v4H15zm6 0h2.5v4H21zM9 27h2.5v4H9zm6 0h2.5v4H15zm6 0h2.5v4H21zM1 9h5v2.5H1zm0 6h5v2.5H1zm0 6h5v2.5H1zM27 9h4v2.5h-4zm0 6h4v2.5h-4zm0 6h4v2.5h-4Z"/></g>,
  multimodal: <g><path d="M1 4h25v20H1Z M4 7v13l7-8 5 5 3-3 4 4V7Z M18 9a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z"/><path d="M28 10h3v19H7v-3h21Z"/></g>,
  "reinforcement-learning": <path d="M3.2 13A13 13 0 0 1 25 6l3.1-3 .5 11-11-.6 3.8-3.7A8.7 8.7 0 0 0 7.5 13ZM28.8 19A13 13 0 0 1 7 26l-3.1 3-.5-11 11 .6-3.8 3.7A8.7 8.7 0 0 0 24.5 19Z"/>,
  quantization: <path d="M2 3h13v13H2Zm17 0h10v10H19ZM4 20h9v9H4Zm16-2h6v6h-6Zm8 8h3v3h-3Z"/>,
  "request-cache": <path d="M1 8l15-7 15 7-15 7Zm1 5 14 6.4L30 13v4L16 23.5 2 17Zm0 8 14 6.4L30 21v3.7L16 31 2 24.7Z"/>,
  "regulatory-adaptation": <path d="M16 1c4.6 3.2 9.7 4.4 13 4.4v8.1c0 7.5-5 14.2-13 17.6C8 27.7 3 21 3 13.5V5.4c3.4 0 8.4-1.2 13-4.4Z M9 15l5.8 5.7 9.3-11-2.7-2.1-7 8.4-3-3.2Z"/>,
  "audit-logs": <path d="M6 5h4v4h12V5h4q2 0 2 2v21q0 2-2 2H6q-2 0-2-2V7q0-2 2-2Zm6-3h8v4h-8Z M8 15l3 3 5-6-1.8-1.3-3.3 3.8-1.6-1.5Zm9 0v2h7v-2ZM8 23l3 3 5-6-1.8-1.3-3.3 3.8-1.6-1.5Zm9 0v2h7v-2Z"/>,
  "load-balancing": <g><path d="M11 2h10v8H11Zm-9 20h10v8H2Zm18 0h10v8H20Z"/><path d="M14.5 11h3v3.5h9v6h-3v-3H8.5v3h-3v-6h9Z"/></g>,
  "offline-inference": <path d="M1 4h30v20H1Z M5 8v12h22V8Zm3 3 3 3-3 3 1.5 1.5L14 14l-4.5-4.5ZM16 16v2h7v-2ZM13 25h6v2h6v3H7v-3h6Z"/>,
  deidentification: <g><path d="M1 16C5 8.7 12.5 5.8 19.5 7.5l-4.1 4.1a5.1 5.1 0 0 0-5.6 5.7l-4.3 4.3A24 24 0 0 1 1 16Zm30 0c-4.3 7.6-12 10.3-18.7 8.7l4.5-4.5a5 5 0 0 0 5.2-5.2l4.6-4.6A22 22 0 0 1 31 16Z"/><path d="M3 28 27.7 3.3l2.2 2.2L5.2 30.2Z"/></g>,
  "version-rebuild": <path d="m16 1 14 7-14 7L2 8Zm-14 12 14 7 14-7v4.5l-14 7-14-7Zm0 8.5 14 7 14-7V25l-14 7-14-7Z"/>,
  "evaluation-suite": <path d="M3 3h26v27H3Z M7 10l2.8 3 5-5.5L13 6 9.7 9.6l-1.3-1.3Zm10-1v3h8V9ZM7 20l2.8 3 5-5.5L13 16l-3.3 3.6-1.3-1.3Zm10-1v3h8v-3Z"/>,
  "synthetic-interface": <g><path d="m1 9 8-7 7 6-3 3-4-3-3 3 9 9-3 3Z M31 23l-8 7-7-6 3-3 4 3 3-3-9-9 3-3Z"/><path d="m8 18 3-3 6 6-3 3Zm8-8 3-3 6 6-3 3Z"/></g>,
  "batch-conversion": <path d="M2 4h8v8H2Zm0 16h8v8H2ZM11 8h7V4l7 6-7 6v-4h-7Zm0 16 7-7v4h8v5h-8v4ZM27 4h4v10h-4Zm0 14h4v11h-4Z"/>,
  "distributed-review": <g><path d="m16 1 6 3.5v7L16 15l-6-3.5v-7ZM7 16l6 3.5v7L7 30l-6-3.5v-7Zm18 0 6 3.5v7L25 30l-6-3.5v-7Z"/><path d="M14 16h4v3h-4Zm-6.2-4.5 2.8 1.6-1.5 2.7-2.8-1.6Zm13.8 1.6 2.8-1.6 1.5 2.7-2.8 1.6Z"/></g>,
  "recursive-improvement": <g><path d="M1.8 13A14 14 0 0 1 26 6l3.3-3v10.3H19l3.9-3.7A9.7 9.7 0 0 0 6.2 13ZM30.2 19A14 14 0 0 1 6 26l-3.3 3V18.7H13l-3.9 3.7A9.7 9.7 0 0 0 25.8 19Z"/><path d="m16 9 5 7-5 7-5-7Z"/></g>,
}

export function TechnologyGlyph({ id }: { id: SkillId }) {
  return <svg x="-25" y="-27" width="50" height="50" viewBox="0 0 32 32" fill="currentColor" fillRule="evenodd"
    aria-hidden="true" className="hex-glyph">{silhouettes[id]}</svg>
}
