import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Fuel, Plus, X } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DailyEntryDay, DailyRoleType, VehicleType } from "../../api/types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ROLE_OPTIONS: { key: DailyRoleType; label: string }[] = [
  { key: "NONE", label: "無" },
  { key: "TRUCK_DRIVER", label: "貨車司機" },
  { key: "TRUCK_ATTENDANT", label: "隨車" },
];
const STATUS_LABEL = { PENDING: "待審核", APPROVED: "已核准", REJECTED: "已駁回" } as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 以手機本地時間為準的「今天」（避免清晨用 UTC 算成前一天）
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}

function km(n: number) {
  return n.toLocaleString("en-US");
}

interface VehicleDraft {
  enabled: boolean;
  vehicleId: string;
  end: string;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none";
const bigNumberClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-mono text-2xl font-semibold text-gray-900 focus:border-blue-500 focus:outline-none";

// 每日填報「今日收工」：角色、送件件數、車輛里程與加油回報一張表填完、一次送出。
// 角色與車輛沿用上一次，件數與里程是唯一每天要打的數字。
export function DailyClosePanel() {
  const today = localToday();
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DailyEntryDay | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const loading = loadedDate !== date;
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);

  const [role, setRole] = useState<DailyRoleType>("NONE");
  const [rolePrefilled, setRolePrefilled] = useState(false);
  const [forward, setForward] = useState("");
  const [reverse, setReverse] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [moto, setMoto] = useState<VehicleDraft>({ enabled: true, vehicleId: "", end: "" });
  const [truck, setTruck] = useState<VehicleDraft>({ enabled: false, vehicleId: "", end: "" });
  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelAmount, setFuelAmount] = useState("");
  const [fuelVehicleId, setFuelVehicleId] = useState("");
  const [fuelNote, setFuelNote] = useState("");

  const vehicles = data?.vehicles ?? [];
  const motorcycles = vehicles.filter((v) => v.type === "MOTORCYCLE");
  const trucks = vehicles.filter((v) => v.type === "TRUCK");
  const vehicleOf = (id: string) => vehicles.find((v) => v.id === id);

  function apply(d: DailyEntryDay) {
    setData(d);
    const typeOf = (id: string) => d.vehicles.find((v) => v.id === id)?.type;
    const dayRecord = (type: VehicleType) => d.mileage.find((m) => typeOf(m.vehicleId) === type);
    const firstOf = (type: VehicleType) => d.vehicles.find((v) => v.type === type)?.id ?? "";

    const nextRole = d.role ?? d.lastRole ?? "NONE";
    setRole(nextRole);
    setRolePrefilled(!d.role && !!d.lastRole);
    setForward(d.delivery ? String(d.delivery.forwardCount) : "");
    setReverse(d.delivery ? String(d.delivery.reverseCount) : "");
    setNote(d.delivery?.note ?? "");
    setShowNote(!!d.delivery?.note);

    const motoRec = dayRecord("MOTORCYCLE");
    const motoId = motoRec?.vehicleId ?? d.lastVehicle.MOTORCYCLE ?? firstOf("MOTORCYCLE");
    // 已經送出過而且沒有機車里程，代表那天沒騎機車
    setMoto({ enabled: motoRec ? true : !d.delivery, vehicleId: motoId, end: motoRec ? String(motoRec.endMileage) : "" });

    const truckRec = dayRecord("TRUCK");
    const truckId = truckRec?.vehicleId ?? d.lastVehicle.TRUCK ?? firstOf("TRUCK");
    setTruck({
      enabled: truckRec ? true : !d.delivery && nextRole === "TRUCK_DRIVER",
      vehicleId: truckId,
      end: truckRec ? String(truckRec.endMileage) : "",
    });

    setFuelOpen(false);
    setFuelAmount("");
    setFuelNote("");
    setFuelVehicleId(motoRec || !truckRec ? motoId : truckId);
    setConfirmZero(false);
  }

  useEffect(() => {
    let active = true;
    apiClient
      .get<DailyEntryDay>("/daily-entry", { params: { date } })
      .then(({ data: d }) => active && apply(d))
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoadedDate(date));
    return () => {
      active = false;
    };
  }, [date]);

  function goTo(next: string) {
    setDate(next);
    setError(null);
    setSaved(null);
  }

  function pickRole(next: DailyRoleType) {
    setRole(next);
    setRolePrefilled(false);
    // 開貨車的人通常要填貨車里程：還沒送出過時自動打開
    if (next === "TRUCK_DRIVER" && !data?.delivery && trucks.length > 0) {
      setTruck((t) => ({ ...t, enabled: true }));
    }
  }

  function distanceHint(draft: VehicleDraft) {
    const v = vehicleOf(draft.vehicleId);
    if (!v) return null;
    if (v.previousMileage === null) return <span>這台車還沒有里程紀錄</span>;
    const end = Number(draft.end);
    if (draft.end === "" || Number.isNaN(end)) return <span>上次 {km(v.previousMileage)} km</span>;
    const diff = end - v.previousMileage;
    if (diff < 0) {
      return <span className="text-red-600">比上次（{km(v.previousMileage)} km）還少，請確認</span>;
    }
    return (
      <span>
        上次 {km(v.previousMileage)} km・今天開了 <span className="font-mono font-semibold text-gray-700">{km(diff)}</span> km
      </span>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);

    const f = forward === "" ? 0 : Number(forward);
    const r = reverse === "" ? 0 : Number(reverse);
    if (!Number.isInteger(f) || !Number.isInteger(r) || f < 0 || r < 0) {
      return setError("件數請填 0 以上的整數");
    }
    if (f + r === 0 && !confirmZero) {
      setConfirmZero(true);
      return setError("今天件數都是 0，確定沒有送件嗎？確定的話再按一次送出。");
    }

    const mileage: { vehicleId: string; endMileage: number }[] = [];
    for (const [draft, label] of [
      [moto, "機車"],
      [truck, "貨車"],
    ] as const) {
      if (!draft.enabled) continue;
      if (!draft.vehicleId) return setError(`請選擇${label}車牌`);
      if (draft.end === "" || Number.isNaN(Number(draft.end))) return setError(`請填${label}今天收工時的里程`);
      mileage.push({ vehicleId: draft.vehicleId, endMileage: Number(draft.end) });
    }
    if (moto.enabled && truck.enabled && moto.vehicleId === truck.vehicleId) {
      return setError("機車和貨車選到同一台了");
    }

    let fuel: { amount: number; vehicleId: string; note: string | null } | null = null;
    if (fuelOpen && fuelAmount !== "") {
      const amount = Number(fuelAmount);
      if (!(amount > 0)) return setError("加油金額要大於 0");
      if (!fuelVehicleId) return setError("請選擇加油的車輛");
      fuel = { amount, vehicleId: fuelVehicleId, note: fuelNote.trim() || null };
    }

    setSubmitting(true);
    try {
      const { data: d } = await apiClient.post<DailyEntryDay>("/daily-entry", {
        date,
        role,
        forwardCount: f,
        reverseCount: r,
        note: note.trim() || null,
        mileage,
        fuel,
      });
      apply(d);
      const parts = [`送件 ${f + r} 件（正 ${f}、逆 ${r}）`];
      for (const m of mileage) {
        const v = vehicleOf(m.vehicleId);
        const diff = v?.previousMileage != null ? m.endMileage - v.previousMileage : null;
        parts.push(`${v?.plateNumber ?? "車輛"} ${diff !== null ? `${km(diff)} km` : `里程 ${km(m.endMileage)}`}`);
      }
      if (fuel) parts.push(`加油 $${km(fuel.amount)}（待審核）`);
      setSaved(parts.join("・"));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const alreadySubmitted = !!data?.delivery;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="前一天"
          onClick={() => goTo(shiftDate(date, -1))}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <label className="relative flex-1 text-center">
          <span className="text-lg font-semibold text-gray-900">
            {date === today ? "今天" : ""} {dayLabel(date)}
          </span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && goTo(e.target.value)}
            aria-label="選擇日期"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <span className="block text-xs text-gray-400">點日期可以補填其他天</span>
        </label>
        <button
          type="button"
          aria-label="後一天"
          disabled={date >= today}
          onClick={() => goTo(shiftDate(date, 1))}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {loading && !data ? (
        <p className="py-8 text-center text-sm text-gray-500">載入中...</p>
      ) : (
        <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
          {alreadySubmitted && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {data?.delivery?.enteredByName
                ? `這天由 ${data.delivery.enteredByName} 代填。你改完送出後會變成本人填寫。`
                : "這天已經填過了，改完再按一次「更新」就好。"}
            </p>
          )}

          {/* 角色＋件數 */}
          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">今日角色</h2>
              {rolePrefilled && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">✓ 沿用上次</span>
              )}
            </div>
            <div role="group" aria-label="今日角色" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
              {ROLE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={role === o.key}
                  onClick={() => pickRole(o.key)}
                  className={`rounded-md py-2 text-sm ${
                    role === o.key ? "bg-white font-semibold text-blue-700 shadow-sm" : "text-gray-600"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="close-forward" className="mb-1 block text-xs font-medium text-gray-600">
                  正物流
                </label>
                <input
                  id="close-forward"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={forward}
                  onChange={(e) => {
                    setForward(e.target.value);
                    setConfirmZero(false);
                  }}
                  placeholder="0"
                  className={bigNumberClass}
                />
              </div>
              <div>
                <label htmlFor="close-reverse" className="mb-1 block text-xs font-medium text-gray-600">
                  逆物流
                </label>
                <input
                  id="close-reverse"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={reverse}
                  onChange={(e) => {
                    setReverse(e.target.value);
                    setConfirmZero(false);
                  }}
                  placeholder="0"
                  className={bigNumberClass}
                />
              </div>
            </div>
            {showNote ? (
              <div>
                <label htmlFor="close-note" className="mb-1 block text-xs font-medium text-gray-600">
                  備註
                </label>
                <input
                  id="close-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="異常或說明"
                  className={inputClass}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setShowNote(true)} className="text-xs text-blue-600 hover:underline">
                ＋ 加備註
              </button>
            )}
          </section>

          {/* 車輛里程 */}
          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">車輛里程</h2>
            <VehicleBlock
              label="機車"
              toggleLabel="今天有騎機車"
              draft={moto}
              options={motorcycles}
              onChange={setMoto}
              hint={distanceHint(moto)}
            />
            <div className="border-t border-gray-100" />
            <VehicleBlock
              label="貨車"
              toggleLabel="今天有開貨車"
              draft={truck}
              options={trucks}
              onChange={setTruck}
              hint={distanceHint(truck)}
            />
            <p className="text-xs text-gray-400">填收工時儀表板上的總里程，系統會自己算今天開了幾公里。</p>
          </section>

          {/* 加油 */}
          {data && data.fuel.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
              {data.fuel.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-gray-700">
                    <Fuel className="h-4 w-4 text-gray-400" />
                    這天已回報加油 <span className="font-mono">${km(f.amount)}</span>
                    {vehicleOf(f.vehicleId ?? "") && (
                      <span className="text-xs text-gray-400">{vehicleOf(f.vehicleId ?? "")!.plateNumber}</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">{STATUS_LABEL[f.status]}</span>
                </li>
              ))}
            </ul>
          )}
          {fuelOpen ? (
            <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">加油回報</h2>
                <button
                  type="button"
                  aria-label="收起加油回報"
                  onClick={() => {
                    setFuelOpen(false);
                    setFuelAmount("");
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="close-fuel" className="mb-1 block text-xs font-medium text-gray-600">
                    金額（元）
                  </label>
                  <input
                    id="close-fuel"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={fuelAmount}
                    onChange={(e) => setFuelAmount(e.target.value)}
                    placeholder="例：500"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="close-fuel-vehicle" className="mb-1 block text-xs font-medium text-gray-600">
                    車輛
                  </label>
                  <select
                    id="close-fuel-vehicle"
                    value={fuelVehicleId}
                    onChange={(e) => setFuelVehicleId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">請選擇</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.type === "TRUCK" ? "貨車" : "機車"} {v.plateNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                type="text"
                value={fuelNote}
                onChange={(e) => setFuelNote(e.target.value)}
                placeholder="備註（選填）"
                aria-label="加油備註"
                className={inputClass}
              />
              <p className="text-xs text-gray-400">送出後跟一般加油回報一樣要等主管審核，核准後計入當月薪資。</p>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setFuelOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-left text-sm text-gray-600 hover:bg-white"
            >
              <Plus className="h-4 w-4 text-blue-600" />
              今天有加油？順便回報
            </button>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {saved && (
            <p className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>已送出：{saved}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "送出中..." : alreadySubmitted ? "更新今日收工" : "送出今日收工"}
          </button>
        </div>
      )}
    </form>
  );
}

function VehicleBlock({
  label,
  toggleLabel,
  draft,
  options,
  onChange,
  hint,
}: {
  label: string;
  toggleLabel: string;
  draft: VehicleDraft;
  options: { id: string; plateNumber: string }[];
  onChange: (next: VehicleDraft) => void;
  hint: ReactNode;
}) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
          className="h-4 w-4"
        />
        {toggleLabel}
      </label>
      {draft.enabled && (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <select
            value={draft.vehicleId}
            onChange={(e) => onChange({ ...draft, vehicleId: e.target.value })}
            aria-label={`${label}車牌`}
            className={inputClass}
          >
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={draft.end}
            onChange={(e) => onChange({ ...draft, end: e.target.value })}
            placeholder="收工里程 km"
            aria-label={`${label}收工里程`}
            className={`${inputClass} font-mono`}
          />
          <p className="col-span-2 text-xs text-gray-500">{hint}</p>
        </div>
      )}
    </div>
  );
}
