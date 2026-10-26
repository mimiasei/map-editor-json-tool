// ─── Object renderer ─────────────────────────────────────────────────────────
// Draws one map object from its exported game prefab (see src-tauri/sidecar/mesh_export.py) as a transparent PNG:
// orthographic camera at 25° elevation / 190° azimuth, warm sun, soft ground shadow, ambient occlusion. Runs on an
// OffscreenCanvas so it works inside a worker, which is how render-job.ts runs several at once.
//
// The transparent background comes from difference matting: the object is drawn once on black and once on white;
// alpha = 1 - mean(white - black) and the colour is black / alpha. That keeps the soft shadow and anti-aliased edges,
// which a chroma key or a cut-out would not.

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { EffectComposer, RenderPass } from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { ELEVATION, RENDER_PPU } from './canvas-size'

const SUPERSAMPLE = 2
const AZIMUTH = 190
/** Height the camera looks at, so tall buildings and the ground below them both fit. */
const TARGET_Y = 0.8

/** The game draws fire with shader particles, which have no mesh; these objects get a flame sprite instead. */
const FIRE: Record<string, { pos: [number, number, number]; h: number }> = {
  camp_fire: { pos: [0, 0.12, 0], h: 0.8 },
}

interface MaterialInfo {
  name?: string
  shader?: string
  diffuse?: string
  queue?: number
  alpha_min?: number
  emissive?: string
  _AlphaClipEnabled?: number
  _RenderMode?: number
  _Cutoff?: number
}

// With the strong warm sun, the glossy default material puts a tan highlight on every sunlit leaf layer of the pines (checked by shading
// the exported mesh with and without specular: with it the tan patches appear, without it the foliage is uniformly deep green, as in the game).
// Trees of every biome (pinetree_*, tree_dirt_*, tree_dead_*, tree_autumn_*, tree_lava_*, palms_*; not the two wonders tree_of_*) get this
// much of the dielectric specular instead, 0 = none. Chosen by name because their texture arrays are shared with mountains, pools and
// other props. Other objects keep their look.
const FOLIAGE_SID = /^(pinetree_|tree_(?!of_)|palms_)/
const FOLIAGE_SPECULAR = 0

interface MeshMeta {
  materials: Record<string, MaterialInfo>
  bbox_min: [number, number, number]
  bbox_max: [number, number, number]
}

export interface RenderRequest {
  sid: string
  /** File name -> bytes of the sidecar's output folder for this object. */
  files: Record<string, ArrayBuffer>
  /** Flame sprite PNG for objects in FIRE. */
  fireSprite?: ArrayBuffer
  /** Output canvas in px at RENDER_PPU, centred on the object. */
  canvas: number
  /** Turn around Y, degrees. */
  rot: number
  /** Hide everything below this height (default 0, the ground): leaves only the top of a cliff wall. */
  cutBelow?: number
  /** Camera elevation in degrees (default ELEVATION). */
  elevation?: number
  /** Also answer with a mask of the upward-facing surfaces (see RenderResult.mask). */
  topMask?: boolean
  /** No shadow on the ground (the cliff tops, and walls whose shadow falls on higher ground). */
  noShadow?: boolean
  /** Camera azimuth in degrees (default AZIMUTH). */
  azimuth?: number
}

export interface RenderResult {
  png: ArrayBuffer
  /** Cropped image size and where the object's origin (the prefab's ground point) lies in it, in px. */
  w: number
  h: number
  ox: number
  oy: number
  /** Visible pixels touch the canvas border: the object is cut off and needs a bigger canvas. */
  clipped: boolean
  empty: boolean
  /** Same size as png: white where the rock's top surfaces are, alpha = how much. The grid paints the biome's ground texture through it. */
  mask?: ArrayBuffer
}

type Canvas2D = OffscreenCanvasRenderingContext2D

let renderer: THREE.WebGLRenderer | null = null
function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer
  const canvas = new OffscreenCanvas(16, 16)
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.VSMShadowMap
  // Geometry below the ground plane (pits, foundations) is hidden; the map draws its own terrain.
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
  return renderer
}

