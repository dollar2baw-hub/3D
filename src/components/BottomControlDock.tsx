import React, { useState } from 'react';
import {
  Box,
  Bone,
  Play,
  Pause,
  Sparkles,
  Plus,
  Trash2,
  Move,
  RotateCw,
  Maximize2,
  Wand2,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
  KeyRound,
  Download,
  Camera,
  HelpCircle,
  Copy,
} from 'lucide-react';
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
  Vec3,
} from '../core/studioEngine';
import { CameraViewPreset } from './Viewport3D';

interface BottomControlDockProps {
  workspaceMode: WorkspaceMode;
  onChangeWorkspaceMode: (mode: WorkspaceMode) => void;
  gizmoMode: GizmoMode;
  onChangeGizmoMode: (mode: GizmoMode) => void;
  parts: StudioMeshPart[];
  selectedPartId: string | null;
  onSelectPart: (id: string) => void;
  onAddPrimitive: (kind: PrimitiveKind) => void;
  onDuplicateSelectedPart: () => void;
  onDeleteSelectedPart: () => void;
  onLoadTemplate: (template: CharacterTemplateId) => void;
  onUpdatePartDeform: (partId: string, patch: Partial<DeformModifiers>) => void;
  onUpdatePartMaterial: (
    partId: string,
    patch: Partial<Pick<StudioMeshPart, 'color' | 'roughness' | 'metalness' | 'wireframe' | 'boundBoneId'>>,
  ) => void;
  onClearSculptStrokes: (partId: string) => void;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  onChangeSculptBrush: (radius: number, strength: number) => void;

  // Rigging props
  bones: StudioBoneNode[];
  selectedBoneId: string | null;
  onSelectBone: (id: string) => void;
  onApplyRigPreset: (preset: RigPresetId) => void;
  onAddChildBone: () => void;
  onAutoBindSkin: () => void;
  onUpdateBoneRotation: (boneId: string, rot: Vec3) => void;
  onResetAllBonesPose: () => void;
  showBonesXRay: boolean;
  onToggleBonesXRay: () => void;

  // Animation props
  keyframes: BoneKeyframe[];
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onScrubFrame: (frame: number) => void;
  onChangeFps: (fps: number) => void;
  onRecordKeyframeAtCurrent: () => void;
  onDeleteKeyframeAtCurrent: () => void;
  onApplyAnimationPreset: (preset: AnimationPresetId) => void;

  // Render & Camera props
  renderEnv: RenderEnvironmentId;
  onChangeRenderEnv: (env: RenderEnvironmentId) => void;
  turntableActive: boolean;
  onToggleTurntable: () => void;
  showWireframeOverlay: boolean;
  onToggleWireframeOverlay: () => void;
  onSetCameraPreset: (preset: CameraViewPreset) => void;
  onOpenExportModal: () => void;
  onOpenGuideModal: () => void;
}

const COLOR_SWATCHES = [
  '#f59e0b',
  '#38bdf8',
  '#ef4444',
  '#10b981',
  '#a855f7',
  '#f97316',
  '#f8fafc',
  '#94a3b8',
  '#334155',
];

