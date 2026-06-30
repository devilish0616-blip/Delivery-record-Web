import fs from "fs";
import path from "path";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { prisma } from "../lib/prisma";
import { startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import {
  getEmployeeMonthlySalary,
  type EmployeeMonthlySalary,
  type DailySalaryDetail,
} from "./salaryService";

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: path.join(__dirname, "../assets/fonts/NotoSansTC-Regular.ttf") },
    { src: path.join(__dirname, "../assets/fonts/NotoSansTC-Bold.ttf"), fontWeight: "bold" },
  ],
});

const LOGO_BUFFER = fs.readFileSync(path.join(__dirname, "../assets/logo.png"));

const COMPANY = "旭寺物流有限公司";

const titleLabels: Record<string, string> = {
  SENIOR: "資深員工",
  STAFF: "員工",
  TEMP: "臨時工",
  CEO: "執行長",
  SPECIAL: "特殊",
};

function formatTitle(category: string, level: string | null): string {
  const label = titleLabels[category] ?? category;
  return level ? `${label}（${level === "HIGH" ? "高" : "低"}）` : label;
}

function fmt(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function truncate(text: string, max = 28): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const C = {
  border: "#d1d5db",
  headerBg: "#f3f4f6",
  netBg: "#dcfce7",
  netText: "#15803d",
  deductText: "#dc2626",
  mutedText: "#6b7280",
  bodyText: "#1f2937",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 8.5,
    color: C.bodyText,
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 30,
  },

  // ── Header ──
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logo: { width: 44, height: 44 },
  headerSpacer: { width: 44 },
  headerCenter: { flex: 1, alignItems: "center" },
  companyName: { fontSize: 17, fontWeight: "bold" },
  slipTitle: { fontSize: 11, marginTop: 3 },

  // ── Divider ──
  divider: { borderBottomWidth: 1, borderColor: C.border, marginBottom: 8 },

  // ── Section title ──
  sectionTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 4, color: C.mutedText },

  // ── Info grid (2 rows × 3 cols) ──
  infoGrid: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: C.border, marginBottom: 10 },
  infoRow: { flexDirection: "row" },
  infoCell: {
    flex: 1,
    flexDirection: "row",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  infoLabel: { fontWeight: "bold", marginRight: 4, minWidth: 40 },

  // ── Generic table ──
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: C.border, marginBottom: 10 },
  row: { flexDirection: "row" },
  th: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.headerBg,
    fontWeight: "bold",
    paddingHorizontal: 5,
    paddingVertical: 3,
    textAlign: "center",
  },
  td: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 5,
    paddingVertical: 3,
    textAlign: "right",
  },
  tdLeft: { textAlign: "left" },
  tdCenter: { textAlign: "center" },
  noRight: { borderRightWidth: 0 },
  totalRow: { backgroundColor: C.headerBg, fontWeight: "bold" },
  netRow: { backgroundColor: C.netBg },
  netText: { color: C.netText, fontWeight: "bold" },
  deductText: { color: C.deductText },

  // ── Footer ──
  footer: {
    position: "absolute",
    bottom: 16,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 7.5,
    color: C.mutedText,
    borderTopWidth: 0.5,
    borderColor: C.border,
    paddingTop: 4,
  },
});

// ─── Info Cell ──────────────────────────────────────────────────────────────

function InfoCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.infoCell, last ? s.noRight : {}]}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

// ─── Daily Table ─────────────────────────────────────────────────────────────
// Columns: 日期(14%) 正物流(14%) 逆物流(14%) 合計(14%) 單價(22%) 小計(22%)

const DC = [14, 14, 14, 14, 22, 22];

const DAILY_FONT = 7.5;
const DAILY_PAD  = 2;