async function loadTexture(buf: ArrayBuffer | undefined, linear = false): Promise<THREE.Texture | null> {
  if (!buf) return null
  const bitmap = await createImageBitmap(new Blob([buf]), { imageOrientation: 'flipY', colorSpaceConversion: 'none' })
  const tex = new THREE.Texture(bitmap)
  tex.flipY = false // the bitmap is already flipped
  tex.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace
  tex.anisotropy = 8
  // Some UVs run past 0..1 (the abbey uses 0..2); clamping would smear one edge pixel over the rest.
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

interface Built {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  disposables: { dispose(): void }[]
}

async function buildScene(req: RenderRequest, meta: MeshMeta): Promise<Built> {
  const half = req.canvas / RENDER_PPU / 2
  const scene = new THREE.Scene()
  const disposables: { dispose(): void }[] = []
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100)
  const a = ((req.azimuth ?? AZIMUTH) * Math.PI) / 180
  const e = ((req.elevation ?? ELEVATION) * Math.PI) / 180
  const target = new THREE.Vector3(0, TARGET_Y, 0)
  camera.position
    .copy(target)
    .add(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(30))
  camera.lookAt(target)

  const shadowed = (light: THREE.DirectionalLight) => {
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.camera.left = light.shadow.camera.bottom = -6
    light.shadow.camera.right = light.shadow.camera.top = 6
    light.shadow.camera.near = 1
    light.shadow.camera.far = 40
    light.shadow.radius = 16
    light.shadow.blurSamples = 25
    light.shadow.bias = -0.0003
    light.shadow.normalBias = 0.03
    scene.add(light)
    disposables.push({ dispose: () => light.shadow.map?.dispose() })
  }
  // The warm light that colours the object...
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.66, 0.32), 7.6)
  sun.position.set(-0.439, 0.643, 0.627).multiplyScalar(12)
  shadowed(sun)
  // ...and a second, invisible one (intensity 0) that only casts the soft ground shadow, lower and from another side.
  const shadowElev = (60 * Math.PI) / 180
  const shadowSun = new THREE.DirectionalLight(0xffffff, 0)
  shadowSun.position.set(-0.574 * Math.cos(shadowElev), Math.sin(shadowElev), 0.819 * Math.cos(shadowElev)).multiplyScalar(12)
  shadowed(shadowSun)
  scene.add(new THREE.HemisphereLight(new THREE.Color(0.75, 0.8, 0.9), new THREE.Color(0.55, 0.55, 0.55), 3.6))

  // Shadow-only ground; it receives just the second light's shadow (loop index 1).
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.65 })
  groundMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <shadowmask_pars_fragment>',
      THREE.ShaderChunk.shadowmask_pars_fragment.replace(
        'shadow *= receiveShadow ? getShadow( directionalShadowMap',
        'shadow *= (receiveShadow && UNROLLED_LOOP_INDEX == 1) ? getShadow( directionalShadowMap',
      ),
    )
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  // A cliff top (cut at 0.5 or more) sits on raised ground that hides its foot, so it casts no shadow onto the low ground.
  ground.visible = !(req.noShadow || (req.cutBelow && req.cutBelow >= 0.5))
  disposables.push(ground.geometry, groundMat)

  const mats: Record<string, THREE.Material> = {}
  for (const [name, info] of Object.entries(meta.materials)) {
    const map = await loadTexture(req.files[`${name}_diffuse.png`])
    // River pieces: the terrain's cut-out (CT_mat) only hides what lies below the ground, and the animated water (Hex/Sea) is its flat deep colour.
    if (name === 'CT_mat') {
      mats[name] = new THREE.MeshBasicMaterial({ colorWrite: false })
      mats[name].userData.clip = true
      disposables.push(mats[name])
      continue
    }
    if (info.shader === 'Hex/Sea') {
      mats[name] = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })
      disposables.push(mats[name])
      if (map) disposables.push(map)
      continue
    }
    const emissiveMap = info.emissive ? await loadTexture(req.files[`${name}_emissive.png`]) : null
    const cutout = info.queue === 2450 && info._AlphaClipEnabled === 1 && (info.alpha_min ?? 255) < 255
    const blended = info.queue === 3000 && info._RenderMode === 2 && (info.alpha_min ?? 255) < 255
    const alphaMap = cutout || blended ? await loadTexture(req.files[`${name}_alpha.png`], true) : null
    const isBlended = blended && !!alphaMap
    const foliage = FOLIAGE_SID.test(req.sid)
    const mat = new THREE.MeshPhysicalMaterial({
      specularIntensity: foliage ? FOLIAGE_SPECULAR : 1,
      map,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: emissiveMap ? 0xffffff : 0x000000,
      emissiveMap,
      emissiveIntensity: 0.5,
      alphaMap,
      alphaTest: cutout && alphaMap ? (info._Cutoff ?? 0.5) : 0,
      transparent: isBlended,
      depthWrite: !isBlended,
    })
    mat.userData.blended = isBlended
    mats[name] = mat
    disposables.push(mat)
    for (const t of [map, emissiveMap, alphaMap]) if (t) disposables.push(t)
  }

  const loader = new OBJLoader()
  // The OBJ names its materials; hand the loader ours instead of letting it read the .mtl.
  loader.setMaterials({ preload() {}, create: (n: string) => mats[n], materialsInfo: {} } as never)
  const obj = loader.parse(new TextDecoder().decode(req.files['model.obj']))
  obj.traverse((m) => {
    if (!(m instanceof THREE.Mesh)) return
    m.castShadow = true
    m.receiveShadow = true
    const list = ([] as THREE.Material[]).concat(m.material)
    if (list.every((x) => mats[x.name]?.userData.clip)) m.castShadow = m.receiveShadow = false
    m.material = Array.isArray(m.material) ? list.map((x) => mats[x.name] ?? x) : (mats[m.material.name] ?? m.material)
    // Glass-like blended parts would cast a solid shadow.
    if (list.every((x) => (mats[x.name] ?? x).userData.blended)) m.castShadow = false
    disposables.push(m.geometry)
  })
  obj.rotation.y = (req.rot * Math.PI) / 180
  scene.add(obj)

  const fire = FIRE[req.sid]
  const fireTex = fire ? await loadTexture(req.fireSprite) : null
  if (fire && fireTex) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, toneMapped: false }))
    sprite.center.set(0.5, 0)
    sprite.position.set(...fire.pos)
    const img = fireTex.image as ImageBitmap
    sprite.scale.set(fire.h * (img.width / img.height), fire.h, 1)
    scene.add(sprite)
    disposables.push(sprite.material, fireTex)
  }
  return { scene, camera, disposables }
}

