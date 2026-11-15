import { CanvasTexture, DataTexture, LinearFilter, PlaneGeometry, RepeatWrapping, RGBAFormat,
  ShaderMaterial, Texture, Vector2, Vector3 } from "three"
import { Atlas, relief, type Country } from "./atlas"
import { WORLD_WIDTH, WORLD_HEIGHT } from "./layout"

export function reliefGeometry(atlas:Atlas) {
  const mesh = new PlaneGeometry(WORLD_WIDTH,WORLD_HEIGHT,720,360)
  const points = mesh.getAttribute("position")
  for (let i=0;i<points.count;i++) points.setZ(i,relief(atlas.heights[i]))
  mesh.computeVertexNormals()
  mesh.computeBoundingSphere()
  return mesh
}

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
export function selectionTexture(country?:Country | null) {
  const canvas = document.createElement("canvas")
  // Only the selected feature's bounding rectangle occupies texture memory.
  const [west,south,east,north] = country?.box ?? [-1,-1,1,1]
  const w = east-west+.8, h = north-south+.8
  const scale = Math.min(36,2048/Math.max(w,h))
  canvas.width = Math.ceil(w*scale); canvas.height = Math.ceil(h*scale)
  if (country) {
    const ctx = canvas.getContext("2d")!
    ctx.scale(canvas.width/w,canvas.height/h)
    ctx.translate(-180-west+.4,north+.4-90)
    ctx.fillStyle = "rgba(240,249,175,.14)"; ctx.fill(country.path,"evenodd")
    ctx.lineWidth = .155; ctx.lineJoin = "round"; ctx.strokeStyle = "#f9ffe5"; ctx.stroke(country.path)
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

const vertex = `
  varying vec2 coord; varying vec3 terrainNormal;
  void main() {
    coord = uv; terrainNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
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

export function materials(surface:Texture, vapor:Texture, humidity:Texture, wind:Texture,
  boundaries:Texture, selected:ReturnType<typeof selectionTexture>) {
  vapor.wrapS = vapor.wrapT = RepeatWrapping
  surface.anisotropy = 8; humidity.wrapS = RepeatWrapping
  const uniforms = {
    windField:{value:wind}, vapor:{value:vapor}, humidity:{value:humidity}, elapsed:{value:0},
    cloudSweep:{value:0}, cloudCover:{value:0}, viewportPixels:{value:new Vector2(1,1)},
    ground:{value:surface}, boundaries:{value:boundaries}, selected:{value:selected.texture},
    selectionRect:{value:selected.rect}, currentsOn:{value:1}, night:{value:1},
    sun:{value:new Vector3(-.50,.46,.77).normalize()},
  }
  const ground = new ShaderMaterial({ uniforms,vertexShader:vertex, fragmentShader:weather+`
    uniform sampler2D ground, boundaries, selected;
    uniform vec4 selectionRect; uniform vec3 sun; uniform float currentsOn, night;
    varying vec3 terrainNormal;
    void main() {
      vec3 dayTex = texture2D(ground,coord).rgb;
      float water = smoothstep(.02,.15,dayTex.b-dayTex.r);
      vec3 lit = dayTex;
      vec3 graded = mix(dayTex * vec3(.56,.60,.66), mix(vec3(.02,.055,.11), dayTex * vec3(.16,.30,.48), .5), water);
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
          vec3 nightCurrent = vec3(.025,.05,.08);
          col += mix(dayCurrent, nightCurrent, night)*(mix(a,b,abs(2.*phase-1.))-.5)*water*smoothstep(.015,.5,length(ms));
        }
      }
      float light = dot(normalize(terrainNormal),sun);
      float dayShade = clamp(1.+(light-sun.z)*.60,.66,1.2);
      float nightShade = clamp(.72+(light-sun.z)*.85,.48,1.16);
      vec3 dayTint = vec3(1.);
      vec3 nightTint = mix(vec3(.86,.93,1.), vec3(1.), nightShade);
      col *= mix(dayShade, nightShade, night);
      col *= mix(dayTint, nightTint, night);
      if(cloudCover>0.) {
        Gust gust = cloudGust(coord);
        float shadow = cloudShadow(gust.uv + vec2(-.002,.004)) * gust.cover * (1. + .45 * gust.ridge);
        col *= 1. - mix(.12,.22,night) * shadow;
      }
      vec4 line = texture2D(boundaries,coord);
      vec3 dayLine = mix(col, line.rgb, line.a*.85);
      vec2 edge = vec2(4.5/4096.,4.5/2048.);
      float halo = texture2D(boundaries,coord+vec2(edge.x,0.)).a
        + texture2D(boundaries,coord-vec2(edge.x,0.)).a
        + texture2D(boundaries,coord+vec2(0.,edge.y)).a
        + texture2D(boundaries,coord-vec2(0.,edge.y)).a;
      vec3 nightLine = col + vec3(.16,.48,.58) * halo * .05;
      nightLine = mix(nightLine, vec3(.52,.72,.78), clamp(line.a*.7,0.,.62));
      col = mix(dayLine, nightLine, night);
      vec2 uv = (coord-selectionRect.xy)/selectionRect.zw;
      if(all(greaterThanEqual(uv,vec2(0.))) && all(lessThanEqual(uv,vec2(1.)))) {
        vec4 mark = texture2D(selected,uv);
        col = mix(col,mark.rgb,mark.a);
      }
      gl_FragColor = vec4(col,1.);
    }` })
  const sky = new ShaderMaterial({uniforms,vertexShader:vertex,transparent:true,depthWrite:false,visible:false,
    fragmentShader:weather+`
      uniform sampler2D ground; uniform float night;
      void main() {
        Gust gust = cloudGust(coord);
        float density = cloud(gust.uv);
        vec3 base = texture2D(ground,coord).rgb;
        float sea = smoothstep(.012,.13,base.b-base.r);
        float dayOpacity = pow(density,1.85)*mix(.12,.71,sea);
        vec4 dayCloud = vec4(mix(vec3(.67,.80,.84),vec3(.95,.97,.97),dayOpacity), dayOpacity);
        float nightOpacity = pow(density,1.75)*.4;
        vec4 nightCloud = vec4(vec3(.62,.70,.80), nightOpacity);
        gl_FragColor = mix(dayCloud, nightCloud, night);
        gl_FragColor.a = mix(gl_FragColor.a, density, .70 * gust.ridge) * gust.cover;
      }`})
  function setCloudCover(cover:number) {
    uniforms.cloudCover.value = cover
    sky.visible = cover > 0
  }
  return {ground,sky,uniforms,setCloudCover}
}
