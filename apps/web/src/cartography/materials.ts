import { CanvasTexture, DataTexture, LinearFilter, RepeatWrapping, RGBAFormat,
  ShaderMaterial, Texture, Vector2, Vector3 } from "three"
import type { Atlas, Country } from "./atlas"

export function borders(atlas:Atlas) {
  const canvas = document.createElement("canvas")
  canvas.width = 4096; canvas.height = 2048
  const ctx = canvas.getContext("2d")!
  ctx.scale(canvas.width/360,canvas.height/180)
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(235,239,214,.63)"; ctx.lineWidth = .069
  for (const country of atlas.countries) ctx.stroke(country.path)
  const texture = new CanvasTexture(canvas)
  texture.anisotropy = 4
  return texture
}

export function selectionTexture(countries: readonly Country[] = []) {
  const canvas = document.createElement("canvas")
  const [west,south,east,north] = countries.length ? [
    Math.min(...countries.map(c => c.box[0])), Math.min(...countries.map(c => c.box[1])),
    Math.max(...countries.map(c => c.box[2])), Math.max(...countries.map(c => c.box[3])),
  ] : [-1,-1,1,1]
  const w = east-west+.8, h = north-south+.8
  const scale = Math.min(36,2048/Math.max(w,h))
  canvas.width = Math.ceil(w*scale); canvas.height = Math.ceil(h*scale)
  if (countries.length) {
    const ctx = canvas.getContext("2d")!
    ctx.scale(canvas.width/w,canvas.height/h)
    ctx.translate(-180-west+.4,north+.4-90)
    ctx.lineJoin = "round"
    const combined = new Path2D()
    for (const country of countries) combined.addPath(country.path)
    ctx.save()
    ctx.clip(combined, "evenodd")
    for (const [width, alpha] of [[.95, .08], [.42, .18]] as const) {
      ctx.lineWidth = width
      ctx.strokeStyle = `rgba(242,246,226,${alpha})`
      for (const country of countries) ctx.stroke(country.path)
    }
    ctx.restore()
    ctx.lineWidth = .14
    ctx.strokeStyle = "#f4f7e8"
    for (const country of countries) ctx.stroke(country.path)
  }
  const texture = new CanvasTexture(canvas)
  return { texture, rect:[(west-.4+180)/360,(south-.4+90)/180,w/360,h/180] }
}

export function velocityTexture(atlas:Atlas) {
  // RG stores wind and BA stores ocean velocity. Alpha zero marks missing ocean data.
  const bytes = new Uint8Array(360*180*4)
  for (let i=0;i<bytes.length;i+=4) {
    bytes[i] = Math.round(atlas.fields[i]/100/48*255+127.5)
    bytes[i+1] = Math.round(atlas.fields[i+1]/100/48*255+127.5)
    if (atlas.fields[i+2] !== -32768) {
      bytes[i+2] = Math.round(atlas.fields[i+2]/1000/6*254+128)
      bytes[i+3] = Math.round(atlas.fields[i+3]/1000/6*254+128)
    }
  }
  const tex = new DataTexture(bytes,360,180,RGBAFormat)
  tex.minFilter = tex.magFilter = LinearFilter
  tex.wrapS = RepeatWrapping; tex.needsUpdate = true
  return tex
}

const skyVertex = `
  varying vec2 coord; varying vec3 terrainNormal;
  void main() {
    coord = uv; terrainNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
  }`

const groundVertex = `
  uniform sampler2D countryField, countryPop;
  uniform float popEnabled;
  varying vec2 coord; varying vec3 terrainNormal;
  float vertexTerritoryFlag(vec2 sampleUV) {
    float cid = floor(texture2D(countryField, sampleUV).r * 255.0 + 0.5);
    if (cid < 0.5) return 0.0;
    float cov = texture2D(countryPop, vec2((cid + 0.5) / 256.0, 0.25)).r;
    return step(0.003, cov);
  }
  void main() {
    coord = uv; terrainNormal = normal;
    vec3 pos = position;
    if (popEnabled > 0.5) {
      vec2 stepUV = vec2(0.85 / 360.0, 0.85 / 180.0);
      float occ = max(
        vertexTerritoryFlag(uv),
        max(
          max(vertexTerritoryFlag(uv + vec2(stepUV.x, 0.0)), vertexTerritoryFlag(uv - vec2(stepUV.x, 0.0))),
          max(vertexTerritoryFlag(uv + vec2(0.0, stepUV.y)), vertexTerritoryFlag(uv - vec2(0.0, stepUV.y)))
        )
      );
      pos.z *= mix(0.26, 0.0, occ);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.);
  }`

