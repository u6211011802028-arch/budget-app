import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { BudgetState, ExtraIncomeItem, MonthExpenseView } from '../types/budget';
import {
  ESSENTIAL_SUBCATEGORIES,
  EXPENSE_CATEGORY_OPTIONS,
  fmt,
  getMonthExpenses,
  getMonthIncome,
  resolveEssentialSubcategory,
} from '../data/defaultBudget';

interface TransactionsViewProps {
  state: BudgetState;
  onUpdateBaseIncome: (salary: number, salary29: number, side: number) => void;
  onUpdatePayrollDeductions: (
    socialSecurity: number,
    providentFund: number,
    applyFutureMonths: boolean
  ) => void;
  onEditExtraIncome: (index: number, item: ExtraIncomeItem) => void;
  onDeleteExtraIncome: (index: number) => void;
  onTogglePaid: (expenseId: number) => void;
  onEditExpense: (item: MonthExpenseView) => void;
  onRequestDeleteExpense: (expenseId: number, name: string) => void;
  onOpenIncomeModal: () => void;
  onOpenExpenseModal: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  state,
  onUpdateBaseIncome,
  onUpdatePayrollDeductions,
  onEditExtraIncome,
  onDeleteExtraIncome,
  onTogglePaid,
  onEditExpense,
  onRequestDeleteExpense,
  onOpenIncomeModal,
  onOpenExpenseModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [applyDeductionsMonthly, setApplyDeductionsMonthly] = useState(true);

  const m = state.activeMonth;
  const incData = useMemo(() => getMonthIncome(state, m), [state, m]);
  const exps = useMemo(() => getMonthExpenses(state, m), [state, m]);

  const totalExpense = exps.reduce((s, e) => s + e.amount, 0);
  const paidTotal = exps.filter((e) => e.isPaid).reduce((s, e) => s + e.amount, 0);
  const unpaidTotal = exps.filter((e) => !e.isPaid).reduce((s, e) => s + e.amount, 0);

