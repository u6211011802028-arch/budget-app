import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BudgetCategory } from '../types/budget';
import { EXPENSE_CATEGORY_OPTIONS } from '../data/defaultBudget';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    recurring: boolean;
    paid: boolean;
  }) => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('ค่าใช้จ่ายจำเป็น (40%)');
  const [recurring, setRecurring] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAmount('');
      setNote('');
      setCategory('ค่าใช้จ่ายจำเป็น (40%)');
      setRecurring(false);
      setPaid(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount) || 0;
    if (!name.trim() || numAmt <= 0) return;
    onSubmit({
      name: name.trim(),
      amount: numAmt,
      note: note.trim() || '-',
      category,
      recurring,
      paid,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-bold text-slate-900">
            เพิ่มรายการรายจ่าย
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
              ชื่อรายการค่าใช้จ่าย *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ค่าอาหารกลางวัน, ค่าน้ำมัน, ค่าเน็ต"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                จำนวนเงิน (บาท) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num focus:outline-none focus:border-[#006A63]"
              />
            </div>
            <div>
              <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                วันครบกำหนด / หมายเหตุ
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น วันที่ 25"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
              หมวดหมู่ตามสูตร 40-30-20-10
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BudgetCategory)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ทำซ้ำทุกเดือน (ตั้งแต่เดือนนี้เป็นต้นไป)</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ทำเครื่องหมายว่าชำระเงินแล้วทันที</span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-heading text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-[#006A63] hover:bg-[#004D48] text-white"
            >
              บันทึกรายจ่าย
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    amount: number;
    type: 'extra' | 'side' | 'salary';
  }) => void;
}

export const AddIncomeModal: React.FC<AddIncomeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'extra' | 'side' | 'salary'>('extra');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAmount('');
      setType('extra');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount) || 0;
    if (!name.trim() || numAmt <= 0) return;
    onSubmit({ name: name.trim(), amount: numAmt, type });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-bold text-slate-900">
            เพิ่มรายการรายรับ
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
              ชื่อรายการรายรับ *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น โบนัส, ขายของออนไลน์, ค่าล่วงเวลา"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div>
            <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
              จำนวนเงิน (บาท) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div>
            <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
              รูปแบบการบันทึก
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'extra' | 'side' | 'salary')
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              <option value="extra">เพิ่มเป็นรายการรายรับพิเศษในเดือนนี้</option>
              <option value="side">บวกเพิ่มเข้าช่อง "รายได้เสริม" ของเดือนนี้</option>
              <option value="salary">อัปเดตยอด "เงินเดือนหลัก" ของเดือนนี้</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-heading text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              บันทึกรายรับ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddMonthModalProps {
  isOpen: boolean;
  suggestedName: string;
  existingMonths: string[];
  onClose: () => void;
  onSubmit: (newMonth: string, copyPrev: boolean) => void;
}

export const AddMonthModal: React.FC<AddMonthModalProps> = ({
  isOpen,
  suggestedName,
  existingMonths,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(suggestedName);
  const [copyPrev, setCopyPrev] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(suggestedName);
      setCopyPrev(true);
      setError(null);
    }
  }, [isOpen, suggestedName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingMonths.includes(trimmed)) {
      setError(`มีเดือน "${trimmed}" อยู่ในระบบแล้ว`);
      return;
    }
    onSubmit(trimmed, copyPrev);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-bold text-slate-900">
            เพิ่มเดือนใหม่
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
              ชื่อเดือน (เช่น พ.ค. 70) *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="พ.ค. 70"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={copyPrev}
                onChange={(e) => setCopyPrev(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#006A63] rounded"
              />
              <span>
                <strong className="font-heading block text-slate-800">
                  คัดลอกยอดเงินเดือนและบิลประจำจากเดือนล่าสุด
                </strong>
                <span className="text-xs text-slate-500">
                  ระบบจะยกยอดเงินเดือนและรายการค่าใช้จ่ายประจำมาให้โดยอัตโนมัติ (สถานะชำระจะเริ่มเป็นยังไม่จ่าย)
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-heading text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-[#006A63] hover:bg-[#004D48] text-white"
            >
              สร้างเดือนใหม่
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