const weather = `
  uniform sampler2D windField, vapor, humidity;
  uniform float elapsed, cloudSweep, cloudCover;
  uniform vec2 viewportPixels;
  varying vec2 coord;
  const float cycle = 42.;
  struct Gust { vec2 uv; float cover; float ridge; };
  Gust cloudGust(vec2 uv) {
    if (cloudSweep <= 0.) return Gust(uv, cloudCover, 0.);
    vec2 screen = gl_FragCoord.xy / viewportPixels;
    float curl = sin(screen.y * 12. + cloudSweep * 3.) + .45 * sin(screen.y * 29. - cloudSweep * 4.);
    float front = mix(1.24, -.25, cloudSweep) + .045 * curl;
    float ahead = front - screen.x;
    float push = 1. - smoothstep(-.04, .43, ahead);
    float ridge = 1. - smoothstep(.015, .21, abs(ahead - .06));
    // Backtrace towards the right. Pixel derivatives keep travel proportional to the visible map at every zoom.
    vec2 along = dFdx(uv) * viewportPixels.x;
    vec2 across = dFdy(uv) * viewportPixels.y;
    uv += along * cloudSweep * (.40 + .19 * push + .038 * curl);
    uv += across * cloudSweep * push * .014 * sin(screen.y * 18. + cloudSweep * 3.);
    return Gust(uv, cloudCover * smoothstep(-.10, .12, ahead), ridge);
  }
  vec2 velocity(vec2 uv) {
    vec2 fieldUV = uv + vec2(.375/360., .375/180.);
    vec2 ms = (texture2D(windField,fieldUV).rg-.5)*48.;
    float latitude = (uv.y-.5)*3.14159265;
    return ms * (4800./111320.) / vec2(360.*max(.23,cos(latitude)),180.);
  }
  float bank(vec2 uv) {
    // A long, tilted synoptic band carries progressively finer cloud structures.
    vec2 p = vec2(uv.x*2.+uv.y*.48,uv.y*2.7-uv.x);
    vec2 warp = vec2(texture2D(vapor,uv*vec2(1.,1.4)).r,texture2D(vapor,uv+vec2(.35,.61)).r)-.5;
    p += warp*.14;
    float broad = texture2D(vapor,p).r;
    float wisps = texture2D(vapor,p*3.+vec2(.22,.57)).r;
    float detail = texture2D(vapor,p*9.+vec2(.45,.11)).r;
    return .60*broad + .27*wisps + .13*detail;
  }
  float cloud(vec2 uv) {
    vec2 wind = velocity(uv);
    float phase = fract(elapsed/cycle), other = fract(phase+.5);
    // Two overlapping backtraces keep noise continuous through the periodic reseed.
    float a = bank(uv-wind*(phase-.5)*cycle);
    float b = bank(uv-wind*(other-.5)*cycle);
    float noise = mix(a,b,abs(phase*2.-1.));
    float moist = texture2D(humidity,uv+vec2(.375/360.,.375/180.)).r;
    return smoothstep(.30,.79,noise + (moist-.61)*.28);
  }
  float cloudShadow(vec2 uv) {
    float phase = fract(elapsed/cycle);
    vec2 drift = velocity(uv)*cycle;
    vec2 p = vec2(uv.x*2.+uv.y*.48,uv.y*2.7-uv.x);
    vec2 v = vec2(drift.x*2.+drift.y*.48,drift.y*2.7-drift.x);
    float a=texture2D(vapor,p-v*(phase-.5)).r;
    float b=texture2D(vapor,p-v*(fract(phase+.5)-.5)).r;
    float moist=texture2D(humidity,uv+vec2(.375/360.,.375/180.)).r;
    return smoothstep(.30,.79,mix(a,b,abs(phase*2.-1.))+(moist-.61)*.28);
  }`

