import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { AssetCategory, AssetItem, VehicleType } from "../../api/types";
import { CATEGORY_LABELS, DEFAULT_LIFE_YEARS, defaultSalvage, money } from "./assetLabels";

interface VehicleOption {
  id: string;
  plateNumber: string;
  type: VehicleType;
  isActive: boolean;
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100";

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

// 新增／編輯資產卡。殘值未手動修改前，跟著總價與耐用年數自動以「成本 ÷（年數＋1）」計算
export function AssetFormModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: AssetItem | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [category, setCategory] = useState<AssetCategory>(asset?.category ?? "MOTORCYCLE");
  const [vehicleId, setVehicleId] = useState(asset?.vehicle?.id ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [acquiredDate, setAcquiredDate] = useState(asset?.acquiredDate ?? new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(asset ? String(asset.cost) : "");
  const [years, setYears] = useState(String(asset?.usefulLifeYears ?? DEFAULT_LIFE_YEARS.MOTORCYCLE));
  const [salvage, setSalvage] = useState(asset ? String(asset.salvageValue) : "");
  const [salvageTouched, setSalvageTouched] = useState(Boolean(asset));
  const [note, setNote] = useState(asset?.note ?? "");
  const [hasLoan, setHasLoan] = useState(asset?.hasLoan ?? false);
  const [downPayment, setDownPayment] = useState(asset?.hasLoan ? String(asset.downPayment) : "0");
  const [lender, setLender] = useState(asset?.lender ?? "");
  const [monthly, setMonthly] = useState(asset?.monthlyPayment ? String(asset.monthlyPayment) : "");
  const [terms, setTerms] = useState(asset?.termCount ? String(asset.termCount) : "");
  const [firstMonth, setFirstMonth] = useState(asset?.firstPaymentMonth ?? "");
  const [payDay, setPayDay] = useState(asset?.paymentDay ? String(asset.paymentDay) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<VehicleOption[]>("/assets/available-vehicles")
      .then(({ data }) => setVehicles(asset?.vehicle ? [asset.vehicle, ...data] : data))
      .catch(() => {});
  }, [asset]);

  const costNum = Number(cost) || 0;
  const yearsNum = Number(years) || 0;
  const shownSalvage = salvageTouched ? salvage : costNum > 0 && yearsNum > 0 ? String(defaultSalvage(costNum, yearsNum)) : "";

  function pickCategory(c: AssetCategory) {
    setCategory(c);
    if (!asset) setYears(String(DEFAULT_LIFE_YEARS[c]));
  }

  function pickVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      if (!name.trim() || vehicles.some((x) => x.plateNumber === name)) setName(v.plateNumber);
      pickCategory(v.type === "TRUCK" ? "TRUCK" : "MOTORCYCLE");
    }
  }

  // 分期試算：貸款金額、月付×期數、最後一期尾數
  const principal = Math.max(0, costNum - (Number(downPayment) || 0));
  const monthlyNum = Number(monthly) || 0;
  const termsNum = Number(terms) || 0;
  const diff = principal - monthlyNum * termsNum;
  const lastAmount = termsNum > 0 && Math.abs(diff) < monthlyNum ? monthlyNum + diff : monthlyNum;
  const mismatch = hasLoan && monthlyNum > 0 && termsNum > 0 && Math.abs(diff) >= termsNum;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = {
      name: name.trim(),
      category,
      vehicleId: vehicleId || null,
      acquiredDate,
      cost: costNum,
      usefulLifeYears: yearsNum,
      salvageValue: shownSalvage === "" ? undefined : Number(shownSalvage),
      note: note.trim() || null,
      hasLoan,
      downPayment: Number(downPayment) || 0,
      lender: lender.trim() || null,
      monthlyPayment: numOrNull(monthly),
      termCount: numOrNull(terms),
      firstPaymentMonth: firstMonth || null,
      paymentDay: numOrNull(payDay),
    };
    try {
      const { data } = asset
        ? await apiClient.put<AssetItem>(`/assets/${asset.id}`, body)
        : await apiClient.post<AssetItem>("/assets", body);
      onSaved(data.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="my-8 w-full max-w-2xl space-y-5 rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold text-gray-800">{asset ? `編輯資產・${asset.name}` : "新增資產"}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="類別" htmlFor="asset-category">
            <select id="asset-category" value={category} onChange={(e) => pickCategory(e.target.value as AssetCategory)} className={inputClass}>
              {(Object.keys(CATEGORY_LABELS) as AssetCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="對應車輛（選填）" htmlFor="asset-vehicle" hint="選了車輛，資產卡上會顯示這台車的維修、保險、油資花費">
            <select id="asset-vehicle" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)} className={inputClass}>
              <option value="">不對應車輛</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber}（{v.type === "TRUCK" ? "貨車" : "機車"}）{v.isActive ? "" : "・已停用"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="名稱" htmlFor="asset-name">
            <input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：KEA-3021、手持 PDA × 6" className={inputClass} />
          </Field>
          <Field label="取得日期" htmlFor="asset-date" hint="從這個月開始攤提折舊">
            <input id="asset-date" type="date" value={acquiredDate} onChange={(e) => setAcquiredDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="總價（元）" htmlFor="asset-cost">
            <input id="asset-cost" type="number" min="0" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="耐用年數" htmlFor="asset-years">
              <input id="asset-years" type="number" min="1" max="50" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
            </Field>
            <Field label="殘值（元）" htmlFor="asset-salvage" hint={salvageTouched ? undefined : "自動＝總價 ÷（年數＋1）"}>
              <input
                id="asset-salvage"
                type="number"
                min="0"
                value={shownSalvage}
                onChange={(e) => {
                  setSalvageTouched(true);
                  setSalvage(e.target.value);
                }}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">付款方式</span>
            {[
              [false, "一次付清"],
              [true, "零利率分期"],
            ].map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setHasLoan(v as boolean)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  hasLoan === v ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label as string}
              </button>
            ))}
          </div>
          {hasLoan && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="頭期款（元）" htmlFor="loan-down">
                  <input id="loan-down" type="number" min="0" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} className={inputClass} />
                </Field>
                <Field label="分期公司（選填）" htmlFor="loan-lender">
                  <input id="loan-lender" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="例：和潤分期" className={inputClass} />
                </Field>
                <Field label="每期金額（元）" htmlFor="loan-monthly">
                  <input id="loan-monthly" type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputClass} />
                </Field>
                <Field label="期數" htmlFor="loan-terms">
                  <input id="loan-terms" type="number" min="1" max="120" value={terms} onChange={(e) => setTerms(e.target.value)} className={inputClass} />
                </Field>
                <Field label="首期月份" htmlFor="loan-first">
                  <input id="loan-first" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} className={inputClass} />
                </Field>
                <Field label="每月繳款日" htmlFor="loan-day" hint="超過當月天數以月底計">
                  <input id="loan-day" type="number" min="1" max="31" value={payDay} onChange={(e) => setPayDay(e.target.value)} className={inputClass} />
                </Field>
              </div>
              {monthlyNum > 0 && termsNum > 0 && (
                <p className={`rounded-md px-3 py-2 text-xs ${mismatch ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-600"}`}>
                  分期金額 {money(principal)}（總價 − 頭期款）；每期 {money(monthlyNum)} × {termsNum} 期 = {money(monthlyNum * termsNum)}
                  {!mismatch && Math.round(diff) !== 0 && `，最後一期自動調為 ${money(lastAmount)}`}
                  {mismatch && `，兩者差 ${money(Math.abs(diff))}，請確認總價、頭期款、每期金額與期數是否填對`}
                </p>
              )}
            </>
          )}
        </div>

        <Field label="備註（選填）" htmlFor="asset-note">
          <input id="asset-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            取消
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </form>
    </div>
  );
}
