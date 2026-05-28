// // =============================================================
// // src/lib/fakeData.ts
// // =============================================================

// import type { SAPModuleConfig, Widget, WidgetDataRow, SqlTestResult } from "../types/index";

// export const FAKE_MODULES: SAPModuleConfig[] = [
//   { id: "m1", name: "Sales", description: "Orders, invoices & revenue analytics", icon: "TrendingUp", widgetCount: 3, createdAt: "2024-01-01T00:00:00Z" },
//   { id: "m2", name: "Finance", description: "AR, AP, GL & cash flow reports", icon: "DollarSign", widgetCount: 2, createdAt: "2024-01-02T00:00:00Z" },
//   { id: "m3", name: "Inventory", description: "Stock levels, movements & valuation", icon: "Package", widgetCount: 2, createdAt: "2024-01-03T00:00:00Z" },
//   { id: "m4", name: "Purchasing", description: "Purchase orders & vendor analytics", icon: "ShoppingCart", widgetCount: 1, createdAt: "2024-01-04T00:00:00Z" },
// ];

// export const FAKE_WIDGETS: Widget[] = [
//   // Sales
//   {
//     id: "w1", moduleId: "m1", moduleName: "Sales",
//     name: "Revenue MTD", description: "Month-to-date sales revenue",
//     type: "kpi", commandType: "GET",
//     sqlQuery: "SELECT SUM(DocTotal) AS Revenue FROM OINV WHERE MONTH(DocDate) = MONTH(GETDATE()) AND CANCELED = 'N'",
//     refreshIntervalSec: 300, detectedColumns: ["Revenue"],
//     allowedRoles: ["CFO", "Admin", "Manager"], allowedUserIds: [],
//     createdAt: "2024-01-05T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   {
//     id: "w2", moduleId: "m1", moduleName: "Sales",
//     name: "Sales by Branch", description: "Revenue breakdown per branch",
//     type: "bar", commandType: "GET",
//     sqlQuery: "SELECT BPLName AS Branch, SUM(DocTotal) AS Revenue FROM OINV INNER JOIN OBPL ON OINV.BPL_IDAssigned = OBPL.BPLId WHERE MONTH(DocDate) = MONTH(GETDATE()) GROUP BY BPLName ORDER BY Revenue DESC",
//     refreshIntervalSec: 300, detectedColumns: ["Branch", "Revenue"],
//     allowedRoles: ["CFO", "Admin", "Manager"], allowedUserIds: [],
//     createdAt: "2024-01-06T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   {
//     id: "w3", moduleId: "m1", moduleName: "Sales",
//     name: "Revenue Trend", description: "6-month revenue trend",
//     type: "line", commandType: "GET",
//     sqlQuery: "SELECT FORMAT(DocDate,'MMM yyyy') AS Month, SUM(DocTotal) AS Revenue FROM OINV WHERE DocDate >= DATEADD(MONTH,-6,GETDATE()) AND CANCELED='N' GROUP BY FORMAT(DocDate,'MMM yyyy'), YEAR(DocDate), MONTH(DocDate) ORDER BY YEAR(DocDate), MONTH(DocDate)",
//     refreshIntervalSec: 600, detectedColumns: ["Month", "Revenue"],
//     allowedRoles: ["CFO", "Admin", "Manager", "Viewer"], allowedUserIds: [],
//     createdAt: "2024-01-07T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   // Finance
//   {
//     id: "w4", moduleId: "m2", moduleName: "Finance",
//     name: "Open AR Balance", description: "Total outstanding receivables",
//     type: "kpi", commandType: "GET",
//     sqlQuery: "SELECT SUM(Balance) AS ARBalance FROM OCRD WHERE CardType = 'C' AND Balance > 0",
//     refreshIntervalSec: 600, detectedColumns: ["ARBalance"],
//     allowedRoles: ["CFO", "Admin"], allowedUserIds: [],
//     createdAt: "2024-01-08T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   {
//     id: "w5", moduleId: "m2", moduleName: "Finance",
//     name: "Open Invoices", description: "Top open invoices by balance",
//     type: "table", commandType: "GET",
//     sqlQuery: "SELECT TOP 10 DocNum, CardName, DocDate, DueDate, (DocTotal - PaidToDate) AS Balance FROM OINV WHERE CANCELED='N' AND DocStatus='O' ORDER BY Balance DESC",
//     refreshIntervalSec: 60, detectedColumns: ["DocNum", "CardName", "DocDate", "DueDate", "Balance"],
//     allowedRoles: ["CFO", "Admin"], allowedUserIds: [],
//     createdAt: "2024-01-09T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   // Inventory
//   {
//     id: "w6", moduleId: "m3", moduleName: "Inventory",
//     name: "Warehouse Stock Value", description: "Stock valuation per warehouse",
//     type: "bar", commandType: "GET",
//     sqlQuery: "SELECT WhsName AS Warehouse, SUM(OnHand * AvgPrice) AS Value FROM OITW INNER JOIN OWHS ON OITW.WhsCode = OWHS.WhsCode INNER JOIN OITM ON OITW.ItemCode = OITM.ItemCode WHERE OITW.OnHand > 0 GROUP BY WhsName ORDER BY Value DESC",
//     refreshIntervalSec: 900, detectedColumns: ["Warehouse", "Value"],
//     allowedRoles: ["CFO", "Admin", "Manager"], allowedUserIds: [],
//     createdAt: "2024-01-10T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   {
//     id: "w7", moduleId: "m3", moduleName: "Inventory",
//     name: "Stock by Category", description: "Inventory value by item group",
//     type: "donut", commandType: "GET",
//     sqlQuery: "SELECT ItmsGrpNam AS Category, SUM(OnHand * AvgPrice) AS Value FROM OITW INNER JOIN OITM ON OITW.ItemCode = OITM.ItemCode INNER JOIN OITB ON OITM.ItmsGrpCod = OITB.ItmsGrpCod WHERE OITW.OnHand > 0 GROUP BY ItmsGrpNam",
//     refreshIntervalSec: 900, detectedColumns: ["Category", "Value"],
//     allowedRoles: ["CFO", "Admin", "Manager"], allowedUserIds: [],
//     createdAt: "2024-01-11T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
//   // Purchasing
//   {
//     id: "w8", moduleId: "m4", moduleName: "Purchasing",
//     name: "Open Purchase Orders", description: "Open POs by vendor",
//     type: "table", commandType: "GET",
//     sqlQuery: "SELECT TOP 10 DocNum, CardName AS Vendor, DocDate, DocTotal, DocDueDate FROM OPOR WHERE DocStatus='O' AND CANCELED='N' ORDER BY DocTotal DESC",
//     refreshIntervalSec: 300, detectedColumns: ["DocNum", "Vendor", "DocDate", "DocTotal", "DocDueDate"],
//     allowedRoles: ["CFO", "Admin", "Manager"], allowedUserIds: [],
//     createdAt: "2024-01-12T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
//   },
// ];

