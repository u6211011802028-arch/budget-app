export type BudgetCategory =
  | 'ค่าใช้จ่ายจำเป็น (40%)'
  | 'สร้างความมั่งคั่ง (30%)'
  | 'ความต้องการส่วนตัว (20%)'
  | 'บริจาค / การกุศล (10%)'
  | 'ภาระผ่อนหนี้ (30%)'
  | 'เงินออม + ลงทุน (20%)'
  | 'เงินใช้ส่วนตัว (10%)';

export interface ExtraIncomeItem {
  name: string;
  amount: number;
}

export interface MonthIncome {
  salary: number;
  side: number;
  extras: ExtraIncomeItem[];
}

export interface ExpenseItem {
  id: number;
  name: string;
  note: string;
  category: BudgetCategory;
  amounts: Record<string, number>;
  paid: Record<string, boolean>;
}

export type ActiveTab = 'dashboard' | 'transactions' | 'projection';

export interface TargetPercentages {
  essential: number;
  debt: number;
  savings: number;
  personal: number;
}

export interface BudgetState {
  months: string[];
  activeMonth: string;
  activeTab: ActiveTab;
  incomes: Record<string, MonthIncome>;
  expenses: ExpenseItem[];
  targetPercentages?: TargetPercentages;
}

export interface MonthExpenseView extends ExpenseItem {
  amount: number;
  isPaid: boolean;
}

export interface DebtPriorityItem {
  rank: number;
  name: string;
  monthlyPayment: number;
  type: string;
  urgency: string;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal' | 'positive';
  strategy: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SheetConnection {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
  selectedSheetTitle: string;
  detectedFormat: 'matrix' | 'transactions';
  lastSyncedAt: string | null;
  autoRefreshSec: number; // 0 = manual, 15, 30, 60
}
