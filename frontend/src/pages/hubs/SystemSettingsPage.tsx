import { Settings } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { TabbedPage, type PageTab } from "../../components/TabbedPage";
import { SettingsPage } from "../admin/SettingsPage";
import { FinanceSettingsPage } from "../admin/FinanceSettingsPage";
import { AuditLogPanel } from "../../components/settings/AuditLogPanel";

// 系統設定：一般設定（收入單價、薪資封存提醒、註冊）＋帳務設定、操作紀錄（僅董事長）
export function SystemSettingsPage() {
  const { user } = useAuth();
  const tabs: PageTab[] = [{ key: "general", label: "一般", render: () => <SettingsPage embedded /> }];
  if (user?.role === "ADMIN") {
    tabs.push({ key: "finance", label: "帳務設定", render: () => <FinanceSettingsPage embedded /> });
    tabs.push({ key: "audit", label: "操作紀錄", render: () => <AuditLogPanel /> });
  }
  return <TabbedPage title="系統設定" icon={Settings} tabs={tabs} />;
}
