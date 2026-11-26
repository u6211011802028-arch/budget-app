import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  BudgetState,
  CreditCardBalanceMode,
  CreditCardConfig,
  CreditCardId,
  CreditCardInstallment,
  MonthExpenseView,
} from '../types/budget';
import {
  ComputedCreditCardMetrics,
  ComputedInstallmentView,
  applySharedCardLimit,
  buildFutureMonthSequence,
  computeAllCreditCardMetrics,
  fmt,
  fmtCompact,
  isSharedLimitCard,
  resolveCreditCards,
} from '../data/defaultBudget';

export interface CreditCardMonthlyPaymentUpdate {
  cardId: CreditCardId;
  month: string;
  amount: number;
  paid?: boolean;
}

export interface InstallmentScheduleAddition {
  cardId: CreditCardId;
  startMonth: string;
  remainingMonths: number;
  monthlyAmount: number;
  itemName: string;
}

interface CreditCardsViewProps {
  state: BudgetState;
  onUpdateCreditCards: (
    cards: CreditCardConfig[],
    monthlyPaymentUpdates?: CreditCardMonthlyPaymentUpdate[],
    installmentScheduleAdditions?: InstallmentScheduleAddition[]
  ) => void;
  onTogglePaid: (expenseId: number) => void;
  onEditLinkedExpense: (item: MonthExpenseView) => void;
  onSwitchToTransactions: () => void;
}

