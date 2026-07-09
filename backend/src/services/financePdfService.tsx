// 記帳模組：月報表 PDF（格式對齊舊單機系統月報表）
// 損益摘要／支出・收入分類彙總＋圓餅圖／全月帳務明細／股東結算＋累計結算

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
  Svg,
  Path,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  getMonthlyFinanceReport,
  type MonthlyFinanceReport,
} from "./financeReportService";
import type { CategorySummaryRow, SettlementRow } from "./financeService";

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: path.join(__dirname, "../assets/fonts/NotoSansTC-Regular.ttf") },
    { src: path.join(__dirname, "../assets/fonts/NotoSansTC-Bold.ttf"), fontWeight: "bold" },
  ],
});

// react-pdf 預設以空白斷行，連續中文長備註會超出欄寬被裁切；
// 改為逐字斷行讓中文在任意位置換行（帳務備註多為中文）
Font.registerHyphenationCallback((word) => Array.from(word));

const LOGO_BUFFER = fs.readFileSync(path.join(__dirname, "../assets/logo.png"));

const COMPANY = "旭寺物流有限公司";

function fmt(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `NT$ ${sign}${Math.abs(rounded).toLocaleString("en-US")}`;
}

// ─── 圓餅圖（donut）────────────────────────────────────────────────────────────
// 色盤沿用 dataviz 參考色盤（已驗證 CVD 相鄰色差），超過 8 類合併為「其他類別」灰

const CHART_COLORS = [
  "#2a78d6", "#1baf7a", "#eda100", "#008300",
  "#4a3aa7", "#e34948", "#e87ba4", "#eb6834",
];
const FOLD_COLOR = "#898781";

interface DonutSlice {
  name: string;
  amount: number;
  percent: number;
  color: string;
}

