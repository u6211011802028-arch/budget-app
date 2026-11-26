import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Calendar,
  FileSpreadsheet,
  LogOut,
  Plus,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import {
  ActiveTab,
  BudgetCategory,
  BudgetState,
  MonthExpenseView,
  SheetConnection,
  TargetPercentages,
} from './types/budget';
import {
  DEFAULT_BUDGET_STATE,
  STORAGE_KEY,
  buildFutureMonthSequence,
  suggestNextThaiMonth,
} from './data/defaultBudget';
import {
  clearCachedToken,
  getAccessToken,
  getStoredUserProfile,
  getTokenRemainingMs,
  googleSignIn,
  initAuth,
  logout,
  refreshAccessTokenSilently,
} from './services/googleAuth';
import {
  AuthExpiredError,
  createBudgetTemplateSpreadsheet,
  fetchSpreadsheetMeta,
  openGooglePicker,
  writeBudgetStateToTabs,
} from './services/googleSheets';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { ConfirmModal } from './components/ConfirmModal';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { ProjectionView } from './components/ProjectionView';
import {
  AddExpenseModal,
  AddIncomeModal,
  AddMonthModal,
  EditExpenseModal,
  EditExtraIncomeModal,
} from './components/BudgetModals';

const SHEET_PREF_KEY = 'thai_budget_sheet_pref_v1';

interface SavedSheetPref {
  spreadsheetId: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  selectedSheetTitle: string;
  autoRefreshSec: number;
}

function loadBudgetState(): BudgetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        Array.isArray(parsed.months) &&
        Array.isArray(parsed.expenses)
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore invalid localStorage
  }
  return JSON.parse(JSON.stringify(DEFAULT_BUDGET_STATE));
}

