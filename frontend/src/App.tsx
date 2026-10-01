import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { DailyEntryPage } from "./pages/hubs/DailyEntryPage";
import { MySalaryPage } from "./pages/employee/MySalaryPage";
import { MyRequestsPage } from "./pages/employee/MyRequestsPage";
import { OperationsPage } from "./pages/admin/OperationsPage";
import { SalaryHubPage } from "./pages/hubs/SalaryHubPage";
import { VehiclesPage } from "./pages/admin/VehiclesPage";
import { StaffPage } from "./pages/hubs/StaffPage";
import { EmployeeRecordsPage } from "./pages/admin/EmployeeRecordsPage";
import { SystemSettingsPage } from "./pages/hubs/SystemSettingsPage";
import { ReviewCenterPage } from "./pages/admin/ReviewCenterPage";
import { FinanceRecordsPage } from "./pages/admin/FinanceRecordsPage";
import { FinanceReportPage } from "./pages/admin/FinanceReportPage";
import { FinanceImportPage } from "./pages/admin/FinanceImportPage";

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