function DailyTable({ rows }: { rows: DailySalaryDetail[] }) {
  if (rows.length === 0) return null;

  const totalFwd   = rows.reduce((s, r) => s + r.forwardCount, 0);
  const totalRev   = rows.reduce((s, r) => s + r.reverseCount, 0);
  const totalItems = rows.reduce((s, r) => s + r.totalCount, 0);
  const totalAmt   = rows.reduce((s, r) => s + r.subtotal, 0);

  const thD = [s.th, { fontSize: DAILY_FONT, paddingHorizontal: DAILY_PAD, paddingVertical: DAILY_PAD }] as const;
  const tdD = [s.td, { fontSize: DAILY_FONT, paddingHorizontal: DAILY_PAD, paddingVertical: DAILY_PAD }] as const;

  return (
    <View style={s.table}>
      {/* Header */}
      <View style={s.row}>
        <Text style={[...thD, { width: `${DC[0]}%` }]}>日期</Text>
        <Text style={[...thD, { width: `${DC[1]}%` }]}>正物流</Text>
        <Text style={[...thD, { width: `${DC[2]}%` }]}>逆物流</Text>
        <Text style={[...thD, { width: `${DC[3]}%` }]}>合計件數</Text>
        <Text style={[...thD, { width: `${DC[4]}%` }]}>當日單價</Text>
        <Text style={[...thD, s.noRight, { width: `${DC[5]}%` }]}>當日薪資</Text>
      </View>
      {/* Data rows */}
      {rows.map((r) => (
        <View style={s.row} key={r.date}>
          <Text style={[...tdD, s.tdCenter, { width: `${DC[0]}%` }]}>{r.date.slice(5)}</Text>
          <Text style={[...tdD, { width: `${DC[1]}%` }]}>{r.forwardCount}</Text>
          <Text style={[...tdD, { width: `${DC[2]}%` }]}>{r.reverseCount}</Text>
          <Text style={[...tdD, { width: `${DC[3]}%` }]}>{r.totalCount}</Text>
          <Text style={[...tdD, { width: `${DC[4]}%` }]}>{r.rate} 元</Text>
          <Text style={[...tdD, s.noRight, { width: `${DC[5]}%` }]}>{fmt(r.subtotal)}</Text>
        </View>
      ))}
      {/* Total row */}
      <View style={[s.row, s.totalRow]}>
        <Text style={[...tdD, s.tdLeft, { width: `${DC[0]}%` }]}>合計</Text>
        <Text style={[...tdD, { width: `${DC[1]}%` }]}>{totalFwd}</Text>
        <Text style={[...tdD, { width: `${DC[2]}%` }]}>{totalRev}</Text>
        <Text style={[...tdD, { width: `${DC[3]}%` }]}>{totalItems}</Text>
        <Text style={[...tdD, { width: `${DC[4]}%` }]}>—</Text>
        <Text style={[...tdD, s.noRight, { width: `${DC[5]}%` }]}>{fmt(totalAmt)}</Text>
      </View>
    </View>
  );
}

// ─── Salary Breakdown ────────────────────────────────────────────────────────
// Columns: 項目(28%) 金額(22%) 說明(50%)

interface SalaryRow { label: string; amount: string; note: string; style?: "net" | "deduct" }

