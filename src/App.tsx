import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StudioMeshPart,
  StudioBoneNode,
  BoneKeyframe,
  PrimitiveKind,
  WorkspaceMode,
  GizmoMode,
  RenderEnvironmentId,
  RigPresetId,
  AnimationPresetId,
  CharacterTemplateId,
  DeformModifiers,
  DEFAULT_DEFORM,
  Vec3,
  createStarterModelParts,
  createRigPreset,
  generateAnimationPreset,
  autoBindPartsToNearestBones,
  interpolatePoseAtFrame,
} from './core/studioEngine';
import { Viewport3D, Viewport3DHandle, CameraViewPreset } from './components/Viewport3D';
import { BottomControlDock } from './components/BottomControlDock';
import { ExportStudioModal } from './components/ExportStudioModal';
import { BeginnerGuideModal } from './components/BeginnerGuideModal';

const PRIMITIVE_LABELS: Record<PrimitiveKind, string> = {
  box: 'Khối Hộp',
  sphere: 'Khối Cầu',
  cylinder: 'Khối Trụ',
  capsule: 'Khối Viên Nang',
  cone: 'Khối Nón',
  torus: 'Khối Vòng',
  head_sculpt: 'Đầu Tượng',
};

export default function App() {
  const viewportRef = useRef<Viewport3DHandle | null>(null);

  // Core 3D Scene State
  const [parts, setParts] = useState<StudioMeshPart[]>(() => createStarterModelParts('robo_buddy'));
  const [bones, setBones] = useState<StudioBoneNode[]>(() => createRigPreset('humanoid'));
  const [totalFrames] = useState<number>(48);
  const [fps, setFps] = useState<number>(24);
  const [keyframes, setKeyframes] = useState<BoneKeyframe[]>(() =>
    generateAnimationPreset('walk_cycle', createRigPreset('humanoid'), 48),
  );
  const [clipName, setClipName] = useState<string>('Walk_Cycle');

  // Selection & Tool Mode State
  const [selectedPartId, setSelectedPartId] = useState<string | null>('part_torso');
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>('bone_spine');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('model');
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [sculptBrushRadius, setSculptBrushRadius] = useState<number>(0.42);
  const [sculptBrushStrength, setSculptBrushStrength] = useState<number>(0.14);

  // Playback & Viewport Display State
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [renderEnv, setRenderEnv] = useState<RenderEnvironmentId>('studio_pbr');
  const [showBonesXRay, setShowBonesXRay] = useState<boolean>(true);
  const [showWireframeOverlay, setShowWireframeOverlay] = useState<boolean>(false);
  const [turntableActive, setTurntableActive] = useState<boolean>(false);

  // Modals State
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Modeling & Sculpting Handlers
  const handleAddPrimitive = useCallback(
    (kind: PrimitiveKind) => {
      const newId = `part_${Date.now().toString(36)}`;
      const count = parts.length + 1;
      const newPart: StudioMeshPart = {
        id: newId,
        name: `${PRIMITIVE_LABELS[kind]} ${count}`,
        kind,
        position: {
          x: Number(((Math.random() - 0.5) * 0.6).toFixed(2)),
          y: Number((1.1 + Math.random() * 0.6).toFixed(2)),
          z: Number(((Math.random() - 0.5) * 0.4).toFixed(2)),
        },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.55, y: 0.55, z: 0.55 },
        color: '#f59e0b',
        roughness: 0.32,
        metalness: 0.4,
        emissive: '#000000',
        emissiveIntensity: 0,
        wireframe: false,
        deform: { ...DEFAULT_DEFORM },
        sculptStrokes: [],
        boundBoneId: selectedBoneId || (bones[0]?.id ?? null),
        visible: true,
      };
      setParts((prev) => [...prev, newPart]);
      setSelectedPartId(newId);
      showToast(`Đã thêm ${newPart.name}`);
    },
    [parts.length, selectedBoneId, bones, showToast],
  );

  const handleDuplicateSelectedPart = useCallback(() => {
    const target = parts.find((p) => p.id === selectedPartId);
    if (!target) return;
    const copyId = `part_${Date.now().toString(36)}`;
    const copyPart: StudioMeshPart = {
      ...JSON.parse(JSON.stringify(target)),
      id: copyId,
      name: `${target.name} (Bản sao)`,
      position: {
        x: Number((target.position.x + 0.35).toFixed(2)),
        y: target.position.y,
        z: target.position.z,
      },
    };
    setParts((prev) => [...prev, copyPart]);
    setSelectedPartId(copyId);
    showToast(`Đã nhân bản ${target.name}`);
  }, [parts, selectedPartId, showToast]);

  const handleDeleteSelectedPart = useCallback(() => {
    if (parts.length <= 1 || !selectedPartId) return;
    const remaining = parts.filter((p) => p.id !== selectedPartId);
    setParts(remaining);
    setSelectedPartId(remaining[0]?.id || null);
    showToast('Đã xóa khối đã chọn');
  }, [parts, selectedPartId, showToast]);

  const handleLoadTemplate = useCallback(
    (template: CharacterTemplateId) => {
      const nextParts = createStarterModelParts(template);
      const nextRig = createRigPreset('humanoid');
      setBones(nextRig);
      setParts(nextParts);
      setSelectedPartId(nextParts[1]?.id || nextParts[0]?.id || null);
      setSelectedBoneId('bone_spine');
      setKeyframes(generateAnimationPreset('walk_cycle', nextRig, totalFrames));
      showToast('Đã tải mẫu nhân vật 3D kèm bộ xương');
    },
    [totalFrames, showToast],
  );

  const handleUpdatePartTransform = useCallback(
    (partId: string, pos: Vec3, rot: Vec3, scale: Vec3) => {
      setParts((prev) =>
        prev.map((pt) =>
          pt.id === partId ? { ...pt, position: pos, rotation: rot, scale } : pt,
        ),
      );
    },
    [],
  );

  const handleUpdatePartDeform = useCallback(
    (partId: string, patch: Partial<DeformModifiers>) => {
      setParts((prev) =>
        prev.map((pt) =>
          pt.id === partId ? { ...pt, deform: { ...pt.deform, ...patch } } : pt,
        ),
      );
    },
    [],
  );

  const handleUpdatePartMaterial = useCallback(
    (
      partId: string,
      patch: Partial<
        Pick<StudioMeshPart, 'color' | 'roughness' | 'metalness' | 'wireframe' | 'boundBoneId'>
      >,
    ) => {
      setParts((prev) => prev.map((pt) => (pt.id === partId ? { ...pt, ...patch } : pt)));
    },
    [],
  );

  const handleAddSculptStroke = useCallback(
    (partId: string, localPoint: Vec3, radius: number, strength: number) => {
      setParts((prev) =>
        prev.map((pt) =>
          pt.id === partId
            ? {
                ...pt,
                sculptStrokes: [
                  ...pt.sculptStrokes.slice(-24),
                  {
                    id: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
                    localPoint,
                    radius,
                    strength,
                  },
                ],
              }
            : pt,
        ),
      );
    },
    [],
  );

  const handleClearSculptStrokes = useCallback(
    (partId: string) => {
      setParts((prev) =>
        prev.map((pt) => (pt.id === partId ? { ...pt, sculptStrokes: [] } : pt)),
      );
      showToast('Đã đặt lại hình dạng khối gốc');
    },
    [showToast],
  );

  // Rigging Handlers
  const handleApplyRigPreset = useCallback(
    (preset: RigPresetId) => {
      const newRig = createRigPreset(preset);
      setBones(newRig);
      setSelectedBoneId(newRig[0]?.id || null);
      setParts((prev) => autoBindPartsToNearestBones(prev, newRig));
      setKeyframes(generateAnimationPreset('idle_breathe', newRig, totalFrames));
      showToast('Đã tạo bộ xương & gán da tự động');
    },
    [totalFrames, showToast],
  );

  const handleAddChildBone = useCallback(() => {
    const parentId = selectedBoneId || bones[0]?.id || null;
    const newId = `bone_custom_${bones.length + 1}`;
    const newBone: StudioBoneNode = {
      id: newId,
      name: `Xương Phụ #${bones.length + 1}`,
      parentId,
      restPosition: { x: 0, y: 0.45, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
    setBones((prev) => [...prev, newBone]);
    setSelectedBoneId(newId);
    showToast(`Đã thêm ${newBone.name}`);
  }, [bones, selectedBoneId, showToast]);

  const handleAutoBindSkin = useCallback(() => {
    setParts((prev) => autoBindPartsToNearestBones(prev, bones));
    showToast('Đã gán tất cả khối 3D vào các khớp xương gần nhất');
  }, [bones, showToast]);

  const handleUpdateBoneRotation = useCallback((boneId: string, rot: Vec3) => {
    setBones((prev) =>
      prev.map((b) => (b.id === boneId ? { ...b, rotation: rot } : b)),
    );
  }, []);

  const handleResetAllBonesPose = useCallback(() => {
    setIsPlaying(false);
    setBones((prev) =>
      prev.map((b) => ({ ...b, rotation: { x: 0, y: 0, z: 0 } })),
    );
    showToast('Đã đưa bộ xương về tư thế T-Pose chuẩn');
  }, [showToast]);

  // Animation Timeline Handlers
  const handleScrubFrame = useCallback(
    (frame: number) => {
      setIsPlaying(false);
      setCurrentFrame(frame);
      const pose = interpolatePoseAtFrame(keyframes, bones, frame, totalFrames);
      setBones((prev) =>
        prev.map((b) => ({
          ...b,
          rotation: pose.boneRotations[b.id] || { x: 0, y: 0, z: 0 },
        })),
      );
    },
    [keyframes, bones, totalFrames],
  );

  const handleRecordKeyframeAtCurrent = useCallback(() => {
    const rotSnapshot: Record<string, Vec3> = {};
    bones.forEach((b) => {
      rotSnapshot[b.id] = { ...b.rotation };
    });

    setKeyframes((prev) => {
      const filtered = prev.filter((k) => k.frame !== currentFrame);
      return [
        ...filtered,
        {
          frame: currentFrame,
          boneRotations: rotSnapshot,
          rootPositionOffset: { x: 0, y: 0, z: 0 },
        },
      ].sort((a, b) => a.frame - b.frame);
    });
    showToast(`Đã lưu Keyframe xương tại Frame ${currentFrame}`);
  }, [bones, currentFrame, showToast]);

  const handleDeleteKeyframeAtCurrent = useCallback(() => {
    if (keyframes.length <= 1) return;
    setKeyframes((prev) => prev.filter((k) => k.frame !== currentFrame));
    showToast(`Đã xóa Keyframe tại Frame ${currentFrame}`);
  }, [keyframes.length, currentFrame, showToast]);

  const handleApplyAnimationPreset = useCallback(
    (preset: AnimationPresetId) => {
      const generated = generateAnimationPreset(preset, bones, totalFrames);
      setKeyframes(generated);
      setClipName(preset.toUpperCase());
      setCurrentFrame(0);
      setIsPlaying(true);
      showToast(`Đang chạy chuyển động mẫu: ${preset}`);
    },
    [bones, totalFrames, showToast],
  );

  const handleSetCameraPreset = useCallback((preset: CameraViewPreset) => {
    viewportRef.current?.setCameraPreset(preset);
  }, []);

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden relative">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-5 py-3 bg-slate-900 border-b border-slate-800 z-30 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSetCameraPreset('perspective');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          PocketBlend 3D
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="Chế độ làm việc chính"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          <a
            href="#model"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceMode('model');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              workspaceMode === 'model' ? 'text-amber-400 underline' : ''
            }`}
          >
            Tạo Khối
          </a>
          <a
            href="#rig"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceMode('rig');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              workspaceMode === 'rig' ? 'text-amber-400 underline' : ''
            }`}
          >
            Rig Xương
          </a>
          <a
            href="#animate"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceMode('animate');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              workspaceMode === 'animate' ? 'text-amber-400 underline' : ''
            }`}
          >
            Diễn Hoạt
          </a>
          <a
            href="#render"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceMode('render');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              workspaceMode === 'render' ? 'text-amber-400 underline' : ''
            }`}
          >
            Render Thực Tế
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-xl hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Xuất Game / Video
          </button>
        </div>
      </header>

      {/* Main 100% Unobstructed 3D Viewport */}
      <main className="flex-1 w-full h-full relative overflow-hidden">
        <Viewport3D
          ref={viewportRef}
          parts={parts}
          bones={bones}
          keyframes={keyframes}
          selectedPartId={selectedPartId}
          selectedBoneId={selectedBoneId}
          workspaceMode={workspaceMode}
          gizmoMode={gizmoMode}
          sculptBrushRadius={sculptBrushRadius}
          sculptBrushStrength={sculptBrushStrength}
          showBonesXRay={showBonesXRay}
          showWireframeOverlay={showWireframeOverlay}
          renderEnv={renderEnv}
          turntableActive={turntableActive}
          isPlaying={isPlaying}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          fps={fps}
          onSelectPart={(id) => setSelectedPartId(id)}
          onSelectBone={(id) => setSelectedBoneId(id)}
          onUpdatePartTransform={handleUpdatePartTransform}
          onUpdateBoneRotation={handleUpdateBoneRotation}
          onAddSculptStroke={handleAddSculptStroke}
          onFrameAdvance={(nextFrame) => setCurrentFrame(nextFrame)}
        />

        {/* Quiet Top-Left Context Indicator (Non-obstructive, no pills, no pulsing dots) */}
        <div className="fixed top-16 left-4 z-20 pointer-events-none select-none">
          <div className="text-xs text-slate-300 font-medium">
            <span>
              Đang chọn:{' '}
              <strong className="text-slate-100">
                {workspaceMode === 'rig' || workspaceMode === 'animate'
                  ? bones.find((b) => b.id === selectedBoneId)?.name || 'Chưa chọn xương'
                  : parts.find((p) => p.id === selectedPartId)?.name || 'Chưa chọn khối'}
              </strong>
            </span>
            <span aria-hidden="true"> · </span>
            <span className="text-slate-400">
              {gizmoMode === 'sculpt'
                ? 'Chạm & vuốt lên khối để nắn đỉnh 3D'
                : 'Chạm kéo trục màu để biến đổi · 1 ngón xoay góc nhìn'}
            </span>
          </div>
        </div>

        {/* Transient feedback notification */}
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-16 right-4 z-30 bg-slate-900 border border-slate-700 text-slate-100 px-3.5 py-2 rounded-xl text-xs font-medium shadow-xl"
          >
            {toastMessage}
          </div>
        )}

        {/* Unified Collapsible Bottom Control Dock */}
        <BottomControlDock
          workspaceMode={workspaceMode}
          onChangeWorkspaceMode={setWorkspaceMode}
          gizmoMode={gizmoMode}
          onChangeGizmoMode={setGizmoMode}
          parts={parts}
          selectedPartId={selectedPartId}
          onSelectPart={setSelectedPartId}
          onAddPrimitive={handleAddPrimitive}
          onDuplicateSelectedPart={handleDuplicateSelectedPart}
          onDeleteSelectedPart={handleDeleteSelectedPart}
          onLoadTemplate={handleLoadTemplate}
          onUpdatePartDeform={handleUpdatePartDeform}
          onUpdatePartMaterial={handleUpdatePartMaterial}
          onClearSculptStrokes={handleClearSculptStrokes}
          sculptBrushRadius={sculptBrushRadius}
          sculptBrushStrength={sculptBrushStrength}
          onChangeSculptBrush={(r, s) => {
            setSculptBrushRadius(r);
            setSculptBrushStrength(s);
          }}
          bones={bones}
          selectedBoneId={selectedBoneId}
          onSelectBone={setSelectedBoneId}
          onApplyRigPreset={handleApplyRigPreset}
          onAddChildBone={handleAddChildBone}
          onAutoBindSkin={handleAutoBindSkin}
          onUpdateBoneRotation={handleUpdateBoneRotation}
          onResetAllBonesPose={handleResetAllBonesPose}
          showBonesXRay={showBonesXRay}
          onToggleBonesXRay={() => setShowBonesXRay((prev) => !prev)}
          keyframes={keyframes}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          fps={fps}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          onScrubFrame={handleScrubFrame}
          onChangeFps={setFps}
          onRecordKeyframeAtCurrent={handleRecordKeyframeAtCurrent}
          onDeleteKeyframeAtCurrent={handleDeleteKeyframeAtCurrent}
          onApplyAnimationPreset={handleApplyAnimationPreset}
          renderEnv={renderEnv}
          onChangeRenderEnv={setRenderEnv}
          turntableActive={turntableActive}
          onToggleTurntable={() => setTurntableActive((prev) => !prev)}
          showWireframeOverlay={showWireframeOverlay}
          onToggleWireframeOverlay={() => setShowWireframeOverlay((prev) => !prev)}
          onSetCameraPreset={handleSetCameraPreset}
          onOpenExportModal={() => setIsExportModalOpen(true)}
          onOpenGuideModal={() => setIsGuideModalOpen(true)}
        />
      </main>

      {/* Export Modal (Unity/Unreal GLB/GLTF/OBJ + PNG Frame Sheet + MP4/WebM Video) */}
      <ExportStudioModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        parts={parts}
        bones={bones}
        keyframes={keyframes}
        totalFrames={totalFrames}
        fps={fps}
        clipName={clipName}
        viewportRef={viewportRef}
      />

      {/* Beginner 3D Guide Modal */}
      <BeginnerGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
}
