import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { DailyDeliveryPage } from "./pages/employee/DailyDeliveryPage";
import { MileagePage } from "./pages/employee/MileagePage";
import { MySalaryPage } from "./pages/employee/MySalaryPage";
import { LeaveRequestPage } from "./pages/employee/LeaveRequestPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { DailyOperationsPage } from "./pages/admin/DailyOperationsPage";
import { DailyDeliveryStatusPage } from "./pages/admin/DailyDeliveryStatusPage";
import { VehicleStatusPage } from "./pages/admin/VehicleStatusPage";
import { SalaryPage } from "./pages/admin/SalaryPage";
import { DispatchPage } from "./pages/admin/DispatchPage";
import { ReconciliationPage } from "./pages/admin/ReconciliationPage";
import { VehiclesPage } from "./pages/admin/VehiclesPage";
import { EmployeesPage } from "./pages/admin/EmployeesPage";
import { EmployeeRecordsPage } from "./pages/admin/EmployeeRecordsPage";
import { SettingsPage } from "./pages/admin/SettingsPage";
import { LeaveManagementPage } from "./pages/admin/LeaveManagementPage";
import { RegionManagementPage } from "./pages/admin/RegionManagementPage";
import { MyRegionPage } from "./pages/employee/MyRegionPage";
import { SchedulePage } from "./pages/admin/SchedulePage";
import { MySchedulePage } from "./pages/employee/MySchedulePage";

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
              <Route path="/delivery" element={<DailyDeliveryPage />} />
              <Route path="/mileage" element={<MileagePage />} />
              <Route path="/salary/me" element={<MySalaryPage />} />
              <Route path="/leaves" element={<LeaveRequestPage />} />

              <Route path="/my-schedule" element={<MySchedulePage />} />

              <Route element={<ProtectedRoute roles={["REGION_MANAGER"]} />}>
                <Route path="/my-region" element={<MyRegionPage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute roles={["ADMIN", "MANAGER", "REGION_MANAGER"]} />
                }
              >
                <Route path="/schedule" element={<SchedulePage />} />
              </Route>

              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="/admin" element={<DashboardPage />} />
                <Route path="/admin/daily-operations" element={<DailyOperationsPage />} />
                <Route path="/admin/delivery-status" element={<DailyDeliveryStatusPage />} />
                <Route path="/admin/vehicle-status" element={<VehicleStatusPage />} />
                <Route path="/admin/salary" element={<SalaryPage />} />
                <Route path="/admin/dispatch" element={<DispatchPage />} />
                <Route path="/admin/reconciliation" element={<ReconciliationPage />} />
                <Route path="/admin/vehicles" element={<VehiclesPage />} />
                <Route path="/admin/employees" element={<EmployeesPage />} />
                <Route path="/admin/employees/:id/records" element={<EmployeeRecordsPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />
                <Route path="/admin/leaves" element={<LeaveManagementPage />} />
                <Route path="/regions" element={<RegionManagementPage />} />
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
