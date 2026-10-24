// n8ao ships no type declarations; only the post-processing pass and the few settings render-core.ts sets are described.
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three'
  import type { Pass } from 'postprocessing'
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: { aoRadius: number; distanceFalloff: number; intensity: number; color: Color }
  }
}
