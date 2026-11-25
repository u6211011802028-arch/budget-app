import {
  BudgetCategory,
  BudgetState,
  ExpenseItem,
  ExtraIncomeItem,
  MonthIncome,
  SheetTabInfo,
} from '../types/budget';
import { BUDGET_CATEGORIES } from '../data/defaultBudget';

export class AuthExpiredError extends Error {
  constructor(message = 'สิทธิ์การใช้งาน Google หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function googleFetch(url: string, accessToken: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new AuthExpiredError();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || `Google API Error (${res.status})`;
    throw new Error(errMsg);
  }
  return data;
}

export async function fetchSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'สเปรดชีตไม่มีชื่อ',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

export async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<string[][]> {
  const safeRange = `'${sheetTitle.replace(/'/g, "''")}'!A1:ZZ2000`;
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(safeRange)}?valueRenderOption=FORMATTED_VALUE`,
    accessToken
  );
  return Array.isArray(data.values) ? data.values : [];
}

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_FULL_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const ENG_SHORT_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

function toThaiShortYear(year: number): number {
  if (year >= 2400) return year % 100; // BE 2569 -> 69
  if (year >= 1900) return (year + 543) % 100; // AD 2026 -> 69
  return year;
}

export function normalizeMonthLabel(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  // Already Thai short month + 2-digit year e.g. "พ.ย. 69" or "พ.ย.69"
  for (let i = 0; i < THAI_SHORT_MONTHS.length; i++) {
    const m = THAI_SHORT_MONTHS[i];
    const mNoDot = m.replace(/\./g, '');
    const regex = new RegExp(`^(${m.replace(/\./g, '\\.')}|${mNoDot})\\s*(\\d{2,4})?$`, 'i');
    const match = s.match(regex);
    if (match) {
      const yr = match[2] ? toThaiShortYear(parseInt(match[2], 10)) : toThaiShortYear(new Date().getFullYear());
      return `${m} ${yr}`;
    }
  }

  // Full Thai month name e.g. "พฤศจิกายน 2569"
  for (let i = 0; i < THAI_FULL_MONTHS.length; i++) {
    if (s.includes(THAI_FULL_MONTHS[i])) {
      const yrMatch = s.match(/(\d{2,4})/);
      const yr = yrMatch ? toThaiShortYear(parseInt(yrMatch[1], 10)) : toThaiShortYear(new Date().getFullYear());
      return `${THAI_SHORT_MONTHS[i]} ${yr}`;
    }
  }

  // Date like DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const monthIdx = parseInt(dmy[2], 10) - 1;
    let yr = parseInt(dmy[3], 10);
    if (yr < 100) yr += 2000;
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${THAI_SHORT_MONTHS[monthIdx]} ${toThaiShortYear(yr)}`;
    }
  }

  // ISO YYYY-MM-DD or YYYY-MM
  const ymd = s.match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?$/);
  if (ymd) {
    const yr = parseInt(ymd[1], 10);
    const monthIdx = parseInt(ymd[2], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${THAI_SHORT_MONTHS[monthIdx]} ${toThaiShortYear(yr)}`;
    }
  }

  // English month e.g. "Nov 2026"
  const lower = s.toLowerCase();
  for (let i = 0; i < ENG_SHORT_MONTHS.length; i++) {
    if (lower.includes(ENG_SHORT_MONTHS[i])) {
      const yrMatch = s.match(/(\d{2,4})/);
      const yr = yrMatch ? toThaiShortYear(parseInt(yrMatch[1], 10)) : toThaiShortYear(new Date().getFullYear());
      return `${THAI_SHORT_MONTHS[i]} ${yr}`;
    }
  }

  return null;
}

function parseNumericCell(raw: string | number | undefined): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const cleaned = String(raw || '')
    .replace(/[฿,\sบาท]/gi, '')
    .trim();
  if (!cleaned || cleaned === '-') return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function mapCategory(rawCategory: string, itemName = ''): BudgetCategory {
  const combined = `${rawCategory} ${itemName}`.toLowerCase();
  if (
    combined.includes('บริจาค') ||
    combined.includes('การกุศล') ||
    combined.includes('ทำบุญ') ||
    combined.includes('มูลนิธิ') ||
    combined.includes('charity') ||
    combined.includes('donat') ||
    combined.includes('giving')
  ) {
    return 'บริจาค / การกุศล (10%)';
  }
  if (
    combined.includes('สร้างความมั่งคั่ง') ||
    combined.includes('มั่งคั่ง') ||
    combined.includes('wealth') ||
    combined.includes('ออม') ||
    combined.includes('ลงทุน') ||
    combined.includes('กองทุน') ||
    combined.includes('หุ้น') ||
    combined.includes('saving') ||
    combined.includes('invest')
  ) {
    return combined.includes('20%') ? 'เงินออม + ลงทุน (20%)' : 'สร้างความมั่งคั่ง (30%)';
  }
  if (
    combined.includes('ความต้องการส่วนตัว') ||
    combined.includes('ไลฟ์สไตล์') ||
    combined.includes('want') ||
    combined.includes('ส่วนตัว') ||
    combined.includes('บันเทิง') ||
    combined.includes('ของขวัญ') ||
    combined.includes('ท่องเที่ยว') ||
    combined.includes('เน็ตฟิต') ||
    combined.includes('personal')
  ) {
    return combined.includes('10%') ? 'เงินใช้ส่วนตัว (10%)' : 'ความต้องการส่วนตัว (20%)';
  }
  if (
    combined.includes('หนี้') ||
    combined.includes('ผ่อน') ||
    combined.includes('บัตร') ||
    combined.includes('กู้') ||
    combined.includes('debt') ||
    combined.includes('loan') ||
    combined.includes('ชอปปี้')
  ) {
    return 'ภาระผ่อนหนี้ (30%)';
  }
  if (
    combined.includes('40%') ||
    combined.includes('จำเป็น') ||
    combined.includes('essential') ||
    combined.includes('need') ||
    combined.includes('ค่าน้ำ') ||
    combined.includes('ค่าไฟ') ||
    combined.includes('เน็ต') ||
    combined.includes('ค่าเช่า') ||
    combined.includes('อาหาร') ||
    combined.includes('ซ่อม')
  ) {
    return 'ค่าใช้จ่ายจำเป็น (40%)';
  }
  return BUDGET_CATEGORIES[0].name;
}

function isTruthyPaid(val: string | undefined): boolean {
  const s = String(val || '').trim().toLowerCase();
  return (
    s === 'true' ||
    s === 'yes' ||
    s === '1' ||
    s === 'paid' ||
    s.includes('ชำระแล้ว') ||
    s.includes('จ่ายแล้ว') ||
    s === '✓' ||
    s === '✅'
  );
}

export interface ParsedSheetResult {
  state: BudgetState;
  detectedFormat: 'matrix' | 'transactions';
  rowCount: number;
}

export function parseGoogleSheetsToBudget(
  primaryRows: string[][],
  incomeTabRows: string[][] | null,
  paidTabRows: string[][] | null,
  previousState: BudgetState
): ParsedSheetResult {
  if (!primaryRows || primaryRows.length < 2) {
    throw new Error('ไม่พบข้อมูลในแผ่นงานที่เลือก (ต้องมีแถวหัวตารางอย่างน้อย 1 แถวและข้อมูล 1 แถว)');
  }

  // Find header row (first non-empty row with >= 2 columns)
  let headerRowIdx = primaryRows.findIndex(
    (r) => r.filter((c) => String(c || '').trim() !== '').length >= 2
  );
  if (headerRowIdx === -1) headerRowIdx = 0;

  const headers = primaryRows[headerRowIdx].map((h) => String(h || '').trim());
  const dataRows = primaryRows.slice(headerRowIdx + 1).filter((r) =>
    r.some((c) => String(c || '').trim() !== '')
  );

  // Detect Format A (Matrix: multiple month columns) vs Format B (Transactions log)
  const monthColumns: { colIdx: number; label: string }[] = [];
  headers.forEach((h, idx) => {
    const normalized = normalizeMonthLabel(h);
    if (normalized) {
      monthColumns.push({ colIdx: idx, label: normalized });
    }
  });

  if (monthColumns.length >= 2) {
    return parseMatrixFormat(
      headers,
      dataRows,
      monthColumns,
      incomeTabRows,
      paidTabRows,
      previousState
    );
  }

  return parseTransactionLogFormat(headers, dataRows, previousState);
}

function parseMatrixFormat(
  headers: string[],
  dataRows: string[][],
  monthColumns: { colIdx: number; label: string }[],
  incomeTabRows: string[][] | null,
  paidTabRows: string[][] | null,
  previousState: BudgetState
): ParsedSheetResult {
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const nameCol = lowerHeaders.findIndex((h) =>
    ['รายการ', 'ชื่อรายการ', 'item', 'name', 'description'].some((k) => h.includes(k))
  );
  const noteCol = lowerHeaders.findIndex((h) =>
    ['หมายเหตุ', 'ครบกำหนด', 'note', 'due'].some((k) => h.includes(k))
  );
  const catCol = lowerHeaders.findIndex((h) =>
    ['หมวด', 'category', 'กลุ่ม'].some((k) => h.includes(k))
  );
  const typeCol = lowerHeaders.findIndex((h) =>
    ['ประเภท', 'type'].some((k) => h.includes(k))
  );
  const paidCol = lowerHeaders.findIndex((h) =>
    ['สถานะ', 'จ่ายแล้ว', 'ชำระ', 'paid', 'status'].some((k) => h.includes(k))
  );

  const resolvedNameCol = nameCol >= 0 ? nameCol : 0;
  const months = monthColumns.map((mc) => mc.label);

  const incomes: Record<string, MonthIncome> = {};
  months.forEach((m) => {
    incomes[m] = { salary: 21000, side: 0, extras: [] };
  });

  // Parse optional income tab
  if (incomeTabRows && incomeTabRows.length >= 2) {
    const incHeader = incomeTabRows[0].map((h) => String(h || '').trim().toLowerCase());
    const mCol = incHeader.findIndex((h) => h.includes('เดือน') || h.includes('month'));
    const salCol = incHeader.findIndex((h) => h.includes('เงินเดือน') || h.includes('salary'));
    const sideCol = incHeader.findIndex((h) => h.includes('เสริม') || h.includes('side') || h.includes('ot'));
    const extraCol = incHeader.findIndex((h) => h.includes('พิเศษ') || h.includes('extra'));

    incomeTabRows.slice(1).forEach((row) => {
      const mLabel = normalizeMonthLabel(row[mCol >= 0 ? mCol : 0] || '');
      if (!mLabel) return;
      if (!incomes[mLabel]) incomes[mLabel] = { salary: 0, side: 0, extras: [] };
      if (salCol >= 0) incomes[mLabel].salary = parseNumericCell(row[salCol]);
      if (sideCol >= 0) incomes[mLabel].side = parseNumericCell(row[sideCol]);
      if (extraCol >= 0) {
        const extraAmt = parseNumericCell(row[extraCol]);
        if (extraAmt > 0) {
          incomes[mLabel].extras = [{ name: 'รายรับพิเศษ (จาก Sheet)', amount: extraAmt }];
        }
      }
    });
  }

  // Parse optional paid status lookup from paidTabRows (key: `${name}::${month}`)
  const paidMap: Record<string, Record<string, boolean>> = {};
  if (paidTabRows && paidTabRows.length >= 2) {
    const pHeaders = paidTabRows[0].map((h) => String(h || '').trim());
    const pMonths: { colIdx: number; label: string }[] = [];
    pHeaders.forEach((h, idx) => {
      const norm = normalizeMonthLabel(h);
      if (norm) pMonths.push({ colIdx: idx, label: norm });
    });
    paidTabRows.slice(1).forEach((row) => {
      const itemName = String(row[0] || '').trim();
      if (!itemName) return;
      if (!paidMap[itemName]) paidMap[itemName] = {};
      pMonths.forEach((pm) => {
        paidMap[itemName][pm.label] = isTruthyPaid(row[pm.colIdx]);
      });
    });
  }

  const expenses: ExpenseItem[] = [];
  let nextId = 1;
  let sawIncomeRowInMainSheet = false;

  dataRows.forEach((row) => {
    const itemName = String(row[resolvedNameCol] || '').trim();
    if (!itemName) return;
    const lowerName = itemName.toLowerCase();
    // Skip summary rows
    if (
      lowerName.startsWith('รวม') ||
      lowerName.startsWith('กระแสเงินสด') ||
      lowerName === 'total'
    ) {
      return;
    }

    const rowType = typeCol >= 0 ? String(row[typeCol] || '').toLowerCase() : '';
    const isIncomeRow =
      rowType.includes('รายรับ') ||
      rowType.includes('income') ||
      lowerName.includes('เงินเดือน') ||
      lowerName.includes('รายได้เสริม') ||
      lowerName.includes('โบนัส');

    if (isIncomeRow) {
      if (!sawIncomeRowInMainSheet && !(incomeTabRows && incomeTabRows.length >= 2)) {
        // Reset default 21000 only if income rows exist directly in main sheet
        months.forEach((m) => {
          incomes[m] = { salary: 0, side: 0, extras: [] };
        });
        sawIncomeRowInMainSheet = true;
      }
      monthColumns.forEach((mc) => {
        const amt = parseNumericCell(row[mc.colIdx]);
        if (lowerName.includes('เงินเดือน') || lowerName.includes('salary')) {
          incomes[mc.label].salary += amt;
        } else if (lowerName.includes('เสริม') || lowerName.includes('ot')) {
          incomes[mc.label].side += amt;
        } else if (amt > 0) {
          incomes[mc.label].extras.push({ name: itemName, amount: amt });
        }
      });
      return;
    }

    const note = noteCol >= 0 ? String(row[noteCol] || '-').trim() || '-' : '-';
    const rawCat = catCol >= 0 ? String(row[catCol] || '').trim() : '';
    const category = mapCategory(rawCat, itemName);

    const amounts: Record<string, number> = {};
    const paid: Record<string, boolean> = {};

    const prevMatch = previousState.expenses.find((e) => e.name === itemName);
    const singlePaidCell = paidCol >= 0 ? isTruthyPaid(row[paidCol]) : false;

    monthColumns.forEach((mc) => {
      amounts[mc.label] = parseNumericCell(row[mc.colIdx]);
      if (paidMap[itemName] && typeof paidMap[itemName][mc.label] === 'boolean') {
        paid[mc.label] = paidMap[itemName][mc.label];
      } else if (paidCol >= 0) {
        paid[mc.label] = singlePaidCell;
      } else if (prevMatch?.paid && typeof prevMatch.paid[mc.label] === 'boolean') {
        paid[mc.label] = prevMatch.paid[mc.label];
      } else {
        paid[mc.label] = false;
      }
    });

    expenses.push({
      id: nextId++,
      name: itemName,
      note,
      category,
      amounts,
      paid,
    });
  });

  const activeMonth = months.includes(previousState.activeMonth)
    ? previousState.activeMonth
    : months[0] || previousState.activeMonth;

  return {
    state: {
      months,
      activeMonth,
      activeTab: previousState.activeTab,
      incomes,
      expenses,
    },
    detectedFormat: 'matrix',
    rowCount: dataRows.length,
  };
}

function parseTransactionLogFormat(
  headers: string[],
  dataRows: string[][],
  previousState: BudgetState
): ParsedSheetResult {
  const lower = headers.map((h) => h.toLowerCase());
  const dateCol = lower.findIndex((h) =>
    ['วันที่', 'เดือน', 'date', 'month'].some((k) => h.includes(k))
  );
  const nameCol = lower.findIndex((h) =>
    ['รายการ', 'รายละเอียด', 'ชื่อ', 'item', 'description', 'title', 'name'].some((k) =>
      h.includes(k)
    )
  );
  const typeCol = lower.findIndex((h) =>
    ['ประเภท', 'type', 'ชนิด'].some((k) => h.includes(k))
  );
  const catCol = lower.findIndex((h) =>
    ['หมวด', 'category', 'กลุ่ม'].some((k) => h.includes(k))
  );
  const amountCol = lower.findIndex((h) =>
    ['จำนวนเงิน', 'ยอดเงิน', 'ราคา', 'amount', 'price', 'total', 'บาท'].some((k) =>
      h.includes(k)
    )
  );
  const statusCol = lower.findIndex((h) =>
    ['สถานะ', 'ชำระ', 'จ่ายแล้ว', 'status', 'paid'].some((k) => h.includes(k))
  );
  const noteCol = lower.findIndex((h) =>
    ['หมายเหตุ', 'note', 'remark', 'ครบกำหนด'].some((k) => h.includes(k))
  );

  if (amountCol === -1 && nameCol === -1) {
    throw new Error(
      'รูปแบบตารางไม่ตรงกับข้อมูลรายรับ-รายจ่าย (ต้องมีคอลัมน์ "รายการ" และ "จำนวนเงิน" หรือคอลัมน์รายเดือน)'
    );
  }

  const resolvedNameCol = nameCol >= 0 ? nameCol : 0;
  const resolvedAmountCol = amountCol >= 0 ? amountCol : headers.length - 1;
  const fallbackMonth =
    normalizeMonthLabel(new Date().toISOString().slice(0, 7)) || 'พ.ย. 69';

  const monthsSet = new Set<string>();
  const incomes: Record<string, MonthIncome> = {};
  const expenseMap = new Map<string, ExpenseItem>();
  let nextId = 1;

  dataRows.forEach((row) => {
    const rawName = String(row[resolvedNameCol] || '').trim();
    const amount = parseNumericCell(row[resolvedAmountCol]);
    if (!rawName || amount === 0) return;

    const rawDateOrMonth = dateCol >= 0 ? String(row[dateCol] || '').trim() : '';
    const monthLabel = normalizeMonthLabel(rawDateOrMonth) || fallbackMonth;
    monthsSet.add(monthLabel);

    if (!incomes[monthLabel]) {
      incomes[monthLabel] = { salary: 0, side: 0, extras: [] };
    }

    const rawType = typeCol >= 0 ? String(row[typeCol] || '').toLowerCase() : '';
    const rawCat = catCol >= 0 ? String(row[catCol] || '').trim() : '';
    const isIncome =
      rawType.includes('รายรับ') ||
      rawType.includes('รับ') ||
      rawType.includes('income') ||
      rawCat.toLowerCase().includes('รายรับ') ||
      rawName.includes('เงินเดือน') ||
      rawName.includes('โบนัส');

    if (isIncome && !rawType.includes('รายจ่าย') && !rawType.includes('จ่าย')) {
      const lowerName = rawName.toLowerCase();
      if (lowerName.includes('เงินเดือน') || lowerName.includes('salary')) {
        incomes[monthLabel].salary += Math.abs(amount);
      } else if (lowerName.includes('เสริม') || lowerName.includes('ot')) {
        incomes[monthLabel].side += Math.abs(amount);
      } else {
        incomes[monthLabel].extras.push({ name: rawName, amount: Math.abs(amount) });
      }
      return;
    }

    const note =
      noteCol >= 0
        ? String(row[noteCol] || '-').trim() || '-'
        : rawDateOrMonth || '-';
    const category = mapCategory(rawCat, rawName);
    const isPaid = statusCol >= 0 ? isTruthyPaid(row[statusCol]) : false;

    const mapKey = `${rawName}::${category}`;
    const existing = expenseMap.get(mapKey);
    if (existing) {
      existing.amounts[monthLabel] =
        (existing.amounts[monthLabel] || 0) + Math.abs(amount);
      existing.paid[monthLabel] = existing.paid[monthLabel] || isPaid;
    } else {
      expenseMap.set(mapKey, {
        id: nextId++,
        name: rawName,
        note,
        category,
        amounts: { [monthLabel]: Math.abs(amount) },
        paid: { [monthLabel]: isPaid },
      });
    }
  });

  const months = Array.from(monthsSet);
  if (months.length === 0) months.push(fallbackMonth);

  const expenses = Array.from(expenseMap.values()).map((exp) => {
    const fullAmounts: Record<string, number> = {};
    const fullPaid: Record<string, boolean> = {};
    months.forEach((m) => {
      fullAmounts[m] = exp.amounts[m] || 0;
      fullPaid[m] = !!exp.paid[m];
    });
    return { ...exp, amounts: fullAmounts, paid: fullPaid };
  });

  months.forEach((m) => {
    if (!incomes[m]) incomes[m] = { salary: 0, side: 0, extras: [] };
  });

  const activeMonth = months.includes(previousState.activeMonth)
    ? previousState.activeMonth
    : months[months.length - 1];

  return {
    state: {
      months,
      activeMonth,
      activeTab: previousState.activeTab,
      incomes,
      expenses,
    },
    detectedFormat: 'transactions',
    rowCount: dataRows.length,
  };
}

export async function createBudgetTemplateSpreadsheet(
  accessToken: string,
  state: BudgetState
): Promise<SpreadsheetMetadata> {
  const created = await googleFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: 'แผนการเงิน 40-30-20-10 (ซิงก์อัตโนมัติ)',
          locale: 'th_TH',
        },
        sheets: [
          { properties: { title: 'รายจ่าย-40-30-20-10' } },
          { properties: { title: 'รายรับประจำเดือน' } },
          { properties: { title: 'สถานะชำระ' } },
        ],
      }),
    }
  );

  const meta: SpreadsheetMetadata = {
    spreadsheetId: created.spreadsheetId,
    title: created.properties?.title || 'แผนการเงิน 40-30-20-10',
    spreadsheetUrl: created.spreadsheetUrl,
    sheets: (created.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };

  await writeBudgetStateToTabs(accessToken, meta.spreadsheetId, 'รายจ่าย-40-30-20-10', state, true);
  return meta;
}

export async function writeBudgetStateToTabs(
  accessToken: string,
  spreadsheetId: string,
  primarySheetTitle: string,
  state: BudgetState,
  includeHelperTabs: boolean
): Promise<void> {
  const expenseHeaders = ['รายการ', 'หมายเหตุ', 'หมวดหมู่', ...state.months];
  const expenseRows = state.expenses.map((exp) => [
    exp.name,
    exp.note || '-',
    exp.category,
    ...state.months.map((m) => Number(exp.amounts[m]) || 0),
  ]);

  const dataBatch: { range: string; values: (string | number | boolean)[][] }[] = [
    {
      range: `'${primarySheetTitle.replace(/'/g, "''")}'!A1`,
      values: [expenseHeaders, ...expenseRows],
    },
  ];

  if (includeHelperTabs) {
    const incomeHeaders = ['เดือน', 'เงินเดือนหลัก', 'รายได้เสริม', 'รายรับพิเศษ'];
    const incomeRows = state.months.map((m) => {
      const inc = state.incomes[m] || { salary: 0, side: 0, extras: [] };
      const extraSum = (inc.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return [m, Number(inc.salary) || 0, Number(inc.side) || 0, extraSum];
    });

    const paidHeaders = ['รายการ', ...state.months];
    const paidRows = state.expenses.map((exp) => [
      exp.name,
      ...state.months.map((m) => (exp.paid?.[m] ? 'ชำระแล้ว' : 'รอชำระ')),
    ]);

    dataBatch.push(
      {
        range: `'รายรับประจำเดือน'!A1`,
        values: [incomeHeaders, ...incomeRows],
      },
      {
        range: `'สถานะชำระ'!A1`,
        values: [paidHeaders, ...paidRows],
      }
    );
  }

  // Clear primary sheet first so deleted items don't leave trailing ghost rows
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${primarySheetTitle.replace(/'/g, "''")}'!A1:ZZ2000`)}:clear`,
    accessToken,
    { method: 'POST', body: JSON.stringify({}) }
  );

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: dataBatch,
      }),
    }
  );
}

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

