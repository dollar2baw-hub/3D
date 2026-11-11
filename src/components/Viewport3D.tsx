import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  StudioMeshPart,
  StudioBoneNode,
  BoneKeyframe,
  WorkspaceMode,
  GizmoMode,
  RenderEnvironmentId,
  Vec3,
  computeBoneWorldPositions,
  interpolatePoseAtFrame,
} from '../core/studioEngine';
import {
  detectSoftwareGl,
  createProceduralSurfaceTexture,
  createContactShadowTexture,
  createToonGradientTexture,
  buildDeformedPartGeometry,
  renderSpriteFrameSheet,
  SpriteSheetRenderResult,
} from '../core/threeBridge';

export type CameraViewPreset = 'front' | 'perspective' | 'side' | 'top';

export interface Viewport3DHandle {
  setCameraPreset: (preset: CameraViewPreset) => void;
  generateSpriteSheet: (options: {
    frameCount: number;
    columns: number;
    cellSize: number;
    transparentBg: boolean;
  }) => SpriteSheetRenderResult | null;
  recordAnimationVideo: (options: {
    durationSeconds: number;
    fps: number;
    onProgress?: (pct: number) => void;
  }) => Promise<{ blobUrl: string; mimeType: string; extension: string; byteSize: number }>;
  captureStillPng: () => string | null;
}

