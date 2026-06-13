import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DailyDeliveryPage } from "./pages/employee/DailyDeliveryPage";
import { MileagePage } from "./pages/employee/MileagePage";
import { MySalaryPage } from "./pages/employee/MySalaryPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { SalaryPage } from "./pages/admin/SalaryPage";
import { DispatchPage } from "./pages/admin/DispatchPage";
import { ReconciliationPage } from "./pages/admin/ReconciliationPage";
import { VehiclesPage } from "./pages/admin/VehiclesPage";
import { EmployeesPage } from "./pages/admin/EmployeesPage";
import { SettingsPage } from "./pages/admin/SettingsPage";

function HomeRedirect() {
  const { user } = useAuth();
  const isStaff = user?.role === "ADMIN" || user?.role === "MANAGER";
  return <Navigate to={isStaff ? "/admin" : "/delivery"} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/delivery" element={<DailyDeliveryPage />} />
              <Route path="/mileage" element={<MileagePage />} />
              <Route path="/salary/me" element={<MySalaryPage />} />

              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="/admin" element={<DashboardPage />} />
                <Route path="/admin/salary" element={<SalaryPage />} />
                <Route path="/admin/dispatch" element={<DispatchPage />} />
                <Route path="/admin/reconciliation" element={<ReconciliationPage />} />
                <Route path="/admin/vehicles" element={<VehiclesPage />} />
                <Route path="/admin/employees" element={<EmployeesPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />
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