function shot(composer: EffectComposer, scene: THREE.Scene, color: number, px: number, g: Canvas2D, canvas: OffscreenCanvas): Uint8ClampedArray {
  scene.background = new THREE.Color(color)
  composer.render()
  canvas.width = canvas.height = px
  g.imageSmoothingQuality = 'high'
  g.drawImage(getRenderer().domElement as unknown as OffscreenCanvas, 0, 0, px, px)
  return g.getImageData(0, 0, px, px).data
}

export async function renderObject(req: RenderRequest): Promise<RenderResult> {
  const meta = JSON.parse(new TextDecoder().decode(req.files['meta.json'])) as MeshMeta
  const px = req.canvas
  const size = px * SUPERSAMPLE
  const gl = getRenderer()
  gl.setSize(size, size, false)
  gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(req.cutBelow ?? 0))]
  const built = await buildScene(req, meta)
  const composer = new EffectComposer(gl)
  composer.addPass(new RenderPass(built.scene, built.camera))
  const ao = new N8AOPostPass(built.scene, built.camera, size, size)
  ao.configuration.aoRadius = 0.7
  ao.configuration.distanceFalloff = 1.0
  ao.configuration.intensity = 4.5
  ao.configuration.color = new THREE.Color(0, 0, 0)
  composer.addPass(ao)
  built.scene.background = new THREE.Color(0x000000)
  for (let i = 0; i < 2; i++) composer.render() // warm-up: shadow maps and AO

  const down = new OffscreenCanvas(px, px)
  const g = down.getContext('2d', { willReadFrequently: true }) as Canvas2D
  const black = new Uint8ClampedArray(shot(composer, built.scene, 0x000000, px, g, down))
  const white = shot(composer, built.scene, 0xffffff, px, g, down)

  const out = new ImageData(px, px)
  let minX = px, minY = px, maxX = -1, maxY = -1, clipped = false
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const j = (y * px + x) * 4
      const d = (white[j] - black[j] + (white[j + 1] - black[j + 1]) + (white[j + 2] - black[j + 2])) / (3 * 255)
      const alpha = Math.min(1, Math.max(0, 1 - d))
      if (alpha > 1e-3) {
        out.data[j] = black[j] / alpha
        out.data[j + 1] = black[j + 1] / alpha
        out.data[j + 2] = black[j + 2] / alpha
      }
      const a8 = Math.round(alpha * 255)
      out.data[j + 3] = a8
      if (a8 > 4) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      if (a8 > 40 && (x === 0 || y === 0 || x === px - 1 || y === px - 1)) clipped = true
    }
  }
  composer.dispose()
  for (const d of built.disposables) d.dispose()

  if (maxX < 0) return { png: new ArrayBuffer(0), w: 0, h: 0, ox: 0, oy: 0, clipped: false, empty: true }
  const pad = 2
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad)
  const x1 = Math.min(px - 1, maxX + pad), y1 = Math.min(px - 1, maxY + pad)
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const crop = new OffscreenCanvas(w, h)
  const cg = crop.getContext('2d') as Canvas2D
  const full = new OffscreenCanvas(px, px)
  full.getContext('2d')!.putImageData(out, 0, 0)
  cg.drawImage(full, x0, y0, w, h, 0, 0, w, h)
  const blob = await crop.convertToBlob({ type: 'image/png' })
  let mask: ArrayBuffer | undefined
  if (req.topMask) {
    // The tops of the rock are its brightest surfaces (lit from above, no shading); sides and shadowed ground are darker. Brightness of the
    // un-premultiplied colour, times coverage, so shadow and edges stay out. An extra normal-material pass was tried first and did not work
    // through the composer.
    const m = new ImageData(px, px)
    for (let i = 0; i < px * px; i++) {
      const lum = 0.3 * out.data[i * 4] + 0.59 * out.data[i * 4 + 1] + 0.11 * out.data[i * 4 + 2]
      const t = Math.min(1, Math.max(0, (lum - 158) / 12))
      m.data[i * 4] = m.data[i * 4 + 1] = m.data[i * 4 + 2] = 255
      m.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * out.data[i * 4 + 3])
    }
    const mfull = new OffscreenCanvas(px, px)
    mfull.getContext('2d')!.putImageData(m, 0, 0)
    const mcrop = new OffscreenCanvas(w, h)
    mcrop.getContext('2d')!.drawImage(mfull, x0, y0, w, h, 0, 0, w, h)
    mask = await (await mcrop.convertToBlob({ type: 'image/png' })).arrayBuffer()
  }
  return {
    png: await blob.arrayBuffer(),
    mask,
    w,
    h,
    // The prefab origin sits at the canvas centre horizontally and, because the camera looks at TARGET_Y, below it by
    // TARGET_Y * cos(elevation) tiles.
    ox: px / 2 - x0,
    oy: px / 2 + TARGET_Y * Math.cos(((req.elevation ?? ELEVATION) * Math.PI) / 180) * RENDER_PPU - y0,
    clipped,
    empty: false,
  }
}
