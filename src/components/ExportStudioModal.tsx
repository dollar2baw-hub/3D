import React, { useState } from 'react';
import {
  Download,
  Film,
  Grid,
  Package,
  CheckCircle2,
  X,
  Camera,
  FileCode2,
} from 'lucide-react';
import { StudioMeshPart, StudioBoneNode, BoneKeyframe } from '../core/studioEngine';
import {
  exportModelForGameEngine,
  ExportResultInfo,
  SpriteSheetRenderResult,
} from '../core/threeBridge';
import { Viewport3DHandle } from './Viewport3D';

interface ExportStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: StudioMeshPart[];
  bones: StudioBoneNode[];
  keyframes: BoneKeyframe[];
  totalFrames: number;
  fps: number;
  clipName: string;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
}

type ExportTab = 'engine' | 'spritesheet' | 'video';

export const ExportStudioModal: React.FC<ExportStudioModalProps> = ({
  isOpen,
  onClose,
  parts,
  bones,
  keyframes,
  totalFrames,
  fps,
  clipName,
  viewportRef,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('engine');

  // Engine export state
  const [engineResult, setEngineResult] = useState<ExportResultInfo | null>(null);
  const [isExportingEngine, setIsExportingEngine] = useState(false);
  const [targetEngine, setTargetEngine] = useState<'unity' | 'unreal' | 'godot'>('unity');

  // Sprite sheet state
  const [sheetFrameCount, setSheetFrameCount] = useState(8);
  const [sheetColumns, setSheetColumns] = useState(4);
  const [sheetCellSize, setSheetCellSize] = useState(256);
  const [sheetTransparent, setSheetTransparent] = useState(true);
  const [sheetResult, setSheetResult] = useState<SpriteSheetRenderResult | null>(null);

  // Video export state
  const [videoDuration, setVideoDuration] = useState(2);
  const [videoFps, setVideoFps] = useState(24);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoResult, setVideoResult] = useState<{
    blobUrl: string;
    mimeType: string;
    extension: string;
    byteSize: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleEngineExport = async (format: 'glb' | 'gltf' | 'obj') => {
    setIsExportingEngine(true);
    try {
      const res = await exportModelForGameEngine(
        format,
        parts,
        bones,
        keyframes,
        totalFrames,
        fps,
        clipName,
      );
      setEngineResult(res);
    } finally {
      setIsExportingEngine(false);
    }
  };

  const handleGenerateSpriteSheet = () => {
    if (!viewportRef.current) return;
    const res = viewportRef.current.generateSpriteSheet({
      frameCount: sheetFrameCount,
      columns: sheetColumns,
      cellSize: sheetCellSize,
      transparentBg: sheetTransparent,
    });
    if (res) {
      setSheetResult(res);
    }
  };

  const handleRecordVideo = async () => {
    if (!viewportRef.current || isRecordingVideo) return;
    setIsRecordingVideo(true);
    setVideoProgress(0);
    try {
      const res = await viewportRef.current.recordAnimationVideo({
        durationSeconds: videoDuration,
        fps: videoFps,
        onProgress: (pct) => setVideoProgress(pct),
      });
      setVideoResult(res);
    } finally {
      setIsRecordingVideo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.85)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 id="export-modal-title" className="text-lg font-semibold text-slate-100 font-display">
              Xuất Dự Án 3D & Animation
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tương thích trực tiếp với Unity, Unreal Engine 5, Godot, Video và Sprite Sheet 2D
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ xuất file"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('engine')}
            className={`min-h-[44px] px-2 py-2 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap overflow-hidden ${
              activeTab === 'engine'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Unity / Unreal</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('spritesheet')}
            className={`min-h-[44px] px-2 py-2 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap overflow-hidden ${
              activeTab === 'spritesheet'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Grid className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Frame Sheet</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`min-h-[44px] px-2 py-2 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap overflow-hidden ${
              activeTab === 'video'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Video MP4</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'engine' && (
            <div className="space-y-4">
              {/* Target Engine Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  1. Chọn Game Engine đích để tối ưu hệ trục tọa độ & xương:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'unity', label: 'Unity Engine', desc: 'Chuẩn GLB + Humanoid Animator' },
                    { id: 'unreal', label: 'Unreal Engine 5', desc: 'Chuẩn GLTF/GLB Skeletal Mesh' },
                    { id: 'godot', label: 'Godot 4', desc: 'Nhập trực tiếp Scene GLB 3D' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTargetEngine(item.id as 'unity' | 'unreal' | 'godot')}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        targetEngine === item.id
                          ? 'border-amber-500 bg-amber-500/10 text-slate-100'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-100 whitespace-nowrap truncate">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Triggers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled={isExportingEngine}
                  onClick={() => handleEngineExport('glb')}
                  className="min-h-[48px] px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Tạo File .GLB (Khuyên dùng)</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingEngine}
                  onClick={() => handleEngineExport('gltf')}
                  className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileCode2 className="w-4 h-4 shrink-0" />
                  <span>Tạo File .GLTF (JSON)</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingEngine}
                  onClick={() => handleEngineExport('obj')}
                  className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <Package className="w-4 h-4 shrink-0" />
                  <span>Tạo File .OBJ (Mesh tĩnh)</span>
                </button>
              </div>

              {/* Result card */}
              {engineResult && (
                <div
                  data-testid="engine-export-result"
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Đã đóng gói thành công: {engineResult.filename}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      {(engineResult.byteSize / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                    <span>Đỉnh (Vertices): {engineResult.vertexCount}</span>
                    <span aria-hidden="true">·</span>
                    <span>Đa giác (Tris): {engineResult.triangleCount}</span>
                    <span aria-hidden="true">·</span>
                    <span>Xương (Bones): {engineResult.boneCount}</span>
                    <span aria-hidden="true">·</span>
                    <span>Clip: {engineResult.clipName}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400">
                      {targetEngine === 'unity'
                        ? 'Mẹo Unity: Kéo file vào thư mục Assets/Models, chọn Rig -> Animation Type: Humanoid hoặc Generic.'
                        : targetEngine === 'unreal'
                        ? 'Mẹo Unreal 5: Kéo file vào Content Browser, bật "Import Skeletal Mesh" và "Import Animations".'
                        : 'Mẹo Godot: Kéo file vào FileSystem, nhấp đúp để mở Advanced Import Settings.'}
                    </p>
                    <a
                      href={engineResult.blobUrl}
                      download={engineResult.filename}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải Xuống Máy</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'spritesheet' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="sheet-frames-select"
                    className="block text-xs text-slate-400 mb-1"
                  >
                    Số lượng Frame
                  </label>
                  <select
                    id="sheet-frames-select"
                    value={sheetFrameCount}
                    onChange={(e) => setSheetFrameCount(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value={4}>4 Frames</option>
                    <option value={8}>8 Frames</option>
                    <option value={12}>12 Frames</option>
                    <option value={16}>16 Frames</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sheet-cols-select" className="block text-xs text-slate-400 mb-1">
                    Số cột (Columns)
                  </label>
                  <select
                    id="sheet-cols-select"
                    value={sheetColumns}
                    onChange={(e) => setSheetColumns(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value={2}>2 Cột</option>
                    <option value={4}>4 Cột</option>
                    <option value={8}>8 Cột</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sheet-size-select" className="block text-xs text-slate-400 mb-1">
                    Kích thước mỗi ô
                  </label>
                  <select
                    id="sheet-size-select"
                    value={sheetCellSize}
                    onChange={(e) => setSheetCellSize(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value={128}>128 × 128 px</option>
                    <option value={256}>256 × 256 px</option>
                    <option value={512}>512 × 512 px</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sheetTransparent}
                      onChange={(e) => setSheetTransparent(e.target.checked)}
                      className="rounded accent-amber-500 w-4 h-4"
                    />
                    <span className="truncate">Nền trong suốt</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateSpriteSheet}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>Chụp & Kết Xuất Frame Sheet Ngay</span>
              </button>

              {sheetResult && (
                <div
                  data-testid="spritesheet-export-result"
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        Atlas: {sheetResult.layout.totalWidth} × {sheetResult.layout.totalHeight} px (
                        {sheetResult.layout.frameIndices.length} frames)
                      </span>
                    </span>
                    <span className="text-slate-400 font-mono">
                      ~{(sheetResult.byteSizeApprox / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-800 p-2 bg-slate-900/90 max-h-48 overflow-auto flex items-center justify-center">
                    <img
                      src={sheetResult.dataUrl}
                      alt="Bản xem trước Sprite Frame Sheet"
                      referrerPolicy="no-referrer"
                      className="max-h-40 object-contain"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={`data:application/json;charset=utf-8,${encodeURIComponent(
                        sheetResult.metadataJson,
                      )}`}
                      download={`pocketblend_spritesheet_${sheetResult.layout.frameIndices.length}f.json`}
                      className="min-h-[40px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>Tải JSON Tọa Độ</span>
                    </a>
                    <a
                      href={sheetResult.dataUrl}
                      download={`pocketblend_spritesheet_${sheetResult.layout.frameIndices.length}f.png`}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải Ảnh PNG</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'video' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="video-duration-select" className="block text-xs text-slate-400 mb-1">
                    Thời lượng quay (Giây)
                  </label>
                  <select
                    id="video-duration-select"
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value={1}>1 Giây (Nhanh)</option>
                    <option value={2}>2 Giây (1 Chu kỳ chuẩn)</option>
                    <option value={4}>4 Giây (2 Chu kỳ lặp)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="video-fps-select" className="block text-xs text-slate-400 mb-1">
                    Tốc độ khung hình (FPS)
                  </label>
                  <select
                    id="video-fps-select"
                    value={videoFps}
                    onChange={(e) => setVideoFps(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value={24}>24 FPS (Điện ảnh)</option>
                    <option value={30}>30 FPS (Tiêu chuẩn)</option>
                    <option value={60}>60 FPS (Mượt mà)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={isRecordingVideo}
                onClick={handleRecordVideo}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Film className="w-4 h-4 shrink-0" />
                <span>
                  {isRecordingVideo
                    ? `Đang Render Video Thời Gian Thực... (${videoProgress}%)`
                    : 'Ghi Hình & Xuất Video Animation'}
                </span>
              </button>

              {videoResult && (
                <div
                  data-testid="video-export-result"
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        Đã kết xuất video ({videoResult.extension.toUpperCase()}) thành công!
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-1">
                      Dung lượng: {(videoResult.byteSize / 1024).toFixed(1)} KB · Định dạng:{' '}
                      {videoResult.mimeType}
                    </div>
                  </div>
                  <a
                    href={videoResult.blobUrl}
                    download={`pocketblend_animation.${videoResult.extension}`}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Video</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