function BreakdownTable({ rows }: { rows: SalaryRow[] }) {
  return (
    <View style={s.table}>
      <View style={s.row}>
        <Text style={[s.th, { width: "28%" }]}>項目</Text>
        <Text style={[s.th, { width: "22%" }]}>金額</Text>
        <Text style={[s.th, s.noRight, { width: "50%" }]}>說明</Text>
      </View>
      {rows.map((r, i) => {
        const isNet    = r.style === "net";
        const isDeduct = r.style === "deduct";
        return (
          <View style={[s.row, isNet ? s.netRow : {}]} key={i}>
            <Text style={[s.td, s.tdLeft, { width: "28%" }, isNet ? s.netText : {}]}>{r.label}</Text>
            <Text style={[s.td, { width: "22%" }, isNet ? s.netText : {}, isDeduct ? s.deductText : {}]}>
              {r.amount}
            </Text>
            <Text style={[s.td, s.tdLeft, s.noRight, { width: "50%" }]}>{truncate(r.note)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Document ────────────────────────────────────────────────────────────────

interface Props {
  email: string;
  printDate: string;
  year: number;
  month: number;
  salary: EmployeeMonthlySalary;
  dayRows: DailySalaryDetail[];
  approvedLeaves: number;
}

function SalarySlipDocument({ email, printDate, year, month, salary, dayRows, approvedLeaves }: Props) {
  const monthStr = String(month).padStart(2, "0");

  // ── Salary breakdown rows ──
  const breakdownRows: SalaryRow[] = [
    {
      label: "底薪（按件）",
      amount: fmt(salary.pieceWorkTotal),
      note: `職稱「${formatTitle(salary.titleCategory, salary.titleLevel)}」，每日件數 × 當日單價 加總`,
    },
    {
      label: "貨車司機加給",
      amount: fmt(salary.driverBonusTotal),
      note: salary.driverDays > 0 ? `${salary.driverDays} 天 × $${salary.driverBonus} /天` : "本月無",
    },
    {
      label: "貨車隨車人員加給",
      amount: fmt(salary.attendantBonusTotal),
      note: salary.attendantDays > 0 ? `${salary.attendantDays} 天 × $${salary.attendantBonus} /天` : "本月無",
    },
    {
      label: "職務加給",
      amount: fmt(salary.jobAllowance),
      note: salary.jobAllowance > 0 ? "管理者設定之固定每月加給" : "本月無",
    },
    {
      label: "激勵獎金",
      amount: fmt(salary.incentiveBonus),
      note: salary.incentiveBonus > 0
        ? `出勤 ${salary.attendanceDays} 天，日均 ${salary.averageDailyCount.toFixed(1)} 件`
        : `出勤 ${salary.attendanceDays} 天，日均 ${salary.averageDailyCount.toFixed(1)} 件，未達門檻`,
    },
    {
      label: "油資補貼",
      amount: fmt(salary.fuelAllowance),
      note: salary.fuelAllowanceItems.length > 0
        ? `共 ${salary.fuelAllowanceItems.length} 筆已核准（合計 ${fmt(salary.fuelAllowance)}）`
        : "本月無已核准加油回報",
    },
    {
      label: "停車費補貼",
      amount: fmt(salary.parkingFeeAllowance),
      note: salary.parkingFeeAllowanceItems.length > 0
        ? `共 ${salary.parkingFeeAllowanceItems.length} 筆已核准（合計 ${fmt(salary.parkingFeeAllowance)}）`
        : "本月無已核准停車費回報",
    },
    ...salary.deductions.map((d) => ({
      label: "扣款",
      amount: `-${fmt(d.amount)}`,
      note: d.reason,
      style: "deduct" as const,
    })),
    {
      label: "請假",
      amount: "—",
      note: approvedLeaves > 0 ? `本月請假 ${approvedLeaves} 天` : "本月無請假紀錄",
    },
    {
      label: "實領薪資",
      amount: fmt(salary.totalSalary),
      note: "",
      style: "net" as const,
    },
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Image src={{ data: LOGO_BUFFER, format: "png" }} style={s.logo} />
          <View style={s.headerCenter}>
            <Text style={s.companyName}>{COMPANY}</Text>
            <Text style={s.slipTitle}>員工薪資單　{year} 年 {monthStr} 月份</Text>
          </View>
          <View style={s.headerSpacer} />
        </View>

        <View style={s.divider} />

        {/* ── Employee Info ── */}
        <Text style={s.sectionTitle}>員工基本資訊</Text>
        <View style={s.infoGrid}>
          <View style={s.infoRow}>
            <InfoCell label="姓名" value={salary.userName} />
            <InfoCell label="帳號" value={email} />
            <InfoCell label="列印日期" value={printDate} last />
          </View>
          <View style={s.infoRow}>
            <InfoCell label="職稱" value={formatTitle(salary.titleCategory, salary.titleLevel)} />
            <InfoCell label="出勤天數" value={`${salary.attendanceDays} 天`} />
            <InfoCell label="日均件數" value={`${salary.averageDailyCount.toFixed(1)} 件`} last />
          </View>
        </View>

        {/* ── Daily Records ── */}
        <Text style={s.sectionTitle}>每日送貨紀錄</Text>
        {dayRows.length === 0 ? (
          <Text style={{ fontSize: 8.5, color: C.mutedText, marginBottom: 10 }}>本月尚無送件紀錄</Text>
        ) : (
          <DailyTable rows={dayRows} />
        )}

        {/* ── Salary Breakdown ── */}
        <Text style={s.sectionTitle}>薪資計算明細</Text>
        <BreakdownTable rows={breakdownRows} />

        {/* ── Footer ── */}
        <Text style={s.footer} fixed>
          本薪資單由系統自動產生，如有疑問請聯絡管理者。　列印日期：{printDate}
        </Text>
      </Page>
    </Document>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function generateSalarySlipPdf(userId: string, year: number, month: number): Promise<Buffer> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) throw new Error("找不到指定員工");

  const salary = await getEmployeeMonthlySalary(userId, year, month);

  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const approvedLeaves = await prisma.leaveRequest.count({
    where: { userId, status: "APPROVED", date: { gte: monthStart, lt: monthEnd } },
  });

  const printDate = toDateOnlyString(new Date());

  return renderToBuffer(
    <SalarySlipDocument
      email={user.email}
      printDate={printDate}
      year={year}
      month={month}
      salary={salary}
      dayRows={salary.dailyDetails}
      approvedLeaves={approvedLeaves}
    />
  );
}
