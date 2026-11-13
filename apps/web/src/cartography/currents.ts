import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three"
import { Atlas } from "./atlas"
import { Y_SCALE } from "./layout"

const count=1850, segments=6, interval=1.4, secondsPerSecond=30000
export class CurrentTraces {
  readonly geometry = new BufferGeometry()
  private readonly positions = new Float32Array(count*segments*6)
  private readonly trail = new Float32Array(count*(segments+1)*2)
  private readonly ages = new Float32Array(count)
  private tick = 0
  private state = 46371
  private readonly flow = {x:0,y:0}
  constructor(private atlas:Atlas) {
    const colors = new Float32Array(this.positions.length)
    for (let i=0;i<count;i++) {
      this.seed(i)
      for (let j=0;j<segments;j++) {
        const c = (i*segments+j)*6, fade = 1-j/(segments+1)
        colors.set([.35+.27*fade,.60+.34*fade,.65+.32*fade,.35+.25*fade,.60+.32*fade,.65+.30*fade],c)
      }
    }
    // Warm up staggered trails so the first frame already shows the measured field.
    for (let i=0;i<segments*3;i++) this.advance(interval/3)
    this.geometry.setAttribute("position",new BufferAttribute(this.positions,3).setUsage(DynamicDrawUsage))
    this.geometry.setAttribute("color",new BufferAttribute(colors,3))
  }
  private random() {
    this.state = (Math.imul(1664525,this.state)+1013904223)>>>0
    return this.state/4294967296
  }
  private seed(index:number) {
    let x=0,y=0
    for (let tries=0;tries<96;tries++) {
      x=this.random()*360-180; y=this.random()*151-70
      if (this.atlas.vector(x,y,"sea",this.flow) && Math.hypot(this.flow.x,this.flow.y)>.045) break
    }
    const start=index*(segments+1)*2
    for (let k=0;k<=segments;k++) {this.trail[start+k*2]=x; this.trail[start+k*2+1]=y}
    this.ages[index]=11+this.random()*24
  }
  advance(dt:number) {
    this.tick+=dt
    const shift = this.tick >= interval
    if (shift) this.tick%=interval
    const deg = dt*secondsPerSecond/111320
    for (let i=0;i<count;i++) {
      const start = i*(segments+1)*2
      const x=this.trail[start],y=this.trail[start+1]
      this.ages[i]-=dt
      if (this.ages[i]<=0 || !this.atlas.vector(x,y,"sea",this.flow)) this.seed(i)
      else {
        const nextX = x+deg*this.flow.x/Math.max(.2,Math.cos(y*Math.PI/180)), nextY=y+deg*this.flow.y
        if (Math.abs(nextX)>180 || this.atlas.isLand(nextX,nextY)) this.seed(i)
        else {
          if (shift) this.trail.copyWithin(start+2,start,start+segments*2)
          this.trail[start]=nextX; this.trail[start+1]=nextY
        }
      }
      for (let k=0;k<segments;k++) {
        const j=start+k*2, n=(i*segments+k)*6
        this.positions[n]=this.trail[j]; this.positions[n+1]=this.trail[j+1]*Y_SCALE; this.positions[n+2]=.07
        this.positions[n+3]=this.trail[j+2]; this.positions[n+4]=this.trail[j+3]*Y_SCALE; this.positions[n+5]=.07
      }
    }
    if (this.geometry.attributes.position) this.geometry.attributes.position.needsUpdate=true
  }
}
