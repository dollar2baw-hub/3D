export type PrimitiveKind =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'capsule'
  | 'cone'
  | 'torus'
  | 'head_sculpt';

export type RigPresetId = 'humanoid' | 'quadruped' | 'arm_chain' | 'tail_chain';
export type AnimationPresetId = 'idle_breathe' | 'walk_cycle' | 'wave_hand' | 'happy_jump' | 'combat_spin';
export type RenderEnvironmentId = 'studio_pbr' | 'clay_sculpt' | 'toon_anime' | 'unreal_sun' | 'wireframe_xray';
export type WorkspaceMode = 'model' | 'rig' | 'animate' | 'render';
export type GizmoMode = 'translate' | 'rotate' | 'scale' | 'sculpt';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface DeformModifiers {
  inflate: number; // -0.5 to 1.0
  twist: number; // -Math.PI to Math.PI
  taper: number; // -0.8 to 0.8
  bend: number; // -1.5 to 1.5
  pinchY: number; // -0.6 to 0.6
  smoothness: number; // 0 to 1
}

export interface SculptStroke {
  id: string;
  localPoint: Vec3;
  radius: number;
  strength: number; // positive = pull out, negative = push in
}

export interface StudioMeshPart {
  id: string;
  name: string;
  kind: PrimitiveKind;
  position: Vec3;
  rotation: Vec3; // Euler radians
  scale: Vec3;
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  wireframe: boolean;
  deform: DeformModifiers;
  sculptStrokes: SculptStroke[];
  boundBoneId: string | null; // Primary bone attachment or skin root
  visible: boolean;
}

export interface StudioBoneNode {
  id: string;
  name: string;
  parentId: string | null;
  restPosition: Vec3; // Relative to parent bone
  rotation: Vec3; // Current Euler radians in pose
}

export interface BoneKeyframe {
  frame: number; // 0 .. totalFrames
  boneRotations: Record<string, Vec3>;
  rootPositionOffset?: Vec3;
}

export interface SpriteSheetLayout {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  totalWidth: number;
  totalHeight: number;
  frameIndices: number[];
}

export const DEFAULT_DEFORM: DeformModifiers = {
  inflate: 0,
  twist: 0,
  taper: 0,
  bend: 0,
  pinchY: 0,
  smoothness: 0,
};

/**
 * Pure deterministic vertex deformation function ("Nắn khối").
 * Takes a base vertex (x, y, z) and its normal (nx, ny, nz) and returns deformed coordinates.
 */
export function applyVertexDeformation(
  pos: Vec3,
  normal: Vec3,
  deform: DeformModifiers,
  strokes: SculptStroke[] = [],
  boundsHalfHeight = 1.0,
): Vec3 {
  let x = pos.x;
  let y = pos.y;
  let z = pos.z;

  const normalizedY = Math.max(-1, Math.min(1, y / Math.max(0.001, boundsHalfHeight)));

  // Continuous radial outward vector from object center so multi-face seams (Box/Cylinder) stay 100% watertight
  const radialLen = Math.sqrt(x * x + y * y + z * z);
  const dirX = radialLen > 0.0001 ? x / radialLen : normal.x;
  const dirY = radialLen > 0.0001 ? y / radialLen : normal.y;
  const dirZ = radialLen > 0.0001 ? z / radialLen : normal.z;

  // 1. Inflate / Deflate along continuous outward direction
  if (Math.abs(deform.inflate) > 0.0001) {
    x += dirX * deform.inflate * 0.45;
    y += dirY * deform.inflate * 0.45;
    z += dirZ * deform.inflate * 0.45;
  }

  // 2. Taper along Y axis (scales X and Z based on height)
  if (Math.abs(deform.taper) > 0.0001) {
    const taperFactor = Math.max(0.15, 1 + normalizedY * deform.taper);
    x *= taperFactor;
    z *= taperFactor;
  }

  // 3. Waist Pinch / Bulge around Y = 0
  if (Math.abs(deform.pinchY) > 0.0001) {
    const bell = Math.exp(-normalizedY * normalizedY * 3.0);
    const pinchScale = Math.max(0.2, 1 + deform.pinchY * bell);
    x *= pinchScale;
    z *= pinchScale;
  }

  // 4. Twist around Y axis proportional to height
  if (Math.abs(deform.twist) > 0.0001) {
    const angle = normalizedY * deform.twist;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const nx = x * cosA - z * sinA;
    const nz = x * sinA + z * cosA;
    x = nx;
    z = nz;
  }

  // 5. Bend along X/Y plane
  if (Math.abs(deform.bend) > 0.0001) {
    const bendOffset = normalizedY * normalizedY * deform.bend * 0.45;
    x += bendOffset;
  }

  // 6. Local interactive sculpt brush strokes (Pull / Push / Pinch)
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    const dx = x - s.localPoint.x;
    const dy = y - s.localPoint.y;
    const dz = z - s.localPoint.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const rSq = s.radius * s.radius;
    if (distSq < rSq && rSq > 0.00001) {
      const falloff = Math.pow(1 - Math.sqrt(distSq) / s.radius, 2);
      const push = s.strength * falloff;
      x += dirX * push;
      y += dirY * push;
      z += dirZ * push;
    }
  }

  return { x, y, z };
}