  const filteredExps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exps.filter((item) => {
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.note.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (categoryFilter !== 'ALL') {
        if (categoryFilter.startsWith('SUB:')) {
          const targetSub = categoryFilter.slice(4);
          if (resolveEssentialSubcategory(item) !== targetSub) return false;
        } else if (item.category !== categoryFilter) {
          return false;
        }
      }
      if (statusFilter === 'PAID' && !item.isPaid) return false;
      if (statusFilter === 'UNPAID' && item.isPaid) return false;
      return true;
    });
  }, [exps, searchQuery, categoryFilter, statusFilter]);

  return (
    <section className="space-y-6">
      {/* Income Section */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
              รายรับประจำเดือน · {m}
            </h2>
            <p className="text-xs text-slate-500">
              ปรับแก้เงินเดือน รายได้เสริม และรายการหักประจำ (ประกันสังคม / กองทุนสำรองเลี้ยงชีพ) ได้ทันที
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenIncomeModal}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs sm:text-sm font-medium px-3.5 py-2 rounded-lg transition self-start sm:self-auto whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มรายการรายรับ</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <label
              htmlFor="input-salary"
              className="block text-xs font-heading text-slate-500 mb-1.5"
            >
              เงินเดือนรอบวันที่ 14 (บาท)
            </label>
            <input
              id="input-salary"
              type="number"
              step="0.01"
              value={incData.salary}
              onChange={(e) =>
                onUpdateBaseIncome(
                  Number(e.target.value) || 0,
                  incData.salary29,
                  incData.side
                )
              }
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-num font-semibold text-slate-900 focus:outline-none focus:border-[#006A63]"
            />
            {incData.providentFund > 0 && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-num">
                {incData.salary > 0 ? (
                  <>
                    <span className="text-slate-500 font-heading">
                      หลังหัก PVD (-฿{fmt(incData.effectiveProvidentFund)})
                    </span>
                    <span className="font-semibold text-[#006A63]">
                      สุทธิ ฿{fmt(incData.salaryNet14)}
                    </span>
                  </>
                ) : (
                  <span className="text-amber-700 font-heading">
                    รอเงินเดือนรอบ 14 เข้าก่อนหัก (ตั้งไว้ ฿{fmt(incData.providentFund)})
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <label
              htmlFor="input-salary-29"
              className="block text-xs font-heading text-slate-500 mb-1.5"
            >
              เงินเดือนรอบวันที่ 29 (บาท)
            </label>
            <input
              id="input-salary-29"
              type="number"
              step="0.01"
              value={incData.salary29}
              onChange={(e) =>
                onUpdateBaseIncome(
                  incData.salary,
                  Number(e.target.value) || 0,
                  incData.side
                )
              }
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-num font-semibold text-slate-900 focus:outline-none focus:border-[#006A63]"
            />
            {incData.socialSecurity > 0 && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-num">
                {incData.salary29 > 0 ? (
                  <>
                    <span className="text-slate-500 font-heading">
                      หลังหัก ปกส. (-฿{fmt(incData.effectiveSocialSecurity)})
                    </span>
                    <span className="font-semibold text-[#006A63]">
                      สุทธิ ฿{fmt(incData.salaryNet29)}
                    </span>
                  </>
                ) : (
                  <span className="text-amber-700 font-heading">
                    รอเงินเดือนรอบ 29 เข้า (ยังไม่หัก ปกส. ฿{fmt(incData.socialSecurity)} จากรอบ 14)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <label
              htmlFor="input-side-income"
              className="block text-xs font-heading text-slate-500 mb-1.5"
            >
              รายได้เสริม / OT (บาท)
            </label>
            <input
              id="input-side-income"
              type="number"
              step="0.01"
              value={incData.side}
              onChange={(e) =>
                onUpdateBaseIncome(
                  incData.salary,
                  incData.salary29,
                  Number(e.target.value) || 0
                )
              }
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-num font-semibold text-slate-900 focus:outline-none focus:border-[#006A63]"
            />
          </div>
        </div>

        {/* Payroll Recurring Deductions + Net Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="p-3.5 rounded-lg bg-rose-50/50 border border-rose-200/80">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="input-social-security"
                className="block text-xs font-heading font-medium text-rose-800"
              >
                หักประกันสังคม (บาท)
              </label>
              <span className="text-[11px] font-heading text-rose-600/90">
                หักจากรอบวันที่ 29
              </span>
            </div>
            <input
              id="input-social-security"
              type="number"
              step="0.01"
              min="0"
              value={incData.socialSecurity}
              onChange={(e) =>
                onUpdatePayrollDeductions(
                  Math.max(0, Number(e.target.value) || 0),
                  incData.providentFund,
                  applyDeductionsMonthly
                )
              }
              className="w-full bg-white border border-rose-200 rounded-lg px-3 py-1.5 font-num font-semibold text-slate-900 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="p-3.5 rounded-lg bg-rose-50/50 border border-rose-200/80">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="input-provident-fund"
                className="block text-xs font-heading font-medium text-rose-800"
              >
                หักกองทุนสำรองเลี้ยงชีพ (บาท)
              </label>
              <span className="text-[11px] font-heading text-rose-600/90">
                หักจากรอบวันที่ 14
              </span>
            </div>
            <input
              id="input-provident-fund"
              type="number"
              step="0.01"
              min="0"
              value={incData.providentFund}
              onChange={(e) =>
                onUpdatePayrollDeductions(
                  incData.socialSecurity,
                  Math.max(0, Number(e.target.value) || 0),
                  applyDeductionsMonthly
                )
              }
              className="w-full bg-white border border-rose-200 rounded-lg px-3 py-1.5 font-num font-semibold text-slate-900 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="p-3.5 rounded-lg bg-[#E6F3F2] border border-[#006A63]/20 flex flex-col justify-center">
            <span className="text-xs font-heading text-[#006A63]">
              {incData.deductionsTotal > 0
                ? 'รายรับสุทธิหลังหักเดือนนี้'
                : 'รวมรายรับทั้งหมดเดือนนี้'}
            </span>
            <span className="text-2xl font-num font-bold text-[#006A63] mt-0.5">
              ฿{fmt(incData.total)}
            </span>
            {(incData.deductionsTotal > 0 || incData.salary29 > 0) && (
              <span className="text-[11px] font-num text-[#004D48]/85 mt-0.5">
                {incData.salary29 > 0
                  ? `รอบ 14 สุทธิ ฿${fmt(incData.salaryNet14)} · รอบ 29 สุทธิ ฿${fmt(incData.salaryNet29)}`
                  : incData.socialSecurity > 0
                  ? `รอบ 14 สุทธิ ฿${fmt(incData.salaryNet14)} · รอเงินรอบ 29 เข้าก่อนหัก ปกส.`
                  : `รอบ 14 สุทธิ ฿${fmt(incData.salaryNet14)}`}
              </span>
            )}
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-heading text-slate-600 cursor-pointer mt-3">
          <input
            type="checkbox"
            checked={applyDeductionsMonthly}
            onChange={(e) => {
              const checked = e.target.checked;
              setApplyDeductionsMonthly(checked);
              if (checked) {
                onUpdatePayrollDeductions(
                  incData.socialSecurity,
                  incData.providentFund,
                  true
                );
              }
            }}
            className="w-3.5 h-3.5 accent-[#006A63] rounded"
          />
          <span>
            หักกองทุนสำรองเลี้ยงชีพ (รอบ 14) และประกันสังคม (รอบ 29) ประจำทุกเดือน (ตั้งแต่ {m} เป็นต้นไป)
          </span>
        </label>

        {incData.extras.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs font-heading font-semibold text-slate-500 mb-2">
              รายการรายรับเพิ่มเติมในเดือนนี้
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {incData.extras.map((ex, idx) => (
                <div
                  key={`${ex.name}-${idx}`}
                  className="flex items-center justify-between px-3.5 py-2 bg-white text-sm"
                >
                  <span className="text-slate-700 font-medium">{ex.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-num font-semibold text-emerald-700">
                      +฿{fmt(ex.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditExtraIncome(idx, ex)}
                      className="text-xs text-[#006A63] hover:underline"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteExtraIncome(idx)}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Expense Checklist */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
              เช็กลิสต์ค่าใช้จ่ายประจำเดือน · {m}
            </h2>
            <p className="text-xs text-slate-500">
              ติ๊กช่องชำระแล้วเพื่ออัปเดตยอดคงเหลืออัตโนมัติ หรือเพิ่มรายการใหม่ได้ทันที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหารายการ..."
                className="border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-[#006A63]"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              <option value="ALL">ทุกหมวดหมู่</option>
              {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
              {ESSENTIAL_SUBCATEGORIES.map((sc) => (
                <option key={sc.key} value={`SUB:${sc.key}`}>
                  ↳ จำเป็น: {sc.shortLabel}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | 'UNPAID' | 'PAID')
              }
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
            >
              <option value="ALL">ทุกสถานะ</option>
              <option value="UNPAID">รอชำระ</option>
              <option value="PAID">ชำระแล้ว</option>
            </select>

            <button
              type="button"
              onClick={onOpenExpenseModal}
              className="inline-flex items-center gap-1 bg-[#006A63] hover:bg-[#004D48] text-white font-heading text-sm font-medium px-3.5 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มรายจ่าย</span>
            </button>
          </div>
        </div>

        {/* Summary Strip (unboxed hairline grid) */}
        <div className="grid grid-cols-3 gap-4 py-3 px-4 mb-4 rounded-lg bg-slate-50 border border-slate-200">
          <div>
            <div className="text-xs text-slate-500 font-heading">ยอดรวมเดือนนี้</div>
            <div className="text-base sm:text-lg font-num font-bold text-slate-900">
              ฿{fmt(totalExpense)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#0F766E] font-heading">ชำระแล้ว</div>
            <div className="text-base sm:text-lg font-num font-bold text-[#0F766E]">
              ฿{fmt(paidTotal)}
            </div>
          </div>
          <div>
            <div className="text-xs text-amber-700 font-heading">รอชำระ</div>
            <div className="text-base sm:text-lg font-num font-bold text-amber-700">
              ฿{fmt(unpaidTotal)}
            </div>
          </div>
        </div>

        {/* Expense Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#006A63] text-white text-xs font-heading">
                <th className="py-3 px-3 rounded-tl-lg w-16 text-center">จ่ายแล้ว</th>
                <th className="py-3 px-3">รายการค่าใช้จ่าย</th>
                <th className="py-3 px-3">หมวดหมู่ (40-30-20-10)</th>
                <th className="py-3 px-3">ครบกำหนด / หมายเหตุ</th>
                <th className="py-3 px-3 text-right">จำนวนเงิน (บาท)</th>
                <th className="py-3 px-3 rounded-tr-lg text-center w-24">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredExps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    ไม่พบรายการที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredExps.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition ${
                      item.isPaid ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={item.isPaid}
                        onChange={() => onTogglePaid(item.id)}
                        className="w-4 h-4 accent-[#006A63] rounded cursor-pointer"
                        aria-label={`ทำเครื่องหมาย ${item.name} ว่าชำระแล้ว`}
                      />
                    </td>
                    <td
                      className={`py-2.5 px-3 font-medium ${
                        item.isPaid ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {item.name}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 font-heading">
                      <span>{item.category}</span>
                      {resolveEssentialSubcategory(item) && (
                        <span className="text-slate-400">
                          {' '}
                          · {resolveEssentialSubcategory(item)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-xs">{item.note}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-num font-semibold ${
                        item.isPaid ? 'text-[#0F766E]' : 'text-slate-900'
                      }`}
                    >
                      ฿{fmt(item.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditExpense(item)}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#006A63] px-2 py-1 rounded-md hover:bg-[#E6F3F2] transition"
                          aria-label={`แก้ไข ${item.name}`}
                          title="แก้ไขรายการ"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDeleteExpense(item.id, item.name)}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 px-2 py-1 rounded-md hover:bg-rose-50 transition"
                          aria-label={`ลบ ${item.name}`}
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
