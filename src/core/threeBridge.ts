import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import {
  StudioMeshPart,
  StudioBoneNode,
  BoneKeyframe,
  PrimitiveKind,
  applyVertexDeformation,
  computeBoneWorldPositions,
  interpolatePoseAtFrame,
  calculateSpriteSheetLayout,
  SpriteSheetLayout,
} from './studioEngine';

/**
 * Detect software WebGL (SwiftShader / llvmpipe) per Three.js skill directive.
 */
export function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Creates a procedural subtle micro-grid bump/roughness texture so PBR surfaces have rich tactile detail.
 */
export function createProceduralSurfaceTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#929292';
  ctx.lineWidth = 1;
  for (let i = 0; i < 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/**
 * Creates a soft radial contact shadow texture for grounding the 3D character on the studio floor.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a 4-step gradient map for Anime/Toon cel-shading mode.
 */
export function createToonGradientTexture(): THREE.DataTexture {
  const colors = new Uint8Array([70, 135, 200, 255]);
  const texture = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds a base BufferGeometry for the given primitive kind with clean subdivisions suitable for sculpting/deforming.
 */
export function createBasePrimitiveGeometry(kind: PrimitiveKind): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
    case 'sphere':
      return new THREE.SphereGeometry(0.6, 28, 22);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.48, 0.52, 1, 24, 12);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.38, 0.65, 12, 24);
    case 'cone':
      return new THREE.ConeGeometry(0.55, 1.0, 24, 12);
    case 'torus':
      return new THREE.TorusGeometry(0.45, 0.18, 18, 32);
    case 'head_sculpt': {
      // Pre-shaped cranium + jawline base mesh for easy character head sculpting
      const geo = new THREE.SphereGeometry(0.58, 32, 26);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        const y = pos.getY(i);
        let z = pos.getZ(i);
        if (y < 0) {
          // Taper jaw slightly
          const jawFactor = 1 + y * 0.35;
          x *= jawFactor;
          // Chin slightly forward
          if (z > 0) z += (-y) * 0.12;
        } else {
          // Slightly wider cranium
          x *= 1.06;
        }
        pos.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
      return geo;
    }
  }
}

/**
 * Builds a deformed BufferGeometry for a StudioMeshPart by applying all deform modifiers & sculpt strokes.
 */