/**
 * Computes world-space positions of all bones in a rig hierarchy for envelope skinning & UI display.
 */
export function computeBoneWorldPositions(bones: StudioBoneNode[]): Record<string, Vec3> {
  const byId = new Map<string, StudioBoneNode>();
  bones.forEach((b) => byId.set(b.id, b));

  const memo: Record<string, Vec3> = {};

  function resolve(id: string, depth = 0): Vec3 {
    if (memo[id]) return memo[id];
    const node = byId.get(id);
    if (!node || depth > 32) return { x: 0, y: 0, z: 0 };
    if (!node.parentId || !byId.has(node.parentId)) {
      memo[id] = { ...node.restPosition };
      return memo[id];
    }
    const parentPos = resolve(node.parentId, depth + 1);
    memo[id] = {
      x: parentPos.x + node.restPosition.x,
      y: parentPos.y + node.restPosition.y,
      z: parentPos.z + node.restPosition.z,
    };
    return memo[id];
  }

  bones.forEach((b) => resolve(b.id));
  return memo;
}

/**
 * Computes 4-bone envelope skinning weights & indices for a vertex in model space.
 * Returns normalized weights (sum === 1.0) and bone indices.
 */
export function computeEnvelopeSkinWeights(
  vertexWorldPos: Vec3,
  boneWorldPositions: Vec3[],
): { indices: [number, number, number, number]; weights: [number, number, number, number] } {
  if (boneWorldPositions.length === 0) {
    return { indices: [0, 0, 0, 0], weights: [1, 0, 0, 0] };
  }

  const scored = boneWorldPositions.map((bPos, index) => {
    const dx = vertexWorldPos.x - bPos.x;
    const dy = vertexWorldPos.y - bPos.y;
    const dz = vertexWorldPos.z - bPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Inverse distance squared with smoothing epsilon
    const weight = 1 / Math.pow(Math.max(0.08, dist), 2.6);
    return { index, weight };
  });

  scored.sort((a, b) => b.weight - a.weight);
  const top4 = scored.slice(0, 4);
  while (top4.length < 4) {
    top4.push({ index: 0, weight: 0 });
  }

  const sum = top4.reduce((acc, item) => acc + item.weight, 0);
  const norm = sum > 0.000001 ? 1 / sum : 1;

  return {
    indices: [top4[0].index, top4[1].index, top4[2].index, top4[3].index],
    weights: [
      top4[0].weight * norm,
      top4[1].weight * norm,
      top4[2].weight * norm,
      top4[3].weight * norm,
    ],
  };
}

/**
 * Automatically binds each mesh part to its nearest bone in world space.
 */
export function autoBindPartsToNearestBones(
  parts: StudioMeshPart[],
  bones: StudioBoneNode[],
): StudioMeshPart[] {
  if (bones.length === 0) return parts;
  const boneWorld = computeBoneWorldPositions(bones);

  return parts.map((part) => {
    let bestBoneId = bones[0].id;
    let bestDistSq = Infinity;
    for (const bone of bones) {
      const bPos = boneWorld[bone.id];
      if (!bPos) continue;
      const dx = part.position.x - bPos.x;
      const dy = part.position.y - bPos.y;
      const dz = part.position.z - bPos.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestBoneId = bone.id;
      }
    }
    return {
      ...part,
      boundBoneId: bestBoneId,
    };
  });
}

/**
 * Linearly interpolates bone rotations and root offset between keyframes at a given frame number.
 */