export const BottomControlDock: React.FC<BottomControlDockProps> = (props) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [modelSubTab, setModelSubTab] = useState<'create' | 'sculpt' | 'material'>('create');

  const selectedPart = props.parts.find((p) => p.id === props.selectedPartId) || props.parts[0] || null;
  const selectedBone = props.bones.find((b) => b.id === props.selectedBoneId) || props.bones[0] || null;
  const hasKeyframeAtCurrent = props.keyframes.some((k) => k.frame === props.currentFrame);

  return (
    <section
      aria-label="Bảng điều khiển 3D Studio"
      className="fixed left-1/2 -translate-x-1/2 bottom-3 z-30 w-[96vw] max-w-[940px] pointer-events-auto transition-transform duration-200"
    >
      {/* Top Collapse / Expand Handle + Quick Status Bar */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs text-slate-300 shadow-lg whitespace-nowrap shrink-0">
          <span className="font-mono text-amber-400 font-semibold">{props.parts.length} Khối</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-sky-400 font-semibold">{props.bones.length} Xương</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-slate-300">
            F{props.currentFrame}/{props.totalFrames}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={props.onOpenGuideModal}
            aria-label="Mở hướng dẫn cho người mới"
            className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] sm:text-xs font-medium text-slate-200 flex items-center gap-1 shadow-lg whitespace-nowrap shrink-0"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Hướng Dẫn</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] sm:text-xs font-medium text-slate-200 flex items-center gap-1 shadow-lg whitespace-nowrap shrink-0"
          >
            {isCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Mở HUD</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Ẩn HUD</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Dock Panel (Solid dark surface — zero backdrop-filter over WebGL) */}
      {!isCollapsed && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* 4 Mobile/Desktop Thumb-Zone Mode Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-950 border-b border-slate-800">
            {[
              { id: 'model', label: '1. Tạo Khối', icon: Box },
              { id: 'rig', label: '2. Rig Xương', icon: Bone },
              { id: 'animate', label: '3. Diễn Hoạt', icon: Play },
              { id: 'render', label: '4. Render', icon: Sparkles },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = props.workspaceMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => props.onChangeWorkspaceMode(tab.id as WorkspaceMode)}
                  className={`min-h-[44px] px-1.5 sm:px-2.5 py-2 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mode 1: Tạo Khối & Nắn Khối (Model & Sculpt) */}
          {props.workspaceMode === 'model' && (
            <div className="p-3 space-y-2.5">
              {/* Top Bar: Sub-tabs + Gizmo Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid grid-cols-3 w-full sm:w-auto gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {[
                    { id: 'create', label: 'Thêm & Chọn Khối' },
                    { id: 'sculpt', label: 'Nắn Khối 3D' },
                    { id: 'material', label: 'Màu & Chất Liệu' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setModelSubTab(st.id as 'create' | 'sculpt' | 'material')}
                      className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        modelSubTab === st.id
                          ? 'bg-slate-800 text-amber-400'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* Transform / Sculpt Gizmo Buttons */}
                <div className="grid grid-cols-4 w-full sm:w-auto gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {[
                    { id: 'translate', label: 'Di chuyển', icon: Move },
                    { id: 'rotate', label: 'Xoay', icon: RotateCw },
                    { id: 'scale', label: 'Co giãn', icon: Maximize2 },
                    { id: 'sculpt', label: 'Cọ Nắn', icon: Wand2 },
                  ].map((g) => {
                    const Icon = g.icon;
                    const active = props.gizmoMode === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => props.onChangeGizmoMode(g.id as GizmoMode)}
                        className={`min-h-[38px] px-2 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{g.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {modelSubTab === 'create' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Add Primitive Buttons */}
                  <div className="md:col-span-7 space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-400">
                      + Thêm khối 3D cơ bản vào mô hình:
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {[
                        { kind: 'box', label: '+ Khối Hộp' },
                        { kind: 'sphere', label: '+ Khối Cầu' },
                        { kind: 'cylinder', label: '+ Khối Trụ' },
                        { kind: 'capsule', label: '+ Viên Nang' },
                        { kind: 'cone', label: '+ Khối Nón' },
                        { kind: 'head_sculpt', label: '+ Đầu Tượng' },
                      ].map((item) => (
                        <button
                          key={item.kind}
                          type="button"
                          onClick={() => props.onAddPrimitive(item.kind as PrimitiveKind)}
                          className="min-h-[42px] px-2.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center justify-center transition-colors whitespace-nowrap shrink-0"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Part Selector & Starter Templates */}
                  <div className="md:col-span-5 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="select-active-part" className="sr-only">
                        Chọn khối đang chỉnh sửa
                      </label>
                      <select
                        id="select-active-part"
                        aria-label="Chọn khối đang chỉnh sửa"
                        value={selectedPart?.id || ''}
                        onChange={(e) => props.onSelectPart(e.target.value)}
                        className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-medium"
                      >
                        {props.parts.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            Khối: {pt.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={props.onDuplicateSelectedPart}
                        aria-label="Nhân bản khối đang chọn"
                        title="Nhân bản khối"
                        className="min-h-[42px] min-w-[42px] rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center justify-center"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={props.onDeleteSelectedPart}
                        disabled={props.parts.length <= 1}
                        aria-label="Xóa khối đang chọn"
                        title="Xóa khối"
                        className="min-h-[42px] min-w-[42px] rounded-xl bg-slate-950 hover:bg-red-950/60 disabled:opacity-40 border border-slate-800 text-red-400 flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">Mẫu sẵn:</span>
                      {[
                        { id: 'robo_buddy', label: 'Robot Chibi' },
                        { id: 'knight_paladin', label: 'Hiệp Sĩ' },
                        { id: 'cyber_fox', label: 'Cáo Cơ Khí' },
                      ].map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => props.onLoadTemplate(tpl.id as CharacterTemplateId)}
                          className="flex-1 min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300 whitespace-nowrap shrink-0"
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modelSubTab === 'sculpt' && selectedPart && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Độ Phồng (Inflate)</span>
                        <span className="font-mono text-amber-400">
                          {selectedPart.deform.inflate.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Độ Phồng (Inflate)"
                        min={-0.4}
                        max={0.8}
                        step={0.02}
                        value={selectedPart.deform.inflate}
                        onChange={(e) =>
                          props.onUpdatePartDeform(selectedPart.id, {
                            inflate: Number(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Độ Vát (Taper)</span>
                        <span className="font-mono text-amber-400">
                          {selectedPart.deform.taper.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Độ Vát (Taper)"
                        min={-0.7}
                        max={0.7}
                        step={0.02}
                        value={selectedPart.deform.taper}
                        onChange={(e) =>
                          props.onUpdatePartDeform(selectedPart.id, {
                            taper: Number(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Độ Xoắn (Twist)</span>
                        <span className="font-mono text-amber-400">
                          {selectedPart.deform.twist.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Độ Xoắn (Twist)"
                        min={-2.5}
                        max={2.5}
                        step={0.05}
                        value={selectedPart.deform.twist}
                        onChange={(e) =>
                          props.onUpdatePartDeform(selectedPart.id, {
                            twist: Number(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Độ Uốn (Bend)</span>
                        <span className="font-mono text-amber-400">
                          {selectedPart.deform.bend.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Độ Uốn (Bend)"
                        min={-1.2}
                        max={1.2}
                        step={0.05}
                        value={selectedPart.deform.bend}
                        onChange={(e) =>
                          props.onUpdatePartDeform(selectedPart.id, {
                            bend: Number(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Interactive Sculpt Brush Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 font-medium">
                        Cọ Nắn Cảm Ứng ({selectedPart.sculptStrokes.length} nét):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          props.onChangeGizmoMode('sculpt');
                          props.onChangeSculptBrush(props.sculptBrushRadius, 0.14);
                        }}
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                          props.gizmoMode === 'sculpt' && props.sculptBrushStrength > 0
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-950 text-slate-300 border border-slate-800'
                        }`}
                      >
                        Kéo Lồi (+Pull)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          props.onChangeGizmoMode('sculpt');
                          props.onChangeSculptBrush(props.sculptBrushRadius, -0.14);
                        }}
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                          props.gizmoMode === 'sculpt' && props.sculptBrushStrength < 0
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-950 text-slate-300 border border-slate-800'
                        }`}
                      >
                        Ấn Lõm (-Push)
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        props.onUpdatePartDeform(selectedPart.id, {
                          inflate: 0,
                          taper: 0,
                          twist: 0,
                          bend: 0,
                          pinchY: 0,
                        });
                        props.onClearSculptStrokes(selectedPart.id);
                      }}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Đặt Lại Hình Dạng Khối</span>
                    </button>
                  </div>
                </div>
              )}

              {modelSubTab === 'material' && selectedPart && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-6 flex items-center gap-1.5 flex-wrap">
                    {COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => props.onUpdatePartMaterial(selectedPart.id, { color: hex })}
                        aria-label={`Chọn màu ${hex}`}
                        className={`w-9 h-9 rounded-xl border-2 transition-transform ${
                          selectedPart.color.toLowerCase() === hex.toLowerCase()
                            ? 'border-white scale-110'
                            : 'border-slate-700 hover:scale-105'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>

                  <div className="sm:col-span-3">
                    <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                      <span>Độ Nhám (Roughness)</span>
                      <span className="font-mono text-amber-400">
                        {selectedPart.roughness.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Độ Nhám (Roughness)"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={selectedPart.roughness}
                      onChange={(e) =>
                        props.onUpdatePartMaterial(selectedPart.id, {
                          roughness: Number(e.target.value),
                        })
                      }
                      className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                      <span>Kim Loại (Metalness)</span>
                      <span className="font-mono text-amber-400">
                        {selectedPart.metalness.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Kim Loại (Metalness)"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedPart.metalness}
                      onChange={(e) =>
                        props.onUpdatePartMaterial(selectedPart.id, {
                          metalness: Number(e.target.value),
                        })
                      }
                      className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Rig Xương (Bone Rigging & Auto-Skinning) */}
          {props.workspaceMode === 'rig' && (
            <div className="p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-400">Mẫu Rig tự động:</span>
                  {[
                    { id: 'humanoid', label: 'Người 2 Chân (7 Xương)' },
                    { id: 'quadruped', label: 'Thú 4 Chân' },
                    { id: 'arm_chain', label: 'Cánh Tay Robot' },
                  ].map((rp) => (
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => props.onApplyRigPreset(rp.id as RigPresetId)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
                    >
                      {rp.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={props.onAddChildBone}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-sky-400 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Xương Con</span>
                  </button>

                  <button
                    type="button"
                    onClick={props.onAutoBindSkin}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Gán Da Tự Động (Auto-Bind)</span>
                  </button>
                </div>
              </div>

              {selectedBone && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-2 border-t border-slate-800">
                  <div className="md:col-span-4 flex items-center gap-2">
                    <label htmlFor="select-active-bone" className="sr-only">
                      Chọn khớp xương
                    </label>
                    <select
                      id="select-active-bone"
                      aria-label="Chọn khớp xương"
                      value={selectedBone.id}
                      onChange={(e) => props.onSelectBone(e.target.value)}
                      className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-sky-300 font-medium"
                    >
                      {props.bones.map((b) => (
                        <option key={b.id} value={b.id}>
                          Xương: {b.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={props.onResetAllBonesPose}
                      aria-label="Đặt lại tư thế gốc T-Pose"
                      className="min-h-[42px] px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>T-Pose</span>
                    </button>
                  </div>

                  {/* Bone Euler Rotation Sliders */}
                  <div className="md:col-span-8 grid grid-cols-3 gap-2.5">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <div key={axis}>
                        <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                          <span>Xoay Trục {axis.toUpperCase()}</span>
                          <span className="font-mono text-sky-400">
                            {Math.round((selectedBone.rotation[axis] * 180) / Math.PI)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label={`Xoay xương trục ${axis.toUpperCase()}`}
                          min={-2.6}
                          max={2.6}
                          step={0.05}
                          value={selectedBone.rotation[axis]}
                          onChange={(e) =>
                            props.onUpdateBoneRotation(selectedBone.id, {
                              ...selectedBone.rotation,
                              [axis]: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400 h-2 bg-slate-950 rounded-lg cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 3: Diễn Hoạt Trên Xương (Keyframe Animation Timeline) */}
          {props.workspaceMode === 'animate' && (
            <div className="p-3.5 space-y-3">
              {/* Top Row: Play/Pause, Record Keyframe, Preset Animation Generators */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={props.onTogglePlay}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {props.isPlaying ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" />
                        <span>Tạm Dừng</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Phát Animation</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={props.onRecordKeyframeAtCurrent}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>+ Lưu Keyframe (F{props.currentFrame})</span>
                  </button>

                  {hasKeyframeAtCurrent && (
                    <button
                      type="button"
                      onClick={props.onDeleteKeyframeAtCurrent}
                      aria-label="Xóa Keyframe hiện tại"
                      className="min-h-[42px] px-2.5 py-2 rounded-xl bg-slate-950 hover:bg-red-950/50 border border-slate-800 text-red-400 text-xs flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Preset Motion Library */}
                <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                  {[
                    { id: 'walk_cycle', label: 'Đi Bộ' },
                    { id: 'wave_hand', label: 'Vẫy Tay' },
                    { id: 'happy_jump', label: 'Nhảy Mừng' },
                    { id: 'combat_spin', label: 'Xoay Đánh' },
                    { id: 'idle_breathe', label: 'Đứng Thở' },
                  ].map((anim) => (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={() => props.onApplyAnimationPreset(anim.id as AnimationPresetId)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline Scrubber with Diamond Keyframe Markers */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>
                    Khung hình: <strong className="text-amber-400">{props.currentFrame}</strong> /{' '}
                    {props.totalFrames}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>Keyframes đã lưu: {props.keyframes.map((k) => `F${k.frame}`).join(', ')}</span>
                    <span aria-hidden="true">·</span>
                    <select
                      aria-label="Chọn tốc độ khung hình FPS"
                      value={props.fps}
                      onChange={(e) => props.onChangeFps(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-200 font-mono"
                    >
                      <option value={12}>12 FPS</option>
                      <option value={24}>24 FPS</option>
                      <option value={30}>30 FPS</option>
                      <option value={60}>60 FPS</option>
                    </select>
                  </div>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="range"
                    aria-label="Thanh trượt thời gian Animation Timeline"
                    min={0}
                    max={props.totalFrames}
                    step={1}
                    value={props.currentFrame}
                    onChange={(e) => props.onScrubFrame(Number(e.target.value))}
                    className="w-full accent-amber-500 h-3 bg-slate-950 rounded-xl cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode 4: Render Thời Gian Thực & Xuất File (Real-time Studio Render & Export) */}
          {props.workspaceMode === 'render' && (
            <div className="p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Real-time Shader / Lighting Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-400">Chế độ Render:</span>
                  {[
                    { id: 'studio_pbr', label: 'Studio PBR' },
                    { id: 'unreal_sun', label: 'Unreal Sun' },
                    { id: 'clay_sculpt', label: 'Đất Sét (Clay)' },
                    { id: 'toon_anime', label: 'Toon Anime' },
                    { id: 'wireframe_xray', label: 'Khung Dây' },
                  ].map((env) => (
                    <button
                      key={env.id}
                      type="button"
                      onClick={() => props.onChangeRenderEnv(env.id as RenderEnvironmentId)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        props.renderEnv === env.id
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {env.label}
                    </button>
                  ))}
                </div>

                {/* Camera Angles & Turntable */}
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'perspective', label: 'Góc 3/4' },
                    { id: 'front', label: 'Chính Diện' },
                    { id: 'side', label: 'Mặt Bên' },
                  ].map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => props.onSetCameraPreset(cam.id as CameraViewPreset)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 whitespace-nowrap shrink-0"
                    >
                      <Camera className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                      {cam.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={props.onToggleTurntable}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      props.turntableActive
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    Xoay 360°
                  </button>

                  <button
                    type="button"
                    onClick={props.onToggleBonesXRay}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      props.showBonesXRay
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 inline mr-1" />
                    X-Ray Xương
                  </button>
                </div>
              </div>

              {/* Direct Export CTA Strip */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  Xuất trực tiếp sang Unity, Unreal Engine, Video MP4/WebM hoặc Sprite Sheet 2D:
                </span>
                <button
                  type="button"
                  onClick={props.onOpenExportModal}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Mở Trung Tâm Xuất File (GLB / MP4 / Frame Sheet)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
