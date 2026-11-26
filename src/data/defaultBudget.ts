import {
  BudgetCategory,
  BudgetState,
  DebtPriorityItem,
  MonthExpenseView,
  TargetPercentages,
} from '../types/budget';

export const STORAGE_KEY = 'thai_budget_40_30_20_10_v3';

export const DEFAULT_TARGET_PERCENTAGES: TargetPercentages = {
  essential: 40,
  debt: 30,
  savings: 20,
  personal: 10,
};

export function resolveTargetPercentages(
  tp?: Partial<TargetPercentages> | null
): TargetPercentages {
  const pick = (val: unknown, fallback: number) => {
    const n = Number(val);
    return typeof val === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
      ? Math.round(n * 10) / 10
      : fallback;
  };
  return {
    essential: pick(tp?.essential, DEFAULT_TARGET_PERCENTAGES.essential),
    debt: pick(tp?.debt, DEFAULT_TARGET_PERCENTAGES.debt),
    savings: pick(tp?.savings, DEFAULT_TARGET_PERCENTAGES.savings),
    personal: pick(tp?.personal, DEFAULT_TARGET_PERCENTAGES.personal),
  };
}

export const BUDGET_CATEGORIES: {
  key: keyof TargetPercentages;
  name: BudgetCategory;
  displayLabel: string;
  shortPrefix: string;
  shortName: string;
  targetPct: number;
  isSavings: boolean;
  color: string;
}[] = [
  {
    key: 'essential',
    name: 'ค่าใช้จ่ายจำเป็น (40%)',
    displayLabel: 'ค่าใช้จ่ายจำเป็น',
    shortPrefix: 'จำเป็น',
    shortName: 'จำเป็น (40%)',
    targetPct: 0.4,
    isSavings: false,
    color: '#006A63',
  },
  {
    key: 'debt',
    name: 'ภาระผ่อนหนี้ (30%)',
    displayLabel: 'ภาระผ่อนหนี้',
    shortPrefix: 'ผ่อนหนี้',
    shortName: 'ผ่อนหนี้ (30%)',
    targetPct: 0.3,
    isSavings: false,
    color: '#EA580C',
  },
  {
    key: 'savings',
    name: 'เงินออม + ลงทุน (20%)',
    displayLabel: 'เงินออม + ลงทุน',
    shortPrefix: 'ออม+ลงทุน',
    shortName: 'ออม+ลงทุน (20%)',
    targetPct: 0.2,
    isSavings: true,
    color: '#0284C7',
  },
  {
    key: 'personal',
    name: 'เงินใช้ส่วนตัว (10%)',
    displayLabel: 'เงินใช้ส่วนตัว',
    shortPrefix: 'ส่วนตัว',
    shortName: 'ส่วนตัว (10%)',
    targetPct: 0.1,
    isSavings: false,
    color: '#D97706',
  },
];

export const EXPENSE_CATEGORY_OPTIONS: {
  name: BudgetCategory;
  label: string;
}[] = [
  { name: 'ค่าใช้จ่ายจำเป็น (40%)', label: 'ค่าใช้จ่ายจำเป็น (40%)' },
  { name: 'ภาระผ่อนหนี้ (30%)', label: 'ภาระผ่อนหนี้ (30%)' },
  { name: 'เงินออม + ลงทุน (20%)', label: 'เงินออม + ลงทุน (20%)' },
  { name: 'เงินใช้ส่วนตัว (10%)', label: 'เงินใช้ส่วนตัว (10%)' },
];

