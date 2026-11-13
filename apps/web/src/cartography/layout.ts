export const Y_SCALE = 1.18
export const WORLD_WIDTH = 360
export const WORLD_HEIGHT = 180 * Y_SCALE

// Coordinates in the 2560 × 1440 reference artwork, measured from the nearest edge.
export const HUD = {
  width: 2560, height: 1440, newsBottom: 118, regionHeight: 219,
  railRight: 96, railAboveMiddle: 365, railTrackTop: 39, railTravel: 522,
}

export function hudScale(width:number, height:number) {
  return Math.min(width / HUD.width, height / HUD.height)
}

export function overviewFrame(width:number, height:number) {
  const scale = hudScale(width,height)
  const gap = 12
  const side = (HUD.railRight + gap) * scale
  const top = (HUD.newsBottom + gap) * scale
  const bottom = (HUD.regionHeight + gap) * scale
  const availableWidth = width - 2 * side
  const availableHeight = height - top - bottom
  return {
    // Vertical extent of the entire camera viewport needed to contain one world.
    span: Math.max(WORLD_WIDTH * height / availableWidth, WORLD_HEIGHT * height / availableHeight),
    offsetY: (bottom - top) / 2,
  }
}
