import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import deliveryRoutes from "./routes/delivery.routes";
import mileageRoutes from "./routes/mileage.routes";
import vehicleRoutes from "./routes/vehicle.routes";
import employeeRoutes from "./routes/employee.routes";
import dispatchRoutes from "./routes/dispatch.routes";
import dailyRoleRoutes from "./routes/dailyRole.routes";
import settingsRoutes from "./routes/settings.routes";
import salaryRoutes from "./routes/salary.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import announcementRoutes from "./routes/announcement.routes";
import eventRoutes from "./routes/event.routes";
import leaveRoutes from "./routes/leave.routes";
import { createExpenseReportRouter } from "./routes/expenseReport.routes";
import reviewRoutes from "./routes/review.routes";
import homeRoutes from "./routes/home.routes";
import assetRoutes from "./routes/asset.routes";
import repairRequestRoutes from "./routes/repairRequest.routes";
import jobPositionRoutes from "./routes/jobPosition.routes";
import payGradeRoutes from "./routes/payGrade.routes";
import financeRoutes from "./routes/finance.routes";
import dailyEntryRoutes from "./routes/dailyEntry.routes";
import checksRoutes from "./routes/checks.routes";
import reportsRoutes from "./routes/reports.routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/mileage", mileageRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/daily-roles", dailyRoleRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/salary", salaryRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/announcement", announcementRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/fuel-reports", createExpenseReportRouter("fuel"));
app.use("/api/parking-fee-reports", createExpenseReportRouter("parking"));
app.use("/api/review", reviewRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/repair-requests", repairRequestRoutes);
app.use("/api/job-positions", jobPositionRoutes);
app.use("/api/pay-grades", payGradeRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/daily-entry", dailyEntryRoutes);
app.use("/api/checks", checksRoutes);
app.use("/api/reports", reportsRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`物流員工管理系統 API 伺服器運行於 http://localhost:${port}`);
});