export const DEFAULT_BUDGET_STATE: BudgetState = {
  months: ['พ.ย. 69', 'ธ.ค. 69', 'ม.ค. 70', 'ก.พ. 70', 'มี.ค. 70', 'เม.ย. 70'],
  activeMonth: 'พ.ย. 69',
  activeTab: 'dashboard',
  targetPercentages: { ...DEFAULT_TARGET_PERCENTAGES },
  incomes: {
    'พ.ย. 69': { salary: 21000, salary29: 0, side: 0, extras: [], socialSecurity: 0, providentFund: 0 },
    'ธ.ค. 69': { salary: 21000, salary29: 0, side: 0, extras: [], socialSecurity: 0, providentFund: 0 },
    'ม.ค. 70': { salary: 21000, salary29: 0, side: 0, extras: [], socialSecurity: 0, providentFund: 0 },
    'ก.พ. 70': { salary: 21000, salary29: 0, side: 0, extras: [], socialSecurity: 0, providentFund: 0 },
    'มี.ค. 70': { salary: 21000, salary29: 0, side: 0, extras: [], socialSecurity: 0, providentFund: 0 },
    'เม.ย. 70': { salary: 21000, salary29: 0, side: 0, extras: [], socialSecurity: 0, providentFund: 0 },
  },
  expenses: [
    {
      id: 1,
      name: 'กู้ชอปปี้600',
      note: 'วันที่ 29',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 600, 'ธ.ค. 69': 600, 'ม.ค. 70': 0, 'ก.พ. 70': 0, 'มี.ค. 70': 0, 'เม.ย. 70': 0 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 2,
      name: 'เน็ตบ้าน',
      note: '-',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 631.3, 'ธ.ค. 69': 631.3, 'ม.ค. 70': 631.3, 'ก.พ. 70': 631.3, 'มี.ค. 70': 631.3, 'เม.ย. 70': 631.3 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 3,
      name: 'เน็ตมือถือ',
      note: '-',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 533.93, 'ธ.ค. 69': 533.93, 'ม.ค. 70': 533.93, 'ก.พ. 70': 533.93, 'มี.ค. 70': 533.93, 'เม.ย. 70': 533.93 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 4,
      name: 'เน็ตฟิต',
      note: 'วันที่ 17',
      category: 'เงินใช้ส่วนตัว (10%)',
      amounts: { 'พ.ย. 69': 105, 'ธ.ค. 69': 105, 'ม.ค. 70': 105, 'ก.พ. 70': 105, 'มี.ค. 70': 105, 'เม.ย. 70': 105 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 5,
      name: 'บัตรเซ็นทรัล1',
      note: 'วันที่ 15-4',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 1666.67, 'ธ.ค. 69': 1666.67, 'ม.ค. 70': 0, 'ก.พ. 70': 0, 'มี.ค. 70': 0, 'เม.ย. 70': 0 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 6,
      name: 'ชอปปี้',
      note: 'วันที่ 29',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 5000, 'ธ.ค. 69': 4078.38, 'ม.ค. 70': 3442.42, 'ก.พ. 70': 2959.88, 'มี.ค. 70': 1067.75, 'เม.ย. 70': 0 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 7,
      name: 'บัตรเซ็นทรัล2',
      note: 'วันที่ 18-8',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 300, 'ธ.ค. 69': 300, 'ม.ค. 70': 300, 'ก.พ. 70': 300, 'มี.ค. 70': 300, 'เม.ย. 70': 300 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 8,
      name: 'ค่าน้ำบ้านนนทบุรี',
      note: '-',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 36, 'ธ.ค. 69': 91, 'ม.ค. 70': 91, 'ก.พ. 70': 91, 'มี.ค. 70': 91, 'เม.ย. 70': 91 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 9,
      name: 'ค่าน้ำบ้านตลิ่งชัน',
      note: 'วันที่ 16-25',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 588, 'ธ.ค. 69': 588, 'ม.ค. 70': 588, 'ก.พ. 70': 588, 'มี.ค. 70': 588, 'เม.ย. 70': 588 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 10,
      name: 'ผ่อนรถ',
      note: 'วันที่ 10-25',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 5196, 'ธ.ค. 69': 5196, 'ม.ค. 70': 5196, 'ก.พ. 70': 5196, 'มี.ค. 70': 5196, 'เม.ย. 70': 5196 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 11,
      name: 'Google ไดฟ์',
      note: '-',
      category: 'เงินใช้ส่วนตัว (10%)',
      amounts: { 'พ.ย. 69': 189, 'ธ.ค. 69': 189, 'ม.ค. 70': 189, 'ก.พ. 70': 189, 'มี.ค. 70': 189, 'เม.ย. 70': 189 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 12,
      name: 'ค่าไฟนนทบุรี',
      note: 'วันที่ 23',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 361.33, 'ธ.ค. 69': 361.33, 'ม.ค. 70': 361.33, 'ก.พ. 70': 361.33, 'มี.ค. 70': 361.33, 'เม.ย. 70': 361.33 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 13,
      name: 'ค่าไฟตลิ่งชัน',
      note: 'จ่าย 14',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 2459, 'ธ.ค. 69': 2459, 'ม.ค. 70': 2459, 'ก.พ. 70': 2459, 'มี.ค. 70': 2459, 'เม.ย. 70': 2459 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 14,
      name: 'บัตรกสิกร1',
      note: 'วันที่ 10-25',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 100, 'ธ.ค. 69': 100, 'ม.ค. 70': 100, 'ก.พ. 70': 100, 'มี.ค. 70': 100, 'เม.ย. 70': 100 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 15,
      name: 'บัตรKTC',
      note: 'วันที่ 4-16',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 2400, 'ธ.ค. 69': 2400, 'ม.ค. 70': 2400, 'ก.พ. 70': 2400, 'มี.ค. 70': 2400, 'เม.ย. 70': 2400 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 16,
      name: 'บัตรบรูการ์ด',
      note: 'วันที่ 10-25',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 600, 'ธ.ค. 69': 600, 'ม.ค. 70': 600, 'ก.พ. 70': 600, 'มี.ค. 70': 600, 'เม.ย. 70': 600 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 17,
      name: 'บัตรกสิกร2',
      note: 'วันที่ 10-25',
      category: 'ภาระผ่อนหนี้ (30%)',
      amounts: { 'พ.ย. 69': 3100, 'ธ.ค. 69': 3100, 'ม.ค. 70': 3100, 'ก.พ. 70': 3100, 'มี.ค. 70': 3100, 'เม.ย. 70': 3100 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 18,
      name: 'ออม',
      note: 'วันที่ 5',
      category: 'เงินออม + ลงทุน (20%)',
      amounts: { 'พ.ย. 69': 500, 'ธ.ค. 69': 500, 'ม.ค. 70': 500, 'ก.พ. 70': 500, 'มี.ค. 70': 500, 'เม.ย. 70': 500 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 19,
      name: 'ค่าซ่อมแซมก๊อกน้ำและท่อประปา',
      note: '19/11/2026 (ซ่อมท่อน้ำรั่ว)',
      category: 'ค่าใช้จ่ายจำเป็น (40%)',
      amounts: { 'พ.ย. 69': 350, 'ธ.ค. 69': 0, 'ม.ค. 70': 0, 'ก.พ. 70': 0, 'มี.ค. 70': 0, 'เม.ย. 70': 0 },
      paid: { 'พ.ย. 69': true },
    },
    {
      id: 20,
      name: 'ค่าของขวัญวันเกิดเพื่อนร่วมงาน',
      note: '2/12/2026 (ของขวัญ+แชร์เค้ก)',
      category: 'เงินใช้ส่วนตัว (10%)',
      amounts: { 'พ.ย. 69': 200, 'ธ.ค. 69': 0, 'ม.ค. 70': 0, 'ก.พ. 70': 0, 'มี.ค. 70': 0, 'เม.ย. 70': 0 },
      paid: { 'พ.ย. 69': false },
    },
    {
      id: 21,
      name: 'ค่าน้ำมัน',
      note: 'ธ.ค. 69 (ค่าน้ำมันเดินทาง)',
      category: 'เงินใช้ส่วนตัว (10%)',
      amounts: { 'พ.ย. 69': 0, 'ธ.ค. 69': 1500, 'ม.ค. 70': 0, 'ก.พ. 70': 0, 'มี.ค. 70': 0, 'เม.ย. 70': 0 },
      paid: { 'พ.ย. 69': false },
    },
  ],
};

export const DEBT_PRIORITIES: DebtPriorityItem[] = [
  {
    rank: 1,
    name: 'กู้ชอปปี้600',
    monthlyPayment: 600,
    type: 'ดอกเบี้ยสูงรายวัน',
    urgency: 'เร่งด่วนอันดับ 1',
    urgencyLevel: 'critical',
    strategy: 'ปิดยอดเต็มจำนวนทันทีเพื่อตัดวงจรดอกเบี้ยสะสม',
  },
  {
    rank: 2,
    name: 'บัตรกสิกร1',
    monthlyPayment: 100,
    type: 'บัตรเครดิต',
    urgency: 'เร่งด่วนอันดับ 2',
    urgencyLevel: 'critical',
    strategy: 'ยอดคงค้างน้อย ปิดจบได้ทันที ลดจำนวนบัญชีหนี้',
  },
  {
    rank: 3,
    name: 'บัตรเซ็นทรัล2',
    monthlyPayment: 300,
    type: 'บัตรเครดิต',
    urgency: 'เร่งด่วนอันดับ 3',
    urgencyLevel: 'medium',
    strategy: 'ปิดยอดในรอบบิลถัดไป สร้างความสำเร็จตามวิธี Snowball',
  },
  {
    rank: 4,
    name: 'บัตรบรูการ์ด',
    monthlyPayment: 600,
    type: 'สินเชื่อ/บัตรกดเงินสด',
    urgency: 'ปานกลาง',
    urgencyLevel: 'medium',
    strategy: 'เร่งปิดยอดเพื่อลดค่าธรรมเนียมและดอกเบี้ย',
  },
  {
    rank: 5,
    name: 'บัตรเซ็นทรัล1',
    monthlyPayment: 1666.67,
    type: 'บัตรเครดิตผ่อนสินค้า',
    urgency: 'เฝ้าระวังปกติ',
    urgencyLevel: 'normal',
    strategy: 'ผ่อนชำระตรงเวลา หมดงวดใน ธ.ค. 69 คืนสภาพคล่อง 1,666.67 บาท',
  },
  {
    rank: 6,
    name: 'บัตรKTC',
    monthlyPayment: 2400,
    type: 'บัตรเครดิต',
    urgency: 'เฝ้าระวังปกติ',
    urgencyLevel: 'normal',
    strategy: 'ชำระตรงเวลาเพื่อรักษาประวัติเครดิตบูโรที่ดี',
  },
  {
    rank: 7,
    name: 'บัตรกสิกร2',
    monthlyPayment: 3100,
    type: 'บัตรเครดิต',
    urgency: 'สำคัญสูง',
    urgencyLevel: 'high',
    strategy: 'ยอดคงค้าง 3,100 บาท งดรูดเพิ่มเด็ดขาด และเร่งตัดเงินต้น',
  },
  {
    rank: 8,
    name: 'ชอปปี้ (SPayLater)',
    monthlyPayment: 5000,
    type: 'สินเชื่อผ่อนชำระ',
    urgency: 'ทยอยลดลง',
    urgencyLevel: 'positive',
    strategy: 'ยอดผ่อนลดลงทุกเดือนจนหมดใน เม.ย. 70',
  },
  {
    rank: 9,
    name: 'ผ่อนรถ',
    monthlyPayment: 5196,
    type: 'สินเชื่อเช่าซื้อ',
    urgency: 'ภาระคงที่',
    urgencyLevel: 'normal',
    strategy: 'จ่ายตรงกำหนดทุกวันที่ 10-25',
  },
];

export const RECOVERY_ROADMAP = [
  {
    step: '01',
    title: 'ปิดหนี้ก้อนเล็กทันที (Snowball Method)',
    desc: 'ปิดกู้ชอปปี้ (600), บัตรกสิกร1 (100), เซ็นทรัล2 (300) → เพิ่มสภาพคล่อง +1,000 บาท/เดือน',
    highlight: true,
  },
  {
    step: '02',
    title: 'สิ้นสุดงวดผ่อนบัตรเซ็นทรัล1 (ธ.ค. 69)',
    desc: 'ค่างวดผ่อนสินค้า 1,666.67 บาท หมดลงหลัง ธ.ค. 69 → คืนสภาพคล่อง +1,666.67 บาท/เดือน',
    highlight: false,
  },
  {
    step: '03',
    title: 'ค่างวดชอปปี้ (SPayLater) ลดลงจนหมดใน เม.ย. 70',
    desc: 'ยอดผ่อนทยอยลดจาก 5,000 จนเป็น 0 ใน เม.ย. 70 → กระแสเงินสดพลิกบวก +3,845 บาท',
    highlight: false,
  },
  {
    step: '04',
    title: 'รักษาวินัยค่าใช้จ่ายจำเป็น & ส่วนตัว',
    desc: 'คุมค่าใช้จ่ายจำเป็นให้คงที่ ~4,664 บาท และงดสร้างหนี้ใหม่ต่อเนื่อง',
    highlight: false,
  },
];

export function fmt(num: number): string {
  const val = Number(num) || 0;
  return val.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtCompact(num: number): string {
  const val = Number(num) || 0;
  return val.toLocaleString('th-TH', {
    maximumFractionDigits: 0,
  });
}

export function getMonthIncome(state: BudgetState, month: string) {
  const inc = state.incomes[month] || {
    salary: 0,
    salary29: 0,
    side: 0,
    extras: [],
    socialSecurity: 0,
    providentFund: 0,
  };
  const extras = Array.isArray(inc.extras) ? inc.extras : [];
  const extrasTotal = extras.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const salary = Number(inc.salary) || 0;
  const salary29 = Number(inc.salary29) || 0;
  const salaryTotal = salary + salary29;
  const side = Number(inc.side) || 0;
  const grossTotal = salaryTotal + side + extrasTotal;
  const socialSecurity = Math.max(0, Number(inc.socialSecurity) || 0);
  const providentFund = Math.max(0, Number(inc.providentFund) || 0);
  const deductionsTotal = socialSecurity + providentFund;
  return {
    salary,
    salary29,
    salaryTotal,
    side,
    extras,
    extrasTotal,
    grossTotal,
    socialSecurity,
    providentFund,
    deductionsTotal,
    total: grossTotal - deductionsTotal,
  };
}

export function getMonthExpenses(state: BudgetState, month: string): MonthExpenseView[] {
  return state.expenses
    .map((exp) => ({
      ...exp,
      amount: Number(exp.amounts?.[month]) || 0,
      isPaid: !!(exp.paid && exp.paid[month]),
    }))
    .filter((exp) => exp.amount > 0);
}

export function suggestNextThaiMonth(months: string[]): string {
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const last = months[months.length - 1] || 'เม.ย. 70';
  const parts = last.trim().split(/\s+/);
  if (parts.length === 2) {
    const idx = thaiMonths.indexOf(parts[0]);
    const yr = parseInt(parts[1], 10);
    if (idx !== -1 && !isNaN(yr)) {
      if (idx === 11) return `${thaiMonths[0]} ${yr + 1}`;
      return `${thaiMonths[idx + 1]} ${yr}`;
    }
  }
  return '';
}

export function buildFutureMonthSequence(
  months: string[],
  activeMonth: string,
  extraFutureCount = 12
): { month: string; isExisting: boolean; countFromActive: number }[] {
  const startIdx = Math.max(0, months.indexOf(activeMonth));
  const existingFromActive = months.slice(startIdx);
  const result: { month: string; isExisting: boolean; countFromActive: number }[] =
    existingFromActive.map((m, idx) => ({
      month: m,
      isExisting: true,
      countFromActive: idx + 1,
    }));

  const workingMonths = [...months];
  for (let i = 0; i < extraFutureCount; i++) {
    const next = suggestNextThaiMonth(workingMonths);
    if (!next || workingMonths.includes(next)) break;
    workingMonths.push(next);
    result.push({
      month: next,
      isExisting: false,
      countFromActive: result.length + 1,
    });
  }

  return result;
}
