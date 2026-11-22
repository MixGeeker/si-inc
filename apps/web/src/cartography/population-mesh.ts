import { BufferAttribute, BufferGeometry, ShaderMaterial } from "three"
import type { PopulationPointCloud } from "./population-points"

export const populationPointDiameter = 2.5

export function populationGeometry(cloud: PopulationPointCloud) {
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(cloud.positions, 3))
  geometry.setAttribute("color", new BufferAttribute(cloud.colors, 3, true))
  geometry.computeBoundingSphere()
  return geometry
}

export function populationMaterial() {
  return new ShaderMaterial({
    uniforms: { diameter: { value: populationPointDiameter } },
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      uniform float diameter;
      varying vec3 pointColor;
      void main() {
        pointColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = diameter;
      }`,
    fragmentShader: `
      varying vec3 pointColor;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float opacity = 1.0 - smoothstep(0.30, 0.50, radius);
        if (opacity == 0.0) discard;
        gl_FragColor = vec4(pointColor, opacity);
      }`,
  })
}
