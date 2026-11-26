import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { BudgetState, TargetPercentages } from '../types/budget';
import {
  BUDGET_CATEGORIES,
  DEFAULT_TARGET_PERCENTAGES,
  ESSENTIAL_SUBCATEGORIES,
  RECOVERY_ROADMAP,
  fmt,
  fmtCompact,
  getMonthExpenses,
  getMonthIncome,
  resolveEssentialSubcategory,
  resolveTargetPercentages,
} from '../data/defaultBudget';

interface DashboardViewProps {
  state: BudgetState;
  onTogglePaid: (expenseId: number) => void;
  onOpenIncomeModal: () => void;
  onSwitchToTransactions: () => void;
  onUpdateTargetPercentages: (next: TargetPercentages) => void;
}

type ProportionStatusLevel = 'on-target' | 'warning' | 'off-target';

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onTogglePaid,
  onOpenIncomeModal,
  onSwitchToTransactions,
  onUpdateTargetPercentages,
}) => {
  const [proportionBasis, setProportionBasis] = useState<'income' | 'expense'>('income');
  const [isEditingPct, setIsEditingPct] = useState(false);
  const [donutMode, setDonutMode] = useState<'nested' | 'main'>('nested');

  const targets = useMemo(
    () => resolveTargetPercentages(state.targetPercentages),
    [state.targetPercentages]
  );

  const [draftPct, setDraftPct] = useState<Record<keyof TargetPercentages, string>>({
    essential: String(targets.essential),
    debt: String(targets.debt),
    savings: String(targets.savings),
    personal: String(targets.personal),
  });

  useEffect(() => {
    setDraftPct({
      essential: String(targets.essential),
      debt: String(targets.debt),
      savings: String(targets.savings),
      personal: String(targets.personal),
    });
  }, [targets]);

  const targetSum =
    Math.round(
      (targets.essential + targets.debt + targets.savings + targets.personal) * 10
    ) / 10;
  const formulaLabel = `${targets.essential}-${targets.debt}-${targets.savings}-${targets.personal}`;
  const isDefaultFormula =
    targets.essential === DEFAULT_TARGET_PERCENTAGES.essential &&
    targets.debt === DEFAULT_TARGET_PERCENTAGES.debt &&
    targets.savings === DEFAULT_TARGET_PERCENTAGES.savings &&
    targets.personal === DEFAULT_TARGET_PERCENTAGES.personal;

  const handleDraftPctChange = (key: keyof TargetPercentages, raw: string) => {
    setDraftPct((prev) => ({ ...prev, [key]: raw }));
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      onUpdateTargetPercentages({
        ...targets,
        [key]: Math.round(parsed * 10) / 10,
      });
    }
  };

  const handleDraftPctBlur = (key: keyof TargetPercentages) => {
    const raw = draftPct[key].trim();
    const parsed = Number(raw);
    if (raw === '' || !Number.isFinite(parsed)) {
      setDraftPct((prev) => ({ ...prev, [key]: String(targets[key]) }));
      return;
    }
    const clamped = Math.min(100, Math.max(0, Math.round(parsed * 10) / 10));
    onUpdateTargetPercentages({ ...targets, [key]: clamped });
    setDraftPct((prev) => ({ ...prev, [key]: String(clamped) }));
  };

  const handleResetPercentages = () => {
    onUpdateTargetPercentages({ ...DEFAULT_TARGET_PERCENTAGES });
  };

  const m = state.activeMonth;
  const incData = useMemo(() => getMonthIncome(state, m), [state, m]);
  const exps = useMemo(() => getMonthExpenses(state, m), [state, m]);

  const totalExpense = useMemo(
    () => exps.reduce((sum, e) => sum + e.amount, 0),
    [exps]
  );
  const paidExps = useMemo(() => exps.filter((e) => e.isPaid), [exps]);
  const unpaidExps = useMemo(() => exps.filter((e) => !e.isPaid), [exps]);
  const unpaidTotal = useMemo(
    () => unpaidExps.reduce((sum, e) => sum + e.amount, 0),
    [unpaidExps]
  );

  const net = incData.total - totalExpense;
  const expPct = incData.total > 0 ? (totalExpense / incData.total) * 100 : 0;

  // ค่าใช้จ่ายจำเป็น (40%) · ภาระผ่อนหนี้ (30%) · เงินออม + ลงทุน (20%) · เงินใช้ส่วนตัว (10%)
  const proportionAudit = useMemo(() => {
    const baseAmount =
      proportionBasis === 'income'
        ? incData.total > 0
          ? incData.total
          : totalExpense
        : totalExpense;

    const sumCats = (names: string[]) =>
      exps
        .filter((e) => names.includes(e.category))
        .reduce((s, e) => s + e.amount, 0);

    const essentialAmt = sumCats(['ค่าใช้จ่ายจำเป็น (40%)']);
    const debtAmt = sumCats(['ภาระผ่อนหนี้ (30%)']);
    const savingsAmt = sumCats(['เงินออม + ลงทุน (20%)', 'สร้างความมั่งคั่ง (30%)']);
    const personalAmt = sumCats([
      'เงินใช้ส่วนตัว (10%)',
      'ความต้องการส่วนตัว (20%)',
      'บริจาค / การกุศล (10%)',
    ]);

    const makeItem = (
      key: keyof TargetPercentages,
      name: string,
      subtitle: string,
      targetPct: number,
      actualAmt: number,
      mode: 'max-cap' | 'min-goal'
    ) => {
      const targetRatio = targetPct / 100;
      const targetAmt = baseAmount * targetRatio;
      const actualPct = baseAmount > 0 ? (actualAmt / baseAmount) * 100 : 0;

      let status: ProportionStatusLevel;
      let statusLabel: string;

      if (mode === 'max-cap') {
        if (targetPct === 0) {
          if (actualAmt === 0) {
            status = 'on-target';
            statusLabel = 'ตรงตามสัดส่วน (0%)';
          } else {
            status = 'off-target';
            statusLabel = 'เกินเพดาน 0%';
          }
        } else if (actualPct <= targetPct) {
          status = 'on-target';
          statusLabel = `ตรงตามสัดส่วน (≤ ${targetPct}%)`;
        } else if (actualPct <= targetPct + 6) {
          status = 'warning';
          statusLabel = 'เกินสัดส่วนเล็กน้อย';
        } else {
          status = 'off-target';
          statusLabel = `เกินสัดส่วน ${targetPct}%`;
        }
      } else {
        if (targetPct === 0) {
          status = 'on-target';
          statusLabel = 'ตามเป้าหมาย (0%)';
        } else if (actualPct >= targetPct) {
          status = 'on-target';
          statusLabel = `ถึงเป้าหมาย (≥ ${targetPct}%)`;
        } else if (actualPct >= targetPct * 0.5) {
          status = 'warning';
          statusLabel = `ใกล้เป้าหมาย ${targetPct}%`;
        } else {
          status = 'off-target';
          statusLabel =
            actualAmt === 0
              ? `ยังไม่มีรายการ (เป้า ${targetPct}%)`
              : `ต่ำกว่าเกณฑ์ ${targetPct}%`;
        }
      }

      const diff = mode === 'max-cap' ? targetAmt - actualAmt : actualAmt - targetAmt;

      return {
        key,
        name,
        title: `${name} (${targetPct}%)`,
        subtitle,
        targetPct,
        targetAmt,
        actualAmt,
        actualPct,
        mode,
        status,
        statusLabel,
        diff,
      };
    };

    const items = [
      makeItem(
        'essential',
        'ค่าใช้จ่ายจำเป็น',
        'ค่าใช้จ่ายจำเป็นในชีวิตประจำวัน',
        targets.essential,
        essentialAmt,
        'max-cap'
      ),
      makeItem(
        'debt',
        'ภาระผ่อนหนี้',
        'ผ่อนชำระหนี้สินและบัตรเครดิต',
        targets.debt,
        debtAmt,
        'max-cap'
      ),
      makeItem(
        'savings',
        'เงินออม + ลงทุน',
        'เงินออม กองทุน และสร้างความมั่งคั่ง',
        targets.savings,
        savingsAmt,
        'min-goal'
      ),
      makeItem(
        'personal',
        'เงินใช้ส่วนตัว',
        'ไลฟ์สไตล์ ของใช้ และความสุขส่วนตัว',
        targets.personal,
        personalAmt,
        'max-cap'
      ),
    ];

    const matchedCount = items.filter((i) => i.status === 'on-target').length;

    return {
      baseAmount,
      items,
      matchedCount,
    };
  }, [exps, incData.total, totalExpense, proportionBasis, targets]);

  // Monthly Trend Data for Real-time ComposedChart
  const monthlyTrendData = useMemo(() => {
    return state.months.map((mon) => {
      const inc = getMonthIncome(state, mon).total;
      const exp = getMonthExpenses(state, mon).reduce((s, e) => s + e.amount, 0);
      return {
        month: mon,
        รายรับ: Number(inc.toFixed(2)),
        รายจ่าย: Number(exp.toFixed(2)),
        กระแสเงินสดสุทธิ: Number((inc - exp).toFixed(2)),
      };
    });
  }, [state]);

  // Dynamic Breakdown Data (synced with custom target percentages)
  const categoryBreakdown = useMemo(() => {
    return BUDGET_CATEGORIES.map((cat) => {
      const customPctNum = targets[cat.key];
      const customTargetRatio = customPctNum / 100;
      const actual = exps
        .filter((e) => {
          if (e.category === cat.name) return true;
          if (
            cat.name === 'เงินออม + ลงทุน (20%)' &&
            e.category === 'สร้างความมั่งคั่ง (30%)'
          ) {
            return true;
          }
          if (
            cat.name === 'เงินใช้ส่วนตัว (10%)' &&
            (e.category === 'ความต้องการส่วนตัว (20%)' ||
              e.category === 'บริจาค / การกุศล (10%)')
          ) {
            return true;
          }
          return false;
        })
        .reduce((s, e) => s + e.amount, 0);
      const targetAmt = incData.total * customTargetRatio;
      const actualPct = incData.total > 0 ? (actual / incData.total) * 100 : 0;
      const diff = cat.isSavings ? actual - targetAmt : targetAmt - actual;
      const isGood = cat.isSavings ? actual >= targetAmt : actual <= targetAmt;
      return {
        ...cat,
        name: `${cat.displayLabel} (${customPctNum}%)`,
        shortName: `${cat.shortPrefix} (${customPctNum}%)`,
        targetPct: customTargetRatio,
        actual: Number(actual.toFixed(2)),
        targetAmt: Number(targetAmt.toFixed(2)),
        actualPct,
        diff,
        isGood,
      };
    });
  }, [exps, incData.total, targets]);

  const essentialSubBreakdown = useMemo(() => {
    const essentialExps = exps.filter((e) => e.category === 'ค่าใช้จ่ายจำเป็น (40%)');
    const essentialTotal = essentialExps.reduce((s, e) => s + e.amount, 0);
    const items = ESSENTIAL_SUBCATEGORIES.map((sc) => {
      const amount = essentialExps
        .filter((e) => resolveEssentialSubcategory(e) === sc.key)
        .reduce((s, e) => s + e.amount, 0);
      return {
        ...sc,
        amount: Number(amount.toFixed(2)),
        shareOfEssential: essentialTotal > 0 ? (amount / essentialTotal) * 100 : 0,
        shareOfTotal: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
        shareOfIncome: incData.total > 0 ? (amount / incData.total) * 100 : 0,
      };
    });
    return { essentialTotal, items };
  }, [exps, totalExpense, incData.total]);

  const innerPieData = useMemo(() => {
    return categoryBreakdown
      .filter((c) => c.actual > 0)
      .map((c) => ({
        key: c.key,
        name: c.shortName,
        fullName: c.name,
        value: c.actual,
        color: c.color,
        sharePct: totalExpense > 0 ? (c.actual / totalExpense) * 100 : 0,
        isSubcategory: false,
        essentialSharePct: 0,
      }));
  }, [categoryBreakdown, totalExpense]);

  const outerEssentialPieData = useMemo(() => {
    return essentialSubBreakdown.items
      .filter((s) => s.amount > 0)
      .map((s) => ({
        key: s.key,
        name: s.shortLabel,
        fullName: `ค่าใช้จ่ายจำเป็น · ${s.key}`,
        value: s.amount,
        color: s.color,
        sharePct: s.shareOfTotal,
        isSubcategory: true,
        essentialSharePct: s.shareOfEssential,
      }));
  }, [essentialSubBreakdown]);

  const essentialArcEndAngle = useMemo(() => {
    if (totalExpense <= 0 || essentialSubBreakdown.essentialTotal <= 0) return 90;
    const sweep = (essentialSubBreakdown.essentialTotal / totalExpense) * 360;
    return 90 - Math.min(360, sweep);
  }, [totalExpense, essentialSubBreakdown.essentialTotal]);

  const targetVsActualData = useMemo(() => {
    const foodAmt =
      essentialSubBreakdown.items.find((s) => s.key === 'ค่าอาหาร / น้ำ / ขนม')?.amount || 0;
    const fuelAmt =
      essentialSubBreakdown.items.find((s) => s.key === 'ค่าน้ำมัน')?.amount || 0;
    const otherEssAmt =
      essentialSubBreakdown.items.find((s) => s.key === 'จำเป็นอื่นๆ')?.amount || 0;

    return categoryBreakdown.map((c) => {
      if (c.key === 'essential') {
        return {
          name: c.shortName,
          categoryKey: c.key,
          งบเป้าหมาย: c.targetAmt,
          'ค่าอาหาร / น้ำ / ขนม': foodAmt,
          ค่าน้ำมัน: fuelAmt,
          จำเป็นอื่นๆ: otherEssAmt,
          ใช้จริงหมวดอื่น: 0,
          รวมใช้จริง: c.actual,
        };
      }
      return {
        name: c.shortName,
        categoryKey: c.key,
        งบเป้าหมาย: c.targetAmt,
        'ค่าอาหาร / น้ำ / ขนม': 0,
        ค่าน้ำมัน: 0,
        จำเป็นอื่นๆ: 0,
        ใช้จริงหมวดอื่น: c.actual,
        รวมใช้จริง: c.actual,
      };
    });
  }, [categoryBreakdown, essentialSubBreakdown]);

  const statusStyles = {
    'on-target': {
      bar: 'bg-emerald-600',
      tint: 'bg-emerald-50/70',
      text: 'text-emerald-700',
      dot: 'bg-emerald-600',
      Icon: CheckCircle2,
    },
    warning: {
      bar: 'bg-amber-500',
      tint: 'bg-amber-50/70',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
      Icon: AlertTriangle,
    },
    'off-target': {
      bar: 'bg-rose-600',
      tint: 'bg-rose-50/70',
      text: 'text-rose-700',
      dot: 'bg-rose-600',
      Icon: AlertCircle,
    },
  };

  return (
    <section className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Income */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-heading font-medium text-slate-500">
              {incData.deductionsTotal > 0 ? `รายรับสุทธิ · ${m}` : `รายรับรวม · ${m}`}
            </span>
            <button
              type="button"
              onClick={onOpenIncomeModal}
              className="text-xs text-[#006A63] hover:underline font-heading font-medium whitespace-nowrap"
            >
              + แก้ไข/เพิ่ม
            </button>
          </div>
          <div className="text-2xl sm:text-3xl font-num font-bold text-slate-900 mt-2">
            ฿{fmt(incData.total)}
          </div>
          <div
            className="text-xs text-slate-500 mt-2 truncate"
            title={`รอบ 14: ฿${fmtCompact(incData.salary)} - กองทุนสำรองฯ ฿${fmtCompact(incData.effectiveProvidentFund)} = ฿${fmtCompact(incData.salaryNet14)} · รอบ 29: ฿${fmtCompact(incData.salary29)} - ปกส. ฿${fmtCompact(incData.effectiveSocialSecurity)} = ฿${fmtCompact(incData.salaryNet29)} · เสริม/อื่นๆ: ฿${fmtCompact(incData.side + incData.extrasTotal)}`}
          >
            {incData.salary29 > 0
              ? `14 สุทธิ: ฿${fmtCompact(incData.salaryNet14)} · 29 สุทธิ: ฿${fmtCompact(incData.salaryNet29)}`
              : incData.effectiveProvidentFund > 0
              ? `รอบ 14 สุทธิ ฿${fmtCompact(incData.salaryNet14)}${incData.socialSecurity > 0 ? ' · รอเงินรอบ 29 เข้าก่อนหัก ปกส.' : ` (หัก PVD -฿${fmtCompact(incData.effectiveProvidentFund)})`}`
              : incData.socialSecurity > 0
              ? `เงินเดือน ฿${fmtCompact(incData.salary)} · รอเงินรอบ 29 เข้าก่อนหัก ปกส.`
              : `เงินเดือน ฿${fmtCompact(incData.salary)} · เสริม/อื่นๆ ฿${fmtCompact(incData.side + incData.extrasTotal)}`}
          </div>
        </div>

        {/* Total Expense */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-heading font-medium text-slate-500">
              รายจ่ายรวม · {m}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-heading font-semibold ${
                expPct > 100 ? 'text-orange-700' : 'text-[#0F766E]'
              }`}
            >
              {expPct > 100 ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {expPct.toFixed(1)}%
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-num font-bold text-slate-900 mt-2">
            ฿{fmt(totalExpense)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            สัดส่วนเทียบกับรายรับทั้งหมดในเดือนนี้
          </div>
        </div>

        {/* Net Cashflow */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-heading font-medium text-slate-500">
              กระแสเงินสดสุทธิ
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-heading font-semibold ${
                net < 0 ? 'text-orange-700' : 'text-[#0F766E]'
              }`}
            >
              {net < 0 ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>ติดลบ</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>เป็นบวก</span>
                </>
              )}
            </span>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-num font-bold mt-2 ${
              net < 0 ? 'text-orange-700' : 'text-[#0F766E]'
            }`}
          >
            {net < 0 ? '-฿' : '+฿'}
            {fmt(Math.abs(net))}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            รายรับหักรายจ่ายทั้งหมดในเดือนนี้
          </div>
        </div>

        {/* Payment Checklist Status */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-heading font-medium text-slate-500">
              สถานะชำระบิล
            </span>
            <button
              type="button"
              onClick={onSwitchToTransactions}
              className="inline-flex items-center gap-1 text-xs text-[#006A63] hover:underline font-heading font-medium whitespace-nowrap"
            >
              <span>ดูรายการ</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-2xl sm:text-3xl font-num font-bold text-[#006A63] mt-2">
            {paidExps.length} / {exps.length}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            รอชำระอีก ฿{fmt(unpaidTotal)}
          </div>
        </div>
      </div>

      {/* Proportion Audit Strip: ค่าใช้จ่ายจำเป็น · ภาระผ่อนหนี้ · เงินออม + ลงทุน · เงินใช้ส่วนตัว */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
                แถบตรวจสอบสัดส่วนรายจ่าย {formulaLabel} · {m}
              </h2>
              <span className="text-xs font-heading font-medium text-slate-500">
                ตรงตามสัดส่วน {proportionAudit.matchedCount} / 4 หมวด
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              คำนวณเทียบจาก
              {proportionBasis === 'income' ? 'รายรับรวม' : 'รายจ่ายรวม'} ฿
              {fmt(proportionAudit.baseAmount)} (ค่าใช้จ่ายจำเป็น {targets.essential}% · ภาระผ่อนหนี้ {targets.debt}% · เงินออม + ลงทุน {targets.savings}% · เงินใช้ส่วนตัว {targets.personal}%)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setProportionBasis('income')}
                className={`px-3 py-1.5 text-xs font-heading font-medium rounded-md whitespace-nowrap transition ${
                  proportionBasis === 'income'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เทียบรายรับรวม
              </button>
              <button
                type="button"
                onClick={() => setProportionBasis('expense')}
                className={`px-3 py-1.5 text-xs font-heading font-medium rounded-md whitespace-nowrap transition ${
                  proportionBasis === 'expense'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เทียบรายจ่ายจริง
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsEditingPct((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-heading font-semibold rounded-lg border whitespace-nowrap transition ${
                isEditingPct
                  ? 'bg-[#006A63] text-white border-[#006A63]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isEditingPct ? 'ซ่อนตัวปรับ %' : 'ปรับ % เป้าหมาย'}</span>
            </button>
          </div>
        </div>

        {/* Inline Target Percentage Customizer */}
        {isEditingPct && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-heading text-slate-600">
                กำหนดสัดส่วนเป้าหมายของแต่ละหมวดหมู่ (ปรับแก้ได้ทันทีและบันทึกลงเครื่องอัตโนมัติ)
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-num font-semibold ${
                    targetSum === 100 ? 'text-[#0F766E]' : 'text-amber-700'
                  }`}
                >
                  {targetSum === 100 ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span>
                    รวม {targetSum}%{targetSum !== 100 ? ' (ควรรวมให้ได้ 100%)' : ''}
                  </span>
                </span>

                {!isDefaultFormula && (
                  <button
                    type="button"
                    onClick={handleResetPercentages}
                    className="inline-flex items-center gap-1 text-xs font-heading font-medium text-[#006A63] hover:underline whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>รีเซ็ต 40-30-20-10</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {proportionAudit.items.map((item) => (
                <label
                  key={item.key}
                  className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 focus-within:border-[#006A63] transition"
                >
                  <span className="block text-xs font-heading font-semibold text-slate-700 mb-1">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={draftPct[item.key]}
                      onChange={(e) => handleDraftPctChange(item.key, e.target.value)}
                      onBlur={() => handleDraftPctBlur(item.key)}
                      className="w-full bg-white border border-slate-300 rounded-md px-2.5 py-1 text-sm font-num font-bold text-slate-900 focus:outline-none focus:border-[#006A63]"
                    />
                    <span className="text-xs font-num font-semibold text-slate-500 shrink-0">
                      %
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 4-Category Color-Coded Status Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {proportionAudit.items.map((item) => {
            const st = statusStyles[item.status];
            const StatusIcon = st.Icon;
            const fillWidth = Math.min(
              100,
              item.targetPct > 0
                ? (item.actualPct / item.targetPct) * 100
                : item.actualAmt > 0
                ? 100
                : 0
            );

            return (
              <div key={item.key} className={`p-4 flex flex-col justify-between ${st.tint}`}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-heading font-bold text-slate-900">
                      {item.title}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-heading font-semibold whitespace-nowrap ${st.text}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {item.status === 'on-target'
                          ? 'ปกติ'
                          : item.status === 'warning'
                          ? 'เฝ้าระวัง'
                          : 'ไม่ตรงเกณฑ์'}
                      </span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {item.subtitle}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-xl font-num font-bold ${st.text}`}>
                      {item.actualPct.toFixed(1)}%
                    </span>
                    <span className="text-xs font-num text-slate-500">
                      เป้าหมาย {item.targetPct}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-white/80 rounded-full overflow-hidden mt-1.5 border border-slate-200/70">
                    <div
                      className={`h-full ${st.bar} rounded-full transition-all duration-300`}
                      style={{ width: `${fillWidth}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-xs gap-2">
                  <span className="font-num font-semibold text-slate-800">
                    ฿{fmt(item.actualAmt)}
                  </span>
                  <span className={`font-heading font-medium text-right ${st.text}`}>
                    {item.statusLabel}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    เป้า ฿{fmtCompact(item.targetAmt)}
                  </span>
                  <span className="font-num">
                    {item.mode === 'max-cap'
                      ? item.diff >= 0
                        ? `เหลืองบ ฿${fmtCompact(item.diff)}`
                        : `เกินเป้า ฿${fmtCompact(Math.abs(item.diff))}`
                      : item.diff >= 0
                      ? `เกินเป้า +฿${fmtCompact(item.diff)}`
                      : `ขาดอีก ฿${fmtCompact(Math.abs(item.diff))}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-Time Interactive Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Monthly Income vs Expense & Net Cashflow Chart */}
        <div className="lg:col-span-7 bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
                กราฟแนวโน้มรายรับ-รายจ่าย และกระแสเงินสดสุทธิ
              </h2>
              <p className="text-xs text-slate-500">
                อัปเดตอัตโนมัติแบบเรียลไทม์ตามรายการรับ-จ่ายที่คุณบันทึก
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={monthlyTrendData}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#475569', fontFamily: 'Prompt' }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `฿${(Number(v) / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `฿${fmt(Number(value) || 0)}`,
                    String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    fontFamily: 'Sarabun, sans-serif',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', fontFamily: 'Prompt, sans-serif' }}
                />
                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="4 4" />
                <Bar
                  dataKey="รายรับ"
                  fill="#006A63"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="รายจ่าย"
                  fill="#F59E0B"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Line
                  type="monotone"
                  dataKey="กระแสเงินสดสุทธิ"
                  stroke="#0F172A"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0F172A', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart: Active Month 40-30-20-10 Allocation with Nested Essential Subcategories */}
        <div className="lg:col-span-5 bg-white rounded-xl p-5 sm:p-6 border border-slate-200 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
                สัดส่วนค่าใช้จ่ายรายหมวดหมู่ · {m}
              </h2>
              <p className="text-xs text-slate-500">
                วงใน 4 หมวดหลัก {formulaLabel} · วงนอกแยกย่อยในค่าใช้จ่ายจำเป็น
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setDonutMode('nested')}
                className={`px-2.5 py-1 text-[11px] font-heading font-medium rounded-md whitespace-nowrap transition ${
                  donutMode === 'nested'
                    ? 'bg-white text-[#006A63] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ซ้อนหมวดย่อย
              </button>
              <button
                type="button"
                onClick={() => setDonutMode('main')}
                className={`px-2.5 py-1 text-[11px] font-heading font-medium rounded-md whitespace-nowrap transition ${
                  donutMode === 'main'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                4 หมวดหลัก
              </button>
            </div>
          </div>

          {innerPieData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-sm text-slate-400">
              ยังไม่มีรายการรายจ่ายในเดือน {m}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between mt-2">
              <div className="h-52 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={innerPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={donutMode === 'nested' ? 44 : 52}
                      outerRadius={donutMode === 'nested' ? 63 : 76}
                      paddingAngle={0}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {innerPieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    {donutMode === 'nested' && outerEssentialPieData.length > 0 && (
                      <Pie
                        data={outerEssentialPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        startAngle={90}
                        endAngle={essentialArcEndAngle}
                        innerRadius={67}
                        outerRadius={84}
                        paddingAngle={0}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {outerEssentialPieData.map((entry, idx) => (
                          <Cell key={`sub-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                    )}
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const p = props?.payload;
                        const subText = p?.isSubcategory
                          ? ` · ${p.essentialSharePct?.toFixed(1) || 0}% ของหมวดจำเป็น`
                          : '';
                        return [
                          `฿${fmt(Number(value) || 0)} (${p?.sharePct?.toFixed(1) || 0}% ของรายจ่าย${subText})`,
                          p?.fullName || '',
                        ];
                      }}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-heading text-slate-400">
                    รายจ่ายรวม
                  </span>
                  <span className="text-sm font-num font-bold text-slate-900">
                    ฿{fmtCompact(totalExpense)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs">
                {categoryBreakdown.map((cat) => {
                  const shareOfExpense =
                    totalExpense > 0 ? (cat.actual / totalExpense) * 100 : 0;
                  return (
                    <div key={cat.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-heading font-semibold text-slate-800 truncate">
                            {cat.name}
                          </span>
                        </div>
                        <span className="font-num font-semibold text-slate-900 shrink-0">
                          ฿{fmt(cat.actual)}{' '}
                          <span className="text-slate-400 font-normal">
                            ({shareOfExpense.toFixed(0)}%)
                          </span>
                        </span>
                      </div>

                      {cat.key === 'essential' && (
                        <div className="ml-3 pl-3 border-l-2 border-[#006A63]/25 space-y-1.5">
                          {essentialSubBreakdown.items.map((sub) => (
                            <div key={sub.key} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-xs shrink-0"
                                    style={{ backgroundColor: sub.color }}
                                  />
                                  <span className="text-slate-600 truncate">
                                    {sub.key}
                                  </span>
                                </div>
                                <span className="font-num text-slate-700 shrink-0">
                                  ฿{fmt(sub.amount)}{' '}
                                  <span className="text-slate-400">
                                    ({sub.shareOfEssential.toFixed(0)}% ของจำเป็น)
                                  </span>
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${Math.min(100, sub.shareOfEssential)}%`,
                                    backgroundColor: sub.color,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 40-30-20-10 Target vs Actual Analysis + Unpaid Bills + Recovery Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 40-30-20-10 Breakdown + Bar Chart + Table */}
        <div className="lg:col-span-7 bg-white rounded-xl p-5 sm:p-6 border border-slate-200 space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-heading font-bold text-slate-900">
              สัดส่วนงบประมาณจริง vs สูตร {formulaLabel}
            </h2>
            <p className="text-xs text-slate-500">
              เปรียบเทียบยอดใช้จ่ายจริงกับเพดานงบประมาณที่กำหนดจากรายได้เดือน {m}
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={targetVsActualData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#475569', fontFamily: 'Prompt' }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `฿${(Number(v) / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload;
                    const nonZeroItems = payload.filter(
                      (item: any) =>
                        item.dataKey === 'งบเป้าหมาย' || Number(item.value) > 0
                    );
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs space-y-1">
                        <div className="font-heading font-semibold text-slate-800">
                          {label}
                        </div>
                        {nonZeroItems.map((entry: any) => (
                          <div
                            key={entry.dataKey}
                            className="flex items-center justify-between gap-4"
                          >
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <span
                                className="w-2 h-2 rounded-xs shrink-0"
                                style={{ backgroundColor: entry.color }}
                              />
                              {entry.dataKey === 'ใช้จริงหมวดอื่น'
                                ? 'ใช้จริง'
                                : entry.name}
                            </span>
                            <span className="font-num font-semibold text-slate-900">
                              ฿{fmt(Number(entry.value) || 0)}
                            </span>
                          </div>
                        ))}
                        {row?.categoryKey === 'essential' && (
                          <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-4 font-semibold text-[#006A63]">
                            <span>รวมใช้จริง</span>
                            <span className="font-num">
                              ฿{fmt(Number(row.รวมใช้จริง) || 0)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Prompt' }} />
                <Bar
                  dataKey="งบเป้าหมาย"
                  fill="#CBD5E1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="ค่าอาหาร / น้ำ / ขนม"
                  stackId="actual"
                  fill="#059669"
                  maxBarSize={28}
                />
                <Bar
                  dataKey="ค่าน้ำมัน"
                  stackId="actual"
                  fill="#0891B2"
                  maxBarSize={28}
                />
                <Bar
                  dataKey="จำเป็นอื่นๆ"
                  stackId="actual"
                  fill="#64748B"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="ใช้จริงหมวดอื่น"
                  name="ใช้จริง (หมวดอื่น)"
                  stackId="actual"
                  fill="#006A63"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3.5 pt-2">
            {categoryBreakdown.map((cat) => {
              const barWidth =
                cat.targetAmt > 0
                  ? Math.min(100, (cat.actual / cat.targetAmt) * 100)
                  : cat.actual > 0
                  ? 100
                  : 0;
              const barColor = cat.isGood
                ? 'bg-[#006A63]'
                : cat.isSavings
                ? 'bg-amber-500'
                : 'bg-orange-600';

              return (
                <div key={cat.name} className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs font-heading mb-1 gap-2">
                      <span className="font-semibold text-slate-700">{cat.name}</span>
                      <span
                        className={`font-num ${
                          cat.isGood ? 'text-[#006A63]' : 'text-orange-700'
                        }`}
                      >
                        ฿{fmt(cat.actual)} ({cat.actualPct.toFixed(1)}%) / เป้า ฿
                        {fmt(cat.targetAmt)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-300`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {cat.key === 'essential' && (
                    <div className="ml-3 pl-3 border-l-2 border-[#006A63]/25 space-y-1.5">
                      {essentialSubBreakdown.items.map((sub) => (
                        <div key={sub.key} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: sub.color }}
                            />
                            <span className="text-slate-600 truncate">{sub.key}</span>
                          </div>
                          <span className="font-num text-slate-700 shrink-0">
                            ฿{fmt(sub.amount)}{' '}
                            <span className="text-slate-400">
                              ({sub.shareOfIncome.toFixed(1)}% รายรับ ·{' '}
                              {sub.shareOfEssential.toFixed(0)}% ในหมวด)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-xs font-heading text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2">หมวดหมู่</th>
                  <th className="py-2 px-2 text-right">งบเป้าหมาย</th>
                  <th className="py-2 px-2 text-right">ใช้จริง</th>
                  <th className="py-2 px-2 text-right">ส่วนต่าง</th>
                  <th className="py-2 pl-2 text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryBreakdown.map((cat) => (
                  <React.Fragment key={cat.name}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-2 font-medium text-slate-800">
                        {cat.name}
                      </td>
                      <td className="py-2.5 px-2 text-right font-num text-slate-600">
                        ฿{fmt(cat.targetAmt)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-num font-semibold text-slate-900">
                        ฿{fmt(cat.actual)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-num ${
                          cat.diff >= 0 ? 'text-[#0F766E]' : 'text-orange-700'
                        }`}
                      >
                        {cat.diff >= 0 ? '+' : '-'}฿{fmt(Math.abs(cat.diff))}
                      </td>
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                        {cat.isGood ? (
                          <span className="inline-flex items-center gap-1 text-xs font-heading font-medium text-[#0F766E]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>ตามเกณฑ์</span>
                          </span>
                        ) : cat.isSavings ? (
                          <span className="inline-flex items-center gap-1 text-xs font-heading font-medium text-amber-700">
                            <Clock className="w-3.5 h-3.5" />
                            <span>ต่ำกว่าเป้า</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-heading font-medium text-orange-700">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>เกินงบ</span>
                          </span>
                        )}
                      </td>
                    </tr>
                    {cat.key === 'essential' &&
                      essentialSubBreakdown.items.map((sub) => (
                        <tr key={sub.key} className="bg-slate-50/50 text-xs">
                          <td className="py-1.5 pr-2 pl-5 text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-xs shrink-0"
                                style={{ backgroundColor: sub.color }}
                              />
                              <span>{sub.key}</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-num text-slate-400">
                            —
                          </td>
                          <td className="py-1.5 px-2 text-right font-num text-slate-700">
                            ฿{fmt(sub.amount)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-num text-slate-500">
                            {sub.shareOfEssential.toFixed(0)}% ในหมวด
                          </td>
                          <td className="py-1.5 pl-2 text-right text-slate-400">
                            {sub.shareOfIncome.toFixed(1)}% รายรับ
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Unpaid Bills + 4-Step Recovery Roadmap */}
        <div className="lg:col-span-5 space-y-6">
          {/* Unpaid Bills */}
          <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-heading font-bold text-slate-900">
                บิลที่รอชำระในเดือนนี้
              </h2>
              <span className="text-xs font-heading font-medium text-amber-700">
                {unpaidExps.length} รายการ · ฿{fmt(unpaidTotal)}
              </span>
            </div>

            {unpaidExps.length === 0 ? (
              <div className="text-center py-6 text-sm text-[#0F766E] bg-[#CCFBF1]/40 rounded-lg font-heading">
                ชำระครบทุกรายการในเดือนนี้แล้ว
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                {unpaidExps.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center justify-between py-2.5 px-2 hover:bg-slate-50 rounded-lg cursor-pointer transition gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onTogglePaid(item.id)}
                        className="w-4 h-4 accent-[#006A63] rounded cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {item.note !== '-' ? `${item.note} · ` : ''}
                          {item.category}
                        </div>
                      </div>
                    </div>
                    <span className="font-num font-semibold text-sm text-slate-900 shrink-0">
                      ฿{fmt(item.amount)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 4-Step Recovery Roadmap */}
          <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
            <h2 className="text-base font-heading font-bold text-slate-900 mb-3">
              แผนฟื้นฟูสภาพคล่อง 4 ขั้นตอน
            </h2>
            <div className="divide-y divide-slate-100">
              {RECOVERY_ROADMAP.map((step) => (
                <div key={step.step} className="py-3 first:pt-1 last:pb-1">
                  <div
                    className={`text-sm font-heading font-semibold ${
                      step.highlight ? 'text-[#006A63]' : 'text-slate-800'
                    }`}
                  >
                    {step.step}. {step.title}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