export function openGooglePicker(
  accessToken: string,
  onPicked: (file: { id: string; name: string }) => void,
  onError: (message: string) => void
): void {
  if (!window.gapi) {
    onError('กำลังโหลด Google Drive Picker กรุณารอสักครู่แล้วลองใหม่ หรือวางลิงก์ Google Sheets ด้านล่าง');
    return;
  }

  window.gapi.load('picker', {
    callback: () => {
      try {
        const pickerOrigin =
          window.location.ancestorOrigins &&
          window.location.ancestorOrigins.length > 0
            ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
            : window.location.origin;

        const docsView = new window.google.picker.DocsView(
          window.google.picker.ViewId.SPREADSHEETS
        ).setIncludeFolders(true);

        const picker = new window.google.picker.PickerBuilder()
          .addView(docsView)
          .setOAuthToken(accessToken)
          .setOrigin(pickerOrigin)
          .setCallback((data: any) => {
            if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
              const file = data.docs[0];
              onPicked({ id: file.id, name: file.name });
            }
          })
          .build();

        picker.setVisible(true);
      } catch (err: any) {
        onError(err?.message || 'ไม่สามารถเปิด Google Picker ได้ กรุณาวางลิงก์ Google Sheets แทน');
      }
    },
    onerror: () => {
      onError('โหลด Google Picker ไม่สำเร็จ กรุณาวางลิงก์ Google Sheets ด้านล่าง');
    },
  });
}