interface Viewport3DProps {
  parts: StudioMeshPart[];
  bones: StudioBoneNode[];
  keyframes: BoneKeyframe[];
  selectedPartId: string | null;
  selectedBoneId: string | null;
  workspaceMode: WorkspaceMode;
  gizmoMode: GizmoMode;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  showBonesXRay: boolean;
  showWireframeOverlay: boolean;
  renderEnv: RenderEnvironmentId;
  turntableActive: boolean;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  onSelectPart: (partId: string) => void;
  onSelectBone: (boneId: string) => void;
  onUpdatePartTransform: (partId: string, pos: Vec3, rot: Vec3, scale: Vec3) => void;
  onUpdateBoneRotation: (boneId: string, rot: Vec3) => void;
  onAddSculptStroke: (partId: string, localPoint: Vec3, radius: number, strength: number) => void;
  onFrameAdvance: (nextFrame: number) => void;
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>((props, ref) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transformGizmo: TransformControls;
    characterRoot: THREE.Group;
    boneHelperGroup: THREE.Group;
    floorGroup: THREE.Group;
    keyLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    rimLight: THREE.DirectionalLight;
    partMeshes: Map<string, THREE.Mesh>;
    boneNodes: Map<string, THREE.Bone>;
    boneVisuals: Map<string, THREE.Mesh>;
    surfaceTexture: THREE.CanvasTexture;
    toonGradient: THREE.DataTexture;
    isSoftwareGl: boolean;
    requestRender: () => void;
    applyFramePose: (frameNum: number) => void;
    syncSceneContent: () => void;
    setCamTarget: (pos: THREE.Vector3, look: THREE.Vector3) => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    setCameraPreset(preset: CameraViewPreset) {
      const eng = engineRef.current;
      if (!eng) return;
      if (preset === 'front') {
        eng.setCamTarget(new THREE.Vector3(0, 1.45, 4.2), new THREE.Vector3(0, 1.3, 0));
      } else if (preset === 'side') {
        eng.setCamTarget(new THREE.Vector3(4.2, 1.45, 0), new THREE.Vector3(0, 1.3, 0));
      } else if (preset === 'top') {
        eng.setCamTarget(new THREE.Vector3(0, 5.2, 0.4), new THREE.Vector3(0, 1.1, 0));
      } else {
        eng.setCamTarget(new THREE.Vector3(2.8, 2.15, 3.6), new THREE.Vector3(0, 1.25, 0));
      }
    },

    generateSpriteSheet(options) {
      const eng = engineRef.current;
      if (!eng) return null;
      const p = propsRef.current;
      return renderSpriteFrameSheet({
        renderer: eng.renderer,
        scene: eng.scene,
        camera: eng.camera,
        helperGroup: eng.boneHelperGroup,
        floorMesh: eng.floorGroup,
        applyFramePose: eng.applyFramePose,
        currentFrame: p.currentFrame,
        frameCount: options.frameCount,
        columns: options.columns,
        cellSize: options.cellSize,
        totalFrames: p.totalFrames,
        transparentBg: options.transparentBg,
      });
    },

    async recordAnimationVideo({ durationSeconds, fps, onProgress }) {
      const eng = engineRef.current;
      if (!eng) throw new Error('WebGL chưa sẵn sàng');

      const canvas = eng.renderer.domElement;
      const candidates = [
        { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
        { mime: 'video/mp4', ext: 'mp4' },
        { mime: 'video/webm;codecs=vp9', ext: 'webm' },
        { mime: 'video/webm', ext: 'webm' },
      ];
      let chosen = { mime: 'video/webm', ext: 'webm' };
      if (typeof MediaRecorder !== 'undefined') {
        for (const c of candidates) {
          if (MediaRecorder.isTypeSupported(c.mime)) {
            chosen = c;
            break;
          }
        }
      }

      const stream = canvas.captureStream(fps);
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: chosen.mime,
        videoBitsPerSecond: 4_500_000,
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const totalSteps = Math.max(12, Math.round(durationSeconds * fps));
      const p = propsRef.current;
      const prevHelperVis = eng.boneHelperGroup.visible;
      eng.boneHelperGroup.visible = false;
      eng.transformGizmo.detach();

      return new Promise((resolve) => {
        recorder.onstop = () => {
          eng.boneHelperGroup.visible = prevHelperVis;
          eng.syncSceneContent();
          eng.requestRender();
          const blob = new Blob(chunks, { type: chosen.mime });
          const blobUrl = URL.createObjectURL(blob);
          resolve({
            blobUrl,
            mimeType: chosen.mime,
            extension: chosen.ext,
            byteSize: blob.size,
          });
        };

        recorder.start();
        let step = 0;
        const stepInterval = Math.max(16, Math.round(1000 / fps));

        const recordStep = () => {
          if (step >= totalSteps) {
            recorder.stop();
            return;
          }
          const frame = ((step / totalSteps) * p.totalFrames) % Math.max(1, p.totalFrames);
          eng.applyFramePose(frame);
          eng.renderer.render(eng.scene, eng.camera);
          step++;
          if (onProgress) {
            onProgress(Math.min(100, Math.round((step / totalSteps) * 100)));
          }
          window.setTimeout(recordStep, stepInterval);
        };

        recordStep();
      });
    },

    captureStillPng() {
      const eng = engineRef.current;
      if (!eng) return null;
      const prevHelper = eng.boneHelperGroup.visible;
      eng.boneHelperGroup.visible = false;
      eng.renderer.render(eng.scene, eng.camera);
      const url = eng.renderer.domElement.toDataURL('image/png');
      eng.boneHelperGroup.visible = prevHelper;
      eng.requestRender();
      return url;
    },
  }));

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = mount.getBoundingClientRect();
    const initW = Math.max(320, rect.width || window.innerWidth);
    const initH = Math.max(320, rect.height || window.innerHeight);
    renderer.setSize(initW, initH);
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.042);

    // Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 120);
    const isPortraitInit = initW < initH;
    if (isPortraitInit) {
      camera.position.set(3.5, 2.45, 5.4);
    } else {
      camera.position.set(2.8, 2.15, 3.8);
    }

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, isPortraitInit ? 0.72 : 1.15, 0);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.07;
    orbit.minDistance = 1.2;
    orbit.maxDistance = 18;
    orbit.maxPolarAngle = Math.PI * 0.52;
    orbit.update();

    // Balanced 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    keyLight.position.set(4.5, 6.5, 4.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    const d = 3.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-4.0, 3.8, -3.5);
    scene.add(rimLight);

    // Floor Grid + Contact Shadow Grounding (offset on Y to prevent coplanar Z-fighting)
    const floorGroup = new THREE.Group();
    scene.add(floorGroup);

    const pedestalGeo = new THREE.CylinderGeometry(2.4, 2.6, 0.08, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.75,
      metalness: 0.2,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.position.y = -0.04;
    pedestalMesh.receiveShadow = true;
    floorGroup.add(pedestalMesh);

    const gridHelper = new THREE.GridHelper(12, 24, 0xf59e0b, 0x1e293b);
    gridHelper.position.y = 0.005;
    const gridMat = gridHelper.material as THREE.Material;
    gridMat.polygonOffset = true;
    gridMat.polygonOffsetFactor = -1;
    gridMat.polygonOffsetUnits = -1;
    floorGroup.add(gridHelper);

    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.015;
    floorGroup.add(shadowPlane);

    const characterRoot = new THREE.Group();
    characterRoot.name = 'CharacterRoot';
    scene.add(characterRoot);

    const boneHelperGroup = new THREE.Group();
    boneHelperGroup.name = 'BoneHelperGroup';
    scene.add(boneHelperGroup);

    // TransformControls Gizmo for interactive Translate / Rotate / Scale
    const transformGizmo = new TransformControls(camera, renderer.domElement);
    transformGizmo.setSize(0.85);
    const gizmoHelper = transformGizmo.getHelper();
    scene.add(gizmoHelper);

    const surfaceTexture = createProceduralSurfaceTexture(renderer);
    const toonGradient = createToonGradientTexture();

    const partMeshes = new Map<string, THREE.Mesh>();
    const boneNodes = new Map<string, THREE.Bone>();
    const boneVisuals = new Map<string, THREE.Mesh>();
    const partSignatures = new Map<string, string>();

    // Pre-allocated scratch vectors outside render loop (zero GC)
    const _camTargetPos = new THREE.Vector3();
    const _camLookTarget = new THREE.Vector3();
    let camTransitionActive = false;

    function setCamTarget(pos: THREE.Vector3, look: THREE.Vector3) {
      _camTargetPos.copy(pos);
      _camLookTarget.copy(look);
      camTransitionActive = true;
      requestRender();
    }

    orbit.addEventListener('start', () => {
      camTransitionActive = false;
    });

    // Build / update scene hierarchy from studio state
    function syncSceneContent() {
      const p = propsRef.current;

      // 1. Update Environment / Lighting preset
      if (p.renderEnv === 'unreal_sun') {
        scene.background = new THREE.Color(0x172554);
        scene.fog = new THREE.FogExp2(0x172554, 0.035);
        keyLight.color.setHex(0xffedd5);
        keyLight.intensity = 2.8;
        hemiLight.color.setHex(0x60a5fa);
        hemiLight.groundColor.setHex(0x1e1b4b);
      } else if (p.renderEnv === 'clay_sculpt') {
        scene.background = new THREE.Color(0x1c1917);
        scene.fog = new THREE.FogExp2(0x1c1917, 0.04);
        keyLight.color.setHex(0xfde68a);
        keyLight.intensity = 2.0;
        hemiLight.color.setHex(0xfed7aa);
        hemiLight.groundColor.setHex(0x292524);
      } else if (p.renderEnv === 'toon_anime') {
        scene.background = new THREE.Color(0x0f172a);
        scene.fog = new THREE.FogExp2(0x0f172a, 0.035);
        keyLight.color.setHex(0xffffff);
        keyLight.intensity = 2.4;
      } else {
        scene.background = new THREE.Color(0x0b1120);
        scene.fog = new THREE.FogExp2(0x0b1120, 0.042);
        keyLight.color.setHex(0xfff4e0);
        keyLight.intensity = 2.2;
        hemiLight.color.setHex(0x93c5fd);
        hemiLight.groundColor.setHex(0x1e293b);
      }

      // 2. Rebuild Bone hierarchy
      const currentBoneIds = new Set(p.bones.map((b) => b.id));
      for (const [id, bNode] of boneNodes.entries()) {
        if (!currentBoneIds.has(id)) {
          bNode.parent?.remove(bNode);
          boneNodes.delete(id);
        }
      }

      for (const bData of p.bones) {
        let bNode = boneNodes.get(bData.id);
        if (!bNode) {
          bNode = new THREE.Bone();
          bNode.name = bData.id;
          boneNodes.set(bData.id, bNode);
        }
        bNode.position.set(bData.restPosition.x, bData.restPosition.y, bData.restPosition.z);
        bNode.rotation.set(bData.rotation.x, bData.rotation.y, bData.rotation.z);
      }

      for (const bData of p.bones) {
        const bNode = boneNodes.get(bData.id)!;
        if (bData.parentId && boneNodes.has(bData.parentId)) {
          const parentBone = boneNodes.get(bData.parentId)!;
          if (bNode.parent !== parentBone) parentBone.add(bNode);
        } else if (bNode.parent !== characterRoot) {
          characterRoot.add(bNode);
        }
      }

      const boneWorld = computeBoneWorldPositions(p.bones);

      // 3. Sync Mesh Parts
      const currentPartIds = new Set(p.parts.map((pt) => pt.id));
      for (const [id, mesh] of partMeshes.entries()) {
        if (!currentPartIds.has(id)) {
          if (transformGizmo.object === mesh) transformGizmo.detach();
          mesh.parent?.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
          partMeshes.delete(id);
          partSignatures.delete(id);
        }
      }

      for (const part of p.parts) {
        const geoSig = JSON.stringify({
          kind: part.kind,
          deform: part.deform,
          strokes: part.sculptStrokes.length,
          lastStroke: part.sculptStrokes[part.sculptStrokes.length - 1],
        });

        let mesh = partMeshes.get(part.id);
        if (!mesh) {
          const geo = buildDeformedPartGeometry(part);
          const mat = new THREE.MeshStandardMaterial();
          mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = !isSoftwareGl;
          mesh.receiveShadow = !isSoftwareGl;
          mesh.userData.partId = part.id;
          partMeshes.set(part.id, mesh);
          partSignatures.set(part.id, geoSig);
        } else if (partSignatures.get(part.id) !== geoSig) {
          mesh.geometry.dispose();
          mesh.geometry = buildDeformedPartGeometry(part);
          partSignatures.set(part.id, geoSig);
        }

        mesh.visible = part.visible;
        mesh.scale.set(part.scale.x, part.scale.y, part.scale.z);
        mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);

        // Parent to bound bone or characterRoot
        if (part.boundBoneId && boneNodes.has(part.boundBoneId)) {
          const targetBone = boneNodes.get(part.boundBoneId)!;
          const bPos = boneWorld[part.boundBoneId] || { x: 0, y: 0, z: 0 };
          mesh.position.set(
            part.position.x - bPos.x,
            part.position.y - bPos.y,
            part.position.z - bPos.z,
          );
          if (mesh.parent !== targetBone) targetBone.add(mesh);
        } else {
          mesh.position.set(part.position.x, part.position.y, part.position.z);
          if (mesh.parent !== characterRoot) characterRoot.add(mesh);
        }

        // Update Material according to Render Environment & selection state
        const isSelected = p.selectedPartId === part.id && p.workspaceMode === 'model';
        const isWireframe = part.wireframe || p.showWireframeOverlay || p.renderEnv === 'wireframe_xray';

        if (p.renderEnv === 'toon_anime') {
          if (!(mesh.material instanceof THREE.MeshToonMaterial)) {
            if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
            else mesh.material.dispose();
            mesh.material = new THREE.MeshToonMaterial({
              gradientMap: toonGradient,
            });
          }
          const m = mesh.material as THREE.MeshToonMaterial;
          m.color.set(part.color);
          m.wireframe = isWireframe;
          m.emissive.set(isSelected ? '#f59e0b' : part.emissive || '#000000');
          m.emissiveIntensity = isSelected ? 0.25 : part.emissiveIntensity || 0;
        } else {
          if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
            if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
            else mesh.material.dispose();
            mesh.material = new THREE.MeshStandardMaterial();
          }
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (p.renderEnv === 'clay_sculpt') {
            m.color.set('#d97757');
            m.roughness = 0.68;
            m.metalness = 0.08;
            m.bumpMap = surfaceTexture;
            m.bumpScale = 0.008;
          } else {
            m.color.set(part.color);
            m.roughness = part.roughness;
            m.metalness = part.metalness;
            m.bumpMap = surfaceTexture;
            m.bumpScale = 0.005;
          }
          m.wireframe = isWireframe;
          m.emissive.set(isSelected ? '#f59e0b' : part.emissive || '#000000');
          m.emissiveIntensity = isSelected ? 0.22 : part.emissiveIntensity || 0;
        }
      }

      // 4. Rebuild Visual X-Ray Bone Markers
      while (boneHelperGroup.children.length > 0) {
        const ch = boneHelperGroup.children[0] as THREE.Mesh;
        boneHelperGroup.remove(ch);
        if (ch.geometry) ch.geometry.dispose();
      }
      boneVisuals.clear();

      const showBones =
        p.showBonesXRay || p.workspaceMode === 'rig' || p.workspaceMode === 'animate';
      boneHelperGroup.visible = showBones;

      if (showBones) {
        characterRoot.updateMatrixWorld(true);
        const wPos = new THREE.Vector3();
        const parentWPos = new THREE.Vector3();

        for (const bData of p.bones) {
          const bNode = boneNodes.get(bData.id);
          if (!bNode) continue;
          bNode.getWorldPosition(wPos);

          const isSelectedBone = p.selectedBoneId === bData.id;
          const jointGeo = new THREE.OctahedronGeometry(isSelectedBone ? 0.12 : 0.09, 0);
          const jointMat = new THREE.MeshBasicMaterial({
            color: isSelectedBone ? 0xf59e0b : 0x38bdf8,
            depthTest: false,
            transparent: true,
            opacity: isSelectedBone ? 0.95 : 0.8,
          });
          const jointMesh = new THREE.Mesh(jointGeo, jointMat);
          jointMesh.position.copy(wPos);
          jointMesh.renderOrder = 999;
          jointMesh.userData.boneId = bData.id;
          boneHelperGroup.add(jointMesh);
          boneVisuals.set(bData.id, jointMesh);

          // Bone link line to parent
          if (bData.parentId && boneNodes.has(bData.parentId)) {
            const pBone = boneNodes.get(bData.parentId)!;
            pBone.getWorldPosition(parentWPos);
            const lineGeo = new THREE.BufferGeometry().setFromPoints([parentWPos.clone(), wPos.clone()]);
            const lineMat = new THREE.LineBasicMaterial({
              color: isSelectedBone ? 0xfbbf24 : 0x38bdf8,
              depthTest: false,
              transparent: true,
              opacity: 0.75,
            });
            const line = new THREE.Line(lineGeo, lineMat);
            line.renderOrder = 998;
            boneHelperGroup.add(line);
          }
        }
      }

      // 5. Attach TransformGizmo appropriately
      if (p.gizmoMode === 'sculpt' || p.workspaceMode === 'render' || p.isPlaying) {
        transformGizmo.detach();
      } else if (p.workspaceMode === 'rig' || p.workspaceMode === 'animate') {
        const targetBone = p.selectedBoneId ? boneNodes.get(p.selectedBoneId) : null;
        if (targetBone) {
          transformGizmo.setMode('rotate');
          transformGizmo.setSpace('local');
          if (transformGizmo.object !== targetBone) {
            transformGizmo.attach(targetBone);
          }
        } else {
          transformGizmo.detach();
        }
      } else {
        const targetMesh = p.selectedPartId ? partMeshes.get(p.selectedPartId) : null;
        if (targetMesh) {
          transformGizmo.setMode(p.gizmoMode);
          transformGizmo.setSpace('local');
          if (transformGizmo.object !== targetMesh) {
            transformGizmo.attach(targetMesh);
          }
        } else {
          transformGizmo.detach();
        }
      }
    }

    function applyFramePose(frameNum: number) {
      const p = propsRef.current;
      const pose = interpolatePoseAtFrame(p.keyframes, p.bones, frameNum, p.totalFrames);

      for (const bData of p.bones) {
        const bNode = boneNodes.get(bData.id);
        if (!bNode) continue;
        const rot = pose.boneRotations[bData.id] || bData.rotation;
        bNode.rotation.set(rot.x, rot.y, rot.z);
        if (!bData.parentId) {
          bNode.position.set(
            bData.restPosition.x + pose.rootOffset.x,
            bData.restPosition.y + pose.rootOffset.y,
            bData.restPosition.z + pose.rootOffset.z,
          );
        }
      }

      characterRoot.updateMatrixWorld(true);
      // Sync bone visual markers positions
      if (boneHelperGroup.visible) {
        const wPos = new THREE.Vector3();
        for (const [bId, bVis] of boneVisuals.entries()) {
          const bNode = boneNodes.get(bId);
          if (bNode) {
            bNode.getWorldPosition(wPos);
            bVis.position.copy(wPos);
          }
        }
      }
    }

    // TransformGizmo interaction events
    transformGizmo.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
      if (!event.value) {
        const p = propsRef.current;
        const obj = transformGizmo.object;
        if (!obj) return;

        if ((p.workspaceMode === 'rig' || p.workspaceMode === 'animate') && p.selectedBoneId) {
          p.onUpdateBoneRotation(p.selectedBoneId, {
            x: Number(obj.rotation.x.toFixed(3)),
            y: Number(obj.rotation.y.toFixed(3)),
            z: Number(obj.rotation.z.toFixed(3)),
          });
        } else if (p.selectedPartId) {
          const part = p.parts.find((pt) => pt.id === p.selectedPartId);
          const boneWorld = computeBoneWorldPositions(p.bones);
          const bOffset =
            part?.boundBoneId && boneWorld[part.boundBoneId]
              ? boneWorld[part.boundBoneId]
              : { x: 0, y: 0, z: 0 };

          p.onUpdatePartTransform(
            p.selectedPartId,
            {
              x: Number((obj.position.x + bOffset.x).toFixed(3)),
              y: Number((obj.position.y + bOffset.y).toFixed(3)),
              z: Number((obj.position.z + bOffset.z).toFixed(3)),
            },
            {
              x: Number(obj.rotation.x.toFixed(3)),
              y: Number(obj.rotation.y.toFixed(3)),
              z: Number(obj.rotation.z.toFixed(3)),
            },
            {
              x: Number(Math.max(0.1, obj.scale.x).toFixed(3)),
              y: Number(Math.max(0.1, obj.scale.y).toFixed(3)),
              z: Number(Math.max(0.1, obj.scale.z).toFixed(3)),
            },
          );
        }
      }
    });

    transformGizmo.addEventListener('change', () => {
      requestRender();
    });

    // Raycasting for selecting parts, bones, or applying Sculpt Brush ("Nắn khối cảm ứng")
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let isSculptDragging = false;
    let lastSculptTime = 0;

    function updateNdc(clientX: number, clientY: number) {
      const r = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - r.left) / r.width) * 2 - 1;
      pointerNdc.y = -((clientY - r.top) / r.height) * 2 + 1;
    }

    function performSculptAtPointer(clientX: number, clientY: number) {
      const p = propsRef.current;
      updateNdc(clientX, clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const meshes = Array.from(partMeshes.values()).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const hitMesh = hit.object as THREE.Mesh;
        const partId = hitMesh.userData.partId as string;
        if (partId) {
          const localPt = hitMesh.worldToLocal(hit.point.clone());
          p.onAddSculptStroke(
            partId,
            { x: localPt.x, y: localPt.y, z: localPt.z },
            p.sculptBrushRadius,
            p.sculptBrushStrength,
          );
        }
      }
    }

    function onPointerDown(e: PointerEvent) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      const p = propsRef.current;
      if (p.workspaceMode === 'model' && p.gizmoMode === 'sculpt') {
        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, camera);
        const meshes = Array.from(partMeshes.values()).filter((m) => m.visible);
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          isSculptDragging = true;
          orbit.enabled = false;
          performSculptAtPointer(e.clientX, e.clientY);
        }
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!isSculptDragging) return;
      const now = performance.now();
      if (now - lastSculptTime < 60) return;
      lastSculptTime = now;
      performSculptAtPointer(e.clientX, e.clientY);
    }

    function onPointerUp(e: PointerEvent) {
      if (isSculptDragging) {
        isSculptDragging = false;
        orbit.enabled = true;
        return;
      }

      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 36) return; // Dragged camera, not a tap

      const p = propsRef.current;
      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);

      // Check bone markers first if in rig/animate mode
      if (p.workspaceMode === 'rig' || p.workspaceMode === 'animate') {
        const bVisuals = Array.from(boneVisuals.values());
        const bHits = raycaster.intersectObjects(bVisuals, false);
        if (bHits.length > 0) {
          const bId = bHits[0].object.userData.boneId as string;
          if (bId) {
            p.onSelectBone(bId);
            return;
          }
        }
      }

      // Otherwise check mesh parts
      const meshes = Array.from(partMeshes.values()).filter((m) => m.visible);
      const mHits = raycaster.intersectObjects(meshes, false);
      if (mHits.length > 0) {
        const partId = mHits[0].object.userData.partId as string;
        if (partId) {
          p.onSelectPart(partId);
          const part = p.parts.find((pt) => pt.id === partId);
          if ((p.workspaceMode === 'rig' || p.workspaceMode === 'animate') && part?.boundBoneId) {
            p.onSelectBone(part.boundBoneId);
          }
        }
      }
    }

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    domElem.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Software-WebGL-aware Render Loop & On-Demand Render Scheduler
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTickTime = performance.now();
    let frameAccumulator = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.1, (now - lastTickTime) / 1000);
        lastTickTime = now;
        const p = propsRef.current;

        if (camTransitionActive) {
          const factor = 1 - Math.exp(-8 * dt);
          camera.position.lerp(_camTargetPos, factor);
          orbit.target.lerp(_camLookTarget, factor);
          if (camera.position.distanceToSquared(_camTargetPos) < 0.002) {
            camTransitionActive = false;
          } else {
            renderDirty = true;
          }
        }

        if (p.turntableActive) {
          characterRoot.rotation.y += dt * 0.85;
          renderDirty = true;
        } else if (Math.abs(characterRoot.rotation.y) > 0.001) {
          characterRoot.rotation.y = THREE.MathUtils.damp(characterRoot.rotation.y, 0, 8, dt);
          renderDirty = true;
        }

        if (p.isPlaying) {
          frameAccumulator += dt * p.fps;
          if (frameAccumulator >= 1) {
            const steps = Math.floor(frameAccumulator);
            frameAccumulator -= steps;
            const nextF = (p.currentFrame + steps) % (p.totalFrames + 1);
            applyFramePose(nextF);
            p.onFrameAdvance(nextF);
          }
          renderDirty = true;
        }

        orbit.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || propsRef.current.isPlaying || propsRef.current.turntableActive) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    orbit.addEventListener('change', () => {
      requestRender();
    });

    const onResize = () => {
      if (!mount) return;
      const r = mount.getBoundingClientRect();
      const w = Math.max(300, r.width || window.innerWidth);
      const h = Math.max(300, r.height || window.innerHeight);
      camera.aspect = w / h;
      if (w < h) {
        camera.position.set(3.5, 2.45, 5.4);
        orbit.target.set(0, 0.72, 0);
      } else {
        camera.position.set(2.8, 2.15, 3.8);
        orbit.target.set(0, 1.15, 0);
      }
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      orbit.update();
      renderer.render(scene, camera);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    engineRef.current = {
      renderer,
      scene,
      camera,
      orbit,
      transformGizmo,
      characterRoot,
      boneHelperGroup,
      floorGroup,
      keyLight,
      hemiLight,
      rimLight,
      partMeshes,
      boneNodes,
      boneVisuals,
      surfaceTexture,
      toonGradient,
      isSoftwareGl,
      requestRender,
      applyFramePose,
      syncSceneContent,
      setCamTarget,
    };

    syncSceneContent();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    orbit.update();
    renderer.render(scene, camera);
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('pointerdown', onPointerDown);
      domElem.removeEventListener('pointermove', onPointerMove);
      transformGizmo.dispose();
      orbit.dispose();
      surfaceTexture.dispose();
      toonGradient.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  // Sync scene when React props change without re-creating the WebGL context
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.syncSceneContent();
    if (props.workspaceMode === 'animate' || props.isPlaying) {
      eng.applyFramePose(props.currentFrame);
    }
    eng.requestRender();
  }, [
    props.parts,
    props.bones,
    props.keyframes,
    props.selectedPartId,
    props.selectedBoneId,
    props.workspaceMode,
    props.gizmoMode,
    props.showBonesXRay,
    props.showWireframeOverlay,
    props.renderEnv,
    props.turntableActive,
    props.isPlaying,
    props.currentFrame,
  ]);

  return (
    <div
      ref={canvasMountRef}
      data-testid="viewport-3d-canvas"
      className="w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing"
      aria-label="Không gian làm việc 3D tương tác"
    />
  );
});
