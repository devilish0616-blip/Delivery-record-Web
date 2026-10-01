import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Landmark } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { TabbedPage } from "../../components/TabbedPage";
import { AssetDuesPanel } from "../../components/assets/AssetDuesPanel";
import { AssetListPanel } from "../../components/assets/AssetListPanel";

// 資產列管：車輛與設備的買價、零利率分期進度、帳面價值，以及每月應繳分期帶入記帳
export function AssetsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();

  return (
    <TabbedPage
      title="資產"
      icon={Landmark}
      description="車子買了多少、還欠多少、現在值多少。帳面價值依直線法每月攤提（耐用年數與殘值可在資產卡調整）。"
      actions={
        isAdmin ? (
          <button
            type="button"
            onClick={() => {
              // 新增表單在資產清單分頁開啟，從本月應繳分頁按也會切回清單
              const next = new URLSearchParams(params);
              next.set("tab", "list");
              setParams(next, { replace: true });
              setCreating(true);
            }}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            ＋ 新增資產
          </button>
        ) : undefined
      }
      tabs={[
        { key: "list", label: "資產清單", render: () => <AssetListPanel isAdmin={isAdmin} creating={creating} onCreateClose={() => setCreating(false)} /> },
        { key: "dues", label: "本月應繳", render: () => <AssetDuesPanel isAdmin={isAdmin} /> },
      ]}
    />
  );
}