const populationGroundShader = `
  uniform sampler2D countryField, countryPop;
  uniform float popEnabled, playerFaction;

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  // Signed distance to a regular pointy-top hexagon with inradius r.
  float hexDist(vec2 p) {
    p = abs(p);
    return max(p.x * 0.8660254 + p.y * 0.5, p.y);
  }

  // Evaluates a staggered hex-grid octave: ordinary users render as crisp scaling circles;
  // synthetic regions crystallize proportionally into crisp regular hexagons.
  // Returns vec3(shapeMask, colorVariant01, isSyntheticHex).
  vec3 dotOctave(vec2 scenePos, float spacing, float pxSize, float elapsedSec, float synBoost, float radiusScale) {
    if (radiusScale <= 0.02) return vec3(0.0);
    vec2 scaled = scenePos / spacing;
    float row = floor(scaled.y * 1.1547);
    float xShift = mod(row, 2.0) * 0.5;
    vec2 cell = vec2(floor(scaled.x + xShift), row);
    vec2 local = vec2(fract(scaled.x + xShift) - 0.5, fract(scaled.y * 1.1547) - 0.5);
    local.y *= 0.866025;

    vec2 rnd = hash22(cell);
    vec2 center = (rnd - 0.5) * 0.16;
    vec2 rel = local - center;

    // Deterministically switch individual lattice cells from circles to hexagons proportional to local synthetic share.
    float synRoll = fract(rnd.x * 19.31 + rnd.y * 7.13);
    float isSyn = step(0.005, synBoost) * (1.0 - step(synBoost, synRoll));
    float dist = mix(length(rel), hexDist(rel), isSyn);

    // Continuous staggered scale-up -> peak -> scale-down breathing cycle.
    float speed = (0.48 + 0.38 * rnd.x) * (1.0 + 0.25 * isSyn);
    float wave = fract(elapsedSec * speed + rnd.y * 6.17 + (cell.x * 0.09 + cell.y * 0.11));
    float scaleEnv = sin(wave * 3.14159265);
    float maxRadius = mix(0.27, 0.34, isSyn) * (0.82 + 0.22 * rnd.x) * radiusScale;
    float radius = maxRadius * pow(max(0.0, scaleEnv), mix(0.72, 0.58, isSyn));

    float aa = max(0.015, (pxSize / spacing) * mix(1.30, 1.08, isSyn));
    float mask = radius > 0.015 ? (1.0 - smoothstep(radius - aa, radius + aa, dist)) : 0.0;
    float variant = step(0.45, fract(rnd.x * 13.7 + rnd.y * 7.3));
    return vec3(mask, variant, isSyn);
  }

  // Bilinear SDF territory evaluation on the 1440x720 field for razor-smooth vector-like coastal & border bleed.
  vec4 sampleTerritoryAt(vec2 sampleUV, float micro) {
    vec2 dims = vec2(1440.0, 720.0);
    vec2 grid = vec2(sampleUV.x * dims.x - 0.5, clamp(sampleUV.y * dims.y - 0.5, 0.0, dims.y - 1.001));
    vec2 baseIdx = floor(grid);
    vec2 f = fract(grid);

    vec2 uv00 = vec2(fract((baseIdx.x + 0.5) / dims.x), (baseIdx.y + 0.5) / dims.y);
    vec2 uv10 = vec2(fract((baseIdx.x + 1.5) / dims.x), (baseIdx.y + 0.5) / dims.y);
    vec2 uv01 = vec2(fract((baseIdx.x + 0.5) / dims.x), min(dims.y - 0.5, baseIdx.y + 1.5) / dims.y);
    vec2 uv11 = vec2(fract((baseIdx.x + 1.5) / dims.x), min(dims.y - 0.5, baseIdx.y + 1.5) / dims.y);

    vec4 c00 = texture2D(countryField, uv00);
    vec4 c10 = texture2D(countryField, uv10);
    vec4 c01 = texture2D(countryField, uv01);
    vec4 c11 = texture2D(countryField, uv11);

    float w00 = (1.0 - f.x) * (1.0 - f.y);
    float w10 = f.x * (1.0 - f.y);
    float w01 = (1.0 - f.x) * f.y;
    float w11 = f.x * f.y;

    float id00 = floor(c00.r * 255.0 + 0.5);
    float id10 = floor(c10.r * 255.0 + 0.5);
    float id01 = floor(c01.r * 255.0 + 0.5);
    float id11 = floor(c11.r * 255.0 + 0.5);

    // Pick dominant active country among the 2x2 texels.
    float cid = 0.0;
    float bestW = -1.0;
    if (id00 > 0.5 && w00 > bestW) { cid = id00; bestW = w00; }
    if (id10 > 0.5) {
      float score = (abs(id10 - id00) < 0.1 ? w00 : 0.0) + w10;
      if (score > bestW) { cid = id10; bestW = score; }
    }
    if (id01 > 0.5) {
      float score = (abs(id01 - id00) < 0.1 ? w00 : 0.0) + (abs(id01 - id10) < 0.1 ? w10 : 0.0) + w01;
      if (score > bestW) { cid = id01; bestW = score; }
    }
    if (id11 > 0.5) {
      float score = (abs(id11 - id00) < 0.1 ? w00 : 0.0) + (abs(id11 - id10) < 0.1 ? w10 : 0.0) + (abs(id11 - id01) < 0.1 ? w01 : 0.0) + w11;
      if (score > bestW) { cid = id11; bestW = score; }
    }
    if (cid < 0.5) return vec4(0.0);

    vec4 p0 = texture2D(countryPop, vec2((cid + 0.5) / 256.0, 0.25));
    float coverage = p0.r;
    if (coverage <= 0.002) return vec4(0.0);

    // True bilinear interpolation of the signed coastal distance field G (ocean texels have G = 0.0).
    float g00 = abs(id00 - cid) < 0.1 ? c00.g : 0.0;
    float g10 = abs(id10 - cid) < 0.1 ? c10.g : 0.0;
    float g01 = abs(id01 - cid) < 0.1 ? c01.g : 0.0;
    float g11 = abs(id11 - cid) < 0.1 ? c11.g : 0.0;
    float gSmooth = mix(mix(g00, g10, f.x), mix(g01, g11, f.x), f.y);

    // Weighted average of sector (B) and spread rank (A) for matching country texels.
    vec2 baSum = vec2(0.0);
    float baW = 0.0;
    if (abs(id00 - cid) < 0.1) { baSum += c00.ba * (w00 + 0.001); baW += w00 + 0.001; }
    if (abs(id10 - cid) < 0.1) { baSum += c10.ba * (w10 + 0.001); baW += w10 + 0.001; }
    if (abs(id01 - cid) < 0.1) { baSum += c01.ba * (w01 + 0.001); baW += w01 + 0.001; }
    if (abs(id11 - cid) < 0.1) { baSum += c11.ba * (w11 + 0.001); baW += w11 + 0.001; }
    vec2 ba = baSum / max(0.0001, baW);

    // G = 0.502 is exact coastline; slope is 0.094 per 0.25 deg -> threshold 0.365 spills smoothly ~0.36 deg past coast!
    float bleedThreshold = 0.365 - micro * 0.22;
    float bleedMask = smoothstep(bleedThreshold - 0.032, bleedThreshold + 0.032, gSmooth);
    if (bleedMask <= 0.003) return vec4(0.0);

    float rank = clamp(ba.y + micro * 0.75, 0.0, 1.0);
    float covMask = coverage > 0.985 ? 1.0 : (1.0 - smoothstep(coverage - 0.028, coverage + 0.022, rank));
    float mask = bleedMask * covMask;
    return vec4(cid, ba.x, mask, 0.0);
  }
`

