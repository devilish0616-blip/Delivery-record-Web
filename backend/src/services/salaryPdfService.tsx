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
  calculateEmployeeMonthlySalary,
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

const titleLabels: Record<string, string> = {
  SENIOR: "資深員工",
  STAFF: "員工",
  TEMP: "臨時工",
  CEO: "執行長",
  SPECIAL: "特殊",
};

const DAILY_COLS = [1.3, 1, 1, 1];
const BREAKDOWN_COLS = [1.2, 1, 3.8];

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 9,
    padding: 28,
    color: "#1f2937",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  logo: {
    width: 50,
    height: 50,
  },
  headerSpacer: {
    width: 50,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 4,
  },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#9ca3af",
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    flexGrow: 1,
    flexBasis: 0,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#9ca3af",
    padding: 3,
  },
  headerCell: {
    flexGrow: 1,
    flexBasis: 0,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#9ca3af",
    padding: 3,
    backgroundColor: "#f3f4f6",
    fontWeight: "bold",
  },
  noRightBorder: {
    borderRightWidth: 0,
  },
  infoCell: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#9ca3af",
    padding: 3,
  },
  infoLabel: {
    fontWeight: "bold",
    marginRight: 4,
  },
  highlightRow: {
    backgroundColor: "#bbf7d0",
  },
  boldText: {
    fontWeight: "bold",
  },
  twoColumns: {
    flexDirection: "row",
  },
  columnLeft: {
    flex: 1,
    marginRight: 6,
  },
  columnRight: {
    flex: 1,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    textAlign: "center",
    fontSize: 8,
    color: "#6b7280",
  },
  emptyNote: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 4,
  },
});

function formatTitle(category: string, level: string | null): string {
  const label = titleLabels[category] ?? category;
  return level ? `${label}（${level === "HIGH" ? "高" : "低"}）` : label;
}

function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function incentiveDescription(attendanceDays: number, averageDailyCount: number, bonus: number): string {
  const avgStr = averageDailyCount.toFixed(1);
  if (bonus >= 3000) {
    return `出勤${attendanceDays}天，日均${avgStr}件 > 60件`;
  }
  if (bonus > 0) {
    return `出勤${attendanceDays}天，日均${avgStr}件 > 30件`;
  }
  return `出勤${attendanceDays}天，日均${avgStr}件，未達激勵獎金標準`;
}

function InfoCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoCell, last ? styles.noRightBorder : {}]}>
      <Text style={styles.infoLabel}>{label}：</Text>
      <Text>{value}</Text>
    </View>
  );
}

function DailyTable({
  rows,
  totalRow,
}: {
  rows: DailySalaryDetail[];
  totalRow?: { forward: number; reverse: number; total: number };
}) {
  return (
    <View style={styles.table}>
      <View style={styles.row}>
        <Text style={[styles.headerCell, { flexGrow: DAILY_COLS[0] }]}>日期</Text>
        <Text style={[styles.headerCell, { flexGrow: DAILY_COLS[1] }]}>正物流（件）</Text>
        <Text style={[styles.headerCell, { flexGrow: DAILY_COLS[2] }]}>逆物流（件）</Text>
        <Text style={[styles.headerCell, styles.noRightBorder, { flexGrow: DAILY_COLS[3] }]}>合計（件）</Text>
      </View>
      {rows.map((r) => (
        <View style={styles.row} key={r.date}>
          <Text style={[styles.cell, { flexGrow: DAILY_COLS[0] }]}>{r.date.slice(5)}</Text>
          <Text style={[styles.cell, { flexGrow: DAILY_COLS[1] }]}>{r.forwardCount}</Text>
          <Text style={[styles.cell, { flexGrow: DAILY_COLS[2] }]}>{r.reverseCount}</Text>
          <Text style={[styles.cell, styles.noRightBorder, { flexGrow: DAILY_COLS[3] }]}>{r.totalCount}</Text>
        </View>
      ))}
      {totalRow && (
        <View style={styles.row}>
          <Text style={[styles.cell, styles.boldText, { flexGrow: DAILY_COLS[0] }]}>當月合計</Text>
          <Text style={[styles.cell, styles.boldText, { flexGrow: DAILY_COLS[1] }]}>{totalRow.forward}</Text>
          <Text style={[styles.cell, styles.boldText, { flexGrow: DAILY_COLS[2] }]}>{totalRow.reverse}</Text>
          <Text style={[styles.cell, styles.boldText, styles.noRightBorder, { flexGrow: DAILY_COLS[3] }]}>{totalRow.total}</Text>
        </View>
      )}
    </View>
  );
}

interface BreakdownRowData {
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}

