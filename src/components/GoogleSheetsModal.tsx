import React, { useState } from 'react';
import { FileSpreadsheet, FolderOpen, Link2, PlusCircle, X } from 'lucide-react';
import { SheetConnection } from '../types/budget';
import { extractSpreadsheetId } from '../services/googleSheets';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: SheetConnection | null;
  isLoading: boolean;
  errorMsg: string | null;
  onPickFromDrive: () => void;
  onConnectById: (spreadsheetId: string) => void;
  onSelectTab: (sheetTitle: string) => void;
  onPullFromSheet: () => void;
  onRequestCreateTemplate: () => void;
  onToggleAutoSave: (enabled: boolean) => void;
  onDisconnect: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  connection,
  isLoading,
  errorMsg,
  onPickFromDrive,
  onConnectById,
  onSelectTab,
  onPullFromSheet,
  onRequestCreateTemplate,
  onToggleAutoSave,
  onDisconnect,
}) => {
  const [urlInput, setUrlInput] = useState(
    connection?.spreadsheetUrl || connection?.spreadsheetId || ''
  );
  const [localErr, setLocalErr] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    const id = extractSpreadsheetId(urlInput);
    if (!id) {
      setLocalErr('กรุณาวางลิงก์ Google Sheets หรือ Spreadsheet ID ที่ถูกต้อง');
      return;
    }
    onConnectById(id);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-xl w-full p-6 border border-slate-200 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#006A63]" />
            <h3 className="text-lg font-heading font-semibold text-slate-900">
              เชื่อมต่อ Google Sheets สำหรับบันทึกข้อมูล
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {(errorMsg || localErr) && (
            <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800">
              {localErr || errorMsg}
            </div>
          )}

          {/* Option 1: Pick from Google Drive or Create New */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onPickFromDrive}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-heading font-medium text-slate-800 transition disabled:opacity-50"
            >
              <FolderOpen className="w-4 h-4 text-[#006A63]" />
              <span>เลือกไฟล์จาก Google Drive</span>
            </button>

            <button
              type="button"
              onClick={onRequestCreateTemplate}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#006A63] hover:bg-[#004D48] text-sm font-heading font-semibold text-white transition disabled:opacity-50"
            >
              <PlusCircle className="w-4 h-4" />
              <span>สร้าง Sheet ใหม่และบันทึกเลย</span>
            </button>
          </div>

          {/* Option 2: Paste URL / ID */}
          <form onSubmit={handleSubmitUrl} className="space-y-2">
            <label className="block text-xs font-heading font-medium text-slate-600">
              หรือวางลิงก์ / Spreadsheet ID ของไฟล์ที่มีอยู่แล้ว (ระบบจะดึงข้อมูลจากไฟล์มาอัปเดตในแอป)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-heading font-medium whitespace-nowrap transition disabled:opacity-50"
              >
                {isLoading ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อไฟล์'}
              </button>
            </div>
          </form>

          {/* Active Connection Tab Selector */}
          {connection && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">สเปรดชีตปลายทางที่เชื่อมต่ออยู่</div>
                  <div className="text-sm font-heading font-semibold text-slate-900 truncate">
                    {connection.spreadsheetTitle}
                  </div>
                  {connection.lastSyncedAt && (
                    <div className="text-[11px] text-[#006A63] mt-0.5">
                      บันทึกล่าสุด {connection.lastSyncedAt}
                    </div>
                  )}
                </div>
                <a
                  href={connection.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-heading font-medium text-[#006A63] hover:underline whitespace-nowrap shrink-0"
                >
                  เปิดใน Google Sheets →
                </a>
              </div>

              {connection.sheets.length > 0 && (
                <div>
                  <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                    เลือกแท็บแผ่นงาน (Sheet Tab) สำหรับบันทึกรายการรายจ่าย
                  </label>
                  <select
                    value={connection.selectedSheetTitle}
                    onChange={(e) => onSelectTab(e.target.value)}
                    disabled={isLoading}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
                  >
                    {connection.sheets.map((s) => (
                      <option key={s.sheetId} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#E6F3F2]/60 border border-[#006A63]/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={connection.autoSave ?? true}
                  onChange={(e) => onToggleAutoSave(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#006A63] rounded shrink-0"
                />
                <div className="text-xs">
                  <div className="font-heading font-semibold text-[#004D48]">
                    บันทึกข้อมูลเข้า Google Sheet อัตโนมัติเมื่อแก้ไข
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    เมื่อเปิดไว้ ระบบจะอัปเดตข้อมูลเข้าไฟล์นี้ให้อัตโนมัติหลังแก้ไขรายการประมาณ 2 วินาที
                  </div>
                </div>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={onPullFromSheet}
                  disabled={isLoading}
                  className="text-xs font-heading font-medium text-[#006A63] hover:underline disabled:opacity-50"
                >
                  ดึงข้อมูลล่าสุดจากแท็บนี้มาอัปเดตในแอป
                </button>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="text-xs font-heading text-orange-700 hover:underline"
                >
                  ยกเลิกการเชื่อมต่อไฟล์นี้
                </button>
              </div>
            </div>
          )}

          {/* Export Structure Guide */}
          <div className="pt-4 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
            <div className="font-heading font-semibold text-slate-800">
              ข้อมูลที่จะถูกบันทึกเข้า Google Sheets เมื่อกดบันทึก:
            </div>
            <p>
              1. <strong>แท็บหลัก ({connection?.selectedSheetTitle || 'รายจ่าย-40-30-20-10'}):</strong>{' '}
              รายการค่าใช้จ่าย หมวดหมู่ หมายเหตุ และยอดแต่ละเดือน
            </p>
            <p>
              2. <strong>แท็บรายรับประจำเดือน &amp; สถานะชำระ:</strong>{' '}
              เงินเดือนรอบวันที่ 14/29 รายได้เสริม ประกันสังคม กองทุนสำรองเลี้ยงชีพ รายรับสุทธิ และสถานะจ่ายบิล
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