// 依彙總列建立圓餅資料：前 8 類各佔一色，其餘合併
export function buildDonutSlices(rows: CategorySummaryRow[]): DonutSlice[] {
  const slices: DonutSlice[] = rows.slice(0, 8).map((r, i) => ({
    name: r.categoryName,
    amount: r.amount,
    percent: r.percent,
    color: CHART_COLORS[i],
  }));
  const rest = rows.slice(8);
  if (rest.length > 0) {
    slices.push({
      name: "其他類別",
      amount: rest.reduce((s, r) => s + r.amount, 0),
      percent: rest.reduce((s, r) => s + r.percent, 0),
      color: FOLD_COLOR,
    });
  }
  return slices;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// 甜甜圈單一扇形的 SVG path（角度自 12 點鐘方向順時針）
export function donutSlicePath(
  cx: number, cy: number, outerR: number, innerR: number,
  startAngle: number, endAngle: number
): string {
  const clamped = Math.min(endAngle, startAngle + 359.99);
  const largeArc = clamped - startAngle > 180 ? 1 : 0;
  const oStart = polar(cx, cy, outerR, startAngle);
  const oEnd = polar(cx, cy, outerR, clamped);
  const iStart = polar(cx, cy, innerR, clamped);
  const iEnd = polar(cx, cy, innerR, startAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${iEnd.x} ${iEnd.y}`,
    "Z",
  ].join(" ");
}

function DonutChart({ slices }: { slices: DonutSlice[] }) {
  const size = 110;
  const cx = size / 2;
  const outerR = 52;
  const innerR = 26;
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (total <= 0) return null;

  let angle = 0;
  const paths = slices.map((s, i) => {
    const sweep = (s.amount / total) * 360;
    const d = donutSlicePath(cx, cx, outerR, innerR, angle, angle + sweep);
    angle += sweep;
    return <Path key={i} d={d} fill={s.color} stroke="#ffffff" strokeWidth={1.5} />;
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
    </Svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const C = {
  border: "#d1d5db",
  headerBg: "#f3f4f6",
  netBg: "#dcfce7",
  netText: "#15803d",
  negText: "#dc2626",
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
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logo: { width: 44, height: 44 },
  headerSpacer: { width: 44 },
  headerCenter: { flex: 1, alignItems: "center" },
  companyName: { fontSize: 17, fontWeight: "bold" },
  slipTitle: { fontSize: 11, marginTop: 3 },
  meta: { fontSize: 7.5, color: C.mutedText, marginBottom: 8 },
  divider: { borderBottomWidth: 1, borderColor: C.border, marginBottom: 8 },
  sectionTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 4, marginTop: 6, color: C.mutedText },

  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: C.border, marginBottom: 10 },
  row: { flexDirection: "row" },
  th: {
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border,
    backgroundColor: C.headerBg, fontWeight: "bold",
    paddingHorizontal: 5, paddingVertical: 3, textAlign: "center",
  },
  td: {
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border,
    paddingHorizontal: 5, paddingVertical: 3, textAlign: "right",
  },
  tdLeft: { textAlign: "left" },
  tdCenter: { textAlign: "center" },
  totalRow: { backgroundColor: C.headerBg, fontWeight: "bold" },
  netRow: { backgroundColor: C.netBg },
  netText: { color: C.netText, fontWeight: "bold" },
  negText: { color: C.negText },

  chartRow: { flexDirection: "row", gap: 14, marginBottom: 10, alignItems: "center" },
  legend: { flex: 1, gap: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 7, height: 7, borderRadius: 1.5 },

  footer: {
    position: "absolute", bottom: 16, left: 30, right: 30,
    textAlign: "center", fontSize: 7.5, color: C.mutedText,
    borderTopWidth: 0.5, borderColor: C.border, paddingTop: 4,
  },
});

// ─── 區塊元件 ────────────────────────────────────────────────────────────────

function CategorySection({ title, rows }: { title: string; rows: CategorySummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <View>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={{ fontSize: 8.5, color: C.mutedText, marginBottom: 10 }}>本月無資料</Text>
      </View>
    );
  }
  const slices = buildDonutSlices(rows);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <View>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.chartRow} wrap={false}>
        <DonutChart slices={slices} />
        <View style={s.legend}>
          {slices.map((sl, i) => (
            <View style={s.legendItem} key={i}>
              <View style={[s.legendSwatch, { backgroundColor: sl.color }]} />
              <Text>{sl.name}　{sl.percent.toFixed(1)}%　{fmt(sl.amount)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.table}>
        <View style={s.row}>
          <Text style={[s.th, { width: "34%" }]}>分類</Text>
          <Text style={[s.th, { width: "26%" }]}>金額</Text>
          <Text style={[s.th, { width: "20%" }]}>佔比</Text>
          <Text style={[s.th, { width: "20%", borderRightWidth: 1 }]}>筆數</Text>
        </View>
        {rows.map((r, i) => (
          <View style={s.row} key={i}>
            <Text style={[s.td, s.tdLeft, { width: "34%" }]}>{r.categoryName}</Text>
            <Text style={[s.td, { width: "26%" }]}>{fmt(r.amount)}</Text>
            <Text style={[s.td, { width: "20%" }]}>{r.percent.toFixed(1)}%</Text>
            <Text style={[s.td, { width: "20%" }]}>{r.count}</Text>
          </View>
        ))}
        <View style={[s.row, s.totalRow]}>
          <Text style={[s.td, s.tdLeft, { width: "34%" }]}>合計</Text>
          <Text style={[s.td, { width: "26%" }]}>{fmt(total)}</Text>
          <Text style={[s.td, { width: "20%" }]}>100%</Text>
          <Text style={[s.td, { width: "20%" }]}>{totalCount}</Text>
        </View>
      </View>
    </View>
  );
}

function SettlementTable({ rows }: { rows: SettlementRow[] }) {
  return (
    <View style={s.table}>
      <View style={s.row}>
        <Text style={[s.th, { width: "25%" }]}>股東</Text>
        <Text style={[s.th, { width: "25%" }]}>代墊支出</Text>
        <Text style={[s.th, { width: "25%" }]}>領回金額</Text>
        <Text style={[s.th, { width: "25%" }]}>剩餘結算</Text>
      </View>
      {rows.map((r, i) => (
        <View style={s.row} key={i}>
          <Text style={[s.td, s.tdCenter, { width: "25%" }]}>{r.partyName}</Text>
          <Text style={[s.td, { width: "25%" }]}>{fmt(r.advanced)}</Text>
          <Text style={[s.td, { width: "25%" }]}>{fmt(r.received)}</Text>
          <Text style={[s.td, { width: "25%" }, r.balance < 0 ? s.negText : {}]}>
            {fmt(r.balance)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const typeLabels: Record<string, string> = {
  INCOME: "收入",
  EXPENSE: "支出",
  TRANSFER: "內部撥款",
};

// 帳務明細列（內部撥款拆成兩個方向呈現，與舊系統一致）
interface DetailRow {
  date: string;
  type: string;
  party: string;
  item: string;
  amount: number; // 帶正負號
  note: string;
}

export function buildDetailRows(records: MonthlyFinanceReport["records"]): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const r of records) {
    if (r.type === "TRANSFER") {
      rows.push({
        date: r.date, type: typeLabels[r.type], party: r.partyName,
        item: `撥給 ${r.counterPartyName ?? ""}`, amount: -r.amount, note: r.note ?? "",
      });
      rows.push({
        date: r.date, type: typeLabels[r.type], party: r.counterPartyName ?? "",
        item: `收到 ${r.partyName}`, amount: r.amount, note: r.note ?? "",
      });
    } else {
      rows.push({
        date: r.date, type: typeLabels[r.type], party: r.partyName,
        item: r.categoryName ?? "", amount: r.type === "EXPENSE" ? -r.amount : r.amount,
        note: r.note ?? "",
      });
    }
  }
  return rows;
}

// ─── Document ────────────────────────────────────────────────────────────────

function FinanceReportDocument({
  report, generatedAt,
}: {
  report: MonthlyFinanceReport;
  generatedAt: string;
}) {
  const monthStr = String(report.month).padStart(2, "0");
  const detailRows = buildDetailRows(report.records);

  const DW = [11, 9, 11, 15, 14, 40]; // 明細表欄寬（%）

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Image src={{ data: LOGO_BUFFER, format: "png" }} style={s.logo} />
          <View style={s.headerCenter}>
            <Text style={s.companyName}>{COMPANY}</Text>
            <Text style={s.slipTitle}>公司帳目　{report.year} 年 {monthStr} 月報表</Text>
          </View>
          <View style={s.headerSpacer} />
        </View>
        <Text style={s.meta}>產生時間：{generatedAt}</Text>
        <View style={s.divider} />

        {/* 損益摘要 */}
        <Text style={s.sectionTitle}>損益摘要</Text>
        <View style={s.table}>
          <View style={s.row}>
            <Text style={[s.th, { width: "55%" }]}>項目</Text>
            <Text style={[s.th, { width: "45%" }]}>金額</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.td, s.tdLeft, { width: "55%" }]}>收入合計</Text>
            <Text style={[s.td, { width: "45%" }]}>{fmt(report.summary.incomeTotal)}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.td, s.tdLeft, { width: "55%" }]}>支出合計</Text>
            <Text style={[s.td, { width: "45%" }]}>{fmt(report.summary.expenseTotal)}</Text>
          </View>
          <View style={[s.row, s.netRow]}>
            <Text style={[s.td, s.tdLeft, s.netText, { width: "55%" }]}>
              本月淨損益（排除內部撥款）
            </Text>
            <Text style={[s.td, { width: "45%" }, report.summary.net < 0 ? s.negText : s.netText]}>
              {fmt(report.summary.net)}
            </Text>
          </View>
        </View>

        {/* 分類彙總＋圓餅圖 */}
        <CategorySection title="支出類別彙總" rows={report.expenseByCategory} />
        <CategorySection title="收入來源彙總" rows={report.incomeByCategory} />

        {/* 帳務明細 */}
        <Text style={s.sectionTitle}>帳務明細</Text>
        {detailRows.length === 0 ? (
          <Text style={{ fontSize: 8.5, color: C.mutedText, marginBottom: 10 }}>本月尚無帳目</Text>
        ) : (
          <View style={s.table}>
            <View style={s.row}>
              <Text style={[s.th, { width: `${DW[0]}%` }]}>日期</Text>
              <Text style={[s.th, { width: `${DW[1]}%` }]}>類別</Text>
              <Text style={[s.th, { width: `${DW[2]}%` }]}>關係人</Text>
              <Text style={[s.th, { width: `${DW[3]}%` }]}>項目</Text>
              <Text style={[s.th, { width: `${DW[4]}%` }]}>金額</Text>
              <Text style={[s.th, { width: `${DW[5]}%` }]}>備註</Text>
            </View>
            {detailRows.map((r, i) => (
              <View style={s.row} key={i} wrap={false}>
                <Text style={[s.td, s.tdCenter, { width: `${DW[0]}%` }]}>{r.date}</Text>
                <Text style={[s.td, s.tdCenter, { width: `${DW[1]}%` }]}>{r.type}</Text>
                <Text style={[s.td, s.tdCenter, { width: `${DW[2]}%` }]}>{r.party}</Text>
                <Text style={[s.td, s.tdLeft, { width: `${DW[3]}%` }]}>{r.item}</Text>
                <Text style={[s.td, { width: `${DW[4]}%` }, r.amount < 0 ? s.negText : {}]}>
                  {fmt(r.amount)}
                </Text>
                <Text style={[s.td, s.tdLeft, { width: `${DW[5]}%` }]}>{r.note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 股東結算 */}
        <Text style={s.sectionTitle}>股東結算（本月）</Text>
        <SettlementTable rows={report.settlement} />

        <Text style={s.sectionTitle}>股東累計結算（開帳以來）</Text>
        <SettlementTable rows={report.cumulativeSettlement} />

        <Text style={s.footer} fixed>
          本報表由系統自動產生。　產生時間：{generatedAt}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateFinanceReportPdf(year: number, month: number): Promise<Buffer> {
  const report = await getMonthlyFinanceReport(year, month);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const generatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return renderToBuffer(<FinanceReportDocument report={report} generatedAt={generatedAt} />);
}