export function interpolatePoseAtFrame(
  keyframes: BoneKeyframe[],
  bones: StudioBoneNode[],
  frame: number,
  totalFrames: number,
): { boneRotations: Record<string, Vec3>; rootOffset: Vec3 } {
  const defaultRotations: Record<string, Vec3> = {};
  bones.forEach((b) => {
    defaultRotations[b.id] = { x: 0, y: 0, z: 0 };
  });

  if (keyframes.length === 0) {
    return { boneRotations: defaultRotations, rootOffset: { x: 0, y: 0, z: 0 } };
  }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const clampedFrame = Math.max(0, Math.min(totalFrames, frame));

  // Find surrounding keyframes
  let prev = sorted[0];
  let next = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].frame <= clampedFrame) {
      prev = sorted[i];
    }
    if (sorted[i].frame >= clampedFrame) {
      next = sorted[i];
      break;
    }
  }

  const span = next.frame - prev.frame;
  const alpha = span > 0.0001 ? (clampedFrame - prev.frame) / span : 0;
  // Smoothstep easing for natural organic motion
  const t = alpha * alpha * (3 - 2 * alpha);

  const resultRotations: Record<string, Vec3> = {};
  for (const bone of bones) {
    const rA = prev.boneRotations[bone.id] || { x: 0, y: 0, z: 0 };
    const rB = next.boneRotations[bone.id] || { x: 0, y: 0, z: 0 };
    resultRotations[bone.id] = {
      x: rA.x + (rB.x - rA.x) * t,
      y: rA.y + (rB.y - rA.y) * t,
      z: rA.z + (rB.z - rA.z) * t,
    };
  }

  const pA = prev.rootPositionOffset || { x: 0, y: 0, z: 0 };
  const pB = next.rootPositionOffset || { x: 0, y: 0, z: 0 };
  const rootOffset: Vec3 = {
    x: pA.x + (pB.x - pA.x) * t,
    y: pA.y + (pB.y - pA.y) * t,
    z: pA.z + (pB.z - pA.z) * t,
  };

  return { boneRotations: resultRotations, rootOffset };
}

/**
 * Generates preset bone rigs for beginners ("Rig xương tự động").
 */