// // Fake data rows per widget
// export const FAKE_WIDGET_DATA: Record<string, WidgetDataRow[]> = {
//   w1: [{ Revenue: 2847650 }],
//   w2: [
//     { Branch: "Karachi", Revenue: 1240000 },
//     { Branch: "Lahore", Revenue: 890000 },
//     { Branch: "Islamabad", Revenue: 610000 },
//     { Branch: "Faisalabad", Revenue: 340000 },
//     { Branch: "Multan", Revenue: 210000 },
//   ],
//   w3: [
//     { Month: "Jan 2024", Revenue: 1850000 },
//     { Month: "Feb 2024", Revenue: 2100000 },
//     { Month: "Mar 2024", Revenue: 1780000 },
//     { Month: "Apr 2024", Revenue: 2450000 },
//     { Month: "May 2024", Revenue: 2680000 },
//     { Month: "Jun 2024", Revenue: 2847650 },
//   ],
//   w4: [{ ARBalance: 1124330 }],
//   w5: [
//     { DocNum: 4891, CardName: "TechPak Ltd", DocDate: "2024-05-12", DueDate: "2024-06-12", Balance: 345000 },
//     { DocNum: 4856, CardName: "Global Trading Co", DocDate: "2024-05-08", DueDate: "2024-06-08", Balance: 240000 },
//     { DocNum: 4799, CardName: "Arif Industries", DocDate: "2024-04-22", DueDate: "2024-05-22", Balance: 215000 },
//     { DocNum: 4901, CardName: "Sunrise Enterprises", DocDate: "2024-05-18", DueDate: "2024-06-18", Balance: 138000 },
//     { DocNum: 4778, CardName: "Al-Faisal Corp", DocDate: "2024-04-15", DueDate: "2024-05-15", Balance: 125000 },
//   ],
//   w6: [
//     { Warehouse: "Main WH", Value: 4200000 },
//     { Warehouse: "Lahore Store", Value: 1800000 },
//     { Warehouse: "Karachi Depot", Value: 1200000 },
//     { Warehouse: "Transit WH", Value: 450000 },
//   ],
//   w7: [
//     { Category: "Electronics", Value: 2800000 },
//     { Category: "Raw Materials", Value: 1900000 },
//     { Category: "FMCG", Value: 1200000 },
//     { Category: "Machinery", Value: 750000 },
//   ],
//   w8: [
//     { DocNum: 1201, Vendor: "Al-Noor Suppliers", DocDate: "2024-05-20", DocTotal: 480000, DocDueDate: "2024-06-20" },
//     { DocNum: 1198, Vendor: "Prime Components", DocDate: "2024-05-15", DocTotal: 320000, DocDueDate: "2024-06-15" },
//     { DocNum: 1185, Vendor: "Tech Parts Ltd", DocDate: "2024-05-10", DocTotal: 195000, DocDueDate: "2024-06-10" },
//   ],
// };

// // Fake SQL test result
// export const FAKE_SQL_RESULT: SqlTestResult = {
//   success: true,
//   columns: ["DocNum", "CardName", "DocTotal", "DocDate", "Balance"],
//   rows: [
//     { DocNum: 4901, CardName: "TechPak Ltd", DocTotal: 345000, DocDate: "2024-06-01", Balance: 345000 },
//     { DocNum: 4902, CardName: "Global Trading", DocTotal: 180000, DocDate: "2024-06-02", Balance: 180000 },
//     { DocNum: 4903, CardName: "Sunrise Corp", DocTotal: 95000, DocDate: "2024-06-03", Balance: 95000 },
//   ],
//   executionMs: 42,
//   rowCount: 3,
// };

// export const FAKE_BRANCHES = [
//   { value: "all", label: "All Branches" },
//   { value: "KHI", label: "Karachi" },
//   { value: "LHE", label: "Lahore" },
//   { value: "ISB", label: "Islamabad" },
// ];

// export const FAKE_WAREHOUSES = [
//   { value: "all", label: "All Warehouses" },
//   { value: "MAIN", label: "Main Warehouse" },
//   { value: "LHR", label: "Lahore Store" },
//   { value: "KHI-D", label: "Karachi Depot" },
// ];