function BreakdownTable({ rows }: { rows: BreakdownRowData[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.row}>
        <Text style={[styles.headerCell, { flexGrow: BREAKDOWN_COLS[0] }]}>項目</Text>
        <Text style={[styles.headerCell, { flexGrow: BREAKDOWN_COLS[1] }]}>金額</Text>
        <Text style={[styles.headerCell, styles.noRightBorder, { flexGrow: BREAKDOWN_COLS[2] }]}>說明</Text>
      </View>
      {rows.map((r, idx) => (
        <View style={[styles.row, r.highlight ? styles.highlightRow : {}]} key={idx}>
          <Text style={[styles.cell, { flexGrow: BREAKDOWN_COLS[0] }, r.highlight ? styles.boldText : {}]}>
            {r.label}
          </Text>
          <Text style={[styles.cell, { flexGrow: BREAKDOWN_COLS[1] }, r.highlight ? styles.boldText : {}]}>
            {r.value}
          </Text>
          <Text style={[styles.cell, styles.noRightBorder, { flexGrow: BREAKDOWN_COLS[2] }]}>
            {r.description}
          </Text>
        </View>
      ))}
    </View>
  );
}

interface SalarySlipDocumentProps {
  email: string;
  printDate: string;
  year: number;
  month: number;
  salary: EmployeeMonthlySalary;
  dayRows: DailySalaryDetail[];
  approvedLeaves: number;
}

function SalarySlipDocument({ email, printDate, year, month, salary, dayRows, approvedLeaves }: SalarySlipDocumentProps) {
  const half = Math.ceil(dayRows.length / 2);
  const leftRows = dayRows.slice(0, half);
  const rightRows = dayRows.slice(half);
  const totals = {
    forward: dayRows.reduce((sum, r) => sum + r.forwardCount, 0),
    reverse: dayRows.reduce((sum, r) => sum + r.reverseCount, 0),
    total: dayRows.reduce((sum, r) => sum + r.totalCount, 0),
  };

  const breakdownRows: BreakdownRowData[] = [
    {
      label: "底薪",
      value: formatCurrency(salary.pieceWorkTotal),
      description: `依職稱「${formatTitle(salary.titleCategory, salary.titleLevel)}」與當月每日送貨件數計算`,
    },
    {
      label: "職務加給",
      value: formatCurrency(salary.jobAllowance),
      description: "管理者設定之固定每月加給",
    },
    {
      label: "貨車司機加給",
      value: formatCurrency(salary.driverBonusTotal),
      description: `${salary.driverDays} 天 × $${salary.driverBonus}/天`,
    },
    {
      label: "貨車隨車人員加給",
      value: formatCurrency(salary.attendantBonusTotal),
      description: `${salary.attendantDays} 天 × $${salary.attendantBonus}/天`,
    },
    {
      label: "激勵獎金",
      value: formatCurrency(salary.incentiveBonus),
      description: incentiveDescription(salary.attendanceDays, salary.averageDailyCount, salary.incentiveBonus),
    },
    ...salary.deductions.map((d) => ({
      label: "扣款",
      value: `-${formatCurrency(d.amount)}`,
      description: d.reason,
    })),
    {
      label: "請假",
      value: "-",
      description: approvedLeaves > 0 ? `本月請假 ${approvedLeaves} 天` : "無請假紀錄",
    },
    {
      label: "實領薪資",
      value: formatCurrency(salary.totalSalary),
      description: "",
      highlight: true,
    },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={{ data: LOGO_BUFFER, format: "png" }} style={styles.logo} />
          <View style={styles.headerCenter}>
            <Text style={styles.companyName}>旭寺物流有限公司</Text>
            <Text style={styles.subtitle}>
              員工薪資單　{year}年{String(month).padStart(2, "0")}月份
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.sectionTitle}>員工基本資訊</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <InfoCell label="姓名" value={salary.userName} />
            <InfoCell label="帳號" value={email} />
            <InfoCell label="列印日期" value={printDate} last />
          </View>
          <View style={styles.row}>
            <InfoCell label="職稱" value={formatTitle(salary.titleCategory, salary.titleLevel)} />
            <InfoCell label="出勤天數" value={`${salary.attendanceDays} 天`} />
            <InfoCell label="日均件數" value={salary.averageDailyCount.toFixed(1)} last />
          </View>
        </View>

        <Text style={styles.sectionTitle}>每日送貨紀錄</Text>
        {dayRows.length === 0 ? (
          <Text style={styles.emptyNote}>本月尚無送件紀錄</Text>
        ) : (
          <View style={styles.twoColumns}>
            <View style={styles.columnLeft}>
              <DailyTable rows={leftRows} />
            </View>
            <View style={styles.columnRight}>
              <DailyTable rows={rightRows} totalRow={totals} />
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>薪資計算明細</Text>
        <BreakdownTable rows={breakdownRows} />

        <Text style={styles.footer} fixed>
          本薪資單由系統自動產生，如有疑問請聯絡管理者。
        </Text>
      </Page>
    </Document>
  );
}

export async function generateSalarySlipPdf(userId: string, year: number, month: number): Promise<Buffer> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) {
    throw new Error("找不到指定員工");
  }

  const salary = await calculateEmployeeMonthlySalary(userId, year, month);

  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);

  const approvedLeaves = await prisma.leaveRequest.count({
    where: { userId, status: "APPROVED", date: { gte: monthStart, lt: monthEnd } },
  });

  const dayRows = salary.dailyDetails;

  const printDate = toDateOnlyString(new Date());

  return renderToBuffer(
    <SalarySlipDocument
      email={user.email}
      printDate={printDate}
      year={year}
      month={month}
      salary={salary}
      dayRows={dayRows}
      approvedLeaves={approvedLeaves}
    />
  );
}
