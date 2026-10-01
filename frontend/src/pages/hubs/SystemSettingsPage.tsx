import { Settings } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { TabbedPage, type PageTab } from "../../components/TabbedPage";
import { SettingsPage } from "../admin/SettingsPage";
import { FinanceSettingsPage } from "../admin/FinanceSettingsPage";

// 系統設定：一般設定（收入單價、薪資封存提醒、註冊）＋帳務設定（僅董事長）
export function SystemSettingsPage() {
  const { user } = useAuth();
  const tabs: PageTab[] = [{ key: "general", label: "一般", render: () => <SettingsPage embedded /> }];
  if (user?.role === "ADMIN") {
    tabs.push({ key: "finance", label: "帳務設定", render: () => <FinanceSettingsPage embedded /> });
  }
  return <TabbedPage title="系統設定" icon={Settings} tabs={tabs} />;
}