export function createRigPreset(preset: RigPresetId): StudioBoneNode[] {
  if (preset === 'humanoid') {
    return [
      { id: 'bone_pelvis', name: 'Xương Chậu (Pelvis)', parentId: null, restPosition: { x: 0, y: 0.9, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_spine', name: 'Cột Sống (Spine)', parentId: 'bone_pelvis', restPosition: { x: 0, y: 0.55, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_head', name: 'Xương Đầu (Head)', parentId: 'bone_spine', restPosition: { x: 0, y: 0.65, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_arm_l', name: 'Tay Trái (LeftArm)', parentId: 'bone_spine', restPosition: { x: -0.62, y: 0.25, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_arm_r', name: 'Tay Phải (RightArm)', parentId: 'bone_spine', restPosition: { x: 0.62, y: 0.25, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_leg_l', name: 'Chân Trái (LeftLeg)', parentId: 'bone_pelvis', restPosition: { x: -0.28, y: -0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_leg_r', name: 'Chân Phải (RightLeg)', parentId: 'bone_pelvis', restPosition: { x: 0.28, y: -0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    ];
  }

  if (preset === 'quadruped') {
    return [
      { id: 'bone_pelvis', name: 'Thân Giữa (BodyRoot)', parentId: null, restPosition: { x: 0, y: 0.85, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_spine', name: 'Ngực Trước (Chest)', parentId: 'bone_pelvis', restPosition: { x: 0, y: 0.15, z: 0.55 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_head', name: 'Đầu Thú (Head)', parentId: 'bone_spine', restPosition: { x: 0, y: 0.4, z: 0.35 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_arm_l', name: 'Chân Trước Trái', parentId: 'bone_spine', restPosition: { x: -0.32, y: -0.45, z: 0.1 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_arm_r', name: 'Chân Trước Phải', parentId: 'bone_spine', restPosition: { x: 0.32, y: -0.45, z: 0.1 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_leg_l', name: 'Chân Sau Trái', parentId: 'bone_pelvis', restPosition: { x: -0.32, y: -0.4, z: -0.4 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_leg_r', name: 'Chân Sau Phải', parentId: 'bone_pelvis', restPosition: { x: 0.32, y: -0.4, z: -0.4 }, rotation: { x: 0, y: 0, z: 0 } },
    ];
  }

  if (preset === 'arm_chain') {
    return [
      { id: 'bone_pelvis', name: 'Đế Trụ (Base)', parentId: null, restPosition: { x: 0, y: 0.3, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_spine', name: 'Khớp Vai (Shoulder)', parentId: 'bone_pelvis', restPosition: { x: 0, y: 0.65, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_head', name: 'Khớp Khuỷu (Elbow)', parentId: 'bone_spine', restPosition: { x: 0, y: 0.65, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'bone_arm_r', name: 'Kẹp Gắp (ClawTip)', parentId: 'bone_head', restPosition: { x: 0, y: 0.55, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    ];
  }

  return [
    { id: 'bone_pelvis', name: 'Gốc Đuôi (Root)', parentId: null, restPosition: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    { id: 'bone_spine', name: 'Đốt Giữa (Mid)', parentId: 'bone_pelvis', restPosition: { x: 0, y: 0.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    { id: 'bone_head', name: 'Đầu Ngọn (Tip)', parentId: 'bone_spine', restPosition: { x: 0, y: 0.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  ];
}

/**
 * Generates multi-keyframe skeletal animations for any rig.
 */
export function generateAnimationPreset(
  preset: AnimationPresetId,
  bones: StudioBoneNode[],
  totalFrames = 48,
): BoneKeyframe[] {
  const zeroPose = (): Record<string, Vec3> => {
    const map: Record<string, Vec3> = {};
    bones.forEach((b) => {
      map[b.id] = { x: 0, y: 0, z: 0 };
    });
    return map;
  };

  const q1 = Math.round(totalFrames * 0.25);
  const q2 = Math.round(totalFrames * 0.5);
  const q3 = Math.round(totalFrames * 0.75);

  if (preset === 'walk_cycle') {
    const k0 = zeroPose();
    const k1 = zeroPose();
    const k2 = zeroPose();
    const k3 = zeroPose();
    const k4 = zeroPose();

    const setIf = (map: Record<string, Vec3>, id: string, v: Vec3) => {
      if (map[id]) map[id] = v;
    };

    // Frame 0 & 48: Neutral contact
    setIf(k0, 'bone_arm_l', { x: 0.45, y: 0, z: -0.1 });
    setIf(k0, 'bone_arm_r', { x: -0.45, y: 0, z: 0.1 });
    setIf(k0, 'bone_leg_l', { x: -0.5, y: 0, z: 0 });
    setIf(k0, 'bone_leg_r', { x: 0.5, y: 0, z: 0 });
    setIf(k0, 'bone_spine', { x: 0.08, y: 0.12, z: 0 });

    // Frame 12: Passing high
    setIf(k1, 'bone_arm_l', { x: 0, y: 0, z: -0.15 });
    setIf(k1, 'bone_arm_r', { x: 0, y: 0, z: 0.15 });
    setIf(k1, 'bone_leg_l', { x: 0, y: 0, z: 0 });
    setIf(k1, 'bone_leg_r', { x: 0, y: 0, z: 0 });
    setIf(k1, 'bone_head', { x: -0.06, y: 0, z: 0.05 });

    // Frame 24: Opposite stride
    setIf(k2, 'bone_arm_l', { x: -0.45, y: 0, z: -0.1 });
    setIf(k2, 'bone_arm_r', { x: 0.45, y: 0, z: 0.1 });
    setIf(k2, 'bone_leg_l', { x: 0.5, y: 0, z: 0 });
    setIf(k2, 'bone_leg_r', { x: -0.5, y: 0, z: 0 });
    setIf(k2, 'bone_spine', { x: 0.08, y: -0.12, z: 0 });

    // Frame 36: Return pass
    setIf(k3, 'bone_arm_l', { x: 0, y: 0, z: -0.15 });
    setIf(k3, 'bone_arm_r', { x: 0, y: 0, z: 0.15 });
    setIf(k3, 'bone_head', { x: -0.06, y: 0, z: -0.05 });

    // Frame 48: Loop match k0
    Object.assign(k4, JSON.parse(JSON.stringify(k0)));

    return [
      { frame: 0, boneRotations: k0, rootPositionOffset: { x: 0, y: 0, z: 0 } },
      { frame: q1, boneRotations: k1, rootPositionOffset: { x: 0, y: 0.12, z: 0 } },
      { frame: q2, boneRotations: k2, rootPositionOffset: { x: 0, y: 0, z: 0 } },
      { frame: q3, boneRotations: k3, rootPositionOffset: { x: 0, y: 0.12, z: 0 } },
      { frame: totalFrames, boneRotations: k4, rootPositionOffset: { x: 0, y: 0, z: 0 } },
    ];
  }

  if (preset === 'wave_hand') {
    const k0 = zeroPose();
    const k1 = zeroPose();
    const k2 = zeroPose();
    const k3 = zeroPose();
    const k4 = zeroPose();

    if (k1['bone_arm_r']) k1['bone_arm_r'] = { x: -0.2, y: 0, z: 2.35 };
    if (k1['bone_head']) k1['bone_head'] = { x: -0.1, y: 0.2, z: -0.12 };
    if (k1['bone_spine']) k1['bone_spine'] = { x: 0, y: 0.1, z: -0.08 };

    if (k2['bone_arm_r']) k2['bone_arm_r'] = { x: -0.2, y: 0, z: 1.75 };
    if (k2['bone_head']) k2['bone_head'] = { x: -0.1, y: -0.15, z: 0.1 };
    if (k2['bone_spine']) k2['bone_spine'] = { x: 0, y: -0.08, z: 0.06 };

    if (k3['bone_arm_r']) k3['bone_arm_r'] = { x: -0.2, y: 0, z: 2.4 };
    if (k3['bone_head']) k3['bone_head'] = { x: -0.08, y: 0.2, z: -0.1 };

    return [
      { frame: 0, boneRotations: k0, rootPositionOffset: { x: 0, y: 0, z: 0 } },
      { frame: q1, boneRotations: k1, rootPositionOffset: { x: 0, y: 0.04, z: 0 } },
      { frame: q2, boneRotations: k2, rootPositionOffset: { x: 0, y: 0.02, z: 0 } },
      { frame: q3, boneRotations: k3, rootPositionOffset: { x: 0, y: 0.05, z: 0 } },
      { frame: totalFrames, boneRotations: k4, rootPositionOffset: { x: 0, y: 0, z: 0 } },
    ];
  }

  if (preset === 'happy_jump') {
    const k0 = zeroPose();
    const k1 = zeroPose();
    const k2 = zeroPose();
    const k3 = zeroPose();
    const k4 = zeroPose();

    // Crouch anticipation
    if (k1['bone_spine']) k1['bone_spine'] = { x: 0.35, y: 0, z: 0 };
    if (k1['bone_arm_l']) k1['bone_arm_l'] = { x: 0.5, y: 0, z: -0.3 };
    if (k1['bone_arm_r']) k1['bone_arm_r'] = { x: 0.5, y: 0, z: 0.3 };
    if (k1['bone_leg_l']) k1['bone_leg_l'] = { x: -0.45, y: 0, z: -0.1 };
    if (k1['bone_leg_r']) k1['bone_leg_r'] = { x: -0.45, y: 0, z: 0.1 };

    // Peak jump cheer
    if (k2['bone_spine']) k2['bone_spine'] = { x: -0.2, y: 0, z: 0 };
    if (k2['bone_head']) k2['bone_head'] = { x: -0.25, y: 0, z: 0 };
    if (k2['bone_arm_l']) k2['bone_arm_l'] = { x: 0, y: 0, z: -2.2 };
    if (k2['bone_arm_r']) k2['bone_arm_r'] = { x: 0, y: 0, z: 2.2 };
    if (k2['bone_leg_l']) k2['bone_leg_l'] = { x: 0.3, y: 0, z: -0.25 };
    if (k2['bone_leg_r']) k2['bone_leg_r'] = { x: 0.3, y: 0, z: 0.25 };

    // Landing cushion
    if (k3['bone_spine']) k3['bone_spine'] = { x: 0.25, y: 0, z: 0 };
    if (k3['bone_arm_l']) k3['bone_arm_l'] = { x: 0.2, y: 0, z: -0.4 };
    if (k3['bone_arm_r']) k3['bone_arm_r'] = { x: 0.2, y: 0, z: 0.4 };

    return [
      { frame: 0, boneRotations: k0, rootPositionOffset: { x: 0, y: 0, z: 0 } },
      { frame: q1, boneRotations: k1, rootPositionOffset: { x: 0, y: -0.18, z: 0 } },
      { frame: q2, boneRotations: k2, rootPositionOffset: { x: 0, y: 0.65, z: 0 } },
      { frame: q3, boneRotations: k3, rootPositionOffset: { x: 0, y: -0.12, z: 0 } },
      { frame: totalFrames, boneRotations: k4, rootPositionOffset: { x: 0, y: 0, z: 0 } },
    ];
  }

  if (preset === 'combat_spin') {
    const k0 = zeroPose();
    const k1 = zeroPose();
    const k2 = zeroPose();
    const k3 = zeroPose();
    const k4 = zeroPose();

    if (k1['bone_pelvis']) k1['bone_pelvis'] = { x: 0, y: Math.PI * 0.5, z: 0 };
    if (k1['bone_arm_l']) k1['bone_arm_l'] = { x: 0, y: 0, z: -1.3 };
    if (k1['bone_arm_r']) k1['bone_arm_r'] = { x: 0, y: 0, z: 1.3 };

    if (k2['bone_pelvis']) k2['bone_pelvis'] = { x: 0, y: Math.PI, z: 0 };
    if (k2['bone_arm_l']) k2['bone_arm_l'] = { x: 0, y: 0, z: -1.5 };
    if (k2['bone_arm_r']) k2['bone_arm_r'] = { x: 0, y: 0, z: 1.5 };

    if (k3['bone_pelvis']) k3['bone_pelvis'] = { x: 0, y: Math.PI * 1.5, z: 0 };
    if (k4['bone_pelvis']) k4['bone_pelvis'] = { x: 0, y: Math.PI * 2, z: 0 };

    return [
      { frame: 0, boneRotations: k0, rootPositionOffset: { x: 0, y: 0, z: 0 } },
      { frame: q1, boneRotations: k1, rootPositionOffset: { x: 0, y: 0.15, z: 0 } },
      { frame: q2, boneRotations: k2, rootPositionOffset: { x: 0, y: 0.3, z: 0 } },
      { frame: q3, boneRotations: k3, rootPositionOffset: { x: 0, y: 0.15, z: 0 } },
      { frame: totalFrames, boneRotations: k4, rootPositionOffset: { x: 0, y: 0, z: 0 } },
    ];
  }

  // Default: idle_breathe
  const k0 = zeroPose();
  const kMid = zeroPose();
  const kEnd = zeroPose();
  if (kMid['bone_spine']) kMid['bone_spine'] = { x: -0.08, y: 0.05, z: 0 };
  if (kMid['bone_head']) kMid['bone_head'] = { x: 0.08, y: -0.06, z: 0.04 };
  if (kMid['bone_arm_l']) kMid['bone_arm_l'] = { x: 0.06, y: 0, z: -0.18 };
  if (kMid['bone_arm_r']) kMid['bone_arm_r'] = { x: -0.06, y: 0, z: 0.18 };

  return [
    { frame: 0, boneRotations: k0, rootPositionOffset: { x: 0, y: 0, z: 0 } },
    { frame: q2, boneRotations: kMid, rootPositionOffset: { x: 0, y: 0.06, z: 0 } },
    { frame: totalFrames, boneRotations: kEnd, rootPositionOffset: { x: 0, y: 0, z: 0 } },
  ];
}

/**
 * Calculates sprite sheet layout dimensions and evenly spaced frame numbers for exporting 2D game Frame Sheets.
 */
export function calculateSpriteSheetLayout(
  frameCount: number,
  columns: number,
  frameWidth: number,
  frameHeight: number,
  totalTimelineFrames: number,
): SpriteSheetLayout {
  const safeCount = Math.max(1, Math.min(64, Math.round(frameCount)));
  const safeCols = Math.max(1, Math.min(safeCount, Math.round(columns)));
  const rows = Math.ceil(safeCount / safeCols);
  const frameIndices: number[] = [];

  for (let i = 0; i < safeCount; i++) {
    const f = safeCount === 1 ? 0 : Math.round((i / (safeCount - 1)) * totalTimelineFrames);
    frameIndices.push(f);
  }

  return {
    columns: safeCols,
    rows,
    frameWidth,
    frameHeight,
    totalWidth: safeCols * frameWidth,
    totalHeight: rows * frameHeight,
    frameIndices,
  };
}

/**
 * Starter composite 3D Character Templates (3-12 distinct parts with varied roughness/metalness).
 */
export type CharacterTemplateId = 'robo_buddy' | 'knight_paladin' | 'cyber_fox';

export function createStarterModelParts(template: CharacterTemplateId = 'robo_buddy'): StudioMeshPart[] {
  if (template === 'knight_paladin') {
    return [
      {
        id: 'part_pelvis',
        name: 'Đai Giáp Hông (Pelvis)',
        kind: 'cylinder',
        position: { x: 0, y: 0.9, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.78, y: 0.42, z: 0.58 },
        color: '#475569',
        roughness: 0.35,
        metalness: 0.75,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: -0.15 },
        sculptStrokes: [],
        boundBoneId: 'bone_pelvis',
        visible: true,
      },
      {
        id: 'part_torso',
        name: 'Giáp Ngực Hiệp Sĩ (Cuirass)',
        kind: 'box',
        position: { x: 0, y: 1.48, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.95, y: 0.82, z: 0.62 },
        color: '#cbd5e1',
        roughness: 0.22,
        metalness: 0.85,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: 0.22, inflate: 0.08 },
        sculptStrokes: [],
        boundBoneId: 'bone_spine',
        visible: true,
      },
      {
        id: 'part_head',
        name: 'Mũ Giáp Hiệp Sĩ (GreatHelm)',
        kind: 'head_sculpt',
        position: { x: 0, y: 2.22, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.72, y: 0.75, z: 0.72 },
        color: '#e2e8f0',
        roughness: 0.2,
        metalness: 0.88,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: -0.12 },
        sculptStrokes: [],
        boundBoneId: 'bone_head',
        visible: true,
      },
      {
        id: 'part_crest',
        name: 'Mào Lông Đỏ (PlumeCrest)',
        kind: 'cone',
        position: { x: 0, y: 2.75, z: -0.05 },
        rotation: { x: -0.25, y: 0, z: 0 },
        scale: { x: 0.28, y: 0.55, z: 0.5 },
        color: '#ef4444',
        roughness: 0.78,
        metalness: 0.08,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, bend: -0.35 },
        sculptStrokes: [],
        boundBoneId: 'bone_head',
        visible: true,
      },
      {
        id: 'part_arm_l',
        name: 'Tay Khiên Trái (LeftArm)',
        kind: 'capsule',
        position: { x: -0.72, y: 1.42, z: 0 },
        rotation: { x: 0, y: 0, z: 0.12 },
        scale: { x: 0.32, y: 0.68, z: 0.32 },
        color: '#94a3b8',
        roughness: 0.3,
        metalness: 0.8,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_arm_l',
        visible: true,
      },
      {
        id: 'part_arm_r',
        name: 'Tay Kiếm Phải (RightArm)',
        kind: 'capsule',
        position: { x: 0.72, y: 1.42, z: 0 },
        rotation: { x: 0, y: 0, z: -0.12 },
        scale: { x: 0.32, y: 0.68, z: 0.32 },
        color: '#94a3b8',
        roughness: 0.3,
        metalness: 0.8,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_arm_r',
        visible: true,
      },
      {
        id: 'part_leg_l',
        name: 'Chân Giáp Trái (LeftGreave)',
        kind: 'cylinder',
        position: { x: -0.28, y: 0.42, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.32, y: 0.78, z: 0.34 },
        color: '#64748b',
        roughness: 0.38,
        metalness: 0.72,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: 0.15 },
        sculptStrokes: [],
        boundBoneId: 'bone_leg_l',
        visible: true,
      },
      {
        id: 'part_leg_r',
        name: 'Chân Giáp Phải (RightGreave)',
        kind: 'cylinder',
        position: { x: 0.28, y: 0.42, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.32, y: 0.78, z: 0.34 },
        color: '#64748b',
        roughness: 0.38,
        metalness: 0.72,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: 0.15 },
        sculptStrokes: [],
        boundBoneId: 'bone_leg_r',
        visible: true,
      },
    ];
  }

  if (template === 'cyber_fox') {
    return [
      {
        id: 'part_pelvis',
        name: 'Khung Hông Cáo (Pelvis)',
        kind: 'sphere',
        position: { x: 0, y: 0.88, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.68, y: 0.52, z: 0.62 },
        color: '#ea580c',
        roughness: 0.65,
        metalness: 0.15,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_pelvis',
        visible: true,
      },
      {
        id: 'part_torso',
        name: 'Thân Cáo Cơ Khí (Torso)',
        kind: 'capsule',
        position: { x: 0, y: 1.42, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.75, y: 0.65, z: 0.62 },
        color: '#f97316',
        roughness: 0.55,
        metalness: 0.22,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: 0.2 },
        sculptStrokes: [],
        boundBoneId: 'bone_spine',
        visible: true,
      },
      {
        id: 'part_head',
        name: 'Đầu Cáo (FoxHead)',
        kind: 'head_sculpt',
        position: { x: 0, y: 2.15, z: 0.05 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.82, y: 0.72, z: 0.85 },
        color: '#fb923c',
        roughness: 0.5,
        metalness: 0.18,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, taper: -0.28, pinchY: 0.15 },
        sculptStrokes: [],
        boundBoneId: 'bone_head',
        visible: true,
      },
      {
        id: 'part_ears',
        name: 'Tai Cáo Đôi (FoxEars)',
        kind: 'cone',
        position: { x: 0, y: 2.66, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.78, y: 0.45, z: 0.28 },
        color: '#1e293b',
        roughness: 0.35,
        metalness: 0.65,
        emissive: '#f59e0b',
        emissiveIntensity: 0.2,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM, pinchY: -0.35 },
        sculptStrokes: [],
        boundBoneId: 'bone_head',
        visible: true,
      },
      {
        id: 'part_arm_l',
        name: 'Tay Trái (LeftArm)',
        kind: 'capsule',
        position: { x: -0.62, y: 1.4, z: 0 },
        rotation: { x: 0, y: 0, z: 0.18 },
        scale: { x: 0.26, y: 0.6, z: 0.26 },
        color: '#fed7aa',
        roughness: 0.6,
        metalness: 0.1,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_arm_l',
        visible: true,
      },
      {
        id: 'part_arm_r',
        name: 'Tay Phải (RightArm)',
        kind: 'capsule',
        position: { x: 0.62, y: 1.4, z: 0 },
        rotation: { x: 0, y: 0, z: -0.18 },
        scale: { x: 0.26, y: 0.6, z: 0.26 },
        color: '#fed7aa',
        roughness: 0.6,
        metalness: 0.1,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_arm_r',
        visible: true,
      },
      {
        id: 'part_leg_l',
        name: 'Chân Trái (LeftLeg)',
        kind: 'capsule',
        position: { x: -0.26, y: 0.42, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.28, y: 0.68, z: 0.28 },
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.5,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_leg_l',
        visible: true,
      },
      {
        id: 'part_leg_r',
        name: 'Chân Phải (RightLeg)',
        kind: 'capsule',
        position: { x: 0.26, y: 0.42, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.28, y: 0.68, z: 0.28 },
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.5,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: 'bone_leg_r',
        visible: true,
      },
    ];
  }

  // Default: 'robo_buddy' (8 composite parts across 3 silhouette scales + varied PBR roughness/metalness)
  return [
    {
      id: 'part_pelvis',
      name: 'Khớp Hông (PelvisCore)',
      kind: 'cylinder',
      position: { x: 0, y: 0.9, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.72, y: 0.36, z: 0.56 },
      color: '#334155',
      roughness: 0.55,
      metalness: 0.65,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM, taper: -0.12 },
      sculptStrokes: [],
      boundBoneId: 'bone_pelvis',
      visible: true,
    },
    {
      id: 'part_torso',
      name: 'Thân Giáp Chính (ChestHull)',
      kind: 'box',
      position: { x: 0, y: 1.46, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.92, y: 0.78, z: 0.64 },
      color: '#f59e0b',
      roughness: 0.25,
      metalness: 0.45,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM, inflate: 0.14, taper: 0.18 },
      sculptStrokes: [],
      boundBoneId: 'bone_spine',
      visible: true,
    },
    {
      id: 'part_head',
      name: 'Đầu Robot (HeadDome)',
      kind: 'head_sculpt',
      position: { x: 0, y: 2.18, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.78, y: 0.68, z: 0.74 },
      color: '#f8fafc',
      roughness: 0.18,
      metalness: 0.25,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM, inflate: 0.08, taper: -0.1 },
      sculptStrokes: [],
      boundBoneId: 'bone_head',
      visible: true,
    },
    {
      id: 'part_visor',
      name: 'Kính Cảm Biến (VisorEye)',
      kind: 'box',
      position: { x: 0, y: 2.18, z: 0.34 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.56, y: 0.22, z: 0.16 },
      color: '#06b6d4',
      roughness: 0.12,
      metalness: 0.9,
      emissive: '#06b6d4',
      emissiveIntensity: 0.45,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM, bend: 0.1 },
      sculptStrokes: [],
      boundBoneId: 'bone_head',
      visible: true,
    },
    {
      id: 'part_arm_l',
      name: 'Cánh Tay Trái (LeftArm)',
      kind: 'capsule',
      position: { x: -0.68, y: 1.42, z: 0 },
      rotation: { x: 0, y: 0, z: 0.15 },
      scale: { x: 0.28, y: 0.64, z: 0.28 },
      color: '#e2e8f0',
      roughness: 0.35,
      metalness: 0.55,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM },
      sculptStrokes: [],
      boundBoneId: 'bone_arm_l',
      visible: true,
    },
    {
      id: 'part_arm_r',
      name: 'Cánh Tay Phải (RightArm)',
      kind: 'capsule',
      position: { x: 0.68, y: 1.42, z: 0 },
      rotation: { x: 0, y: 0, z: -0.15 },
      scale: { x: 0.28, y: 0.64, z: 0.28 },
      color: '#e2e8f0',
      roughness: 0.35,
      metalness: 0.55,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM },
      sculptStrokes: [],
      boundBoneId: 'bone_arm_r',
      visible: true,
    },
    {
      id: 'part_leg_l',
      name: 'Chân Trụ Trái (LeftLeg)',
      kind: 'cylinder',
      position: { x: -0.28, y: 0.42, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.3, y: 0.76, z: 0.32 },
      color: '#475569',
      roughness: 0.5,
      metalness: 0.6,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM, taper: -0.15 },
      sculptStrokes: [],
      boundBoneId: 'bone_leg_l',
      visible: true,
    },
    {
      id: 'part_leg_r',
      name: 'Chân Trụ Phải (RightLeg)',
      kind: 'cylinder',
      position: { x: 0.28, y: 0.42, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.3, y: 0.76, z: 0.32 },
      color: '#475569',
      roughness: 0.5,
      metalness: 0.6,
      emissive: '#000000',
      emissiveIntensity: 0,
      wireframe: false,
      deform: { ...DEFAULT_DEFORM, taper: -0.15 },
      sculptStrokes: [],
      boundBoneId: 'bone_leg_r',
      visible: true,
    },
  ];
}
