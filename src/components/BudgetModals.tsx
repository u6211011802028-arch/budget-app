import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BudgetCategory, EssentialSubcategory, ExpenseItem } from '../types/budget';
import {
  ESSENTIAL_SUBCATEGORIES,
  EXPENSE_CATEGORY_OPTIONS,
  buildFutureMonthSequence,
  detectEssentialSubcategory,
  fmt,
  isFuelExpenseInput,
  resolveBlueCardTargetMonth,
  resolveEssentialSubcategory,
} from '../data/defaultBudget';

interface AddExpenseModalProps {
  isOpen: boolean;
  months: string[];
  activeMonth: string;
  expenses: ExpenseItem[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    subCategory?: EssentialSubcategory;
    recurring: boolean;
    recurringStartMonth: string;
    recurringEndMonth: string;
    recurringMonths: number;
    paid: boolean;
    chargeToBlueCard?: boolean;
  }) => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  months,
  activeMonth,
  expenses,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('ค่าใช้จ่ายจำเป็น (40%)');
  const [subCategory, setSubCategory] = useState<EssentialSubcategory>('จำเป็นอื่นๆ');
  const [categoryManual, setCategoryManual] = useState(false);
  const [subCategoryManual, setSubCategoryManual] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [recurringMode, setRecurringMode] = useState<'split' | 'fixed'>('split');
  const [recurringStartMonth, setRecurringStartMonth] = useState(activeMonth);
  const [durationMonths, setDurationMonths] = useState('');
  const [recurringEndMonth, setRecurringEndMonth] = useState('');
  const [paid, setPaid] = useState(false);
  const [chargeToBlueCard, setChargeToBlueCard] = useState(true);

  const parsedDuration = Math.max(0, parseInt(durationMonths, 10) || 0);

  const startMonthOptions = useMemo(
    () => buildFutureMonthSequence(months, months[0] || activeMonth, 24),
    [months, activeMonth]
  );

  const effectiveStartMonth = recurringStartMonth || activeMonth;

  const futureOptions = useMemo(
    () =>
      buildFutureMonthSequence(
        months,
        effectiveStartMonth,
        Math.max(36, parsedDuration + 6)
      ),
    [months, effectiveStartMonth, parsedDuration]
  );

  const isFuel = useMemo(
    () => isFuelExpenseInput(name, category, subCategory),
    [name, category, subCategory]
  );
  const shouldChargeBlueCard = isFuel && chargeToBlueCard;

  const blueCardResolution = useMemo(
    () =>
      resolveBlueCardTargetMonth(
        expenses,
        months,
        recurring ? effectiveStartMonth : activeMonth
      ),
    [expenses, months, recurring, effectiveStartMonth, activeMonth]
  );

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAmount('');
      setNote('');
      setCategory('ค่าใช้จ่ายจำเป็น (40%)');
      setSubCategory('จำเป็นอื่นๆ');
      setCategoryManual(false);
      setSubCategoryManual(false);
      setRecurring(false);
      setRecurringMode('split');
      setRecurringStartMonth(activeMonth);
      setDurationMonths('');
      setRecurringEndMonth('');
      setPaid(false);
      setChargeToBlueCard(true);
    }
  }, [isOpen, activeMonth]);

  if (!isOpen) return null;

  const numAmt = Number(amount) || 0;
  const effectiveMonths =
    recurring && recurringMode === 'split'
      ? Math.max(1, parsedDuration || 3)
      : parsedDuration;
  const effectiveMonthlyAmount =
    recurring && recurringMode === 'split'
      ? Math.round((numAmt / effectiveMonths) * 100) / 100
      : numAmt;

  const syncEndMonthForDuration = (startM: string, monthsCount: number) => {
    const seq = buildFutureMonthSequence(
      months,
      startM,
      Math.max(36, monthsCount + 6)
    );
    const target = seq[monthsCount - 1];
    if (target) setRecurringEndMonth(target.month);
  };

  const handleStartMonthChange = (nextStart: string) => {
    setRecurringStartMonth(nextStart);
    if (parsedDuration >= 1) {
      syncEndMonthForDuration(nextStart, parsedDuration);
    } else if (recurringMode === 'split') {
      setDurationMonths('3');
      syncEndMonthForDuration(nextStart, 3);
    }
  };

  const handleDurationChange = (raw: string) => {
    setDurationMonths(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1) {
      syncEndMonthForDuration(effectiveStartMonth, n);
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

  const handleModeSwitch = (mode: 'split' | 'fixed') => {
    setRecurringMode(mode);
    if (mode === 'split' && (!parsedDuration || parsedDuration < 1)) {
      const defaultN = Math.min(3, futureOptions.length);
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
          effectiveStartMonth
        : recurring
        ? recurringEndMonth
        : '';

    onSubmit({
      name: name.trim(),
      amount: effectiveMonthlyAmount,
      note: note.trim() || '-',
      category,
      subCategory:
        category === 'ค่าใช้จ่ายจำเป็น (40%)' ? subCategory : undefined,
      recurring,
      recurringStartMonth: effectiveStartMonth,
      recurringEndMonth: finalEndMonth,
      recurringMonths: recurring ? effectiveMonths : 1,
      paid: shouldChargeBlueCard ? false : paid,
      chargeToBlueCard: shouldChargeBlueCard,
    });
    onClose();
  };

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    const detected = detectEssentialSubcategory(nextName);
    if (!subCategoryManual) {
      setSubCategory(detected);
    }
    if (
      !categoryManual &&
      (detected === 'ค่าอาหาร / น้ำ / ขนม' || detected === 'ค่าน้ำมัน')
    ) {
      setCategory('ค่าใช้จ่ายจำเป็น (40%)');
    }
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
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="เช่น ค่าอาหารกลางวัน, กาแฟ, ขนม, ค่าน้ำมัน, ค่าเน็ต"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                {recurring && recurringMode === 'split'
                  ? 'ยอดรวมทั้งหมดที่ผ่อน (บาท) *'
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
              onChange={(e) => {
                const nextCat = e.target.value as BudgetCategory;
                setCategory(nextCat);
                setCategoryManual(true);
                if (nextCat === 'ค่าใช้จ่ายจำเป็น (40%)' && !subCategoryManual) {
                  setSubCategory(detectEssentialSubcategory(name));
                }
              }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {category === 'ค่าใช้จ่ายจำเป็น (40%)' && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  htmlFor="add-expense-subcategory"
                  className="block text-xs font-heading font-medium text-slate-600"
                >
                  หมวดย่อยในค่าใช้จ่ายจำเป็น
                </label>
                {name.trim() && !subCategoryManual && (
                  <span className="text-[11px] font-heading text-[#006A63]">
                    กรองจากชื่อรายการอัตโนมัติ
                  </span>
                )}
              </div>
              <select
                id="add-expense-subcategory"
                value={subCategory}
                onChange={(e) => {
                  setSubCategory(e.target.value as EssentialSubcategory);
                  setSubCategoryManual(true);
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
              >
                {ESSENTIAL_SUBCATEGORIES.map((sc) => (
                  <option key={sc.key} value={sc.key}>
                    {sc.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isFuel && (
            <div className="p-3 rounded-lg bg-[#E6F3F2]/75 border border-[#006A63]/25 space-y-1.5">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-heading font-semibold text-[#004D48] cursor-pointer">
                <input
                  type="checkbox"
                  checked={chargeToBlueCard}
                  onChange={(e) => setChargeToBlueCard(e.target.checked)}
                  className="w-4 h-4 accent-[#006A63] rounded"
                />
                <span>ตัดยอดค่าน้ำมันเข้า &quot;{blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'}&quot; อัตโนมัติ</span>
              </label>

              {chargeToBlueCard ? (
                <div className="pl-6 space-y-1 text-xs text-slate-700 font-heading">
                  {blueCardResolution.isDeferredToNextMonth ? (
                    <p className="text-amber-800 font-medium">
                      {blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'} เดือน{' '}
                      {recurring ? effectiveStartMonth : activeMonth} ขึ้นสถานะจ่ายแล้ว ✓ →{' '}
                      <span className="font-semibold">
                        นำยอดไปคิดในเดือนถัดไป ({blueCardResolution.targetMonth})
                      </span>
                    </p>
                  ) : (
                    <p className="text-[#006A63]">
                      {blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'} เดือน{' '}
                      {blueCardResolution.targetMonth} ยังไม่ชำระ → ตัดยอดรวมในเดือน{' '}
                      <span className="font-semibold">{blueCardResolution.targetMonth}</span>
                    </p>
                  )}
                  {effectiveMonthlyAmount > 0 && (
                    <p className="text-slate-600">
                      ยอด {blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'} เดือน{' '}
                      {blueCardResolution.targetMonth}:{' '}
                      <span className="font-num">
                        ฿{fmt(Number(blueCardResolution.blueCardItem?.amounts?.[blueCardResolution.targetMonth]) || 0)}
                      </span>{' '}
                      →{' '}
                      <span className="font-num font-bold text-[#004D48]">
                        ฿{fmt(
                          (Number(blueCardResolution.blueCardItem?.amounts?.[blueCardResolution.targetMonth]) || 0) +
                            effectiveMonthlyAmount
                        )}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="pl-6 text-[11px] text-slate-500 font-heading">
                  จะบันทึกเป็นรายการค่าน้ำมันแยกต่างหาก (ไม่รวมในยอดบัตรบรูการ์ด)
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => {
                const checked = e.target.checked;
                setRecurring(checked);
                if (checked) {
                  setRecurringMode('split');
                  setRecurringStartMonth(activeMonth);
                  const defaultN = parsedDuration >= 1 ? parsedDuration : 3;
                  setDurationMonths(String(defaultN));
                  syncEndMonthForDuration(activeMonth, defaultN);
                } else {
                  setRecurringEndMonth('');
                  setDurationMonths('');
                  setRecurringStartMonth(activeMonth);
                  setRecurringMode('split');
                }
              }}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ผ่อนรายเดือน / ทำซ้ำทุกเดือน</span>
          </label>

          {recurring && (
            <div className="ml-6 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              {/* 0% Installment Split (Default) vs Fixed Monthly */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg">
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
                <button
                  type="button"
                  onClick={() => handleModeSwitch('fixed')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    recurringMode === 'fixed'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  จ่ายเท่ากันทุกเดือน
                </button>
              </div>

              <div>
                <label
                  htmlFor="add-expense-start-month"
                  className="block text-xs font-heading font-medium text-slate-600 mb-1"
                >
                  เริ่มผ่อน / เริ่มจ่ายเดือนไหน
                </label>
                <select
                  id="add-expense-start-month"
                  value={effectiveStartMonth}
                  onChange={(e) => handleStartMonthChange(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
                >
                  {startMonthOptions.map((opt) => (
                    <option key={opt.month} value={opt.month}>
                      {opt.month}
                      {opt.month === activeMonth ? ' (เดือนที่เลือกอยู่)' : ''}
                    </option>
                  ))}
                </select>
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
                    placeholder={recurringMode === 'split' ? 'เช่น 3, 10' : 'ไม่จำกัด'}
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
                      ({effectiveStartMonth} – {recurringEndMonth || futureOptions[effectiveMonths - 1]?.month})
                      · ตกเดือนละ{' '}
                      <span className="font-num">฿{fmt(effectiveMonthlyAmount)}</span> (จากยอดรวม{' '}
                      <span className="font-num">฿{fmt(numAmt)}</span>)
                    </span>
                  ) : parsedDuration > 0 ? (
                    <span className="font-heading">
                      จ่ายเดือนละ <span className="font-num font-semibold">฿{fmt(numAmt)}</span>{' '}
                      นาน <span className="font-num">{parsedDuration}</span> เดือน ({effectiveStartMonth} –{' '}
                      {recurringEndMonth || futureOptions[parsedDuration - 1]?.month}) · รวม{' '}
                      <span className="font-num font-semibold">
                        ฿{fmt(numAmt * parsedDuration)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-heading">
                      บันทึกเดือนละ <span className="font-num font-semibold">฿{fmt(numAmt)}</span>{' '}
                      ตั้งแต่ {effectiveStartMonth} เป็นต้นไป
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {!shouldChargeBlueCard && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
                className="w-4 h-4 accent-[#006A63] rounded"
              />
              <span>ทำเครื่องหมายว่าชำระเงินแล้วทันที</span>
            </label>
          )}

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
    type: 'extra' | 'side' | 'salary' | 'salary29';
  }) => void;
}

export const AddIncomeModal: React.FC<AddIncomeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'extra' | 'side' | 'salary' | 'salary29'>('extra');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAmount('');
      setType('extra');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isNameRequired = type === 'extra';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount) || 0;
    if (numAmt <= 0) return;
    if (isNameRequired && !name.trim()) return;
    const fallbackName =
      type === 'salary'
        ? 'เงินเดือนรอบวันที่ 14'
        : type === 'salary29'
        ? 'เงินเดือนรอบวันที่ 29'
        : 'รายได้เสริม';
    onSubmit({ name: name.trim() || fallbackName, amount: numAmt, type });
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
              รูปแบบการบันทึก
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(
                  e.target.value as 'extra' | 'side' | 'salary' | 'salary29'
                )
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              <option value="extra">เพิ่มเป็นรายการรายรับพิเศษในเดือนนี้</option>
              <option value="salary">อัปเดตยอด "เงินเดือนรอบวันที่ 14" ของเดือนนี้</option>
              <option value="salary29">อัปเดตยอด "เงินเดือนรอบวันที่ 29" ของเดือนนี้</option>
              <option value="side">บวกเพิ่มเข้าช่อง "รายได้เสริม" ของเดือนนี้</option>
            </select>
          </div>

          {isNameRequired && (
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
          )}

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
                  คัดลอกยอดเงินเดือน รายการหักประจำ และบิลประจำจากเดือนล่าสุด
                </strong>
                <span className="text-xs text-slate-500">
                  ระบบจะยกยอดเงินเดือน ประกันสังคม กองทุนสำรองเลี้ยงชีพ และค่าใช้จ่ายประจำมาให้โดยอัตโนมัติ (สถานะชำระจะเริ่มเป็นยังไม่จ่าย)
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
  expenses: ExpenseItem[];
  expense: {
    id: number;
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    subCategory?: EssentialSubcategory;
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
    subCategory?: EssentialSubcategory;
    paid: boolean;
    applyFutureMonths: boolean;
    recurringStartMonth: string;
    recurringEndMonth: string;
    recurringMonths: number;
    transferToBlueCard?: boolean;
  }) => void;
}

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  isOpen,
  months,
  activeMonth,
  expenses,
  expense,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('ค่าใช้จ่ายจำเป็น (40%)');
  const [subCategory, setSubCategory] = useState<EssentialSubcategory>('จำเป็นอื่นๆ');
  const [subCategoryManual, setSubCategoryManual] = useState(false);
  const [paid, setPaid] = useState(false);
  const [applyFutureMonths, setApplyFutureMonths] = useState(false);
  const [recurringMode, setRecurringMode] = useState<'split' | 'fixed'>('split');
  const [recurringStartMonth, setRecurringStartMonth] = useState(activeMonth);
  const [durationMonths, setDurationMonths] = useState('');
  const [recurringEndMonth, setRecurringEndMonth] = useState('');
  const [transferToBlueCard, setTransferToBlueCard] = useState(true);

  const parsedDuration = Math.max(0, parseInt(durationMonths, 10) || 0);

  const startMonthOptions = useMemo(
    () => buildFutureMonthSequence(months, months[0] || activeMonth, 24),
    [months, activeMonth]
  );

  const effectiveStartMonth = recurringStartMonth || activeMonth;

  const futureOptions = useMemo(
    () =>
      buildFutureMonthSequence(
        months,
        effectiveStartMonth,
        Math.max(36, parsedDuration + 6)
      ),
    [months, effectiveStartMonth, parsedDuration]
  );

  const isFuel = useMemo(
    () => isFuelExpenseInput(name, category, subCategory),
    [name, category, subCategory]
  );
  const shouldTransferBlueCard = isFuel && transferToBlueCard;

  const blueCardResolution = useMemo(
    () =>
      resolveBlueCardTargetMonth(
        expenses,
        months,
        applyFutureMonths ? effectiveStartMonth : activeMonth
      ),
    [expenses, months, applyFutureMonths, effectiveStartMonth, activeMonth]
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
      setSubCategory(
        resolveEssentialSubcategory({
          name: expense.name,
          category: normalizedCat,
          subCategory: expense.subCategory,
        }) || detectEssentialSubcategory(expense.name)
      );
      setSubCategoryManual(!!expense.subCategory);
      setPaid(expense.isPaid);
      setApplyFutureMonths(false);
      setRecurringMode('split');
      setRecurringStartMonth(activeMonth);
      setTransferToBlueCard(true);
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
      ? Math.max(1, parsedDuration || 3)
      : parsedDuration;
  const effectiveMonthlyAmount =
    applyFutureMonths && recurringMode === 'split'
      ? Math.round((validAmt / effectiveMonths) * 100) / 100
      : validAmt;

  const syncEndMonthForDuration = (startM: string, monthsCount: number) => {
    const seq = buildFutureMonthSequence(
      months,
      startM,
      Math.max(36, monthsCount + 6)
    );
    const target = seq[monthsCount - 1];
    if (target) setRecurringEndMonth(target.month);
  };

  const handleStartMonthChange = (nextStart: string) => {
    setRecurringStartMonth(nextStart);
    if (parsedDuration >= 1) {
      syncEndMonthForDuration(nextStart, parsedDuration);
    } else if (recurringMode === 'split') {
      setDurationMonths('3');
      syncEndMonthForDuration(nextStart, 3);
    }
  };

  const handleDurationChange = (raw: string) => {
    setDurationMonths(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1) {
      syncEndMonthForDuration(effectiveStartMonth, n);
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

  const handleModeSwitch = (mode: 'split' | 'fixed') => {
    setRecurringMode(mode);
    if (mode === 'split' && (!parsedDuration || parsedDuration < 1)) {
      const defaultN = Math.min(3, futureOptions.length);
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
          effectiveStartMonth
        : applyFutureMonths
        ? recurringEndMonth
        : '';

    onSubmit({
      id: expense.id,
      name: name.trim(),
      amount: effectiveMonthlyAmount,
      note: note.trim() || '-',
      category,
      subCategory:
        category === 'ค่าใช้จ่ายจำเป็น (40%)' ? subCategory : undefined,
      paid: shouldTransferBlueCard ? false : paid,
      applyFutureMonths,
      recurringStartMonth: effectiveStartMonth,
      recurringEndMonth: finalEndMonth,
      recurringMonths: applyFutureMonths ? effectiveMonths : 1,
      transferToBlueCard: shouldTransferBlueCard,
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
              onChange={(e) => {
                const nextName = e.target.value;
                setName(nextName);
                if (!subCategoryManual) {
                  setSubCategory(detectEssentialSubcategory(nextName));
                }
              }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-medium text-slate-600 mb-1">
                {applyFutureMonths && recurringMode === 'split'
                  ? 'ยอดรวมทั้งหมดที่ผ่อน (บาท) *'
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
              onChange={(e) => {
                const nextCat = e.target.value as BudgetCategory;
                setCategory(nextCat);
                if (nextCat === 'ค่าใช้จ่ายจำเป็น (40%)' && !subCategoryManual) {
                  setSubCategory(detectEssentialSubcategory(name));
                }
              }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {category === 'ค่าใช้จ่ายจำเป็น (40%)' && (
            <div>
              <label
                htmlFor="edit-expense-subcategory"
                className="block text-xs font-heading font-medium text-slate-600 mb-1"
              >
                หมวดย่อยในค่าใช้จ่ายจำเป็น
              </label>
              <select
                id="edit-expense-subcategory"
                value={subCategory}
                onChange={(e) => {
                  setSubCategory(e.target.value as EssentialSubcategory);
                  setSubCategoryManual(true);
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
              >
                {ESSENTIAL_SUBCATEGORIES.map((sc) => (
                  <option key={sc.key} value={sc.key}>
                    {sc.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isFuel && (
            <div className="p-3 rounded-lg bg-[#E6F3F2]/75 border border-[#006A63]/25 space-y-1.5">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-heading font-semibold text-[#004D48] cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferToBlueCard}
                  onChange={(e) => setTransferToBlueCard(e.target.checked)}
                  className="w-4 h-4 accent-[#006A63] rounded"
                />
                <span>ตัดยอดค่าน้ำมันนี้เข้า &quot;{blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'}&quot;</span>
              </label>

              {transferToBlueCard && (
                <div className="pl-6 space-y-1 text-xs text-slate-700 font-heading">
                  {blueCardResolution.isDeferredToNextMonth ? (
                    <p className="text-amber-800 font-medium">
                      {blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'} เดือน{' '}
                      {applyFutureMonths ? effectiveStartMonth : activeMonth} ขึ้นสถานะจ่ายแล้ว ✓ →{' '}
                      <span className="font-semibold">
                        นำยอดไปคิดในเดือนถัดไป ({blueCardResolution.targetMonth})
                      </span>
                    </p>
                  ) : (
                    <p className="text-[#006A63]">
                      {blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'} เดือน{' '}
                      {blueCardResolution.targetMonth} ยังไม่ชำระ → ตัดยอดรวมในเดือน{' '}
                      <span className="font-semibold">{blueCardResolution.targetMonth}</span>
                    </p>
                  )}
                  {effectiveMonthlyAmount > 0 && (
                    <p className="text-slate-600">
                      ยอด {blueCardResolution.blueCardItem?.name || 'บัตรบรูการ์ด'} เดือน{' '}
                      {blueCardResolution.targetMonth}:{' '}
                      <span className="font-num">
                        ฿{fmt(Number(blueCardResolution.blueCardItem?.amounts?.[blueCardResolution.targetMonth]) || 0)}
                      </span>{' '}
                      →{' '}
                      <span className="font-num font-bold text-[#004D48]">
                        ฿{fmt(
                          (Number(blueCardResolution.blueCardItem?.amounts?.[blueCardResolution.targetMonth]) || 0) +
                            effectiveMonthlyAmount
                        )}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={applyFutureMonths}
              onChange={(e) => {
                const checked = e.target.checked;
                setApplyFutureMonths(checked);
                if (checked) {
                  setRecurringMode('split');
                  const startM = recurringStartMonth || activeMonth;
                  setRecurringStartMonth(startM);
                  const defaultN = parsedDuration >= 1 ? parsedDuration : 3;
                  setDurationMonths(String(defaultN));
                  syncEndMonthForDuration(startM, defaultN);
                } else {
                  setRecurringMode('split');
                }
              }}
              className="w-4 h-4 accent-[#006A63] rounded"
            />
            <span>ผ่อนรายเดือน / ทำซ้ำทุกเดือน</span>
          </label>

          {applyFutureMonths && (
            <div className="ml-6 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              {/* 0% Installment Split (Default) vs Fixed Monthly */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg">
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
                <button
                  type="button"
                  onClick={() => handleModeSwitch('fixed')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    recurringMode === 'fixed'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  จ่ายเท่ากันทุกเดือน
                </button>
              </div>

              <div>
                <label
                  htmlFor="edit-expense-start-month"
                  className="block text-xs font-heading font-medium text-slate-600 mb-1"
                >
                  เริ่มผ่อน / เริ่มจ่ายเดือนไหน
                </label>
                <select
                  id="edit-expense-start-month"
                  value={effectiveStartMonth}
                  onChange={(e) => handleStartMonthChange(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
                >
                  {startMonthOptions.map((opt) => (
                    <option key={opt.month} value={opt.month}>
                      {opt.month}
                      {opt.month === activeMonth ? ' (เดือนที่เลือกอยู่)' : ''}
                    </option>
                  ))}
                </select>
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
                    placeholder={recurringMode === 'split' ? 'เช่น 3, 10' : 'ไม่จำกัด'}
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
                      ({effectiveStartMonth} – {recurringEndMonth || futureOptions[effectiveMonths - 1]?.month})
                      · ตกเดือนละ{' '}
                      <span className="font-num">฿{fmt(effectiveMonthlyAmount)}</span> (จากยอดรวม{' '}
                      <span className="font-num">฿{fmt(validAmt)}</span>)
                    </span>
                  ) : parsedDuration > 0 ? (
                    <span className="font-heading">
                      จ่ายเดือนละ <span className="font-num font-semibold">฿{fmt(validAmt)}</span>{' '}
                      นาน <span className="font-num">{parsedDuration}</span> เดือน ({effectiveStartMonth} –{' '}
                      {recurringEndMonth || futureOptions[parsedDuration - 1]?.month}) · รวม{' '}
                      <span className="font-num font-semibold">
                        ฿{fmt(validAmt * parsedDuration)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-heading">
                      ปรับยอดเป็น <span className="font-num font-semibold">฿{fmt(validAmt)}</span>{' '}
                      ตั้งแต่ {effectiveStartMonth} เป็นต้นไป
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {!shouldTransferBlueCard && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
                className="w-4 h-4 accent-[#006A63] rounded"
              />
              <span>ชำระเงินแล้ว</span>
            </label>
          )}

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

