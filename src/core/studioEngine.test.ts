import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DEFORM,
  applyVertexDeformation,
  computeBoneWorldPositions,
  computeEnvelopeSkinWeights,
  autoBindPartsToNearestBones,
  interpolatePoseAtFrame,
  createRigPreset,
  generateAnimationPreset,
  calculateSpriteSheetLayout,
  createStarterModelParts,
} from './studioEngine';

test('applyVertexDeformation inflates, tapers, twists, and applies local sculpt brush strokes deterministically', () => {
  const basePos = { x: 1, y: 1, z: 0 };
  const normal = { x: 1, y: 0, z: 0 };

  // Identity deformation leaves vertex intact
  const untouched = applyVertexDeformation(basePos, normal, DEFAULT_DEFORM, []);
  assert.equal(untouched.x, 1);
  assert.equal(untouched.y, 1);
  assert.equal(untouched.z, 0);

  // Inflate pushes vertex outward along normal
  const inflated = applyVertexDeformation(
    basePos,
    normal,
    { ...DEFAULT_DEFORM, inflate: 0.5 },
    [],
  );
  assert.ok(inflated.x > 1.15);

  // Sculpt stroke pulls vertex out along radial direction when inside brush radius
  const sculpted = applyVertexDeformation(basePos, normal, DEFAULT_DEFORM, [
    { id: 's1', localPoint: { x: 1, y: 1, z: 0 }, radius: 0.8, strength: 0.4 },
  ]);
  assert.ok(sculpted.x > 1.25 && sculpted.y > 1.25);
});

test('computeBoneWorldPositions resolves hierarchical parent-child bone chains', () => {
  const rig = createRigPreset('humanoid');
  const worldMap = computeBoneWorldPositions(rig);

  // Pelvis at y=0.9, Spine +0.55 => 1.45, Head +0.65 => 2.10
  assert.ok(Math.abs(worldMap['bone_pelvis'].y - 0.9) < 1e-6);
  assert.ok(Math.abs(worldMap['bone_spine'].y - 1.45) < 1e-6);
  assert.ok(Math.abs(worldMap['bone_head'].y - 2.1) < 1e-6);
});

test('computeEnvelopeSkinWeights returns normalized 4-bone weights summing to 1.0', () => {
  const rig = createRigPreset('humanoid');
  const worldMap = computeBoneWorldPositions(rig);
  const bonePositions = rig.map((b) => worldMap[b.id]);

  // Vertex right next to head bone (0, 2.1, 0)
  const skin = computeEnvelopeSkinWeights({ x: 0, y: 2.12, z: 0 }, bonePositions);
  const sum = skin.weights.reduce((a, b) => a + b, 0);

  assert.ok(Math.abs(sum - 1.0) < 1e-6);
  // Head bone is index 2 in humanoid rig and should have highest weight
  assert.equal(skin.indices[0], 2);
  assert.ok(skin.weights[0] > 0.75);
});

test('autoBindPartsToNearestBones attaches starter parts to corresponding anatomical bones', () => {
  const rig = createRigPreset('humanoid');
  const parts = createStarterModelParts('robo_buddy').map((p) => ({
    ...p,
    boundBoneId: null,
  }));
  const bound = autoBindPartsToNearestBones(parts, rig);

  const headPart = bound.find((p) => p.id === 'part_head');
  const leftArmPart = bound.find((p) => p.id === 'part_arm_l');
  assert.equal(headPart?.boundBoneId, 'bone_head');
  assert.equal(leftArmPart?.boundBoneId, 'bone_arm_l');
});

test('interpolatePoseAtFrame smoothly interpolates bone rotations and root offset across keyframes', () => {
  const rig = createRigPreset('humanoid');
  const keyframes = generateAnimationPreset('happy_jump', rig, 48);

  const poseAtPeak = interpolatePoseAtFrame(keyframes, rig, 24, 48);
  assert.ok(poseAtPeak.rootOffset.y > 0.5);
  assert.ok(poseAtPeak.boneRotations['bone_arm_r'].z > 1.8);

  const poseAtMidTransition = interpolatePoseAtFrame(keyframes, rig, 18, 48);
  assert.ok(poseAtMidTransition.rootOffset.y > 0 && poseAtMidTransition.rootOffset.y < 0.65);
});

test('calculateSpriteSheetLayout computes atlas dimensions and evenly distributed timeline frames', () => {
  const layout = calculateSpriteSheetLayout(8, 4, 256, 256, 48);
  assert.equal(layout.columns, 4);
  assert.equal(layout.rows, 2);
  assert.equal(layout.totalWidth, 1024);
  assert.equal(layout.totalHeight, 512);
  assert.equal(layout.frameIndices.length, 8);
  assert.equal(layout.frameIndices[0], 0);
  assert.equal(layout.frameIndices[7], 48);
});
