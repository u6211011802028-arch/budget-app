import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BudgetCategory } from '../types/budget';
import {
  EXPENSE_CATEGORY_OPTIONS,
  buildFutureMonthSequence,
  fmt,
} from '../data/defaultBudget';

interface AddExpenseModalProps {
  isOpen: boolean;
  months: string[];
  activeMonth: string;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    recurring: boolean;
    recurringEndMonth: string;
    recurringMonths: number;
    paid: boolean;
  }) => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  months,
  activeMonth,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('ค่าใช้จ่ายจำเป็น (40%)');
  const [recurring, setRecurring] = useState(false);
  const [recurringMode, setRecurringMode] = useState<'fixed' | 'split'>('fixed');
  const [durationMonths, setDurationMonths] = useState('');
  const [recurringEndMonth, setRecurringEndMonth] = useState('');
  const [paid, setPaid] = useState(false);

  const parsedDuration = Math.max(0, parseInt(durationMonths, 10) || 0);

  const futureOptions = useMemo(
    () =>
      buildFutureMonthSequence(
        months,
        activeMonth,
        Math.max(36, parsedDuration + 6)
      ),
    [months, activeMonth, parsedDuration]
  );

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAmount('');
      setNote('');
      setCategory('ค่าใช้จ่ายจำเป็น (40%)');
      setRecurring(false);
      setRecurringMode('fixed');
      setDurationMonths('');
      setRecurringEndMonth('');
      setPaid(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numAmt = Number(amount) || 0;
  const effectiveMonths =
    recurring && recurringMode === 'split'
      ? Math.max(1, parsedDuration || 10)
      : parsedDuration;
  const effectiveMonthlyAmount =
    recurring && recurringMode === 'split'
      ? Math.round((numAmt / effectiveMonths) * 100) / 100
      : numAmt;

  const handleDurationChange = (raw: string) => {
    setDurationMonths(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1) {
      const seq = buildFutureMonthSequence(
        months,
        activeMonth,
        Math.max(36, n + 6)
      );
      const target = seq[n - 1];
      if (target) setRecurringEndMonth(target.month);
    } else if (raw.trim() === '' && recurringMode === 'fixed') {
      setRecurringEndMonth('');
    }
  };

  const handleEndMonthSelect = (endMonth: string) => {
    setRecurringEndMonth(endMonth);
    if (!endMonth) {
      setDurationMonths('');
      return;
    }
    const found = futureOptions.find((o) => o.month === endMonth);
    if (found) {
      setDurationMonths(String(found.countFromActive));
    }
  };

  const handleModeSwitch = (mode: 'fixed' | 'split') => {
    setRecurringMode(mode);
    if (mode === 'split' && (!parsedDuration || parsedDuration < 1)) {
      const defaultN = Math.min(10, futureOptions.length);
      setDurationMonths(String(defaultN));
      if (futureOptions[defaultN - 1]) {
        setRecurringEndMonth(futureOptions[defaultN - 1].month);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || numAmt <= 0) return;

    const finalEndMonth =
      recurring && recurringMode === 'split'
        ? recurringEndMonth ||
          futureOptions[effectiveMonths - 1]?.month ||
          activeMonth
        : recurring
        ? recurringEndMonth
        : '';

    onSubmit({
      name: name.trim(),
      amount: effectiveMonthlyAmount,
      note: note.trim() || '-',
      category,
      recurring,
      recurringEndMonth: finalEndMonth,
      recurringMonths: recurring ? effectiveMonths : 1,
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
      <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg max-h-[92vh] overflow-y-auto">
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
              placeholder="เช่น ค่าอาหารกลางวัน, ผ่อนมือถือ 0%, ค่าเน็ต"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                {recurring && recurringMode === 'split'
                  ? 'ยอดรวมทั้งหมด (บาท) *'
                  : 'จำนวนเงิน (บาท) *'}
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
              onChange={(e) => {
                setRecurring(e.target.checked);
                if (!e.target.checked) {
                  setRecurringEndMonth('');
                  setDurationMonths('');
                  setRecurringMode('fixed');
                }
              }}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ทำซ้ำทุกเดือน / ผ่อนรายเดือน (เริ่ม {activeMonth})</span>
          </label>

          {recurring && (
            <div className="ml-6 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              {/* Fixed Monthly vs 0% Installment Split */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('fixed')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    recurringMode === 'fixed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  จ่ายเท่ากันทุกเดือน
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('split')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    recurringMode === 'split'
                      ? 'bg-white text-[#006A63] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ผ่อน 0% (หารตามเดือน)
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <label
                    htmlFor="add-expense-duration"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    ระยะเวลา (เดือน)
                  </label>
                  <input
                    id="add-expense-duration"
                    type="number"
                    min={recurringMode === 'split' ? 1 : 0}
                    max={120}
                    required={recurringMode === 'split'}
                    value={durationMonths}
                    onChange={(e) => handleDurationChange(e.target.value)}
                    placeholder={recurringMode === 'split' ? 'เช่น 10' : 'ไม่จำกัด'}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num bg-white focus:outline-none focus:border-[#006A63]"
                  />
                </div>

                <div className="col-span-7">
                  <label
                    htmlFor="add-expense-end-month"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    สิ้นสุดเดือนไหน
                  </label>
                  <select
                    id="add-expense-end-month"
                    value={recurringEndMonth}
                    onChange={(e) => handleEndMonthSelect(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
                  >
                    {recurringMode === 'fixed' && (
                      <option value="">ไม่กำหนดสิ้นสุด</option>
                    )}
                    {futureOptions.map((opt) => (
                      <option key={opt.month} value={opt.month}>
                        {opt.month} ({opt.countFromActive} เดือน)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {numAmt > 0 && (
                <div className="pt-1.5 border-t border-slate-200/80 text-xs text-slate-600">
                  {recurringMode === 'split' ? (
                    <span className="font-heading text-[#006A63] font-semibold">
                      ผ่อน 0% นาน <span className="font-num">{effectiveMonths}</span> เดือน
                      ({activeMonth} – {recurringEndMonth || futureOptions[effectiveMonths - 1]?.month})
                      · ตกเดือนละ{' '}
                      <span className="font-num">฿{fmt(effectiveMonthlyAmount)}</span>
                    </span>
                  ) : parsedDuration > 0 ? (
                    <span className="font-heading">
                      จ่ายเดือนละ <span className="font-num font-semibold">฿{fmt(numAmt)}</span>{' '}
                      นาน <span className="font-num">{parsedDuration}</span> เดือน · รวม{' '}
                      <span className="font-num font-semibold">
                        ฿{fmt(numAmt * parsedDuration)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-heading">
                      บันทึกเดือนละ <span className="font-num font-semibold">฿{fmt(numAmt)}</span>{' '}
                      ตั้งแต่ {activeMonth} เป็นต้นไป
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

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

interface EditExpenseModalProps {
  isOpen: boolean;
  months: string[];
  activeMonth: string;
  expense: {
    id: number;
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    isPaid: boolean;
    recurringEndMonth?: string;
  } | null;
  onClose: () => void;
  onSubmit: (data: {
    id: number;
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    paid: boolean;
    applyFutureMonths: boolean;
    recurringEndMonth: string;
    recurringMonths: number;
  }) => void;
}

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  isOpen,
  months,
  activeMonth,
  expense,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('ค่าใช้จ่ายจำเป็น (40%)');
  const [paid, setPaid] = useState(false);
  const [applyFutureMonths, setApplyFutureMonths] = useState(false);
  const [recurringMode, setRecurringMode] = useState<'fixed' | 'split'>('fixed');
  const [durationMonths, setDurationMonths] = useState('');
  const [recurringEndMonth, setRecurringEndMonth] = useState('');

  const parsedDuration = Math.max(0, parseInt(durationMonths, 10) || 0);

  const futureOptions = useMemo(
    () =>
      buildFutureMonthSequence(
        months,
        activeMonth,
        Math.max(36, parsedDuration + 6)
      ),
    [months, activeMonth, parsedDuration]
  );

  useEffect(() => {
    if (isOpen && expense) {
      setName(expense.name);
      setAmount(String(expense.amount));
      setNote(expense.note === '-' ? '' : expense.note);
      const normalizedCat: BudgetCategory =
        expense.category === 'สร้างความมั่งคั่ง (30%)'
          ? 'เงินออม + ลงทุน (20%)'
          : expense.category === 'ความต้องการส่วนตัว (20%)' ||
            expense.category === 'บริจาค / การกุศล (10%)'
          ? 'เงินใช้ส่วนตัว (10%)'
          : expense.category;
      setCategory(normalizedCat);
      setPaid(expense.isPaid);
      setApplyFutureMonths(false);
      setRecurringMode('fixed');
      const endM = expense.recurringEndMonth || '';
      setRecurringEndMonth(endM);
      if (endM) {
        const seq = buildFutureMonthSequence(months, activeMonth, 36);
        const found = seq.find((o) => o.month === endM);
        setDurationMonths(found ? String(found.countFromActive) : '');
      } else {
        setDurationMonths('');
      }
    }
  }, [isOpen, expense, months, activeMonth]);

  if (!isOpen || !expense) return null;

  const numAmt = Number(amount);
  const validAmt = !isNaN(numAmt) && numAmt >= 0 ? numAmt : 0;
  const effectiveMonths =
    applyFutureMonths && recurringMode === 'split'
      ? Math.max(1, parsedDuration || 10)
      : parsedDuration;
  const effectiveMonthlyAmount =
    applyFutureMonths && recurringMode === 'split'
      ? Math.round((validAmt / effectiveMonths) * 100) / 100
      : validAmt;

  const handleDurationChange = (raw: string) => {
    setDurationMonths(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1) {
      const seq = buildFutureMonthSequence(
        months,
        activeMonth,
        Math.max(36, n + 6)
      );
      const target = seq[n - 1];
      if (target) setRecurringEndMonth(target.month);
    } else if (raw.trim() === '' && recurringMode === 'fixed') {
      setRecurringEndMonth('');
    }
  };

  const handleEndMonthSelect = (endMonth: string) => {
    setRecurringEndMonth(endMonth);
    if (!endMonth) {
      setDurationMonths('');
      return;
    }
    const found = futureOptions.find((o) => o.month === endMonth);
    if (found) {
      setDurationMonths(String(found.countFromActive));
    }
  };

  const handleModeSwitch = (mode: 'fixed' | 'split') => {
    setRecurringMode(mode);
    if (mode === 'split' && (!parsedDuration || parsedDuration < 1)) {
      const defaultN = Math.min(10, futureOptions.length);
      setDurationMonths(String(defaultN));
      if (futureOptions[defaultN - 1]) {
        setRecurringEndMonth(futureOptions[defaultN - 1].month);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isNaN(numAmt) || numAmt < 0) return;

    const finalEndMonth =
      applyFutureMonths && recurringMode === 'split'
        ? recurringEndMonth ||
          futureOptions[effectiveMonths - 1]?.month ||
          activeMonth
        : applyFutureMonths
        ? recurringEndMonth
        : '';

    onSubmit({
      id: expense.id,
      name: name.trim(),
      amount: effectiveMonthlyAmount,
      note: note.trim() || '-',
      category,
      paid,
      applyFutureMonths,
      recurringEndMonth: finalEndMonth,
      recurringMonths: applyFutureMonths ? effectiveMonths : 1,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-bold text-slate-900">
            แก้ไขรายการค่าใช้จ่าย · {activeMonth}
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
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                {applyFutureMonths && recurringMode === 'split'
                  ? 'ยอดรวมทั้งหมด (บาท) *'
                  : 'จำนวนเงิน (บาท) *'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
              checked={applyFutureMonths}
              onChange={(e) => {
                setApplyFutureMonths(e.target.checked);
                if (!e.target.checked) {
                  setRecurringMode('fixed');
                }
              }}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ทำซ้ำทุกเดือน / ผ่อนรายเดือน (เริ่ม {activeMonth})</span>
          </label>

          {applyFutureMonths && (
            <div className="ml-6 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              {/* Fixed Monthly vs 0% Installment Split */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('fixed')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    recurringMode === 'fixed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  จ่ายเท่ากันทุกเดือน
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('split')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    recurringMode === 'split'
                      ? 'bg-white text-[#006A63] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ผ่อน 0% (หารตามเดือน)
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <label
                    htmlFor="edit-expense-duration"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    ระยะเวลา (เดือน)
                  </label>
                  <input
                    id="edit-expense-duration"
                    type="number"
                    min={recurringMode === 'split' ? 1 : 0}
                    max={120}
                    required={recurringMode === 'split'}
                    value={durationMonths}
                    onChange={(e) => handleDurationChange(e.target.value)}
                    placeholder={recurringMode === 'split' ? 'เช่น 10' : 'ไม่จำกัด'}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num bg-white focus:outline-none focus:border-[#006A63]"
                  />
                </div>

                <div className="col-span-7">
                  <label
                    htmlFor="edit-expense-end-month"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    สิ้นสุดเดือนไหน
                  </label>
                  <select
                    id="edit-expense-end-month"
                    value={recurringEndMonth}
                    onChange={(e) => handleEndMonthSelect(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
                  >
                    {recurringMode === 'fixed' && (
                      <option value="">ไม่กำหนดสิ้นสุด</option>
                    )}
                    {futureOptions.map((opt) => (
                      <option key={opt.month} value={opt.month}>
                        {opt.month} ({opt.countFromActive} เดือน)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {validAmt > 0 && (
                <div className="pt-1.5 border-t border-slate-200/80 text-xs text-slate-600">
                  {recurringMode === 'split' ? (
                    <span className="font-heading text-[#006A63] font-semibold">
                      ผ่อน 0% นาน <span className="font-num">{effectiveMonths}</span> เดือน
                      ({activeMonth} – {recurringEndMonth || futureOptions[effectiveMonths - 1]?.month})
                      · ตกเดือนละ{' '}
                      <span className="font-num">฿{fmt(effectiveMonthlyAmount)}</span>
                    </span>
                  ) : parsedDuration > 0 ? (
                    <span className="font-heading">
                      จ่ายเดือนละ <span className="font-num font-semibold">฿{fmt(validAmt)}</span>{' '}
                      นาน <span className="font-num">{parsedDuration}</span> เดือน · รวม{' '}
                      <span className="font-num font-semibold">
                        ฿{fmt(validAmt * parsedDuration)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-heading">
                      ปรับยอดเป็น <span className="font-num font-semibold">฿{fmt(validAmt)}</span>{' '}
                      ตั้งแต่ {activeMonth} เป็นต้นไป
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ชำระเงินแล้ว</span>
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
              บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface EditExtraIncomeModalProps {
  isOpen: boolean;
  extraIncome: { index: number; name: string; amount: number } | null;
  onClose: () => void;
  onSubmit: (index: number, name: string, amount: number) => void;
}

export const EditExtraIncomeModal: React.FC<EditExtraIncomeModalProps> = ({
  isOpen,
  extraIncome,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (isOpen && extraIncome) {
      setName(extraIncome.name);
      setAmount(String(extraIncome.amount));
    }
  }, [isOpen, extraIncome]);

  if (!isOpen || !extraIncome) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!name.trim() || isNaN(numAmt) || numAmt < 0) return;
    onSubmit(extraIncome.index, name.trim(), numAmt);
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
            แก้ไขรายการรายรับพิเศษ
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
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num focus:outline-none focus:border-[#006A63]"
            />
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
              บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