function loadSheetPref(): SavedSheetPref | null {
  try {
    const raw = localStorage.getItem(SHEET_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.spreadsheetId === 'string') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

type ConfirmAction =
  | { type: 'reset' }
  | { type: 'delete-expense'; id: number; name: string }
  | { type: 'create-sheet' }
  | { type: 'push-to-sheet' }
  | null;

export default function App() {
  const [state, setState] = useState<BudgetState>(loadBudgetState);

  // Google Auth State (persisted via browserLocalPersistence + localStorage token cache)
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Google Sheets Connection State
  const [savedSheetPref, setSavedSheetPref] = useState<SavedSheetPref | null>(
    loadSheetPref
  );
  const [sheetConn, setSheetConn] = useState<SheetConnection | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncBannerMsg, setSyncBannerMsg] = useState<string | null>(null);

  // Modals
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isAddMonthModalOpen, setIsAddMonthModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<MonthExpenseView | null>(null);
  const [editingExtraIncome, setEditingExtraIncome] = useState<{
    index: number;
    name: string;
    amount: number;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Save budget state locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [state]);

  // Save sheet connection preference (ID, title & tab name only, never tokens)
  useEffect(() => {
    try {
      if (sheetConn) {
        const pref: SavedSheetPref = {
          spreadsheetId: sheetConn.spreadsheetId,
          spreadsheetTitle: sheetConn.spreadsheetTitle,
          spreadsheetUrl: sheetConn.spreadsheetUrl,
          selectedSheetTitle: sheetConn.selectedSheetTitle,
          autoRefreshSec: sheetConn.autoRefreshSec,
        };
        localStorage.setItem(SHEET_PREF_KEY, JSON.stringify(pref));
        setSavedSheetPref(pref);
      }
    } catch {
      // ignore
    }
  }, [sheetConn]);

  const connectToSpreadsheet = useCallback(
    async (
      spreadsheetId: string,
      preferredTab?: string,
      autoRefreshOverride?: number
    ) => {
      let token = getAccessToken();
      if (!token) {
        token = await refreshAccessTokenSilently();
      }
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      setIsSyncing(true);
      setSyncError(null);

      const performConnect = async (activeToken: string) => {
        const meta = await fetchSpreadsheetMeta(activeToken, spreadsheetId);
        if (!meta.sheets.length) {
          throw new Error('ไม่พบแผ่นงาน (Sheet Tab) ในไฟล์สเปรดชีตนี้');
        }

        const targetTab =
          preferredTab && meta.sheets.some((s) => s.title === preferredTab)
            ? preferredTab
            : meta.sheets[0].title;

        setSheetConn((prev) => ({
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.title,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheets: meta.sheets,
          selectedSheetTitle: targetTab,
          detectedFormat: 'matrix',
          lastSyncedAt: prev?.spreadsheetId === meta.spreadsheetId ? prev.lastSyncedAt : null,
          autoRefreshSec:
            autoRefreshOverride !== undefined
              ? autoRefreshOverride
              : prev?.autoRefreshSec ?? 0,
        }));

        setSyncBannerMsg(
          `เชื่อมต่อไฟล์ "${meta.title}" แล้ว — กด "บันทึกข้อมูลเข้า Google Sheet" เมื่อต้องการอัปเดตไฟล์`
        );
      };

      try {
        await performConnect(token);
      } catch (err: any) {
        if (err instanceof AuthExpiredError) {
          clearCachedToken();
          const renewed = await refreshAccessTokenSilently();
          if (renewed) {
            try {
              await performConnect(renewed);
              return;
            } catch (retryErr: any) {
              if (retryErr instanceof AuthExpiredError) {
                clearCachedToken();
                setNeedsAuth(true);
                setSyncError(retryErr.message);
              } else {
                setSyncError(
                  retryErr?.message ||
                    'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets'
                );
              }
              return;
            }
          }
          setNeedsAuth(true);
          setSyncError(err.message);
        } else {
          setSyncError(
            err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets'
          );
        }
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  const hasAutoReconnectedRef = useRef(false);

  // Initialize Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);

        if (!hasAutoReconnectedRef.current) {
          hasAutoReconnectedRef.current = true;
          const savedPref = loadSheetPref();
          if (savedPref?.spreadsheetId) {
            connectToSpreadsheet(
              savedPref.spreadsheetId,
              savedPref.selectedSheetTitle,
              savedPref.autoRefreshSec
            );
          }
        }
      },
      (existingUser) => {
        setUser(existingUser);
        setNeedsAuth(true);
        hasAutoReconnectedRef.current = false;
      }
    );
    return () => unsubscribe();
  }, [connectToSpreadsheet]);

  // Proactive silent token refresh before the 1-hour OAuth token expires
  useEffect(() => {
    if (needsAuth) return;
    const timer = window.setInterval(() => {
      const remaining = getTokenRemainingMs();
      if (remaining > 0 && remaining < 5 * 60 * 1000) {
        refreshAccessTokenSilently();
      }
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [needsAuth]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setSyncError(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setNeedsAuth(false);

      // Reconnect saved Google Sheet preference automatically if available
      const savedPref = loadSheetPref();
      if (savedPref?.spreadsheetId) {
        hasAutoReconnectedRef.current = true;
        await connectToSpreadsheet(
          savedPref.spreadsheetId,
          savedPref.selectedSheetTitle,
          savedPref.autoRefreshSec
        );
      }
    } catch (err: any) {
      setSyncError(err?.message || 'เข้าสู่ระบบ Google ไม่สำเร็จ');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setSyncBannerMsg(null);
  };

  const handlePickFromDrive = () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    openGooglePicker(
      token,
      async (file) => {
        setIsSheetsModalOpen(false);
        await connectToSpreadsheet(file.id);
      },
      (msg) => {
        setSyncError(msg);
      }
    );
  };

  const handleConnectById = async (spreadsheetId: string) => {
    await connectToSpreadsheet(spreadsheetId);
    setIsSheetsModalOpen(false);
  };

  const handleDisconnectSheet = () => {
    setSheetConn(null);
    setSavedSheetPref(null);
    localStorage.removeItem(SHEET_PREF_KEY);
    setSyncBannerMsg(null);
    setSyncError(null);
    setIsSheetsModalOpen(false);
  };

  // Budget Mutation Handlers
  const handleMonthChange = (month: string) => {
    setState((prev) => ({ ...prev, activeMonth: month }));
  };

  const handleTabChange = (tab: ActiveTab) => {
    setState((prev) => ({ ...prev, activeTab: tab }));
  };

  const handleUpdateTargetPercentages = (targetPercentages: TargetPercentages) => {
    setState((prev) => ({ ...prev, targetPercentages }));
  };

  const handleTogglePaid = (expenseId: number) => {
    setState((prev) => {
      const m = prev.activeMonth;
      return {
        ...prev,
        expenses: prev.expenses.map((exp) =>
          exp.id === expenseId
            ? {
                ...exp,
                paid: { ...exp.paid, [m]: !exp.paid?.[m] },
              }
            : exp
        ),
      };
    });
  };

  const handleUpdateBaseIncome = (
    salary: number,
    salary29: number,
    side: number
  ) => {
    setState((prev) => {
      const m = prev.activeMonth;
      const existing = prev.incomes[m] || {
        salary: 0,
        salary29: 0,
        side: 0,
        extras: [],
        socialSecurity: 0,
        providentFund: 0,
      };
      return {
        ...prev,
        incomes: {
          ...prev.incomes,
          [m]: { ...existing, salary, salary29, side },
        },
      };
    });
  };

  const handleUpdatePayrollDeductions = (
    socialSecurity: number,
    providentFund: number,
    applyFutureMonths: boolean
  ) => {
    const cleanSso = Math.max(0, Number(socialSecurity) || 0);
    const cleanPvd = Math.max(0, Number(providentFund) || 0);
    setState((prev) => {
      const m = prev.activeMonth;
      const startIdx = prev.months.indexOf(m);
      const nextIncomes = { ...prev.incomes };
      const targetMonths =
        applyFutureMonths && startIdx >= 0
          ? prev.months.slice(startIdx)
          : [m];

      targetMonths.forEach((mon) => {
        const existing = nextIncomes[mon] || {
          salary: 0,
          salary29: 0,
          side: 0,
          extras: [],
          socialSecurity: 0,
          providentFund: 0,
        };
        nextIncomes[mon] = {
          ...existing,
          socialSecurity: cleanSso,
          providentFund: cleanPvd,
        };
      });

      return {
        ...prev,
        incomes: nextIncomes,
      };
    });
  };

  const handleDeleteExtraIncome = (index: number) => {
    setState((prev) => {
      const m = prev.activeMonth;
      const existing = prev.incomes[m];
      if (!existing) return prev;
      const nextExtras = [...existing.extras];
      nextExtras.splice(index, 1);
      return {
        ...prev,
        incomes: {
          ...prev.incomes,
          [m]: { ...existing, extras: nextExtras },
        },
      };
    });
  };

  const handleEditExpense = (data: {
    id: number;
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    paid: boolean;
    applyFutureMonths: boolean;
    recurringEndMonth: string;
    recurringMonths: number;
  }) => {
    setState((prev) => {
      const m = prev.activeMonth;
      const startIdx = prev.months.indexOf(m);
      const futureSeq = buildFutureMonthSequence(
        prev.months,
        m,
        Math.max(36, (data.recurringMonths || 12) + 6)
      );
      const endIdxInSeq = data.recurringEndMonth
        ? futureSeq.findIndex((item) => item.month === data.recurringEndMonth)
        : -1;

      return {
        ...prev,
        expenses: prev.expenses.map((exp) => {
          if (exp.id !== data.id) return exp;
          const nextAmounts = { ...exp.amounts };
          if (data.applyFutureMonths && startIdx >= 0) {
            prev.months.forEach((mon, idx) => {
              if (idx >= startIdx) {
                if (!data.recurringEndMonth) {
                  nextAmounts[mon] = data.amount;
                } else {
                  const seqIdx = futureSeq.findIndex((item) => item.month === mon);
                  nextAmounts[mon] =
                    endIdxInSeq >= 0 && seqIdx >= 0 && seqIdx <= endIdxInSeq
                      ? data.amount
                      : 0;
                }
              }
            });
            if (data.recurringEndMonth && endIdxInSeq >= 0) {
              futureSeq.forEach((item, idx) => {
                if (!item.isExisting) {
                  nextAmounts[item.month] = idx <= endIdxInSeq ? data.amount : 0;
                }
              });
            }
          } else {
            nextAmounts[m] = data.amount;
          }
          return {
            ...exp,
            name: data.name,
            note: data.note,
            category: data.category,
            amounts: nextAmounts,
            paid: { ...exp.paid, [m]: data.paid },
            recurringEndMonth: data.applyFutureMonths
              ? data.recurringEndMonth || undefined
              : exp.recurringEndMonth,
          };
        }),
      };
    });
  };

  const handleEditExtraIncome = (index: number, name: string, amount: number) => {
    setState((prev) => {
      const m = prev.activeMonth;
      const existing = prev.incomes[m];
      if (!existing) return prev;
      const nextExtras = [...existing.extras];
      if (!nextExtras[index]) return prev;
      nextExtras[index] = { name, amount };
      return {
        ...prev,
        incomes: {
          ...prev.incomes,
          [m]: { ...existing, extras: nextExtras },
        },
      };
    });
  };

  const handleAddExpense = (data: {
    name: string;
    amount: number;
    note: string;
    category: BudgetCategory;
    recurring: boolean;
    recurringEndMonth: string;
    recurringMonths: number;
    paid: boolean;
  }) => {
    setState((prev) => {
      const startIdx = prev.months.indexOf(prev.activeMonth);
      const futureSeq = buildFutureMonthSequence(
        prev.months,
        prev.activeMonth,
        Math.max(36, (data.recurringMonths || 12) + 6)
      );
      const endIdxInSeq = data.recurringEndMonth
        ? futureSeq.findIndex((item) => item.month === data.recurringEndMonth)
        : -1;

      const amounts: Record<string, number> = {};
      prev.months.forEach((mon, idx) => {
        if (idx < startIdx) {
          amounts[mon] = 0;
        } else if (mon === prev.activeMonth) {
          amounts[mon] = data.amount;
        } else if (data.recurring) {
          if (!data.recurringEndMonth) {
            amounts[mon] = data.amount;
          } else {
            const seqIdx = futureSeq.findIndex((item) => item.month === mon);
            amounts[mon] =
              endIdxInSeq >= 0 && seqIdx >= 0 && seqIdx <= endIdxInSeq
                ? data.amount
                : 0;
          }
        } else {
          amounts[mon] = 0;
        }
      });

      if (data.recurring && data.recurringEndMonth && endIdxInSeq >= 0) {
        futureSeq.forEach((item, idx) => {
          if (!item.isExisting) {
            amounts[item.month] = idx <= endIdxInSeq ? data.amount : 0;
          }
        });
      }

      const nextId =
        prev.expenses.reduce((max, item) => Math.max(max, item.id), 0) + 1;

      return {
        ...prev,
        expenses: [
          ...prev.expenses,
          {
            id: nextId,
            name: data.name,
            note: data.note,
            category: data.category,
            amounts,
            paid: { [prev.activeMonth]: data.paid },
            recurringEndMonth:
              data.recurring && data.recurringEndMonth
                ? data.recurringEndMonth
                : undefined,
          },
        ],
      };
    });
  };

  const handleAddIncome = (data: {
    name: string;
    amount: number;
    type: 'extra' | 'side' | 'salary' | 'salary29';
  }) => {
    setState((prev) => {
      const m = prev.activeMonth;
      const existing = prev.incomes[m] || {
        salary: 0,
        salary29: 0,
        side: 0,
        extras: [],
      };
      const updated = { ...existing, extras: [...(existing.extras || [])] };

      if (data.type === 'salary') {
        updated.salary = data.amount;
      } else if (data.type === 'salary29') {
        updated.salary29 = data.amount;
      } else if (data.type === 'side') {
        updated.side = (Number(updated.side) || 0) + data.amount;
      } else {
        updated.extras.push({ name: data.name, amount: data.amount });
      }

      return {
        ...prev,
        incomes: { ...prev.incomes, [m]: updated },
      };
    });
  };

  const handleAddMonth = (newMonth: string, copyPrev: boolean) => {
    setState((prev) => {
      const prevMonth = prev.months[prev.months.length - 1];
      const prevInc = prev.incomes[prevMonth] || {
        salary: 21000,
        salary29: 0,
        side: 0,
        extras: [],
        socialSecurity: 0,
        providentFund: 0,
      };

      const nextExpenses = prev.expenses.map((exp) => {
        const hasPreScheduled = Object.prototype.hasOwnProperty.call(
          exp.amounts,
          newMonth
        );
        const endedAtPrev =
          !!exp.recurringEndMonth && exp.recurringEndMonth === prevMonth;
        const nextAmt = hasPreScheduled
          ? Number(exp.amounts[newMonth]) || 0
          : endedAtPrev
          ? 0
          : copyPrev
          ? Number(exp.amounts[prevMonth]) || 0
          : 0;

        return {
          ...exp,
          amounts: {
            ...exp.amounts,
            [newMonth]: nextAmt,
          },
          paid: {
            ...exp.paid,
            [newMonth]: false,
          },
        };
      });

      return {
        ...prev,
        months: [...prev.months, newMonth],
        activeMonth: newMonth,
        incomes: {
          ...prev.incomes,
          [newMonth]: {
            salary: copyPrev ? Number(prevInc.salary) || 0 : 0,
            salary29: copyPrev ? Number(prevInc.salary29) || 0 : 0,
            side: 0,
            extras: [],
            socialSecurity: copyPrev ? Number(prevInc.socialSecurity) || 0 : 0,
            providentFund: copyPrev ? Number(prevInc.providentFund) || 0 : 0,
          },
        },
        expenses: nextExpenses,
      };
    });
  };

  // Confirmation Execution
  const executeConfirmedAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.type === 'reset') {
      setState(JSON.parse(JSON.stringify(DEFAULT_BUDGET_STATE)));
      setConfirmAction(null);
      return;
    }

    if (confirmAction.type === 'delete-expense') {
      const { id } = confirmAction;
      setState((prev) => {
        const m = prev.activeMonth;
        const nextExpenses = prev.expenses
          .map((exp) =>
            exp.id === id
              ? { ...exp, amounts: { ...exp.amounts, [m]: 0 } }
              : exp
          )
          .filter((exp) =>
            prev.months.some((mon) => (Number(exp.amounts[mon]) || 0) > 0)
          );
        return { ...prev, expenses: nextExpenses };
      });
      setConfirmAction(null);
      return;
    }

    if (confirmAction.type === 'create-sheet') {
      const token = getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        setConfirmAction(null);
        return;
      }
      setIsConfirmLoading(true);
      setSyncError(null);
      try {
        const meta = await createBudgetTemplateSpreadsheet(token, state);
        const nowTime = new Date().toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setSheetConn({
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.title,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheets: meta.sheets,
          selectedSheetTitle: meta.sheets[0]?.title || 'รายจ่าย-40-30-20-10',
          detectedFormat: 'matrix',
          lastSyncedAt: nowTime,
          autoRefreshSec: 0,
        });
        setSyncBannerMsg(
          `สร้าง Google Sheet "${meta.title}" และบันทึกข้อมูลเข้าไฟล์เรียบร้อยแล้ว`
        );
        setIsSheetsModalOpen(false);
        setConfirmAction(null);
      } catch (err: any) {
        if (err instanceof AuthExpiredError) {
          clearCachedToken();
          setNeedsAuth(true);
        }
        setSyncError(err?.message || 'สร้างไฟล์ Google Sheets ไม่สำเร็จ');
        setConfirmAction(null);
      } finally {
        setIsConfirmLoading(false);
      }
      return;
    }

    if (confirmAction.type === 'push-to-sheet') {
      if (!sheetConn) {
        setConfirmAction(null);
        return;
      }
      let token = getAccessToken();
      if (!token) {
        token = await refreshAccessTokenSilently();
      }
      if (!token) {
        setNeedsAuth(true);
        setConfirmAction(null);
        return;
      }
      setIsConfirmLoading(true);
      setSyncError(null);
      try {
        const updatedSheets = await writeBudgetStateToTabs(
          token,
          sheetConn.spreadsheetId,
          sheetConn.selectedSheetTitle,
          state,
          true,
          sheetConn.sheets.map((s) => s.title)
        );

        const nowTime = new Date().toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setSheetConn((prev) =>
          prev
            ? {
                ...prev,
                sheets: updatedSheets || prev.sheets,
                lastSyncedAt: nowTime,
              }
            : prev
        );
        setSyncBannerMsg(
          `บันทึกข้อมูลเข้า Google Sheet "${sheetConn.spreadsheetTitle}" (${sheetConn.selectedSheetTitle}) เรียบร้อยแล้ว`
        );
        setConfirmAction(null);
      } catch (err: any) {
        if (err instanceof AuthExpiredError) {
          clearCachedToken();
          setNeedsAuth(true);
        }
        setSyncError(err?.message || 'บันทึกข้อมูลเข้า Google Sheets ไม่สำเร็จ');
        setConfirmAction(null);
      } finally {
        setIsConfirmLoading(false);
      }
    }
  };

  const confirmDialogProps = (() => {
    if (!confirmAction) return null;
    if (confirmAction.type === 'reset') {
      return {
        title: 'คืนค่าข้อมูลเริ่มต้น',
        message:
          'ต้องการคืนค่าข้อมูลรายรับ-รายจ่ายทั้งหมดในแดชบอร์ดกลับไปเป็นค่าตั้งต้นใช่หรือไม่?',
        confirmLabel: 'คืนค่าเริ่มต้น',
        variant: 'danger' as const,
      };
    }
    if (confirmAction.type === 'delete-expense') {
      return {
        title: 'ลบรายการค่าใช้จ่าย',
        message: `ต้องการลบรายการ "${confirmAction.name}" ออกจากเดือน ${state.activeMonth} ใช่หรือไม่?`,
        confirmLabel: 'ลบรายการ',
        variant: 'danger' as const,
      };
    }
    if (confirmAction.type === 'create-sheet') {
      return {
        title: 'สร้าง Google Sheet ใหม่และบันทึกข้อมูล',
        message:
          'ระบบจะสร้างสเปรดชีตใหม่ชื่อ "แผนการเงิน 40-30-20-10 (ซิงก์อัตโนมัติ)" ใน Google Drive ของคุณ พร้อมบันทึกข้อมูลทั้งหมดจากแอปลงในแผ่นงาน',
        details: [
          'แผ่นงาน 1: รายจ่าย-40-30-20-10',
          'แผ่นงาน 2: รายรับประจำเดือน (เงินเดือน 2 รอบ, ปกส., กองทุนสำรองฯ)',
          'แผ่นงาน 3: สถานะชำระ',
        ],
        confirmLabel: 'ยืนยันสร้างและบันทึกเข้า Sheet',
        variant: 'primary' as const,
      };
    }
    return {
      title: 'ยืนยันการบันทึกข้อมูลเข้า Google Sheets',
      message: `ระบบจะบันทึกข้อมูลรายรับ-รายจ่ายล่าสุดทั้งหมดจากแอปลงในสเปรดชีต "${sheetConn?.spreadsheetTitle}"`,
      details: [
        `แท็บรายจ่ายหลัก: ${sheetConn?.selectedSheetTitle}`,
        'แท็บข้อมูลประกอบ: รายรับประจำเดือน, สถานะชำระ',
        `จำนวนข้อมูล: ${state.expenses.length} รายการ (${state.months.length} เดือน)`,
      ],
      confirmLabel: 'ยืนยันบันทึกเข้า Google Sheet',
      variant: 'primary' as const,
    };
  })();

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7F6] text-slate-800">
      {/* Top Bar: 3-zone single-row contract */}
      <header className="bg-[#006A63] text-white border-b border-[#004D48] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <span className="text-base sm:text-lg font-heading font-bold tracking-tight whitespace-nowrap shrink-0">
            วางแผนการเงิน
          </span>

          {/* Zone 2: Concise Navigation Tabs */}
          <nav className="flex items-center gap-5 overflow-x-auto h-full">
            <button
              type="button"
              onClick={() => handleTabChange('dashboard')}
              className={`h-full px-1 text-sm font-heading font-medium border-b-2 whitespace-nowrap shrink-0 transition ${
                state.activeTab === 'dashboard'
                  ? 'border-amber-300 text-white'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              แดชบอร์ดภาพรวม
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('transactions')}
              className={`h-full px-1 text-sm font-heading font-medium border-b-2 whitespace-nowrap shrink-0 transition ${
                state.activeTab === 'transactions'
                  ? 'border-amber-300 text-white'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              รายการรับ-จ่าย
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('projection')}
              className={`h-full px-1 text-sm font-heading font-medium border-b-2 whitespace-nowrap shrink-0 transition ${
                state.activeTab === 'projection'
                  ? 'border-amber-300 text-white'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              แนวโน้มและปลดหนี้
            </button>
          </nav>

          {/* Zone 3: 1 Primary Google Auth / Sheets Action */}
          <div className="flex items-center gap-3 shrink-0">
            {needsAuth ? (
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'Sign in with Google'}
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="hidden md:inline text-xs text-teal-100 whitespace-nowrap max-w-[160px] truncate">
                  {user?.displayName ||
                    user?.email ||
                    getStoredUserProfile()?.displayName ||
                    getStoredUserProfile()?.email}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="ออกจากระบบ Google"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-heading font-medium text-white whitespace-nowrap shrink-0 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Workspace Toolbar (Google Sheets Sync + Month Controls) */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Month & Quick Add Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-[#006A63]" />
              <span className="text-xs font-heading text-slate-600">เดือน:</span>
              <select
                value={state.activeMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="bg-transparent text-slate-900 font-heading font-semibold text-sm focus:outline-none cursor-pointer"
              >
                {state.months.map((mon) => (
                  <option key={mon} value={mon}>
                    {mon}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setIsAddMonthModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs sm:text-sm font-heading font-medium text-slate-700 whitespace-nowrap transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มเดือน</span>
            </button>

            <button
              type="button"
              onClick={() => setIsIncomeModalOpen(true)}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-heading font-semibold whitespace-nowrap transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>รายรับ</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-heading font-semibold whitespace-nowrap transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>รายจ่าย</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmAction({ type: 'reset' })}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-heading text-slate-500 hover:text-slate-800 hover:bg-slate-100 whitespace-nowrap transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>รีเซ็ต</span>
            </button>
          </div>

          {/* Google Sheets Export Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {needsAuth ? (
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
                {savedSheetPref ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-700 font-heading">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#006A63] shrink-0" />
                    <span className="max-w-[200px] truncate">
                      ไฟล์ที่ผูกไว้: {savedSheetPref.spreadsheetTitle || 'Google Sheets'}
                    </span>
                  </span>
                ) : (
                  <span>เชื่อมต่อ Google Sheets เพื่อบันทึกข้อมูลลงไฟล์ของคุณ</span>
                )}
                <GoogleSignInButton
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  label={
                    isLoggingIn
                      ? 'กำลังเชื่อมต่อ...'
                      : savedSheetPref
                      ? 'เชื่อมต่อ Sheet ต่อ'
                      : 'เชื่อมต่อ Google'
                  }
                />
              </div>
            ) : !sheetConn ? (
              <button
                type="button"
                onClick={() => setIsSheetsModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#006A63] hover:bg-[#004D48] text-white text-xs sm:text-sm font-heading font-semibold whitespace-nowrap transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>เลือก / สร้าง Google Sheet</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsSheetsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-heading font-medium text-slate-800 max-w-[200px] transition"
                  title={`เปลี่ยนไฟล์หรือแท็บ (${sheetConn.spreadsheetTitle})`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#006A63] shrink-0" />
                  <span className="truncate">{sheetConn.spreadsheetTitle}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: 'push-to-sheet' })}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006A63] hover:bg-[#004D48] text-white text-xs font-heading font-semibold whitespace-nowrap transition disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{isSyncing ? 'กำลังบันทึก...' : 'บันทึกข้อมูลเข้า Google Sheet'}</span>
                </button>

                {sheetConn.lastSyncedAt && (
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    บันทึกล่าสุด {sheetConn.lastSyncedAt}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sync Feedback / Error Strip */}
      {(syncError || syncBannerMsg) && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          {syncError ? (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs sm:text-sm text-orange-800">
              <span>{syncError}</span>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                className="text-xs font-heading font-semibold hover:underline shrink-0"
              >
                ปิด
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[#E6F3F2] border border-[#006A63]/20 text-xs sm:text-sm text-[#004D48]">
              <span>{syncBannerMsg}</span>
              <button
                type="button"
                onClick={() => setSyncBannerMsg(null)}
                className="text-xs font-heading font-semibold hover:underline shrink-0"
              >
                ปิด
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {state.activeTab === 'dashboard' && (
          <DashboardView
            state={state}
            onTogglePaid={handleTogglePaid}
            onOpenIncomeModal={() => setIsIncomeModalOpen(true)}
            onSwitchToTransactions={() => handleTabChange('transactions')}
            onUpdateTargetPercentages={handleUpdateTargetPercentages}
          />
        )}

        {state.activeTab === 'transactions' && (
          <TransactionsView
            state={state}
            onUpdateBaseIncome={handleUpdateBaseIncome}
            onUpdatePayrollDeductions={handleUpdatePayrollDeductions}
            onEditExtraIncome={(index, item) =>
              setEditingExtraIncome({ index, name: item.name, amount: item.amount })
            }
            onDeleteExtraIncome={handleDeleteExtraIncome}
            onTogglePaid={handleTogglePaid}
            onEditExpense={(item) => setEditingExpense(item)}
            onRequestDeleteExpense={(id, name) =>
              setConfirmAction({ type: 'delete-expense', id, name })
            }
            onOpenIncomeModal={() => setIsIncomeModalOpen(true)}
            onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
          />
        )}

        {state.activeTab === 'projection' && (
          <ProjectionView
            state={state}
            onOpenAddMonthModal={() => setIsAddMonthModalOpen(true)}
          />
        )}
      </main>

      {/* Modals */}
      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        connection={sheetConn}
        isLoading={isSyncing}
        errorMsg={syncError}
        onPickFromDrive={handlePickFromDrive}
        onConnectById={handleConnectById}
        onSelectTab={(tabTitle) => {
          setSheetConn((prev) =>
            prev ? { ...prev, selectedSheetTitle: tabTitle } : prev
          );
        }}
        onRequestCreateTemplate={() => setConfirmAction({ type: 'create-sheet' })}
        onDisconnect={handleDisconnectSheet}
      />

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        months={state.months}
        activeMonth={state.activeMonth}
        onClose={() => setIsExpenseModalOpen(false)}
        onSubmit={handleAddExpense}
      />

      <AddIncomeModal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        onSubmit={handleAddIncome}
      />

      <AddMonthModal
        isOpen={isAddMonthModalOpen}
        suggestedName={suggestNextThaiMonth(state.months)}
        existingMonths={state.months}
        onClose={() => setIsAddMonthModalOpen(false)}
        onSubmit={handleAddMonth}
      />

      <EditExpenseModal
        isOpen={!!editingExpense}
        months={state.months}
        activeMonth={state.activeMonth}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSubmit={handleEditExpense}
      />

      <EditExtraIncomeModal
        isOpen={!!editingExtraIncome}
        extraIncome={editingExtraIncome}
        onClose={() => setEditingExtraIncome(null)}
        onSubmit={handleEditExtraIncome}
      />

      <ConfirmModal
        isOpen={!!confirmAction && !!confirmDialogProps}
        title={confirmDialogProps?.title || ''}
        message={confirmDialogProps?.message || ''}
        details={confirmDialogProps?.details}
        confirmLabel={confirmDialogProps?.confirmLabel}
        variant={confirmDialogProps?.variant}
        isLoading={isConfirmLoading}
        onConfirm={executeConfirmedAction}
        onCancel={() => {
          if (!isConfirmLoading) setConfirmAction(null);
        }}
      />
    </div>
  );
}