interface CardInlineNumberInputProps {
  id: string;
  value: number;
  onCommit: (nextValue: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}

const CardInlineNumberInput: React.FC<CardInlineNumberInputProps> = ({
  id,
  value,
  onCommit,
  placeholder = '0',
  className = '',
  ariaLabel,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(() => (value > 0 ? String(value) : ''));

  useEffect(() => {
    if (!isFocused) {
      setDraft(value > 0 ? String(value) : '');
    }
  }, [value, isFocused]);

  return (
    <input
      id={id}
      type="number"
      min="0"
      step="0.01"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={isFocused ? draft : value > 0 ? String(value) : ''}
      onFocus={() => {
        setIsFocused(true);
        setDraft(value > 0 ? String(value) : '');
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = draft.trim() === '' ? 0 : Math.max(0, Number(draft) || 0);
        const rounded = Math.round(parsed * 100) / 100;
        if (rounded !== value) {
          onCommit(rounded);
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') {
          onCommit(0);
          return;
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          onCommit(Math.round(parsed * 100) / 100);
        }
      }}
      className={className}
    />
  );
};

export const CreditCardsView: React.FC<CreditCardsViewProps> = ({
  state,
  onUpdateCreditCards,
  onTogglePaid,
  onEditLinkedExpense,
  onSwitchToTransactions,
}) => {
  const m = state.activeMonth;
  const cards = useMemo(
    () => resolveCreditCards(state.creditCards),
    [state.creditCards]
  );

  const cardMetrics: ComputedCreditCardMetrics[] = useMemo(
    () => computeAllCreditCardMetrics(state),
    [state]
  );

  const [editingCardId, setEditingCardId] = useState<CreditCardId | null>(null);
  const [draftLimit, setDraftLimit] = useState('');
  const [draftMode, setDraftMode] = useState<CreditCardBalanceMode>('schedule');
  const [draftCustomBalance, setDraftCustomBalance] = useState('');
  const [draftMonthPayment, setDraftMonthPayment] = useState('');
  const [draftMonthPaid, setDraftMonthPaid] = useState(false);

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<
    Record<
      CreditCardId,
      {
        creditLimit: string;
        balanceMode: CreditCardBalanceMode;
        customBalance: string;
        monthPayment: string;
      }
    >
  >({} as any);

  // Installment Add/Edit Modal State
  const [instModalCardId, setInstModalCardId] = useState<CreditCardId | null>(
    null
  );
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [instItemName, setInstItemName] = useState('');
  const [instIsZeroInterest, setInstIsZeroInterest] = useState(true);
  const [instCalcMode, setInstCalcMode] = useState<'total' | 'monthly'>('total');
  const [instTotalPrice, setInstTotalPrice] = useState('');
  const [instMonthlyInput, setInstMonthlyInput] = useState('');
  const [instTotalMonths, setInstTotalMonths] = useState('10');
  const [instPaidMonths, setInstPaidMonths] = useState('0');
  const [instStartMonth, setInstStartMonth] = useState(m);
  const [instSyncMode, setInstSyncMode] = useState<
    'add_both' | 'limit_only' | 'memo_only'
  >('add_both');
  const [instError, setInstError] = useState('');

  const editingMetric = useMemo(
    () => cardMetrics.find((cm) => cm.card.id === editingCardId) || null,
    [cardMetrics, editingCardId]
  );

  const instModalMetric = useMemo(
    () => cardMetrics.find((cm) => cm.card.id === instModalCardId) || null,
    [cardMetrics, instModalCardId]
  );

  const startMonthOptions = useMemo(() => {
    const seq = buildFutureMonthSequence(
      state.months,
      state.months[0] || m,
      18
    );
    return seq.map((s) => s.month);
  }, [state.months, m]);

  const computedInstPreview = useMemo(() => {
    const months = Math.max(1, Math.round(Number(instTotalMonths) || 1));
    const paid = Math.min(months, Math.max(0, Math.round(Number(instPaidMonths) || 0)));
    const remMonths = Math.max(0, months - paid);
    let totalPrice = 0;
    let monthlyAmount = 0;
    if (instCalcMode === 'total') {
      totalPrice = Math.max(0, Number(instTotalPrice) || 0);
      monthlyAmount = Math.round((totalPrice / months) * 100) / 100;
    } else {
      monthlyAmount = Math.max(0, Number(instMonthlyInput) || 0);
      totalPrice = Math.round(monthlyAmount * months * 100) / 100;
    }
    const remainingBalance =
      remMonths === 0
        ? 0
        : Math.max(
            0,
            Math.round((totalPrice - monthlyAmount * paid) * 100) / 100
          );
    const seq = buildFutureMonthSequence(
      state.months,
      instStartMonth || m,
      remMonths + 4
    );
    const endMonth = remMonths > 0 ? seq[remMonths - 1]?.month || null : null;
    return {
      months,
      paid,
      remMonths,
      totalPrice,
      monthlyAmount,
      remainingBalance,
      endMonth,
    };
  }, [
    instTotalMonths,
    instPaidMonths,
    instCalcMode,
    instTotalPrice,
    instMonthlyInput,
    state.months,
    instStartMonth,
    m,
  ]);

  const openAddInstallment = (cm: ComputedCreditCardMetrics) => {
    setInstModalCardId(cm.card.id);
    setEditingInstId(null);
    setInstItemName('');
    setInstIsZeroInterest(true);
    setInstCalcMode('total');
    setInstTotalPrice('');
    setInstMonthlyInput('');
    setInstTotalMonths('10');
    setInstPaidMonths('0');
    setInstStartMonth(m);
    setInstSyncMode('add_both');
    setInstError('');
  };

  const openEditInstallment = (
    cm: ComputedCreditCardMetrics,
    inst: ComputedInstallmentView
  ) => {
    setInstModalCardId(cm.card.id);
    setEditingInstId(inst.id);
    setInstItemName(inst.itemName);
    setInstIsZeroInterest(inst.isZeroInterest);
    setInstCalcMode('total');
    setInstTotalPrice(inst.totalPrice > 0 ? String(inst.totalPrice) : '');
    setInstMonthlyInput(
      inst.monthlyAmount > 0 ? String(inst.monthlyAmount) : ''
    );
    setInstTotalMonths(String(inst.totalMonths));
    setInstPaidMonths(String(inst.paidMonths));
    setInstStartMonth(inst.startMonth || m);
    setInstSyncMode(
      inst.deductFromLimit === false
        ? 'memo_only'
        : inst.syncedToSchedule
        ? 'add_both'
        : 'limit_only'
    );
    setInstError('');
  };

  const handleSaveInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instModalCardId) return;
    const cleanName = instItemName.trim();
    if (!cleanName) {
      setInstError('กรุณาระบุชื่อรายการที่ติดผ่อน');
      return;
    }
    if (
      computedInstPreview.monthlyAmount <= 0 ||
      computedInstPreview.totalPrice <= 0
    ) {
      setInstError('กรุณากรอกยอดเงินผ่อนให้มากกว่า 0 บาท');
      return;
    }

    const deductFromLimit = instSyncMode !== 'memo_only';
    const syncedToSchedule = instSyncMode === 'add_both';

    const newItem: CreditCardInstallment = {
      id:
        editingInstId ||
        `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemName: cleanName,
      totalPrice: computedInstPreview.totalPrice,
      totalMonths: computedInstPreview.months,
      monthlyAmount: computedInstPreview.monthlyAmount,
      paidMonths: computedInstPreview.paid,
      startMonth: instStartMonth || m,
      isZeroInterest: instIsZeroInterest,
      deductFromLimit,
      syncedToSchedule,
    };

    const scheduleAdds: InstallmentScheduleAddition[] = [];
    const nextCards = cards.map((c) => {
      if (c.id !== instModalCardId) return c;
      const existing = Array.isArray(c.installments) ? c.installments : [];
      const prevItem = editingInstId
        ? existing.find((item) => item.id === editingInstId) || null
        : null;

      const nextInstallments = editingInstId
        ? existing.map((item) => (item.id === editingInstId ? newItem : item))
        : [...existing, newItem];

      if (prevItem?.syncedToSchedule) {
        const oldRemMonths = Math.max(
          0,
          prevItem.totalMonths - prevItem.paidMonths
        );
        if (oldRemMonths > 0 && prevItem.monthlyAmount > 0) {
          scheduleAdds.push({
            cardId: instModalCardId,
            startMonth: prevItem.startMonth || m,
            remainingMonths: oldRemMonths,
            monthlyAmount: -prevItem.monthlyAmount,
            itemName: prevItem.itemName,
          });
        }
      }

      if (
        syncedToSchedule &&
        computedInstPreview.remMonths > 0 &&
        computedInstPreview.monthlyAmount > 0
      ) {
        scheduleAdds.push({
          cardId: instModalCardId,
          startMonth: instStartMonth || m,
          remainingMonths: computedInstPreview.remMonths,
          monthlyAmount: computedInstPreview.monthlyAmount,
          itemName: cleanName,
        });
      }

      return {
        ...c,
        installments: nextInstallments,
      };
    });

    onUpdateCreditCards(nextCards, undefined, scheduleAdds);
    setInstModalCardId(null);
    setEditingInstId(null);
  };

  const handleIncrementInstallmentPaid = (
    cm: ComputedCreditCardMetrics,
    targetInst: ComputedInstallmentView
  ) => {
    const targetWindow = buildFutureMonthSequence(
      state.months,
      targetInst.startMonth || m,
      targetInst.totalMonths + 4
    )
      .slice(0, targetInst.totalMonths)
      .map((entry) => entry.month);
    const isTargetActiveInMonth =
      !targetInst.startMonth || targetWindow.includes(m);

    let updatedCardInstallments: CreditCardInstallment[] = [];

    const nextCards = cards.map((c) => {
      if (c.id !== cm.card.id) return c;
      const existing = Array.isArray(c.installments) ? c.installments : [];
      const nextInstallments = existing.map((item) => {
        if (item.id !== targetInst.id || item.paidMonths >= item.totalMonths) {
          return item;
        }
        const prevPaidList = Array.isArray(item.paidScheduleMonths)
          ? item.paidScheduleMonths
          : [];
        const nextPaidList =
          item.syncedToSchedule &&
          isTargetActiveInMonth &&
          !prevPaidList.includes(m)
            ? [...prevPaidList, m]
            : prevPaidList;

        return {
          ...item,
          paidMonths: Math.min(item.totalMonths, item.paidMonths + 1),
          paidScheduleMonths: nextPaidList,
        };
      });
      updatedCardInstallments = nextInstallments;
      return {
        ...c,
        installments: nextInstallments,
      };
    });

    const activeSyncedInMonth = updatedCardInstallments.filter((item) => {
      if (!item.syncedToSchedule) return false;
      if (!item.startMonth) return true;
      const win = buildFutureMonthSequence(
        state.months,
        item.startMonth,
        item.totalMonths + 4
      )
        .slice(0, item.totalMonths)
        .map((entry) => entry.month);
      return win.includes(m);
    });

    const allActiveSyncedSettled =
      activeSyncedInMonth.length > 0 &&
      activeSyncedInMonth.every(
        (item) =>
          (item.paidScheduleMonths || []).includes(m) ||
          item.paidMonths >= item.totalMonths
      );

    const monthlyUpdates: CreditCardMonthlyPaymentUpdate[] | undefined =
      allActiveSyncedSettled &&
      !cm.isActiveMonthPaid &&
      cm.activeMonthPayment > 0
        ? [
            {
              cardId: cm.card.id,
              month: m,
              amount: cm.activeMonthPayment,
              paid: true,
            },
          ]
        : undefined;

    onUpdateCreditCards(nextCards, monthlyUpdates);
  };

  const handleDeleteInstallment = (cardId: CreditCardId, instId: string) => {
    const scheduleAdds: InstallmentScheduleAddition[] = [];
    const nextCards = cards.map((c) => {
      if (c.id !== cardId) return c;
      const existing = Array.isArray(c.installments) ? c.installments : [];
      const target = existing.find((item) => item.id === instId);

      if (target?.syncedToSchedule) {
        const oldRemMonths = Math.max(
          0,
          target.totalMonths - target.paidMonths
        );
        if (oldRemMonths > 0 && target.monthlyAmount > 0) {
          scheduleAdds.push({
            cardId,
            startMonth: target.startMonth || m,
            remainingMonths: oldRemMonths,
            monthlyAmount: -target.monthlyAmount,
            itemName: target.itemName,
          });
        }
      }

      return {
        ...c,
        installments: existing.filter((item) => item.id !== instId),
      };
    });
    onUpdateCreditCards(nextCards, undefined, scheduleAdds);
  };

  const openSingleEdit = (metric: ComputedCreditCardMetrics) => {
    setEditingCardId(metric.card.id);
    setDraftLimit(metric.card.creditLimit > 0 ? String(metric.card.creditLimit) : '');
    setDraftMode(metric.card.balanceMode);
    setDraftCustomBalance(
      metric.generalUsedAmount > 0 ? String(metric.generalUsedAmount) : ''
    );
    setDraftMonthPayment(
      metric.activeMonthPayment > 0 ? String(metric.activeMonthPayment) : ''
    );
    setDraftMonthPaid(metric.isActiveMonthPaid);
  };

  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCardId) return;
    const nextLimit = Math.max(0, Number(draftLimit) || 0);
    const nextCustom = Math.max(0, Number(draftCustomBalance) || 0);
    const nextMonthPayment = Math.max(0, Number(draftMonthPayment) || 0);

    const updatedBalances = cards.map((c) =>
      c.id === editingCardId
        ? {
            ...c,
            balanceMode: draftMode,
            customBalance: nextCustom,
          }
        : c
    );
    const nextCards = applySharedCardLimit(updatedBalances, editingCardId, nextLimit);

    onUpdateCreditCards(nextCards, [
      {
        cardId: editingCardId,
        month: m,
        amount: nextMonthPayment,
        paid: draftMonthPaid,
      },
    ]);
    setEditingCardId(null);
  };

  const openBatchModal = () => {
    const initial: Record<
      string,
      {
        creditLimit: string;
        balanceMode: CreditCardBalanceMode;
        customBalance: string;
        monthPayment: string;
      }
    > = {};
    cardMetrics.forEach((cm) => {
      initial[cm.card.id] = {
        creditLimit: cm.card.creditLimit > 0 ? String(cm.card.creditLimit) : '',
        balanceMode: cm.card.balanceMode,
        customBalance:
          cm.generalUsedAmount > 0 ? String(cm.generalUsedAmount) : '',
        monthPayment:
          cm.activeMonthPayment > 0 ? String(cm.activeMonthPayment) : '',
      };
    });
    setBatchDrafts(initial as any);
    setIsBatchModalOpen(true);
  };

  const handleBatchLimitChange = (cardId: CreditCardId, value: string) => {
    const isShared = isSharedLimitCard(cardId);
    setBatchDrafts((prev) => {
      const next = { ...prev };
      if (isShared) {
        (['bluecard', 'kbank1', 'kbank2'] as CreditCardId[]).forEach((sid) => {
          const cur = next[sid] || {
            creditLimit: '',
            balanceMode: 'schedule',
            customBalance: '',
            monthPayment: '',
          };
          next[sid] = { ...cur, creditLimit: value };
        });
      } else {
        const cur = next[cardId];
        if (cur) {
          next[cardId] = { ...cur, creditLimit: value };
        }
      }
      return next;
    });
  };

  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const paymentUpdates: CreditCardMonthlyPaymentUpdate[] = [];
    let nextCards = cards.map((c) => {
      const d = batchDrafts[c.id];
      if (!d) return c;
      paymentUpdates.push({
        cardId: c.id,
        month: m,
        amount: Math.max(0, Number(d.monthPayment) || 0),
      });
      return {
        ...c,
        creditLimit: Math.max(0, Number(d.creditLimit) || 0),
        balanceMode: d.balanceMode,
        customBalance: Math.max(0, Number(d.customBalance) || 0),
      };
    });

    const sharedDraftLimit = Math.max(
      0,
      Number(batchDrafts.bluecard?.creditLimit) || 0
    );
    nextCards = applySharedCardLimit(nextCards, 'bluecard', sharedDraftLimit);

    onUpdateCreditCards(nextCards, paymentUpdates);
    setIsBatchModalOpen(false);
  };

  const handleInlineUsedChange = (cardId: CreditCardId, nextUsed: number) => {
    const nextCards = cards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            balanceMode: 'custom' as CreditCardBalanceMode,
            customBalance: Math.max(0, nextUsed),
          }
        : c
    );
    onUpdateCreditCards(nextCards);
  };

  const handleResetToScheduleMode = (cardId: CreditCardId) => {
    const nextCards = cards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            balanceMode: 'schedule' as CreditCardBalanceMode,
          }
        : c
    );
    onUpdateCreditCards(nextCards);
  };

  const handleInlineMonthPaymentChange = (
    cardId: CreditCardId,
    nextPayment: number
  ) => {
    onUpdateCreditCards(cards, [
      {
        cardId,
        month: m,
        amount: Math.max(0, nextPayment),
      },
    ]);
  };

  // Portfolio Aggregates (counting shared pool 1-3 ONCE)
  const summary = useMemo(() => {
    const sharedMetrics = cardMetrics.filter((c) => c.isSharedLimit);
    const individualMetrics = cardMetrics.filter((c) => !c.isSharedLimit);

    const sharedPoolLimit = sharedMetrics[0]?.creditLimit || 0;
    const sharedPoolUsed = sharedMetrics[0]?.sharedUsedTotal || 0;
    const sharedPoolAvailable =
      sharedPoolLimit > 0
        ? Math.round((sharedPoolLimit - sharedPoolUsed) * 100) / 100
        : 0;
    const sharedPoolPct =
      sharedPoolLimit > 0 ? (sharedPoolUsed / sharedPoolLimit) * 100 : 0;

    const configuredCount = cardMetrics.filter((c) => c.creditLimit > 0).length;
    const totalLimit =
      sharedPoolLimit +
      individualMetrics.reduce((s, c) => s + c.creditLimit, 0);
    const totalUsed = cardMetrics.reduce((s, c) => s + c.usedAmount, 0);
    const totalAvailable =
      (sharedPoolLimit > 0 ? sharedPoolAvailable : 0) +
      individualMetrics
        .filter((c) => c.creditLimit > 0)
        .reduce((s, c) => s + c.availableLimit, 0);

    const monthDueTotal = cardMetrics.reduce(
      (s, c) => s + c.activeMonthPayment,
      0
    );
    const monthPaidTotal = cardMetrics
      .filter((c) => c.isActiveMonthPaid)
      .reduce((s, c) => s + c.activeMonthPayment, 0);
    const monthUnpaidTotal = monthDueTotal - monthPaidTotal;
    const totalActiveInstallments = cardMetrics.reduce(
      (s, c) => s + c.activeInstallmentsCount,
      0
    );
    const totalInstallmentsMonthly = cardMetrics.reduce(
      (s, c) => s + c.installmentsMonthlyTotal,
      0
    );
    const longestCard = [...cardMetrics]
      .filter((c) => (c.remainingMonths ?? 0) > 0)
      .sort((a, b) => (b.remainingMonths ?? 0) - (a.remainingMonths ?? 0))[0];

    return {
      configuredCount,
      totalLimit,
      totalUsed,
      totalAvailable,
      monthDueTotal,
      monthPaidTotal,
      monthUnpaidTotal,
      totalActiveInstallments,
      totalInstallmentsMonthly,
      longestCard,
      sharedMetrics,
      sharedPoolLimit,
      sharedPoolUsed,
      sharedPoolAvailable,
      sharedPoolPct,
    };
  }, [cardMetrics]);

  // Chart data comparing own used + shared peer used vs remaining limit
  const chartData = useMemo(
    () =>
      cardMetrics.map((cm) => ({
        name: cm.card.name,
        ใช้ไปแล้วใบนี้: cm.usedAmount,
        บัตรร่วมใช้อยู่: cm.isSharedLimit ? cm.otherSharedUsedAmount : 0,
        วงเงินคงเหลือ: cm.creditLimit > 0 ? Math.max(0, cm.availableLimit) : 0,
      })),
    [cardMetrics]
  );

  // Sorted comparison table (longest payoff / highest debt first)
  const sortedForTable = useMemo(
    () =>
      [...cardMetrics].sort((a, b) => {
        const mDiff = (b.remainingMonths ?? -1) - (a.remainingMonths ?? -1);
        if (mDiff !== 0) return mDiff;
        return b.usedAmount - a.usedAmount;
      }),
    [cardMetrics]
  );

  const formatPayoffBadgeText = (cm: ComputedCreditCardMetrics) => {
    if (cm.usedAmount <= 0 && cm.installmentsMaxRemainingMonths <= 0) {
      return 'ปิดยอดแล้ว';
    }
    if (cm.remainingMonths !== null && cm.remainingMonths > 0) {
      return cm.hasInfiniteOrOpenEnd
        ? `อย่างน้อย ${cm.remainingMonths} เดือน`
        : `อีก ${cm.remainingMonths} เดือน`;
    }
    if (cm.installmentsMaxRemainingMonths > 0) {
      return `อีก ${cm.installmentsMaxRemainingMonths} เดือน`;
    }
    return 'รอระบุค่างวด';
  };

  return (
    <section className="space-y-6">
      {/* Summary Header Card */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg sm:text-xl font-heading font-bold text-slate-900">
              บัตรเครดิตและระยะเวลาปลดหนี้ (6 บัตร)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              เชื่อมโยงยอดจ่ายเดือน {m} · บันทึกรายการผ่อน 0% แยกแต่ละบัตร · บัตร 1–3 ใช้วงเงินร่วมกัน
            </p>
          </div>
          <button
            type="button"
            onClick={openBatchModal}
            className="inline-flex items-center gap-1.5 bg-[#006A63] hover:bg-[#004D48] text-white font-heading text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>ตั้งค่าทั้งหมด (6 บัตร)</span>
          </button>
        </div>

        {/* 4-Column Unboxed Hairline KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div>
            <div className="text-xs font-heading text-slate-500">
              วงเงินรวมจริงทั้งหมด
            </div>
            <div className="text-xl sm:text-2xl font-num font-bold text-slate-900 mt-0.5">
              ฿{fmt(summary.totalLimit)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              ตั้งวงเงินแล้ว{' '}
              <span className="font-num font-semibold text-[#006A63]">
                {summary.configuredCount}/6
              </span>{' '}
              บัตร (1–3 นับ 1 วงเงิน)
            </div>
          </div>

          <div>
            <div className="text-xs font-heading text-slate-500">
              ยอดที่ใช้ไปรวม
            </div>
            <div className="text-xl sm:text-2xl font-num font-bold text-orange-700 mt-0.5">
              ฿{fmt(summary.totalUsed)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {summary.totalLimit > 0
                ? `ใช้วงเงินรวม ${((summary.totalUsed / summary.totalLimit) * 100).toFixed(1)}%`
                : 'รวมยอดใช้ไป / ค้างชำระทั้ง 6 บัตร'}
            </div>
          </div>

          <div>
            <div className="text-xs font-heading text-slate-500">
              วงเงินคงเหลือใช้ได้รวม
            </div>
            <div
              className={`text-xl sm:text-2xl font-num font-bold mt-0.5 ${
                summary.totalAvailable < 0 ? 'text-rose-600' : 'text-[#006A63]'
              }`}
            >
              ฿{fmt(summary.totalAvailable)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {summary.totalActiveInstallments > 0
                ? `ติดผ่อนอยู่ ${summary.totalActiveInstallments} รายการ (฿${fmtCompact(summary.totalInstallmentsMonthly)}/ด.)`
                : summary.configuredCount > 0
                ? 'หักลบวงเงินร่วม 1–3 และบัตรอื่นๆ แล้ว'
                : 'กด "ตั้งค่าทั้งหมด" เพื่อใส่วงเงินบัตร'}
            </div>
          </div>

          <div>
            <div className="text-xs font-heading text-slate-500">
              ยอดที่จ่ายในเดือน {m}
            </div>
            <div className="text-xl sm:text-2xl font-num font-bold text-slate-900 mt-0.5">
              ฿{fmt(summary.monthDueTotal)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-num">
              จ่ายแล้ว ฿{fmtCompact(summary.monthPaidTotal)} · รอจ่าย ฿
              {fmtCompact(summary.monthUnpaidTotal)}
            </div>
          </div>
        </div>

        {/* Shared Pool Summary Strip for Cards 1, 2, 3 */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-heading font-medium">
            <Link2 className="w-3.5 h-3.5 text-[#006A63] shrink-0" />
            <span>
              วงเงินร่วม บัตร 1–3 (บัตรบรูการ์ด + บัตรกสิกร1 + บัตรกสิกร2):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-num text-slate-700">
            <span>
              วงเงินร่วม:{' '}
              <strong className="text-slate-900">
                {summary.sharedPoolLimit > 0
                  ? `฿${fmt(summary.sharedPoolLimit)}`
                  : 'ยังไม่ตั้ง'}
              </strong>
            </span>
            <span>
              ใช้ไปรวม 3 บัตร:{' '}
              <strong className="text-orange-700">
                ฿{fmt(summary.sharedPoolUsed)}
              </strong>
            </span>
            <span>
              คงเหลือร่วม:{' '}
              <strong
                className={
                  summary.sharedPoolLimit <= 0
                    ? 'text-slate-400'
                    : summary.sharedPoolAvailable < 0
                    ? 'text-rose-600'
                    : 'text-[#006A63]'
                }
              >
                {summary.sharedPoolLimit > 0
                  ? `฿${fmt(summary.sharedPoolAvailable)}`
                  : '-'}
              </strong>
              {summary.sharedPoolLimit > 0 && (
                <span className="text-slate-500">
                  {' '}
                  ({summary.sharedPoolPct.toFixed(1)}%)
                </span>
              )}
            </span>
            {summary.sharedMetrics[0] && (
              <button
                type="button"
                onClick={() => openSingleEdit(summary.sharedMetrics[0])}
                className="font-heading font-semibold text-[#006A63] hover:underline"
              >
                แก้ไขวงเงินร่วม
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 6 Credit Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {cardMetrics.map((cm, idx) => {
          const { card, linkedExpense } = cm;
          const isOverLimit =
            cm.creditLimit > 0 && cm.sharedUsedTotal > cm.creditLimit;
          const ownBarPct =
            cm.creditLimit > 0
              ? Math.min(100, Math.max(0, cm.ownUtilizationPct))
              : cm.usedAmount > 0
              ? 100
              : 0;
          const otherBarPct =
            cm.isSharedLimit && cm.creditLimit > 0
              ? Math.min(
                  Math.max(0, 100 - ownBarPct),
                  Math.max(0, (cm.otherSharedUsedAmount / cm.creditLimit) * 100)
                )
              : 0;

          const ownBarColor =
            cm.creditLimit <= 0
              ? 'bg-slate-300'
              : isOverLimit || cm.utilizationPct >= 90
              ? 'bg-rose-600'
              : cm.utilizationPct >= 70
              ? 'bg-amber-600'
              : 'bg-[#006A63]';

          return (
            <article
              key={card.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* Card Visual Header */}
                <div
                  className="px-5 py-4 text-white"
                  style={{ backgroundColor: card.accentColor }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-white/75 font-heading flex items-center gap-1.5">
                        <span>
                          0{idx + 1} · {card.issuerLabel}
                        </span>
                        {cm.isSharedLimit && (
                          <span className="text-white/90 font-medium">
                            · วงเงินร่วม 1–3
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg font-heading font-bold tracking-tight truncate mt-0.5">
                        {card.name}
                      </h2>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-white/75 font-heading">
                        ระยะเวลาปลดหนี้
                      </div>
                      <div className="text-sm font-num font-bold whitespace-nowrap mt-0.5">
                        {formatPayoffBadgeText(cm)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-white/15 flex items-center justify-between text-xs text-white/85 gap-2">
                    <span className="truncate">
                      {linkedExpense
                        ? `เชื่อมกับ: ${linkedExpense.name} (${linkedExpense.note || '-'})`
                        : 'ยังไม่มีรายการจ่ายในเดือนนี้'}
                    </span>
                    {cm.paidToDateAmount > 0 && (
                      <span className="font-num whitespace-nowrap shrink-0 text-white/95">
                        จ่ายแล้วรวม ฿{fmtCompact(cm.paidToDateAmount)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Figures */}
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[11px] font-heading text-slate-500">
                        {cm.isSharedLimit ? 'วงเงินร่วม (1-3)' : 'วงเงินที่ตั้งไว้'}
                      </div>
                      {cm.creditLimit > 0 ? (
                        <div className="text-sm font-num font-bold text-slate-900 mt-0.5">
                          ฿{fmtCompact(cm.creditLimit)}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openSingleEdit(cm)}
                          className="text-xs font-heading font-semibold text-[#006A63] hover:underline mt-0.5 text-left"
                        >
                          + ตั้งวงเงิน
                        </button>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-heading text-slate-500">
                        ยอดที่ใช้ไป (ใบนี้)
                      </div>
                      <div className="text-sm font-num font-bold text-orange-700 mt-0.5">
                        ฿{fmt(cm.usedAmount)}
                      </div>
                      {cm.installmentsDeductedTotal > 0 && (
                        <div className="text-[10px] font-num text-slate-500 mt-0.5 leading-tight">
                          ทั่วไป ฿{fmtCompact(cm.generalUsedAmount)} + ผ่อน ฿
                          {fmtCompact(cm.installmentsDeductedTotal)}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] font-heading text-slate-500">
                        {cm.isSharedLimit ? 'คงเหลือร่วม' : 'คงเหลือใช้ได้'}
                      </div>
                      <div
                        className={`text-sm font-num font-bold mt-0.5 ${
                          cm.creditLimit <= 0
                            ? 'text-slate-400'
                            : isOverLimit
                            ? 'text-rose-600'
                            : 'text-[#006A63]'
                        }`}
                      >
                        {cm.creditLimit > 0 ? `฿${fmt(cm.availableLimit)}` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Utilization Progress Bar */}
                  <div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                      <div
                        className={`h-full transition-all duration-300 ${ownBarColor}`}
                        style={{ width: `${ownBarPct}%` }}
                        title={`บัตรนี้ใช้ไป ฿${fmt(cm.usedAmount)}`}
                      />
                      {otherBarPct > 0 && (
                        <div
                          className="h-full bg-amber-400 transition-all duration-300"
                          style={{ width: `${otherBarPct}%` }}
                          title={`บัตรร่วมอื่นในกลุ่ม 1-3 ใช้ไป ฿${fmt(cm.otherSharedUsedAmount)}`}
                        />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 gap-2">
                      <span className="font-num truncate">
                        {cm.creditLimit > 0
                          ? cm.isSharedLimit
                            ? `รวม 3 บัตร ฿${fmtCompact(cm.sharedUsedTotal)} (${cm.utilizationPct.toFixed(1)}%)${
                                isOverLimit ? ' เกินวงเงิน' : ''
                              }`
                            : `ใช้วงเงิน ${cm.utilizationPct.toFixed(1)}%${
                                isOverLimit ? ' (เกินวงเงิน)' : ''
                              }`
                          : 'ยังไม่ได้ตั้งวงเงินบัตร'}
                      </span>
                      {card.balanceMode === 'custom' ? (
                        <button
                          type="button"
                          onClick={() => handleResetToScheduleMode(card.id)}
                          className="inline-flex items-center gap-1 font-heading text-[#006A63] hover:underline whitespace-nowrap shrink-0"
                          title="เปลี่ยนกลับไปคำนวณอัตโนมัติจากตารางรายจ่าย"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>ใช้ยอดตามตาราง</span>
                        </button>
                      ) : (
                        <span className="font-heading whitespace-nowrap shrink-0">
                          รวมตามตารางจ่าย
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Direct Editable Fields: ยอดที่ใช้ไป & ยอดที่จ่ายในเดือนนั้น */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor={`card-used-${card.id}`}
                        className="block text-[11px] font-heading font-medium text-slate-600 mb-1"
                      >
                        {cm.installmentsDeductedTotal > 0
                          ? 'ยอดใช้จ่ายอื่น (ไม่รวมผ่อน)'
                          : 'ยอดที่ใช้ไป (บาท)'}
                      </label>
                      <CardInlineNumberInput
                        id={`card-used-${card.id}`}
                        ariaLabel={
                          cm.installmentsDeductedTotal > 0
                            ? `ยอดใช้จ่ายอื่นไม่รวมผ่อนของ${card.name}`
                            : `ยอดที่ใช้ไปของ${card.name}`
                        }
                        value={cm.generalUsedAmount}
                        onCommit={(val) => handleInlineUsedChange(card.id, val)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num font-semibold text-orange-700 bg-white focus:outline-none focus:border-[#006A63]"
                      />
                      {cm.installmentsDeductedTotal > 0 && (
                        <div className="text-[10px] font-num text-slate-500 mt-1 leading-tight">
                          + ผ่อน ฿{fmtCompact(cm.installmentsDeductedTotal)} = รวม ฿
                          {fmtCompact(cm.usedAmount)}
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`card-month-pay-${card.id}`}
                        className="block text-[11px] font-heading font-medium text-slate-600 mb-1"
                      >
                        ยอดที่จ่ายเดือน {m} (บาท)
                      </label>
                      <CardInlineNumberInput
                        id={`card-month-pay-${card.id}`}
                        ariaLabel={`ยอดที่จ่ายเดือน ${m} ของ${card.name}`}
                        value={cm.activeMonthPayment}
                        onCommit={(val) =>
                          handleInlineMonthPaymentChange(card.id, val)
                        }
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num font-semibold text-slate-900 bg-white focus:outline-none focus:border-[#006A63]"
                      />
                    </div>
                  </div>

                  {/* Installments Tracker: บัตรนี้ติดผ่อนอะไรอยู่ / กี่เดือน / เดือนละเท่าไหร่ / ผ่อน 0% */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-heading font-semibold text-slate-800">
                        ติดผ่อนอะไรอยู่ ({cm.installments.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => openAddInstallment(cm)}
                        className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-[#006A63] hover:text-[#004D48] hover:underline whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>เพิ่มรายการผ่อน 0%</span>
                      </button>
                    </div>

                    {cm.installments.length === 0 ? (
                      <div className="text-[11px] text-slate-400 font-heading">
                        ยังไม่มีรายการผ่อน 0% ที่ระบุไว้ในบัตรนี้
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {cm.installments.map((inst) => (
                          <div key={inst.id} className="py-2 first:pt-1 last:pb-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-heading font-semibold text-slate-900 truncate">
                                  {inst.itemName}{' '}
                                  <span className="text-[11px] font-medium text-[#006A63]">
                                    {inst.isZeroInterest ? '· ผ่อน 0%' : '· ผ่อนปกติ'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-num mt-0.5">
                                  งวดที่ {inst.paidMonths}/{inst.totalMonths} ·{' '}
                                  {inst.remainingMonths === 0 ? (
                                    <span className="text-[#0F766E] font-heading font-medium">
                                      ผ่อนครบแล้ว
                                    </span>
                                  ) : (
                                    <>
                                      เหลือ{' '}
                                      <strong className="text-slate-700">
                                        {inst.remainingMonths}
                                      </strong>{' '}
                                      ด.
                                      {inst.estimatedEndMonth
                                        ? ` (หมด ${inst.estimatedEndMonth})`
                                        : ''}
                                      {' · '}ค้าง ฿{fmtCompact(inst.remainingBalance)}
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-xs font-num font-bold text-slate-900">
                                  ฿{fmt(inst.monthlyAmount)}/ด.
                                </div>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  {inst.remainingMonths > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleIncrementInstallmentPaid(cm, inst)
                                      }
                                      className="text-[10px] font-heading font-semibold text-[#006A63] hover:underline whitespace-nowrap"
                                      title="บันทึกว่าผ่อนเพิ่มแล้ว 1 งวด"
                                    >
                                      +1 งวด
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openEditInstallment(cm, inst)}
                                    className="text-slate-400 hover:text-slate-700 p-0.5"
                                    aria-label={`แก้ไขรายการผ่อน ${inst.itemName}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteInstallment(card.id, inst.id)
                                    }
                                    className="text-slate-400 hover:text-rose-600 p-0.5"
                                    aria-label={`ลบรายการผ่อน ${inst.itemName}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {cm.activeInstallmentsCount > 0 && (
                          <div className="pt-2 flex items-center justify-between text-[11px] font-num text-slate-600">
                            <span className="font-heading">รวมยอดผ่อน 0% คงเหลือ</span>
                            <span>
                              เดือนละ{' '}
                              <strong className="text-slate-900">
                                ฿{fmt(cm.installmentsMonthlyTotal)}
                              </strong>{' '}
                              · คงเหลือ{' '}
                              <strong className="text-orange-700">
                                ฿{fmt(cm.installmentsRemainingTotal)}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment Status & Payoff Forecast */}
                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-heading text-slate-600">
                        สถานะจ่ายเดือน {m}
                      </span>
                      {linkedExpense && cm.activeMonthPayment > 0 ? (
                        <button
                          type="button"
                          onClick={() => onTogglePaid(linkedExpense.id)}
                          className={`inline-flex items-center gap-1 text-xs font-heading font-medium px-2.5 py-1 rounded-md transition whitespace-nowrap ${
                            cm.isActiveMonthPaid
                              ? 'bg-emerald-50 text-[#0F766E] hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          {cm.isActiveMonthPaid ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>จ่ายแล้ว ฿{fmt(cm.activeMonthPayment)}</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              <span>รอจ่าย ฿{fmt(cm.activeMonthPayment)}</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-heading">
                          ยังไม่มียอดจ่ายเดือนนี้
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 font-heading flex items-start justify-between gap-2">
                      <span>คาดการณ์ปิดหนี้</span>
                      <span className="text-right font-medium text-slate-800">
                        {cm.usedAmount <= 0 ? (
                          <span className="text-[#0F766E]">ไม่มีหนี้ค้าง</span>
                        ) : cm.hasInfiniteOrOpenEnd ? (
                          <span>
                            คงเหลือตามตาราง {cm.remainingMonths} เดือน (ยังไม่ได้ตั้งวันจบงวด)
                          </span>
                        ) : cm.remainingMonths !== null && cm.estimatedEndMonth ? (
                          <span>
                            อีก <span className="font-num font-bold">{cm.remainingMonths}</span> เดือน · หมดภายใน{' '}
                            <span className="text-[#006A63] font-semibold">
                              {cm.estimatedEndMonth}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            กรอกยอดที่จ่าย/เดือน เพื่อคำนวณ
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => openSingleEdit(cm)}
                  className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-[#006A63] hover:text-[#004D48] px-2.5 py-1.5 rounded-md hover:bg-[#E6F3F2] transition whitespace-nowrap"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>ตั้งค่าวงเงิน / ยอดบัตร</span>
                </button>

                {linkedExpense && cm.activeMonthPayment > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onEditLinkedExpense({
                        ...linkedExpense,
                        amount: cm.activeMonthPayment,
                        isPaid: cm.isActiveMonthPaid,
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-heading text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-200/70 transition whitespace-nowrap"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>ตั้งค่างวดผ่อน</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSwitchToTransactions}
                    className="text-xs font-heading text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-200/70 transition whitespace-nowrap"
                  >
                    ดูรายการจ่าย
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Payoff Comparison Chart & Priority Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-xl p-5 sm:p-6 border border-slate-200 flex flex-col">
          <div className="mb-3">
            <h3 className="text-base font-heading font-bold text-slate-900">
              เปรียบเทียบยอดใช้ไปและวงเงินคงเหลือ
            </h3>
            <p className="text-xs text-slate-500">
              บัตร 1–3 แสดงยอดใช้ร่วมกันเทียบกับวงเงินเดียวกันและวงเงินคงเหลือ
            </p>
          </div>
          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => `฿${fmtCompact(Number(v))}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={95}
                  tick={{ fontSize: 12, fill: '#1e293b' }}
                />
                <Tooltip
                  formatter={(value: unknown) => `฿${fmt(Number(value) || 0)}`}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="ใช้ไปแล้วใบนี้"
                  stackId="limit"
                  fill="#EA580C"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="บัตรร่วมใช้อยู่"
                  stackId="limit"
                  fill="#F59E0B"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="วงเงินคงเหลือ"
                  stackId="limit"
                  fill="#006A63"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-heading font-bold text-slate-900">
                ตารางจัดลำดับระยะเวลาปลดหนี้บัตรเครดิต
              </h3>
              <p className="text-xs text-slate-500">
                เรียงตามบัตรที่ต้องผ่อนนานที่สุดและยอดคงค้างสูงสุดเพื่อวางแผนปิดยอด
              </p>
            </div>
            {summary.longestCard && (
              <div className="text-xs font-heading text-slate-600">
                นานสุด:{' '}
                <span className="font-semibold text-orange-700">
                  {summary.longestCard.card.name} (
                  {summary.longestCard.remainingMonths} เดือน)
                </span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#006A63] text-white text-xs font-heading">
                  <th className="py-2.5 px-3 rounded-tl-lg">บัตร / ติดผ่อน</th>
                  <th className="py-2.5 px-3 text-right">วงเงิน</th>
                  <th className="py-2.5 px-3 text-right">ยอดที่ใช้ไป</th>
                  <th className="py-2.5 px-3 text-right">คงเหลือ</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    จ่ายเดือน {m}
                  </th>
                  <th className="py-2.5 px-3 text-right">เหลือกี่เดือน</th>
                  <th className="py-2.5 px-3 rounded-tr-lg text-right">
                    คาดว่าหมด
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedForTable.map((cm) => {
                  const activeInsts = cm.installments.filter(
                    (i) => i.remainingMonths > 0
                  );
                  return (
                    <tr key={cm.card.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        <div className="whitespace-nowrap">{cm.card.name}</div>
                        {cm.isSharedLimit && (
                          <div className="text-[10px] font-heading text-slate-400">
                            วงเงินร่วม 1–3
                          </div>
                        )}
                        {activeInsts.length > 0 && (
                          <div className="text-[11px] font-heading text-[#006A63] mt-0.5">
                            {activeInsts[0].isZeroInterest ? 'ผ่อน 0%: ' : 'ผ่อน: '}
                            {activeInsts[0].itemName}
                            {activeInsts.length > 1
                              ? ` (+${activeInsts.length - 1})`
                              : ''}{' '}
                            · ฿{fmtCompact(cm.installmentsMonthlyTotal)}/ด.
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-num text-slate-600">
                        {cm.creditLimit > 0 ? (
                          <div>฿{fmtCompact(cm.creditLimit)}</div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-num font-semibold text-orange-700">
                        ฿{fmt(cm.usedAmount)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-num font-semibold ${
                          cm.creditLimit <= 0
                            ? 'text-slate-400'
                            : cm.availableLimit < 0
                            ? 'text-rose-600'
                            : 'text-[#006A63]'
                        }`}
                      >
                        {cm.creditLimit > 0 ? (
                          <>
                            <div>฿{fmt(cm.availableLimit)}</div>
                            {cm.isSharedLimit && (
                              <div className="text-[10px] font-heading font-normal text-slate-400">
                                คงเหลือร่วม
                              </div>
                            )}
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-num text-slate-700">
                        <div>฿{fmt(cm.activeMonthPayment)}</div>
                        {cm.activeMonthPayment > 0 && (
                          <div
                            className={`text-[10px] font-heading ${
                              cm.isActiveMonthPaid
                                ? 'text-[#0F766E]'
                                : 'text-amber-700'
                            }`}
                          >
                            {cm.isActiveMonthPaid ? 'จ่ายแล้ว' : 'รอจ่าย'}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-num font-semibold text-slate-900 whitespace-nowrap">
                        {cm.usedAmount <= 0
                          ? '0 เดือน'
                          : cm.remainingMonths !== null
                          ? `${cm.remainingMonths} เดือน`
                          : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-heading text-xs text-slate-600 whitespace-nowrap">
                        {cm.usedAmount <= 0
                          ? 'ปิดยอดแล้ว'
                          : cm.hasInfiniteOrOpenEnd
                          ? 'ยังไม่กำหนดวันจบ'
                          : cm.estimatedEndMonth || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit 0% Installment Modal */}
      {instModalMetric && (
        <div
          className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-heading font-bold text-slate-900">
                  {editingInstId ? 'แก้ไขรายการผ่อน' : 'เพิ่มรายการผ่อน 0%'} ·{' '}
                  {instModalMetric.card.name}
                </h3>
                <p className="text-xs text-slate-500">
                  ระบุสินค้าหรือรายการที่ติดผ่อน พร้อมจำนวนงวดและยอดผ่อนต่อเดือน
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInstModalCardId(null);
                  setEditingInstId(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInstallment} className="space-y-4">
              <div>
                <label
                  htmlFor="inst-item-name"
                  className="block text-xs font-heading font-medium text-slate-600 mb-1"
                >
                  ติดผ่อนอะไรอยู่
                </label>
                <input
                  id="inst-item-name"
                  type="text"
                  value={instItemName}
                  onChange={(e) => {
                    setInstItemName(e.target.value);
                    setInstError('');
                  }}
                  placeholder="เช่น iPhone 16, ยางรถยนต์, ประกันรถ"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#006A63]"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInstIsZeroInterest(true)}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    instIsZeroInterest
                      ? 'bg-white text-[#006A63] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ผ่อน 0%
                </button>
                <button
                  type="button"
                  onClick={() => setInstIsZeroInterest(false)}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    !instIsZeroInterest
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ผ่อนมีดอกเบี้ย / ปกติ
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInstCalcMode('total')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    instCalcMode === 'total'
                      ? 'bg-white text-[#006A63] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  กรอกยอดรวม (หารงวด)
                </button>
                <button
                  type="button"
                  onClick={() => setInstCalcMode('monthly')}
                  className={`px-2 py-1.5 text-xs font-heading font-medium rounded-md transition ${
                    instCalcMode === 'monthly'
                      ? 'bg-white text-[#006A63] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  กรอกค่างวดต่อเดือน
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {instCalcMode === 'total' ? (
                  <div>
                    <label
                      htmlFor="inst-total-price"
                      className="block text-xs font-heading font-medium text-slate-600 mb-1"
                    >
                      ยอดรวมทั้งหมด (บาท)
                    </label>
                    <input
                      id="inst-total-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={instTotalPrice}
                      onChange={(e) => {
                        setInstTotalPrice(e.target.value);
                        setInstError('');
                      }}
                      placeholder="เช่น 15000"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num font-semibold focus:outline-none focus:border-[#006A63]"
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="inst-monthly-amt"
                      className="block text-xs font-heading font-medium text-slate-600 mb-1"
                    >
                      ผ่อนเดือนละ (บาท)
                    </label>
                    <input
                      id="inst-monthly-amt"
                      type="number"
                      min="0"
                      step="0.01"
                      value={instMonthlyInput}
                      onChange={(e) => {
                        setInstMonthlyInput(e.target.value);
                        setInstError('');
                      }}
                      placeholder="เช่น 1500"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num font-semibold focus:outline-none focus:border-[#006A63]"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="inst-total-months"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    ผ่อนกี่เดือน (ทั้งหมด)
                  </label>
                  <input
                    id="inst-total-months"
                    type="number"
                    min="1"
                    max="120"
                    value={instTotalMonths}
                    onChange={(e) => setInstTotalMonths(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num font-semibold focus:outline-none focus:border-[#006A63]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-heading">
                <span className="text-slate-500">เลือกงวดด่วน:</span>
                {['3', '6', '10', '12'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInstTotalMonths(preset)}
                    className={`px-2 py-1 rounded border font-num transition ${
                      instTotalMonths === preset
                        ? 'border-[#006A63] bg-[#E6F3F2] text-[#006A63] font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {preset} ด.
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="inst-paid-months"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    ผ่อนไปแล้ว (เดือน)
                  </label>
                  <input
                    id="inst-paid-months"
                    type="number"
                    min="0"
                    max={instTotalMonths}
                    value={instPaidMonths}
                    onChange={(e) => setInstPaidMonths(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num focus:outline-none focus:border-[#006A63]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="inst-start-month"
                    className="block text-xs font-heading font-medium text-slate-600 mb-1"
                  >
                    เริ่มงวดที่เหลือเดือน
                  </label>
                  <select
                    id="inst-start-month"
                    value={instStartMonth}
                    onChange={(e) => setInstStartMonth(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-heading bg-white focus:outline-none focus:border-[#006A63]"
                  >
                    {startMonthOptions.map((mon) => (
                      <option key={mon} value={mon}>
                        {mon}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Calculation Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <div className="font-heading font-semibold text-slate-800">
                  {instIsZeroInterest ? 'ผ่อน 0%' : 'ผ่อนชำระ'} เดือนละ{' '}
                  <span className="font-num text-[#006A63]">
                    ฿{fmt(computedInstPreview.monthlyAmount)}
                  </span>{' '}
                  นาน{' '}
                  <span className="font-num">{computedInstPreview.months}</span>{' '}
                  เดือน · ยอดรวม{' '}
                  <span className="font-num">
                    ฿{fmt(computedInstPreview.totalPrice)}
                  </span>
                </div>
                <div className="text-slate-500 font-num">
                  {computedInstPreview.remMonths === 0
                    ? 'ผ่อนครบทั้งหมดแล้ว'
                    : `เหลืองวดที่ต้องจ่ายอีก ${computedInstPreview.remMonths} เดือน (฿${fmt(
                        computedInstPreview.remainingBalance
                      )})${
                        computedInstPreview.endMonth
                          ? ` · คาดว่าหมด ${computedInstPreview.endMonth}`
                          : ''
                      }`}
                </div>
                {instModalMetric.creditLimit > 0 &&
                  instSyncMode !== 'memo_only' &&
                  computedInstPreview.remainingBalance > 0 && (() => {
                    const existingEditingInst = editingInstId
                      ? instModalMetric.installments.find(
                          (i) => i.id === editingInstId
                        )
                      : null;
                    const prevDeducted =
                      existingEditingInst &&
                      existingEditingInst.deductFromLimit !== false
                        ? existingEditingInst.remainingBalance
                        : 0;
                    const projectedAvail =
                      Math.round(
                        (instModalMetric.availableLimit +
                          prevDeducted -
                          computedInstPreview.remainingBalance) *
                          100
                      ) / 100;
                    return (
                      <div className="pt-1 border-t border-slate-200/70 font-heading text-slate-700">
                        วงเงินคงเหลือหลังหักรายการนี้:{' '}
                        <span
                          className={`font-num font-bold ${
                            projectedAvail < 0
                              ? 'text-rose-600'
                              : 'text-[#006A63]'
                          }`}
                        >
                          ฿{fmt(projectedAvail)}
                        </span>
                      </div>
                    );
                  })()}
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2 text-xs font-heading text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="inst-sync-mode"
                    checked={instSyncMode === 'add_both'}
                    onChange={() => setInstSyncMode('add_both')}
                    className="mt-0.5 accent-[#006A63]"
                  />
                  <span>
                    <strong className="text-slate-900">
                      หักวงเงินบัตรและบวกค่างวดเข้าตารางจ่ายรายเดือน
                    </strong>{' '}
                    (ลดวงเงินคงเหลือทันที ฿
                    {fmtCompact(computedInstPreview.remainingBalance)} และเพิ่มค่างวดเดือนละ ฿
                    {fmtCompact(computedInstPreview.monthlyAmount)})
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs font-heading text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="inst-sync-mode"
                    checked={instSyncMode === 'limit_only'}
                    onChange={() => setInstSyncMode('limit_only')}
                    className="mt-0.5 accent-[#006A63]"
                  />
                  <span>
                    <strong className="text-slate-900">
                      หักวงเงินบัตรอย่างเดียว
                    </strong>{' '}
                    (ลดวงเงินคงเหลือทันที ฿
                    {fmtCompact(computedInstPreview.remainingBalance)} โดยไม่บวกเข้าตารางจ่ายรายเดือน)
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs font-heading text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="inst-sync-mode"
                    checked={instSyncMode === 'memo_only'}
                    onChange={() => setInstSyncMode('memo_only')}
                    className="mt-0.5 accent-[#006A63]"
                  />
                  <span>
                    บันทึกชื่อรายการอย่างเดียว (กรณียอดนี้รวมอยู่ใน &quot;ยอดที่ใช้ไป&quot; เดิมแล้ว)
                  </span>
                </label>
              </div>

              {instError && (
                <div className="text-xs font-heading text-rose-600">
                  {instError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setInstModalCardId(null);
                    setEditingInstId(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-heading text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-[#006A63] hover:bg-[#004D48] text-white"
                >
                  {editingInstId ? 'บันทึกการแก้ไข' : 'เพิ่มรายการผ่อน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Card Settings Modal */}
      {editingMetric && (
        <div
          className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-heading font-bold text-slate-900">
                ตั้งค่าบัตร · {editingMetric.card.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCardId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSingle} className="space-y-4">
              <div>
                <label
                  htmlFor="single-card-limit"
                  className="block text-xs font-heading font-medium text-slate-600 mb-1"
                >
                  {editingMetric.isSharedLimit
                    ? 'วงเงินร่วม บัตร 1–3 ที่ตั้งไว้ (บาท)'
                    : 'วงเงินบัตรที่ตั้งไว้ (บาท)'}
                </label>
                <input
                  id="single-card-limit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftLimit}
                  onChange={(e) => setDraftLimit(e.target.value)}
                  placeholder="เช่น 30000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num focus:outline-none focus:border-[#006A63]"
                />
                {editingMetric.isSharedLimit && (
                  <p className="text-[11px] text-[#006A63] mt-1 font-heading">
                    บัตรบรูการ์ด, บัตรกสิกร1 และบัตรกสิกร2 ใช้วงเงินเดียวกัน — แก้ไขที่นี่จะอัปเดตทั้ง 3 บัตรให้เท่ากัน
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="single-card-used"
                    className="block text-xs font-heading font-medium text-slate-600"
                  >
                    {editingMetric.installmentsDeductedTotal > 0
                      ? 'ยอดใช้จ่ายอื่น / ไม่รวมรายการผ่อน (บาท)'
                      : 'ยอดที่ใช้ไป / หนี้คงค้างของใบนี้ (บาท)'}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftMode((prev) =>
                        prev === 'custom' ? 'schedule' : 'custom'
                      )
                    }
                    className="text-[11px] font-heading font-medium text-[#006A63] hover:underline"
                  >
                    {draftMode === 'custom'
                      ? 'สลับไปใช้ยอดตามตาราง'
                      : 'กำลังใช้ยอดตามตาราง'}
                  </button>
                </div>
                <input
                  id="single-card-used"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftCustomBalance}
                  onChange={(e) => {
                    setDraftCustomBalance(e.target.value);
                    setDraftMode('custom');
                  }}
                  placeholder="เช่น 12000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-num font-semibold text-orange-700 focus:outline-none focus:border-[#006A63]"
                />
                {editingMetric.installmentsDeductedTotal > 0 && (
                  <p className="text-[11px] font-num text-[#006A63] mt-1 font-medium">
                    รวมยอดที่ใช้ไปทั้งหมด: ฿
                    {fmt(
                      (draftMode === 'custom'
                        ? Math.max(0, Number(draftCustomBalance) || 0)
                        : editingMetric.generalUsedAmount) +
                        editingMetric.installmentsDeductedTotal
                    )}{' '}
                    (ใช้จ่ายอื่น ฿
                    {fmtCompact(
                      draftMode === 'custom'
                        ? Math.max(0, Number(draftCustomBalance) || 0)
                        : editingMetric.generalUsedAmount
                    )}{' '}
                    + ติดผ่อน ฿{fmtCompact(editingMetric.installmentsDeductedTotal)})
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1 font-heading">
                  {draftMode === 'custom'
                    ? `โหมดกำหนดยอดเอง: ระบบจะบวกยอดที่ติดผ่อน 0% ให้อัตโนมัติ ไม่หักหายเมื่อแก้ไขยอดใช้จ่าย`
                    : `โหมดอัตโนมัติ: รวมยอดรอจ่ายทั้งหมดในตาราง (แก้ไขตัวเลขด้านบนเพื่อกำหนดเองได้ทันที)`}
                </p>
              </div>

              <div>
                <label
                  htmlFor="single-card-month-payment"
                  className="block text-xs font-heading font-medium text-slate-600 mb-1"
                >
                  ยอดที่จ่ายในเดือน {m} (บาท)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="single-card-month-payment"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draftMonthPayment}
                    onChange={(e) => setDraftMonthPayment(e.target.value)}
                    placeholder="เช่น 1500"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-num font-semibold text-slate-900 focus:outline-none focus:border-[#006A63]"
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs font-heading text-slate-700 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={draftMonthPaid}
                      onChange={(e) => setDraftMonthPaid(e.target.checked)}
                      className="w-4 h-4 accent-[#006A63] rounded"
                    />
                    <span>จ่ายแล้ว</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCardId(null)}
                  className="px-4 py-2 rounded-lg text-sm font-heading text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-[#006A63] hover:bg-[#004D48] text-white"
                >
                  บันทึกข้อมูลบัตร
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Edit All 6 Cards Modal */}
      {isBatchModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 border border-slate-200 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-heading font-bold text-slate-900">
                  ตั้งค่าวงเงิน ยอดที่ใช้ไป และยอดที่จ่ายเดือน {m} (ทั้ง 6 บัตร)
                </h3>
                <p className="text-xs text-slate-500">
                  บัตร 1–3 (บัตรบรูการ์ด, บัตรกสิกร1, บัตรกสิกร2) ใช้วงเงินร่วมกัน กรอกใบใดใบหนึ่งจะอัปเดตทั้ง 3 ใบเท่ากัน
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="space-y-3">
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                {cards.map((c, idx) => {
                  const d = batchDrafts[c.id] || {
                    creditLimit: '',
                    balanceMode: 'schedule',
                    customBalance: '',
                    monthPayment: '',
                  };
                  const isShared = isSharedLimitCard(c.id);
                  return (
                    <div
                      key={c.id}
                      className="p-3.5 bg-white grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                    >
                      <div className="sm:col-span-3">
                        <div className="text-[11px] text-slate-400 font-heading">
                          บัตรที่ {idx + 1}
                          {isShared ? ' · วงเงินร่วม 1–3' : ''}
                        </div>
                        <div className="text-sm font-heading font-bold text-slate-900">
                          {c.name}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setBatchDrafts((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...d,
                                balanceMode:
                                  d.balanceMode === 'custom'
                                    ? 'schedule'
                                    : 'custom',
                              },
                            }))
                          }
                          className="text-[11px] font-heading text-[#006A63] hover:underline mt-0.5"
                        >
                          {d.balanceMode === 'custom'
                            ? 'โหมด: กรอกยอดใช้เอง'
                            : 'โหมด: ตามตารางจ่าย'}
                        </button>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-heading text-slate-500 mb-1">
                          {isShared
                            ? 'วงเงินร่วม 1–3 (บาท)'
                            : 'วงเงินที่ตั้งไว้ (บาท)'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={d.creditLimit}
                          onChange={(e) =>
                            handleBatchLimitChange(c.id, e.target.value)
                          }
                          placeholder="0"
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num focus:outline-none focus:border-[#006A63]"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        {(() => {
                          const cm = cardMetrics.find((m) => m.card.id === c.id);
                          const instDeducted = cm?.installmentsDeductedTotal || 0;
                          return (
                            <>
                              <label className="block text-[11px] font-heading text-slate-500 mb-1">
                                {instDeducted > 0
                                  ? 'ยอดใช้จ่ายอื่น (ไม่รวมผ่อน)'
                                  : 'ยอดที่ใช้ไป (บาท)'}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={d.customBalance}
                                onChange={(e) =>
                                  setBatchDrafts((prev) => ({
                                    ...prev,
                                    [c.id]: {
                                      ...d,
                                      balanceMode: 'custom',
                                      customBalance: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="0"
                                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num font-semibold text-orange-700 focus:outline-none focus:border-[#006A63]"
                              />
                              {instDeducted > 0 && (
                                <div className="text-[10px] font-num text-[#006A63] mt-0.5">
                                  + ผ่อน ฿{fmtCompact(instDeducted)} = รวม ฿
                                  {fmtCompact(
                                    (Math.max(0, Number(d.customBalance) || 0)) +
                                      instDeducted
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-heading text-slate-500 mb-1">
                          ยอดที่จ่ายเดือน {m} (บาท)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={d.monthPayment}
                          onChange={(e) =>
                            setBatchDrafts((prev) => ({
                              ...prev,
                              [c.id]: { ...d, monthPayment: e.target.value },
                            }))
                          }
                          placeholder="0"
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-num font-semibold text-slate-900 focus:outline-none focus:border-[#006A63]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-heading text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-[#006A63] hover:bg-[#004D48] text-white"
                >
                  บันทึกข้อมูลบัตรทั้งหมด
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
