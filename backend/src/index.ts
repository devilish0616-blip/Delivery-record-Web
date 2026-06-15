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
import reconciliationRoutes from "./routes/reconciliation.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import announcementRoutes from "./routes/announcement.routes";
import eventRoutes from "./routes/event.routes";
import leaveRoutes from "./routes/leave.routes";
import regionRoutes from "./routes/region.routes";
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
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/announcement", announcementRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/regions", regionRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`物流員工管理系統 API 伺服器運行於 http://localhost:${port}`);
});
