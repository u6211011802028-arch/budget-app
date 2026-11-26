import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Calendar,
  FileSpreadsheet,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import {
  ActiveTab,
  BudgetCategory,
  BudgetState,
  EssentialSubcategory,
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
  fetchSheetValues,
  fetchSpreadsheetMeta,
  findLatestBudgetSpreadsheet,
  openGooglePicker,
  parseGoogleSheetsToBudget,
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
const DIRTY_FLAG_KEY = 'thai_budget_dirty_v1';

function hasDirtyLocalEdits(): boolean {
  try {
    return localStorage.getItem(DIRTY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setDirtyLocalEdits(dirty: boolean) {
  try {
    if (dirty) {
      localStorage.setItem(DIRTY_FLAG_KEY, '1');
    } else {
      localStorage.removeItem(DIRTY_FLAG_KEY);
    }
  } catch {
    // ignore
  }
}

interface SavedSheetPref {
  spreadsheetId: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  selectedSheetTitle: string;
  autoRefreshSec: number;
  autoSave?: boolean;
  lastSyncedAt?: string | null;
}

function formatSyncTimestamp(): string {
  return new Date().toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
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

  const syncPayloadKey = useMemo(
    () =>
      JSON.stringify({
        months: state.months,
        incomes: state.incomes,
        expenses: state.expenses,
        targetPercentages: state.targetPercentages,
      }),
    [state.months, state.incomes, state.expenses, state.targetPercentages]
  );
  const syncPayloadKeyRef = useRef(syncPayloadKey);
  syncPayloadKeyRef.current = syncPayloadKey;
  const lastSyncedSnapshotRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  // Save budget state locally & mark dirty if edited after last sync
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
    if (
      lastSyncedSnapshotRef.current !== null &&
      lastSyncedSnapshotRef.current !== syncPayloadKey
    ) {
      setDirtyLocalEdits(true);
    }
  }, [state, syncPayloadKey]);

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
          autoSave: sheetConn.autoSave ?? true,
          lastSyncedAt: sheetConn.lastSyncedAt ?? null,
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
      options?: {
        autoRefreshOverride?: number;
        pullFromSheet?: boolean;
      }
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
            : meta.sheets.some((s) => s.title === 'รายจ่าย-40-30-20-10')
            ? 'รายจ่าย-40-30-20-10'
            : meta.sheets[0].title;

        const existingPref = loadSheetPref();
        const autoSaveEnabled =
          existingPref?.spreadsheetId === meta.spreadsheetId
            ? existingPref.autoSave ?? true
            : true;

        let nextSnapshot = syncPayloadKeyRef.current;
        let syncedAtValue: string | null = null;
        let bannerText = autoSaveEnabled
          ? `เชื่อมต่อไฟล์ "${meta.title}" แล้ว — ระบบจะบันทึกข้อมูลเข้า Google Sheet อัตโนมัติเมื่อมีการแก้ไข`
          : `เชื่อมต่อไฟล์ "${meta.title}" แล้ว — กด "บันทึกข้อมูลเข้า Google Sheet" เมื่อต้องการอัปเดตไฟล์`;

        if (options?.pullFromSheet) {
          const sheetTitles = meta.sheets.map((s) => s.title);
          const primaryRows = await fetchSheetValues(
            activeToken,
            meta.spreadsheetId,
            targetTab
          );

          if (primaryRows.length >= 2) {
            const hasIncomeTab =
              targetTab !== 'รายรับประจำเดือน' &&
              sheetTitles.includes('รายรับประจำเดือน');
            const hasPaidTab =
              targetTab !== 'สถานะชำระ' && sheetTitles.includes('สถานะชำระ');

            const [incomeRows, paidRows] = await Promise.all([
              hasIncomeTab
                ? fetchSheetValues(
                    activeToken,
                    meta.spreadsheetId,
                    'รายรับประจำเดือน'
                  ).catch(() => null)
                : Promise.resolve(null),
              hasPaidTab
                ? fetchSheetValues(
                    activeToken,
                    meta.spreadsheetId,
                    'สถานะชำระ'
                  ).catch(() => null)
                : Promise.resolve(null),
            ]);

            try {
              const parsed = parseGoogleSheetsToBudget(
                primaryRows,
                incomeRows,
                paidRows,
                stateRef.current
              );
              nextSnapshot = JSON.stringify({
                months: parsed.state.months,
                incomes: parsed.state.incomes,
                expenses: parsed.state.expenses,
                targetPercentages: parsed.state.targetPercentages,
              });
              lastSyncedSnapshotRef.current = nextSnapshot;
              setDirtyLocalEdits(false);
              setState(parsed.state);
              syncedAtValue = formatSyncTimestamp();
              bannerText = `อัปเดตข้อมูลจากไฟล์ "${meta.title}" (${parsed.rowCount} รายการ) แล้ว${
                autoSaveEnabled ? ' และเปิดบันทึกอัตโนมัติเมื่อแก้ไข' : ''
              }`;
            } catch (parseErr: any) {
              setSyncError(
                parseErr?.message ||
                  'รูปแบบข้อมูลในแผ่นงานยังไม่ตรงกับเทมเพลต จึงยังคงใช้ข้อมูลเดิมในแอป'
              );
            }
          } else {
            bannerText = `เชื่อมต่อไฟล์ "${meta.title}" แล้ว (แผ่นงานยังว่างอยู่ กด "บันทึกข้อมูลเข้า Google Sheet" เพื่อส่งข้อมูลจากแอปขึ้นไฟล์ได้ทันที)`;
          }
        }

        lastSyncedSnapshotRef.current = nextSnapshot;

        setSheetConn((prev) => ({
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.title,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheets: meta.sheets,
          selectedSheetTitle: targetTab,
          detectedFormat: 'matrix',
          lastSyncedAt:
            syncedAtValue ??
            (prev?.spreadsheetId === meta.spreadsheetId ? prev.lastSyncedAt : null) ??
            (existingPref?.spreadsheetId === meta.spreadsheetId
              ? existingPref.lastSyncedAt ?? null
              : null),
          autoRefreshSec:
            options?.autoRefreshOverride !== undefined
              ? options.autoRefreshOverride
              : prev?.autoRefreshSec ?? 0,
          autoSave:
            prev?.spreadsheetId === meta.spreadsheetId
              ? prev.autoSave ?? autoSaveEnabled
              : autoSaveEnabled,
        }));

        setSyncBannerMsg(bannerText);
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
      async (authedUser, token) => {
        setUser(authedUser);
        setNeedsAuth(false);

        if (!hasAutoReconnectedRef.current) {
          hasAutoReconnectedRef.current = true;
          const savedPref = loadSheetPref();
          if (savedPref?.spreadsheetId) {
            await connectToSpreadsheet(
              savedPref.spreadsheetId,
              savedPref.selectedSheetTitle,
              {
                autoRefreshOverride: savedPref.autoRefreshSec,
                pullFromSheet: !hasDirtyLocalEdits(),
              }
            );
          } else {
            const discovered = await findLatestBudgetSpreadsheet(token);
            if (discovered?.id) {
              await connectToSpreadsheet(discovered.id, undefined, {
                pullFromSheet: !hasDirtyLocalEdits(),
              });
            }
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

  // Automatic debounced save to Google Sheets when data changes
  useEffect(() => {
    if (!sheetConn || !(sheetConn.autoSave ?? true) || needsAuth) return;
    if (isSyncing || isConfirmLoading) return;
    if (lastSyncedSnapshotRef.current === syncPayloadKey && !hasDirtyLocalEdits()) return;

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      let token = getAccessToken();
      if (!token) {
        token = await refreshAccessTokenSilently();
      }
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      const snapshotToSave = syncPayloadKeyRef.current;
      const latestState = stateRef.current;
      setIsAutoSaving(true);
      setSyncError(null);

      try {
        const updatedSheets = await writeBudgetStateToTabs(
          token,
          sheetConn.spreadsheetId,
          sheetConn.selectedSheetTitle,
          latestState,
          true,
          sheetConn.sheets.map((s) => s.title)
        );
        lastSyncedSnapshotRef.current = snapshotToSave;
        setDirtyLocalEdits(false);
        const nowTime = formatSyncTimestamp();
        setSheetConn((prev) =>
          prev
            ? {
                ...prev,
                sheets: updatedSheets || prev.sheets,
                lastSyncedAt: nowTime,
              }
            : prev
        );
      } catch (err: any) {
        if (err instanceof AuthExpiredError) {
          clearCachedToken();
          const renewed = await refreshAccessTokenSilently();
          if (renewed) {
            try {
              const updatedSheets = await writeBudgetStateToTabs(
                renewed,
                sheetConn.spreadsheetId,
                sheetConn.selectedSheetTitle,
                stateRef.current,
                true,
                sheetConn.sheets.map((s) => s.title)
              );
              lastSyncedSnapshotRef.current = syncPayloadKeyRef.current;
              setDirtyLocalEdits(false);
              const nowTime = formatSyncTimestamp();
              setSheetConn((prev) =>
                prev
                  ? {
                      ...prev,
                      sheets: updatedSheets || prev.sheets,
                      lastSyncedAt: nowTime,
                    }
                  : prev
              );
              return;
            } catch {
              setNeedsAuth(true);
              return;
            }
          }
          setNeedsAuth(true);
        } else {
          setSyncError(
            err?.message || 'บันทึกข้อมูลอัตโนมัติเข้า Google Sheets ไม่สำเร็จ'
          );
        }
      } finally {
        setIsAutoSaving(false);
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [syncPayloadKey, sheetConn, needsAuth, isSyncing, isConfirmLoading]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setSyncError(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setNeedsAuth(false);

      // Reconnect saved Google Sheet preference automatically (or discover existing sheet on new device)
      const savedPref = loadSheetPref();
      if (savedPref?.spreadsheetId) {
        hasAutoReconnectedRef.current = true;
        await connectToSpreadsheet(
          savedPref.spreadsheetId,
          savedPref.selectedSheetTitle,
          {
            autoRefreshOverride: savedPref.autoRefreshSec,
            pullFromSheet: !hasDirtyLocalEdits(),
          }
        );
      } else {
        const discovered = await findLatestBudgetSpreadsheet(result.accessToken);
        if (discovered?.id) {
          hasAutoReconnectedRef.current = true;
          await connectToSpreadsheet(discovered.id, undefined, {
            pullFromSheet: !hasDirtyLocalEdits(),
          });
        }
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
        await connectToSpreadsheet(file.id, undefined, { pullFromSheet: true });
      },
      (msg) => {
        setSyncError(msg);
      }
    );
  };

  const handleConnectById = async (spreadsheetId: string) => {
    await connectToSpreadsheet(spreadsheetId, undefined, { pullFromSheet: true });
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
    subCategory?: EssentialSubcategory;
    paid: boolean;
    applyFutureMonths: boolean;
    recurringStartMonth: string;
    recurringEndMonth: string;
    recurringMonths: number;
  }) => {
    setState((prev) => {
      const m = prev.activeMonth;
      const startMonth = data.recurringStartMonth || m;
      const activeIdx = prev.months.indexOf(m);
      const startIdxInPrev = prev.months.indexOf(startMonth);
      const rangeStartIdx =
        activeIdx >= 0 && startIdxInPrev >= 0
          ? Math.min(activeIdx, startIdxInPrev)
          : activeIdx >= 0
          ? activeIdx
          : 0;

      const futureSeq = buildFutureMonthSequence(
        prev.months,
        startMonth,
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
          if (data.applyFutureMonths) {
            prev.months.forEach((mon, idx) => {
              if (idx >= rangeStartIdx) {
                const seqIdx = futureSeq.findIndex((item) => item.month === mon);
                if (seqIdx < 0) {
                  nextAmounts[mon] = 0;
                } else if (!data.recurringEndMonth) {
                  nextAmounts[mon] = data.amount;
                } else {
                  nextAmounts[mon] =
                    endIdxInSeq >= 0 && seqIdx <= endIdxInSeq ? data.amount : 0;
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
            subCategory:
              data.category === 'ค่าใช้จ่ายจำเป็น (40%)'
                ? data.subCategory
                : undefined,
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
    subCategory?: EssentialSubcategory;
    recurring: boolean;
    recurringStartMonth: string;
    recurringEndMonth: string;
    recurringMonths: number;
    paid: boolean;
  }) => {
    setState((prev) => {
      const startMonth = data.recurring
        ? data.recurringStartMonth || prev.activeMonth
        : prev.activeMonth;
      const futureSeq = buildFutureMonthSequence(
        prev.months,
        startMonth,
        Math.max(36, (data.recurringMonths || 12) + 6)
      );
      const endIdxInSeq = data.recurringEndMonth
        ? futureSeq.findIndex((item) => item.month === data.recurringEndMonth)
        : -1;

      const amounts: Record<string, number> = {};
      prev.months.forEach((mon) => {
        if (!data.recurring) {
          amounts[mon] = mon === prev.activeMonth ? data.amount : 0;
          return;
        }
        const seqIdx = futureSeq.findIndex((item) => item.month === mon);
        if (seqIdx < 0) {
          amounts[mon] = 0;
        } else if (!data.recurringEndMonth) {
          amounts[mon] = data.amount;
        } else {
          amounts[mon] =
            endIdxInSeq >= 0 && seqIdx <= endIdxInSeq ? data.amount : 0;
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
            subCategory:
              data.category === 'ค่าใช้จ่ายจำเป็น (40%)'
                ? data.subCategory
                : undefined,
            amounts,
            paid: { [startMonth]: data.paid },
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
        const nowTime = formatSyncTimestamp();
        lastSyncedSnapshotRef.current = syncPayloadKeyRef.current;
        setDirtyLocalEdits(false);
        setSheetConn({
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.title,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheets: meta.sheets,
          selectedSheetTitle: meta.sheets[0]?.title || 'รายจ่าย-40-30-20-10',
          detectedFormat: 'matrix',
          lastSyncedAt: nowTime,
          autoRefreshSec: 0,
          autoSave: true,
        });
        setSyncBannerMsg(
          `สร้าง Google Sheet "${meta.title}" และบันทึกข้อมูลเข้าไฟล์เรียบร้อยแล้ว (เปิดบันทึกอัตโนมัติไว้ให้)`
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

        lastSyncedSnapshotRef.current = syncPayloadKeyRef.current;
        setDirtyLocalEdits(false);
        const nowTime = formatSyncTimestamp();
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
                    {savedSheetPref.lastSyncedAt && (
                      <span className="text-slate-500 font-sans whitespace-nowrap">
                        · บันทึกล่าสุด {savedSheetPref.lastSyncedAt}
                      </span>
                    )}
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
                  disabled={isSyncing || isAutoSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006A63] hover:bg-[#004D48] text-white text-xs font-heading font-semibold whitespace-nowrap transition disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>
                    {isSyncing || isAutoSaving
                      ? 'กำลังบันทึก...'
                      : 'บันทึกข้อมูลเข้า Google Sheet'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    connectToSpreadsheet(
                      sheetConn.spreadsheetId,
                      sheetConn.selectedSheetTitle,
                      { pullFromSheet: true }
                    )
                  }
                  disabled={isSyncing || isAutoSaving}
                  title="ดึงข้อมูลล่าสุดจาก Google Sheet มาอัปเดตในเครื่องนี้"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-heading font-medium text-slate-700 whitespace-nowrap transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>ดึงข้อมูลล่าสุด</span>
                </button>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-heading text-slate-700 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={sheetConn.autoSave ?? true}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setSheetConn((prev) =>
                        prev ? { ...prev, autoSave: enabled } : prev
                      );
                    }}
                    className="w-3.5 h-3.5 accent-[#006A63] rounded"
                  />
                  <span>บันทึกอัตโนมัติ</span>
                </label>

                {isAutoSaving ? (
                  <span className="text-xs font-heading text-[#006A63] whitespace-nowrap">
                    กำลังบันทึกอัตโนมัติ...
                  </span>
                ) : (
                  sheetConn.lastSyncedAt && (
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      บันทึกล่าสุด {sheetConn.lastSyncedAt}
                    </span>
                  )
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
            onSelectMonth={handleMonthChange}
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
        onSelectTab={async (tabTitle) => {
          if (sheetConn) {
            await connectToSpreadsheet(sheetConn.spreadsheetId, tabTitle, {
              pullFromSheet: true,
            });
          }
        }}
        onPullFromSheet={async () => {
          if (sheetConn) {
            await connectToSpreadsheet(
              sheetConn.spreadsheetId,
              sheetConn.selectedSheetTitle,
              { pullFromSheet: true }
            );
            setIsSheetsModalOpen(false);
          }
        }}
        onRequestCreateTemplate={() => setConfirmAction({ type: 'create-sheet' })}
        onToggleAutoSave={(enabled) => {
          setSheetConn((prev) => (prev ? { ...prev, autoSave: enabled } : prev));
        }}
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
