import React from 'react';
import { Plus } from 'lucide-react';
import { BudgetState } from '../types/budget';
import {
  BUDGET_CATEGORIES,
  DEBT_PRIORITIES,
  fmt,
  getMonthExpenses,
  getMonthIncome,
} from '../data/defaultBudget';

interface ProjectionViewProps {
  state: BudgetState;
  onOpenAddMonthModal: () => void;
}

export const ProjectionView: React.FC<ProjectionViewProps> = ({
  state,
  onOpenAddMonthModal,
}) => {
  const monthExpenseTotals = state.months.map((mon) =>
    getMonthExpenses(state, mon).reduce((s, e) => s + e.amount, 0)
  );
  const grandExpense = monthExpenseTotals.reduce((a, b) => a + b, 0);

  const monthIncomeTotals = state.months.map(
    (mon) => getMonthIncome(state, mon).total
  );
  const grandIncome = monthIncomeTotals.reduce((a, b) => a + b, 0);

  const monthDeductionTotals = state.months.map(
    (mon) => getMonthIncome(state, mon).deductionsTotal
  );
  const grandDeductions = monthDeductionTotals.reduce((a, b) => a + b, 0);
  const hasAnyDeductions = grandDeductions > 0;

  const grandNet = grandIncome - grandExpense;

  const urgencyBadgeClass = (level: string) => {
    switch (level) {
      case 'critical':
        return 'text-orange-700 font-semibold';
      case 'high':
        return 'text-orange-700 font-semibold';
      case 'medium':
        return 'text-amber-700 font-medium';
      case 'positive':
        return 'text-[#0F766E] font-medium';
      default:
        return 'text-slate-600';
    }
  };

  return (
    <section className="space-y-6">
      {/* Multi-month Projection Table */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
              ตารางสรุปแนวโน้มรายรับ-รายจ่ายล่วงหน้าทุกเดือน
            </h2>
            <p className="text-xs text-slate-500">
              อัปเดตอัตโนมัติตามรายการรับ-จ่ายและเดือนที่คุณเพิ่มเข้ามา
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAddMonthModal}
            className="inline-flex items-center gap-1 bg-[#006A63] hover:bg-[#004D48] text-white font-heading text-xs sm:text-sm font-medium px-3.5 py-2 rounded-lg transition self-start sm:self-auto whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มเดือนใหม่</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#006A63] text-white text-xs font-heading">
                <th className="py-3 px-3 rounded-tl-lg">หมวดหมู่ / สรุปยอด</th>
                {state.months.map((mon) => (
                  <th
                    key={mon}
                    className="py-3 px-3 text-right whitespace-nowrap"
                  >
                    {mon}
                  </th>
                ))}
                <th className="py-3 px-3 rounded-tr-lg text-right whitespace-nowrap">
                  รวมทั้งหมด
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BUDGET_CATEGORIES.map((cat) => {
                let rowTotal = 0;
                const cells = state.months.map((mon) => {
                  const val = getMonthExpenses(state, mon)
                    .filter((e) => e.category === cat.name)
                    .reduce((s, e) => s + e.amount, 0);
                  rowTotal += val;
                  return (
                    <td
                      key={mon}
                      className="py-2.5 px-3 text-right font-num text-slate-700"
                    >
                      ฿{fmt(val)}
                    </td>
                  );
                });
                return (
                  <tr key={cat.name} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {cat.name}
                    </td>
                    {cells}
                    <td className="py-2.5 px-3 text-right font-num font-semibold text-slate-900">
                      ฿{fmt(rowTotal)}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-slate-100/80 font-semibold">
                <td className="py-2.5 px-3 font-heading text-slate-900 whitespace-nowrap">
                  รวมรายจ่ายทั้งหมด
                </td>
                {monthExpenseTotals.map((val, idx) => (
                  <td
                    key={state.months[idx]}
                    className="py-2.5 px-3 text-right font-num font-bold text-slate-900"
                  >
                    ฿{fmt(val)}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right font-num font-bold text-slate-900">
                  ฿{fmt(grandExpense)}
                </td>
              </tr>

              {hasAnyDeductions && (
                <tr>
                  <td className="py-2.5 px-3 font-heading text-rose-700 whitespace-nowrap">
                    หักประกันสังคม + กองทุนสำรองเลี้ยงชีพ
                  </td>
                  {monthDeductionTotals.map((val, idx) => (
                    <td
                      key={state.months[idx]}
                      className="py-2.5 px-3 text-right font-num text-rose-700"
                    >
                      {val > 0 ? `-฿${fmt(val)}` : '฿0.00'}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-right font-num font-semibold text-rose-700">
                    -฿{fmt(grandDeductions)}
                  </td>
                </tr>
              )}

              <tr>
                <td className="py-2.5 px-3 font-heading font-semibold text-[#006A63] whitespace-nowrap">
                  {hasAnyDeductions ? 'รายรับสุทธิต่อเดือน (หลังหัก)' : 'รายรับรวมต่อเดือน'}
                </td>
                {monthIncomeTotals.map((val, idx) => (
                  <td
                    key={state.months[idx]}
                    className="py-2.5 px-3 text-right font-num font-semibold text-[#006A63]"
                  >
                    ฿{fmt(val)}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right font-num font-bold text-[#006A63]">
                  ฿{fmt(grandIncome)}
                </td>
              </tr>

              <tr className="border-t-2 border-slate-200">
                <td className="py-3 px-3 font-heading font-bold text-slate-900 whitespace-nowrap">
                  กระแสเงินสดสุทธิ
                </td>
                {state.months.map((mon, idx) => {
                  const net = monthIncomeTotals[idx] - monthExpenseTotals[idx];
                  const cls =
                    net < 0
                      ? 'text-orange-700 bg-orange-50/70'
                      : 'text-[#0F766E] bg-emerald-50/70';
                  return (
                    <td
                      key={mon}
                      className={`py-2.5 px-3 text-right font-num font-bold ${cls}`}
                    >
                      {net < 0 ? '-฿' : '+฿'}
                      {fmt(Math.abs(net))}
                    </td>
                  );
                })}
                <td
                  className={`py-3 px-3 text-right font-num font-bold ${
                    grandNet < 0 ? 'text-orange-700' : 'text-[#0F766E]'
                  }`}
                >
                  {grandNet < 0 ? '-฿' : '+฿'}
                  {fmt(Math.abs(grandNet))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Debt Payoff Priority Table */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
        <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900 mb-1">
          ลำดับความสำคัญในการปลดหนี้ (Debt Snowball & Avalanche)
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          เรียงลำดับหนี้ที่ควรปิดก่อนเพื่อลดดอกเบี้ยและปลดล็อกกระแสเงินสดรายเดือน
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs font-heading">
                <th className="py-2.5 px-3 rounded-tl-lg text-center">อันดับ</th>
                <th className="py-2.5 px-3">รายการหนี้สิน</th>
                <th className="py-2.5 px-3 text-right">ค่างวด/เดือน</th>
                <th className="py-2.5 px-3">ประเภท / ลักษณะ</th>
                <th className="py-2.5 px-3">ระดับความเร่งด่วน</th>
                <th className="py-2.5 px-3 rounded-tr-lg">กลยุทธ์แนะนำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DEBT_PRIORITIES.map((d) => (
                <tr key={d.rank} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 text-center font-num font-bold text-slate-700">
                    {d.rank}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    {d.name}
                  </td>
                  <td className="py-2.5 px-3 text-right font-num font-semibold text-slate-900">
                    ฿{fmt(d.monthlyPayment)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{d.type}</td>
                  <td
                    className={`py-2.5 px-3 text-xs font-heading ${urgencyBadgeClass(
                      d.urgencyLevel
                    )}`}
                  >
                    {d.urgency}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{d.strategy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
