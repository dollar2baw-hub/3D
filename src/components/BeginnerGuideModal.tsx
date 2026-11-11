import React from 'react';
import { X, Box, Bone, Play, Share2 } from 'lucide-react';

interface BeginnerGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BeginnerGuideModal: React.FC<BeginnerGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const steps = [
    {
      icon: Box,
      title: '01. Tạo Khối & Nắn Khối (Model & Sculpt)',
      desc: 'Bấm "+ Thêm Khối" để thêm hình cầu, hộp, trụ hoặc đầu nhân vật. Dùng các thanh trượt "Phồng (Inflate)", "Vát (Taper)", "Xoắn (Twist)", "Uốn (Bend)" hoặc bật công cụ "Cọ Nắn Cảm Ứng" để vuốt trực tiếp lên bề mặt 3D.',
    },
    {
      icon: Bone,
      title: '02. Rig Xương Tự Động (Skeletal Rigging)',
      desc: 'Chuyển sang tab "Rig Xương". Chọn mẫu bộ xương có sẵn (Người 2 chân, Thú 4 chân, Cánh tay robot) hoặc bấm "+ Thêm Xương Con". Bấm "Gán Da Tự Động (Auto-Bind)" để các khối 3D tự động bám theo khớp xương gần nhất.',
    },
    {
      icon: Play,
      title: '03. Diễn Hoạt Trên Xương (Keyframe Animation)',
      desc: 'Chuyển sang tab "Diễn Hoạt". Chọn khung hình (Frame 0 - 48), xoay xương trên màn hình và bấm "Lưu Keyframe". Bạn cũng có thể áp dụng ngay 5 dáng chuyển động mẫu (Đi bộ, Vẫy tay, Nhảy mừng, Xoay chiến đấu).',
    },
    {
      icon: Share2,
      title: '04. Render Thời Gian Thực & Xuất Sang Unity / Unreal',
      desc: 'Đổi chế độ ánh sáng PBR Studio, Clay Đất Sét hoặc Toon Anime. Bấm "Xuất Game / Video" ở góc trên để tải file .GLB/.GLTF chuẩn cho Unity & Unreal Engine, hoặc xuất ảnh Frame Sheet .PNG và Video .MP4/.WebM.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.85)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
    >
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 id="guide-modal-title" className="text-base font-semibold text-slate-100 font-display">
            Hướng Dẫn Nhanh Cho Người Mới Học 3D (Android & PC)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hướng dẫn"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{s.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
          >
            Đã Hiểu, Bắt Đầu Sáng Tạo
          </button>
        </div>
      </div>
    </div>
  );
};