export function materials(surface:Texture, nightLights:Texture, vapor:Texture, humidity:Texture, wind:Texture,
  boundaries:Texture, selected:ReturnType<typeof selectionTexture>, countryField:Texture, countryPop:Texture) {
  vapor.wrapS = vapor.wrapT = RepeatWrapping
  surface.anisotropy = 8; nightLights.anisotropy = 8; humidity.wrapS = RepeatWrapping
  const uniforms = {
    windField:{value:wind}, vapor:{value:vapor}, humidity:{value:humidity}, elapsed:{value:0},
    cloudSweep:{value:0}, cloudCover:{value:0}, viewportPixels:{value:new Vector2(1,1)},
    ground:{value:surface}, nightLights:{value:nightLights}, boundaries:{value:boundaries}, selected:{value:selected.texture},
    selectionRect:{value:selected.rect}, currentsOn:{value:1}, night:{value:1},
    countryField:{value:countryField}, countryPop:{value:countryPop}, popEnabled:{value:1}, playerFaction:{value:-1},
    sun:{value:new Vector3(-.50,.46,.77).normalize()},
  }
  const ground = new ShaderMaterial({ uniforms, vertexShader:groundVertex, fragmentShader:weather + populationGroundShader + `
    uniform sampler2D ground, nightLights, boundaries, selected;
    uniform vec4 selectionRect; uniform vec3 sun; uniform float currentsOn, night;
    varying vec3 terrainNormal;
    void main() {
      vec3 dayTex = texture2D(ground,coord).rgb;
      float water = smoothstep(.02,.15,dayTex.b-dayTex.r);
      float landLuma = dot(dayTex, vec3(.299, .587, .114));
      vec3 slateLand = mix(dayTex, vec3(landLuma) * vec3(.72, .77, .82), .76) * .78;
      vec3 calmSea = mix(dayTex, dayTex * vec3(.66, .74, .84), .55);
      vec3 lit = mix(dayTex, mix(slateLand, calmSea, water), popEnabled);
      vec3 graded = mix(dayTex * vec3(.32,.38,.48), mix(vec3(.007,.012,.034), dayTex * vec3(.08,.16,.32), .45), water);
      vec3 col = mix(lit, graded, night);
      if(currentsOn>.5 && water>.02) {
        vec2 fieldUV = coord + vec2(.375/360., .375/180.);
        vec4 field = texture2D(windField,fieldUV);
        if(field.a>.20) {
          vec2 ms = (field.ba*255.-128.)*(6./254.);
          vec2 drift = ms*(30000./111320.) / vec2(360.*max(.23,cos((coord.y-.5)*3.14159)),180.);
          float phase=fract(elapsed/16.), other=fract(phase+.5);
          vec2 grain=vec2(92.,71.);
          float a=texture2D(vapor,(coord-drift*(phase-.5)*16.)*grain).r;
          float b=texture2D(vapor,(coord-drift*(other-.5)*16.)*grain).r;
          vec3 dayCurrent = vec3(.07,.09,.10);
          vec3 nightCurrent = vec3(.018,.065,.105);
          col += mix(dayCurrent, nightCurrent, night)*(mix(a,b,abs(2.*phase-1.))-.5)*water*smoothstep(.015,.5,length(ms));
        }
      }
      float light = dot(normalize(terrainNormal),sun);
      float dayShade = clamp(1.+(light-sun.z)*.60,.66,1.2);
      float nightShade = clamp(.66+(light-sun.z)*.90,.42,1.15);
      vec3 dayTint = vec3(1.);
      vec3 nightTint = mix(vec3(.78,.86,1.), vec3(1.), nightShade);
      col *= mix(dayShade, nightShade, night);
      col *= mix(dayTint, nightTint, night);

      if(cloudCover>0.) {
        Gust gust = cloudGust(coord);
        float shadow = cloudShadow(gust.uv + vec2(-.002,.004)) * gust.cover * (1. + .45 * gust.ridge);
        col *= 1. - mix(.12,.22,night) * shadow;
      }

      vec4 lamps = texture2D(nightLights, coord);
      if(night>0.) {
        float lampGlow = pow(lamps.a, .78);
        vec3 lampCol = mix(vec3(.84, .56, .34), vec3(.98, .90, .75), smoothstep(.18, .85, lamps.a));
        col = mix(col, lampCol, night * clamp(lampGlow * 1.05, 0., 1.));
      }

      // Draw country borders BEFORE the flat territory overlay so high-saturation paint spills right across borders!
      vec4 line = texture2D(boundaries,coord);
      vec3 dayLine = mix(col, line.rgb, line.a*.85);
      if(night>0.) {
        vec3 nightLine = mix(col, vec3(.44,.64,.70), clamp(line.a*.75,0.,.70));
        col = mix(dayLine, nightLine, night);
      } else {
        col = dayLine;
      }

      // Pure flat, zero-elevation high-saturation pigment coat with outward border bleed + scaling faction dots.
      if (popEnabled > 0.5) {
        float micro = (texture2D(vapor, coord * vec2(22.0, 12.0)).r - 0.5) * 0.055;
        vec4 terr = sampleTerritoryAt(coord, micro);

        // Smooth 8-direction ring + 4-direction inner probe (~0.35 deg) so occupied countries spill evenly across land borders too.
        if (terr.z < 0.72) {
          float cosLat = max(0.32, cos((coord.y - 0.5) * 3.14159));
          vec2 ring = vec2(0.35 / (360.0 * cosLat), 0.35 / 180.0) * (0.92 + micro * 1.8);
          vec2 diag = ring * 0.7071;
          vec2 inner = ring * 0.52;
          vec4 s;
          s = sampleTerritoryAt(coord + vec2(inner.x, 0.0), micro);   if (s.z * 0.96 > terr.z) terr = vec4(s.xy, s.z * 0.96, 0.0);
          s = sampleTerritoryAt(coord + vec2(-inner.x, 0.0), micro);  if (s.z * 0.96 > terr.z) terr = vec4(s.xy, s.z * 0.96, 0.0);
          s = sampleTerritoryAt(coord + vec2(0.0, inner.y), micro);   if (s.z * 0.96 > terr.z) terr = vec4(s.xy, s.z * 0.96, 0.0);
          s = sampleTerritoryAt(coord + vec2(0.0, -inner.y), micro);  if (s.z * 0.96 > terr.z) terr = vec4(s.xy, s.z * 0.96, 0.0);
          s = sampleTerritoryAt(coord + vec2(ring.x, 0.0), micro);    if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(-ring.x, 0.0), micro);   if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(0.0, ring.y), micro);    if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(0.0, -ring.y), micro);   if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(diag.x, diag.y), micro);   if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(-diag.x, diag.y), micro);  if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(diag.x, -diag.y), micro);  if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
          s = sampleTerritoryAt(coord + vec2(-diag.x, -diag.y), micro); if (s.z * 0.88 > terr.z) terr = vec4(s.xy, s.z * 0.88, 0.0);
        }

        if (terr.z > 0.01) {
          float cid = terr.x;
          float sec = clamp(terr.y + micro * 0.45, 0.0, 1.0);
          vec4 p0 = texture2D(countryPop, vec2((cid + 0.5) / 256.0, 0.25));
          vec4 p1 = texture2D(countryPop, vec2((cid + 0.5) / 256.0, 0.75));
          float sGpt = p0.b;
          float sClaude = p0.a;

          float wGpt = 1.0 - smoothstep(sGpt - 0.006, sGpt + 0.006, sec);
          float cut2 = sGpt + sClaude;
          float wClaude = (1.0 - wGpt) * (1.0 - smoothstep(cut2 - 0.006, cut2 + 0.006, sec));
          float wGrok = max(0.0, 1.0 - wGpt - wClaude);
          if (sGpt <= 0.001) wGpt = 0.0;
          if (sClaude <= 0.001) wClaude = 0.0;
          if (1.0 - cut2 <= 0.001) wGrok = 0.0;
          float wTotal = max(0.0001, wGpt + wClaude + wGrok);
          wGpt /= wTotal; wClaude /= wTotal; wGrok /= wTotal;

          float localSyn = wGpt * p1.r + wClaude * p1.g + wGrok * p1.b;

          // 100% Flat, zero-relief, high-saturation opaque base pigments:
          // GPT (#00a854 / #00c462), Claude (#eb4409 / #ff5c0a), Grok (#7524e6 / #8f38ff)
          vec3 baseGpt = mix(vec3(0.000, 0.659, 0.329), vec3(0.000, 0.785, 0.400), localSyn);
          vec3 baseClaude = mix(vec3(0.922, 0.267, 0.035), vec3(1.000, 0.380, 0.045), localSyn);
          vec3 baseGrok = mix(vec3(0.459, 0.141, 0.902), vec3(0.580, 0.235, 1.000), localSyn);
          vec3 flatColor = baseGpt * wGpt + baseClaude * wClaude + baseGrok * wGrok;

          // Pure vibrant dual-bright faction dots/hexes in matching faction hues:
          vec3 dotVivid = vec3(0.420, 1.000, 0.710) * wGpt + vec3(1.000, 0.750, 0.160) * wClaude + vec3(0.855, 0.560, 1.000) * wGrok;
          vec3 dotMid   = vec3(0.160, 0.920, 0.530) * wGpt + vec3(1.000, 0.520, 0.110) * wClaude + vec3(0.700, 0.360, 1.000) * wGrok;

          // Emphasize player's faction and dim rival factions so own territory pops at a glance.
          float playerWeight = playerFaction < -0.5 ? 1.0
            : (playerFaction < 0.5 ? wGpt : (playerFaction < 1.5 ? wClaude : wGrok));
          float rivalWeight = clamp(1.0 - playerWeight, 0.0, 1.0);
          float baseLuma = dot(flatColor, vec3(0.299, 0.587, 0.114));
          vec3 dimBase = mix(vec3(baseLuma), flatColor, 0.68) * 0.46;
          flatColor = mix(min(vec3(1.0), flatColor * 1.06), dimBase, rivalWeight);

          // Zoom-adaptive radius-transitioned hex grids in isotropic scene space (360 x 180*1.18):
          vec2 scenePos = vec2(coord.x * 360.0, coord.y * 212.4);
          float pxScene = max(length(dFdx(scenePos)), length(dFdy(scenePos)));
          float idealSpacing = clamp(pxScene * 21.5, 0.36, 16.0);
          float lv = log2(idealSpacing);
          float lv0 = floor(lv);
          float blend = fract(lv);
          float sp0 = exp2(lv0);
          float sp1 = sp0 * 2.0;

          vec3 d0 = dotOctave(scenePos, sp0, pxScene, elapsed, localSyn, smoothstep(0.82, 0.14, blend));
          vec3 d1 = dotOctave(scenePos + vec2(3.7, 1.9), sp1, pxScene, elapsed, localSyn, 1.0);
          vec3 dotChoice = d0.x >= d1.x ? d0 : d1;

          vec3 dotCol = mix(dotMid, dotVivid, dotChoice.y);
          // Give synthetic hexagons a subtle crystalline highlight boost on player territory.
          dotCol = mix(dotCol, min(vec3(1.0), dotCol * 1.18 + vec3(0.08)), dotChoice.z * 0.55);
          float dotLuma = dot(dotCol, vec3(0.299, 0.587, 0.114));
          vec3 dimDot = mix(vec3(dotLuma), dotCol, 0.66) * 0.52;
          dotCol = mix(dotCol, dimDot, rivalWeight);
          flatColor = mix(flatColor, dotCol, dotChoice.x * mix(0.96, 0.86, rivalWeight));

          // Crisp vector-smooth solid fill (opacity = 1.0 inside, smooth anti-aliased spill perimeter).
          float fillMask = smoothstep(0.24, 0.64, terr.z + dotChoice.x * step(0.22, terr.z) * 0.20);
          col = mix(col, flatColor, fillMask);
        }
      }

      vec2 uv = (coord-selectionRect.xy)/selectionRect.zw;
      if(all(greaterThanEqual(uv,vec2(0.))) && all(lessThanEqual(uv,vec2(1.)))) {
        vec4 mark = texture2D(selected,uv);
        vec3 selCol = mix(vec3(.96,.98,.90), vec3(.84,.95,.98), night);
        col = mix(col, selCol, clamp(mark.a * .95, 0., 1.));
      }
      gl_FragColor = vec4(col,1.);
    }` })
  const sky = new ShaderMaterial({uniforms,vertexShader:skyVertex,transparent:true,depthWrite:false,visible:false,
    fragmentShader:weather+`
      uniform sampler2D ground, countryField, countryPop;
      uniform float night, popEnabled;
      float smoothTerritoryCloudClear(vec2 sampleUV) {
        vec2 dims = vec2(1440.0, 720.0);
        vec2 grid = vec2(sampleUV.x * dims.x - 0.5, clamp(sampleUV.y * dims.y - 0.5, 0.0, dims.y - 1.001));
        vec2 baseIdx = floor(grid);
        vec2 f = fract(grid);
        vec4 c00 = texture2D(countryField, vec2(fract((baseIdx.x + 0.5) / dims.x), (baseIdx.y + 0.5) / dims.y));
        vec4 c10 = texture2D(countryField, vec2(fract((baseIdx.x + 1.5) / dims.x), (baseIdx.y + 0.5) / dims.y));
        vec4 c01 = texture2D(countryField, vec2(fract((baseIdx.x + 0.5) / dims.x), min(dims.y - 0.5, baseIdx.y + 1.5) / dims.y));
        vec4 c11 = texture2D(countryField, vec2(fract((baseIdx.x + 1.5) / dims.x), min(dims.y - 0.5, baseIdx.y + 1.5) / dims.y));
        float id0 = floor(c00.r * 255.0 + 0.5);
        float a00 = id0 > 0.5 && texture2D(countryPop, vec2((id0 + 0.5) / 256.0, 0.25)).r > 0.005 ? c00.g : 0.0;
        float id1 = floor(c10.r * 255.0 + 0.5);
        float a10 = id1 > 0.5 && texture2D(countryPop, vec2((id1 + 0.5) / 256.0, 0.25)).r > 0.005 ? c10.g : 0.0;
        float id2 = floor(c01.r * 255.0 + 0.5);
        float a01 = id2 > 0.5 && texture2D(countryPop, vec2((id2 + 0.5) / 256.0, 0.25)).r > 0.005 ? c01.g : 0.0;
        float id3 = floor(c11.r * 255.0 + 0.5);
        float a11 = id3 > 0.5 && texture2D(countryPop, vec2((id3 + 0.5) / 256.0, 0.25)).r > 0.005 ? c11.g : 0.0;
        float gVal = mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y);
        return smoothstep(0.28, 0.56, gVal);
      }
      void main() {
        Gust gust = cloudGust(coord);
        float density = cloud(gust.uv);
        vec3 base = texture2D(ground,coord).rgb;
        vec3 baseNorth = texture2D(ground, coord + vec2(0.0, 0.015)).rgb;
        float sea = smoothstep(.015,.14,min(base.b-base.r, baseNorth.b-baseNorth.r));
        float territoryClear = 1.0;
        if (popEnabled > 0.5) {
          float clr = max(smoothTerritoryCloudClear(coord), smoothTerritoryCloudClear(coord + vec2(0.0, 0.012)) * 0.85);
          territoryClear = mix(1.0, 0.06, clr);
        }
        float dayOpacity = pow(density,1.85)*mix(.08,.68,sea)*territoryClear;
        vec4 dayCloud = vec4(mix(vec3(.67,.80,.84),vec3(.95,.97,.97),dayOpacity), dayOpacity);
        float nightOpacity = pow(density,1.75)*.4*territoryClear;
        vec4 nightCloud = vec4(vec3(.62,.70,.80), nightOpacity);
        gl_FragColor = mix(dayCloud, nightCloud, night);
        gl_FragColor.a = mix(gl_FragColor.a, density * territoryClear, .70 * gust.ridge) * gust.cover;
      }`})
  function setCloudCover(cover:number) {
    uniforms.cloudCover.value = cover
    sky.visible = cover > 0
  }
  return {ground,sky,uniforms,setCloudCover}
}
