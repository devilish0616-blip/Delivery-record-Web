import { useState, type FormEvent } from "react";
import { CircleUserRound, IdCard, KeyRound } from "lucide-react";
import { apiClient, getErrorMessage, TOKEN_STORAGE_KEY } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const roleLabels: Record<string, string> = { ADMIN: "董事長", MANAGER: "執行長", EMPLOYEE: "員工" };

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none";

// 我的帳號：看自己的登入資料、修改密碼（不用再請董事長重設）
export function AccountPage() {
  const { user } = useAuth();
  // 聯絡資料：電話、緊急聯絡人本人可以改；到職日、駕照由董事長維護
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [emergency, setEmergency] = useState(user?.emergencyContact ?? "");
  const [savedContact, setSavedContact] = useState({ phone: user?.phone ?? "", emergency: user?.emergencyContact ?? "" });
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMsg, setContactMsg] = useState<string | null>(null);
  const contactChanged = phone.trim() !== savedContact.phone || emergency.trim() !== savedContact.emergency;

  async function saveContact() {
    setContactBusy(true);
    setContactMsg(null);
    try {
      const { data } = await apiClient.put<{ phone: string | null; emergencyContact: string | null }>("/auth/profile", {
        phone: phone.trim() || null,
        emergencyContact: emergency.trim() || null,
      });
      setSavedContact({ phone: data.phone ?? "", emergency: data.emergencyContact ?? "" });
      setContactMsg("已儲存");
    } catch (err) {
      setContactMsg(getErrorMessage(err));
    } finally {
      setContactBusy(false);
    }
  }
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 6) {
      setError("新密碼至少需要 6 個字元");
      return;
    }
    if (next !== confirm) {
      setError("兩次輸入的新密碼不一樣");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await apiClient.put<{ token: string }>("/auth/password", {
        currentPassword: current,
        newPassword: next,
      });
      // 改密碼後舊憑證失效，換成新憑證讓這台繼續登入
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const hasEmail = user?.email && !user.email.endsWith("@no-login.local");

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-2">
        <CircleUserRound className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">我的帳號</h1>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-[5.5rem_1fr] gap-y-2.5 text-sm">
          <dt className="text-gray-500">名稱</dt>
          <dd className="font-medium text-gray-800">{user?.name}</dd>
          <dt className="text-gray-500">登入 Email</dt>
          <dd className="break-all text-gray-800">{hasEmail ? user?.email : "未設定"}</dd>
          <dt className="text-gray-500">身分</dt>
          <dd className="text-gray-800">{roleLabels[user?.role ?? ""] ?? user?.role}</dd>
          {(user?.jobPositions?.length ?? 0) > 0 && (
            <>
              <dt className="text-gray-500">職務</dt>
              <dd className="text-gray-800">{user?.jobPositions?.map((j) => j.name).join("、")}</dd>
            </>
          )}
        </dl>
        <p className="mt-4 text-xs text-gray-400">名稱或 Email 要更改，請找董事長在「員工」頁修改。</p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <IdCard className="h-4 w-4 text-gray-500" />
          員工資料卡
        </h2>
        <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-2 text-sm">
          <dt className="text-gray-500">到職日</dt>
          <dd className="text-gray-800">{user?.hireDate ? user.hireDate.slice(0, 10) : "未填"}</dd>
          <dt className="text-gray-500">駕照</dt>
          <dd className="text-gray-800">
            {user?.licenseType || "未填"}
            {user?.licenseExpiry && <span className="ml-1.5 text-gray-500">（{user.licenseExpiry.slice(0, 10)} 到期）</span>}
          </dd>
        </dl>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="me-phone" className="mb-1 block text-sm font-medium text-gray-700">電話</label>
            <input id="me-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="me-emergency" className="mb-1 block text-sm font-medium text-gray-700">緊急聯絡人（姓名、關係、電話）</label>
            <input id="me-emergency" value={emergency} onChange={(e) => setEmergency(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center justify-end gap-3">
            {contactMsg && <span className="mr-auto text-sm text-gray-600">{contactMsg}</span>}
            <button
              type="button"
              disabled={contactBusy || !contactChanged}
              onClick={saveContact}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {contactBusy ? "儲存中..." : "儲存聯絡資料"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">到職日與駕照要更新，請找董事長在「員工」頁修改。</p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <KeyRound className="h-4 w-4 text-gray-500" />
          修改密碼
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="pw-current" className="mb-1 block text-sm font-medium text-gray-700">目前的密碼</label>
            <input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pw-next" className="mb-1 block text-sm font-medium text-gray-700">新密碼（至少 6 個字元）</label>
            <input id="pw-next" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="mb-1 block text-sm font-medium text-gray-700">再輸入一次新密碼</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {done && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              密碼已更新。其他手機或電腦上的登入會被登出，要用新密碼重新登入。
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "更新中..." : "更新密碼"}
          </button>
        </form>
        <p className="mt-3 text-xs text-gray-400">忘記目前的密碼？請董事長在「員工」頁幫你重設。</p>
      </section>
    </div>
  );
}