export function buildDeformedPartGeometry(part: StudioMeshPart): THREE.BufferGeometry {
  const geo = createBasePrimitiveGeometry(part.kind);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const halfHeight = Math.max(0.25, (bb.max.y - bb.min.y) * 0.5);

  const posAttr = geo.attributes.position;
  const normAttr = geo.attributes.normal;

  for (let i = 0; i < posAttr.count; i++) {
    const basePos = {
      x: posAttr.getX(i),
      y: posAttr.getY(i),
      z: posAttr.getZ(i),
    };
    const baseNorm = {
      x: normAttr.getX(i),
      y: normAttr.getY(i),
      z: normAttr.getZ(i),
    };
    const deformed = applyVertexDeformation(
      basePos,
      baseNorm,
      part.deform,
      part.sculptStrokes,
      halfHeight,
    );
    posAttr.setXYZ(i, deformed.x, deformed.y, deformed.z);
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Compiles a Three.js AnimationClip from the Studio's BoneKeyframe timeline so exported GLB/GLTF files
 * contain real skeletal & part animations ready for Unity Animator or Unreal Engine Sequencer.
 */
export function buildExportAnimationClip(
  clipName: string,
  keyframes: BoneKeyframe[],
  bones: StudioBoneNode[],
  totalFrames: number,
  fps: number,
): THREE.AnimationClip {
  const duration = Math.max(0.1, totalFrames / Math.max(1, fps));
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const times = sorted.map((kf) => (kf.frame / Math.max(1, totalFrames)) * duration);

  const tracks: THREE.KeyframeTrack[] = [];
  const tempEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  const tempQuat = new THREE.Quaternion();

  for (const bone of bones) {
    const quatValues: number[] = [];
    for (const kf of sorted) {
      const rot = kf.boneRotations[bone.id] || { x: 0, y: 0, z: 0 };
      tempEuler.set(rot.x, rot.y, rot.z, 'XYZ');
      tempQuat.setFromEuler(tempEuler);
      quatValues.push(tempQuat.x, tempQuat.y, tempQuat.z, tempQuat.w);
    }

    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${bone.id}.quaternion`, times, quatValues),
    );
  }

  // Root Pelvis position track if rootPositionOffset is animated
  const rootBone = bones.find((b) => !b.parentId) || bones[0];
  if (rootBone) {
    const posValues: number[] = [];
    for (const kf of sorted) {
      const off = kf.rootPositionOffset || { x: 0, y: 0, z: 0 };
      posValues.push(
        rootBone.restPosition.x + off.x,
        rootBone.restPosition.y + off.y,
        rootBone.restPosition.z + off.z,
      );
    }
    tracks.push(
      new THREE.VectorKeyframeTrack(`${rootBone.id}.position`, times, posValues),
    );
  }

  return new THREE.AnimationClip(clipName || 'PocketBlend_Action', duration, tracks);
}

/**
 * Builds a clean, standalone export scene hierarchy with real THREE.Bone nodes, attached deformed meshes,
 * and embedded AnimationClip so GLTFExporter / OBJExporter produces a game-engine-ready asset.
 */
export function buildCleanExportRoot(
  parts: StudioMeshPart[],
  bones: StudioBoneNode[],
  keyframes: BoneKeyframe[],
  totalFrames: number,
  fps: number,
  clipName = 'PocketBlend_Action',
): { rootGroup: THREE.Group; clip: THREE.AnimationClip; vertexCount: number; triangleCount: number } {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'PocketBlend_Character';

  const boneMap = new Map<string, THREE.Bone>();
  const boneWorld = computeBoneWorldPositions(bones);

  for (const bData of bones) {
    const bone = new THREE.Bone();
    bone.name = bData.id;
    bone.position.set(bData.restPosition.x, bData.restPosition.y, bData.restPosition.z);
    bone.rotation.set(bData.rotation.x, bData.rotation.y, bData.rotation.z);
    boneMap.set(bData.id, bone);
  }

  for (const bData of bones) {
    const bone = boneMap.get(bData.id)!;
    if (bData.parentId && boneMap.has(bData.parentId)) {
      boneMap.get(bData.parentId)!.add(bone);
    } else {
      rootGroup.add(bone);
    }
  }

  let vertexCount = 0;
  let triangleCount = 0;

  for (const part of parts) {
    if (!part.visible) continue;
    const geo = buildDeformedPartGeometry(part);
    vertexCount += geo.attributes.position.count;
    if (geo.index) {
      triangleCount += Math.round(geo.index.count / 3);
    } else {
      triangleCount += Math.round(geo.attributes.position.count / 3);
    }

    const mat = new THREE.MeshStandardMaterial({
      name: `${part.name}_Mat`,
      color: new THREE.Color(part.color),
      roughness: part.roughness,
      metalness: part.metalness,
      emissive: new THREE.Color(part.emissive || '#000000'),
      emissiveIntensity: part.emissiveIntensity || 0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = part.name.replace(/\s+/g, '_');
    mesh.scale.set(part.scale.x, part.scale.y, part.scale.z);
    mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);

    if (part.boundBoneId && boneMap.has(part.boundBoneId)) {
      const parentBone = boneMap.get(part.boundBoneId)!;
      const bW = boneWorld[part.boundBoneId] || { x: 0, y: 0, z: 0 };
      mesh.position.set(
        part.position.x - bW.x,
        part.position.y - bW.y,
        part.position.z - bW.z,
      );
      parentBone.add(mesh);
    } else {
      mesh.position.set(part.position.x, part.position.y, part.position.z);
      rootGroup.add(mesh);
    }
  }

  const clip = buildExportAnimationClip(clipName, keyframes, bones, totalFrames, fps);
  rootGroup.animations = [clip];

  return { rootGroup, clip, vertexCount, triangleCount };
}

export interface ExportResultInfo {
  format: 'glb' | 'gltf' | 'obj';
  filename: string;
  byteSize: number;
  vertexCount: number;
  triangleCount: number;
  boneCount: number;
  clipName: string;
  blobUrl: string;
}

/**
 * Exports the current 3D model, bone rig, and animation clip to GLB (Binary), GLTF (JSON), or OBJ (Wavefront)
 * for direct import into Unity or Unreal Engine.
 */
export async function exportModelForGameEngine(
  format: 'glb' | 'gltf' | 'obj',
  parts: StudioMeshPart[],
  bones: StudioBoneNode[],
  keyframes: BoneKeyframe[],
  totalFrames: number,
  fps: number,
  clipName = 'Character_Action',
): Promise<ExportResultInfo> {
  const { rootGroup, clip, vertexCount, triangleCount } = buildCleanExportRoot(
    parts,
    bones,
    keyframes,
    totalFrames,
    fps,
    clipName,
  );

  if (format === 'obj') {
    const exporter = new OBJExporter();
    rootGroup.updateMatrixWorld(true);
    const objText = exporter.parse(rootGroup);
    const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    return {
      format: 'obj',
      filename: `pocketblend_${clipName.toLowerCase()}.obj`,
      byteSize: blob.size,
      vertexCount,
      triangleCount,
      boneCount: bones.length,
      clipName: clip.name,
      blobUrl,
    };
  }

  const gltfExporter = new GLTFExporter();
  const isBinary = format === 'glb';

  return new Promise<ExportResultInfo>((resolve, reject) => {
    gltfExporter.parse(
      rootGroup,
      (result) => {
        let blob: Blob;
        if (result instanceof ArrayBuffer) {
          blob = new Blob([result], { type: 'model/gltf-binary' });
        } else {
          const jsonText = JSON.stringify(result, null, 2);
          blob = new Blob([jsonText], { type: 'application/gltf+json' });
        }
        const blobUrl = URL.createObjectURL(blob);
        resolve({
          format,
          filename: `pocketblend_${clipName.toLowerCase()}.${format}`,
          byteSize: blob.size,
          vertexCount,
          triangleCount,
          boneCount: bones.length,
          clipName: clip.name,
          blobUrl,
        });
      },
      (error) => {
        reject(error);
      },
      {
        binary: isBinary,
        animations: [clip],
      },
    );
  });
}

export interface SpriteSheetRenderResult {
  dataUrl: string;
  layout: SpriteSheetLayout;
  byteSizeApprox: number;
  metadataJson: string;
}

/**
 * Renders a multi-frame Sprite Sheet / Frame Sheet (.PNG) from the 3D scene by stepping through
 * the skeletal animation timeline and compositing each frame into an atlas canvas.
 */
export function renderSpriteFrameSheet(params: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  helperGroup: THREE.Group;
  floorMesh: THREE.Object3D;
  applyFramePose: (frame: number) => void;
  currentFrame: number;
  frameCount: number;
  columns: number;
  cellSize: number;
  totalFrames: number;
  transparentBg: boolean;
}): SpriteSheetRenderResult {
  const {
    renderer,
    scene,
    camera,
    helperGroup,
    floorMesh,
    applyFramePose,
    currentFrame,
    frameCount,
    columns,
    cellSize,
    totalFrames,
    transparentBg,
  } = params;

  const layout = calculateSpriteSheetLayout(
    frameCount,
    columns,
    cellSize,
    cellSize,
    totalFrames,
  );

  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = layout.totalWidth;
  atlasCanvas.height = layout.totalHeight;
  const ctx = atlasCanvas.getContext('2d')!;

  // Save current viewport state
  const prevBg = scene.background;
  const prevFog = scene.fog;
  const prevHelperVis = helperGroup.visible;
  const prevFloorVis = floorMesh.visible;
  const prevClearAlpha = renderer.getClearAlpha();

  helperGroup.visible = false;
  if (transparentBg) {
    scene.background = null;
    scene.fog = null;
    floorMesh.visible = false;
    renderer.setClearColor(0x000000, 0);
  }

  for (let i = 0; i < layout.frameIndices.length; i++) {
    const frameNum = layout.frameIndices[i];
    applyFramePose(frameNum);
    renderer.render(scene, camera);

    const col = i % layout.columns;
    const row = Math.floor(i / layout.columns);
    const dx = col * layout.frameWidth;
    const dy = row * layout.frameHeight;

    ctx.drawImage(
      renderer.domElement,
      0,
      0,
      renderer.domElement.width,
      renderer.domElement.height,
      dx,
      dy,
      layout.frameWidth,
      layout.frameHeight,
    );
  }

  // Restore viewport state
  scene.background = prevBg;
  scene.fog = prevFog;
  helperGroup.visible = prevHelperVis;
  floorMesh.visible = prevFloorVis;
  renderer.setClearAlpha(prevClearAlpha);
  applyFramePose(currentFrame);
  renderer.render(scene, camera);

  const dataUrl = atlasCanvas.toDataURL('image/png');
  const byteSizeApprox = Math.round((dataUrl.length * 3) / 4);

  const metadata = {
    app: 'PocketBlend 3D Studio',
    columns: layout.columns,
    rows: layout.rows,
    frameWidth: layout.frameWidth,
    frameHeight: layout.frameHeight,
    totalWidth: layout.totalWidth,
    totalHeight: layout.totalHeight,
    frames: layout.frameIndices.map((timelineFrame, idx) => ({
      index: idx,
      timelineFrame,
      x: (idx % layout.columns) * layout.frameWidth,
      y: Math.floor(idx / layout.columns) * layout.frameHeight,
      w: layout.frameWidth,
      h: layout.frameHeight,
    })),
  };

  return {
    dataUrl,
    layout,
    byteSizeApprox,
    metadataJson: JSON.stringify(metadata, null, 2),
  };
}
