import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { lazyPage } from "./utils/lazyPage";

// 各頁用到才下載：員工手機第一次打開時不用連記帳、資產、薪資計算等管理頁面的程式一起下載
const DailyEntryPage = lazyPage(() => import("./pages/hubs/DailyEntryPage").then((m) => m.DailyEntryPage));
const MySalaryPage = lazyPage(() => import("./pages/employee/MySalaryPage").then((m) => m.MySalaryPage));
const MyRequestsPage = lazyPage(() => import("./pages/employee/MyRequestsPage").then((m) => m.MyRequestsPage));
const AccountPage = lazyPage(() => import("./pages/AccountPage").then((m) => m.AccountPage));
const OperationsPage = lazyPage(() => import("./pages/admin/OperationsPage").then((m) => m.OperationsPage));
const AssetsPage = lazyPage(() => import("./pages/admin/AssetsPage").then((m) => m.AssetsPage));
const SalaryHubPage = lazyPage(() => import("./pages/hubs/SalaryHubPage").then((m) => m.SalaryHubPage));
const VehiclesPage = lazyPage(() => import("./pages/admin/VehiclesPage").then((m) => m.VehiclesPage));
const StaffPage = lazyPage(() => import("./pages/hubs/StaffPage").then((m) => m.StaffPage));
const EmployeeRecordsPage = lazyPage(() => import("./pages/admin/EmployeeRecordsPage").then((m) => m.EmployeeRecordsPage));
const SystemSettingsPage = lazyPage(() => import("./pages/hubs/SystemSettingsPage").then((m) => m.SystemSettingsPage));
const ReviewCenterPage = lazyPage(() => import("./pages/admin/ReviewCenterPage").then((m) => m.ReviewCenterPage));
const FinanceRecordsPage = lazyPage(() => import("./pages/admin/FinanceRecordsPage").then((m) => m.FinanceRecordsPage));
const FinanceReportPage = lazyPage(() => import("./pages/admin/FinanceReportPage").then((m) => m.FinanceReportPage));
const FinanceImportPage = lazyPage(() => import("./pages/admin/FinanceImportPage").then((m) => m.FinanceImportPage));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/delivery" element={<DailyEntryPage />} />
              <Route path="/mileage" element={<Navigate to="/delivery?tab=mileage" replace />} />
              <Route path="/salary/me" element={<MySalaryPage />} />
              <Route path="/requests" element={<MyRequestsPage />} />
              <Route path="/account" element={<AccountPage />} />

              {/* 審核中心與車輛管理：ADMIN/MANAGER，或具「車輛管理」職務權限的員工（審核中心內只看得到報修分頁） */}
              <Route
                element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} capability="MANAGE_VEHICLES" />}
              >
                <Route path="/review" element={<ReviewCenterPage />} />
                <Route path="/admin/vehicles" element={<VehiclesPage />} />
              </Route>

              {/* 舊網址轉到整合後的頁面（書籤與通知連結仍可用） */}
              <Route path="/fuel-report" element={<Navigate to="/requests?tab=fuel" replace />} />
              <Route path="/parking-fee-report" element={<Navigate to="/requests?tab=parking" replace />} />
              <Route path="/repair-report" element={<Navigate to="/requests?tab=repair" replace />} />
              <Route path="/leaves" element={<Navigate to="/requests?tab=leave" replace />} />
              <Route path="/fuel-review" element={<Navigate to="/review?tab=fuel" replace />} />
              <Route path="/parking-fee-review" element={<Navigate to="/review?tab=parking" replace />} />
              <Route path="/repair-review" element={<Navigate to="/review?tab=repair" replace />} />
              <Route path="/admin/leaves" element={<Navigate to="/review?tab=leave" replace />} />

              {/* 記帳與帳務月報：董事長，或具「記帳」職務權限的員工（其記帳需董事長審核） */}
              <Route element={<ProtectedRoute roles={["ADMIN"]} capability="MANAGE_FINANCE" />}>
                <Route path="/admin/finance" element={<FinanceRecordsPage />} />
                <Route path="/admin/finance/report" element={<FinanceReportPage />} />
              </Route>

              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="/admin" element={<OperationsPage />} />
                <Route path="/admin/assets" element={<AssetsPage />} />
                <Route path="/admin/daily-operations" element={<Navigate to="/admin?tab=daily" replace />} />
                <Route path="/admin/delivery-status" element={<Navigate to="/admin?tab=day" replace />} />
                <Route path="/admin/vehicle-status" element={<Navigate to="/admin?tab=vehicles" replace />} />
                <Route path="/admin/dispatch" element={<Navigate to="/admin?tab=day" replace />} />
                <Route path="/admin/salary" element={<SalaryHubPage />} />
                <Route path="/admin/employees" element={<StaffPage />} />
                <Route path="/admin/employees/:id/records" element={<EmployeeRecordsPage />} />
                <Route path="/admin/performance" element={<Navigate to="/admin/employees?tab=performance" replace />} />
                <Route path="/admin/pay-grades" element={<Navigate to="/admin/salary?tab=grades" replace />} />
                <Route path="/admin/settings" element={<SystemSettingsPage />} />
                <Route path="/admin/finance/import" element={<FinanceImportPage />} />
                <Route path="/admin/finance/settings" element={<Navigate to="/admin/settings?tab=finance" replace />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
