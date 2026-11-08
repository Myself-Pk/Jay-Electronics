import { Navigate, Route, Routes } from "react-router";
import { LoginScreen } from "@/auth/LoginScreen";
import { OwnerOnly } from "@/auth/OwnerOnly";
import { SessionProvider, useSession } from "@/auth/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { ToastProvider } from "@/components/ui/Toast";
import { BillPage } from "@/pages/bills/BillPage";
import { BillsListPage } from "@/pages/bills/BillsListPage";
import { NewBillPage } from "@/pages/bills/NewBillPage";
import { SharedBillPage } from "@/pages/bills/SharedBillPage";
import { CloseDayPage } from "@/pages/closeday/CloseDayPage";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { CustomerPage } from "@/pages/customers/CustomerPage";
import { CustomersPage } from "@/pages/customers/CustomersPage";
import { PaymentReceivedPage } from "@/pages/customers/PaymentReceivedPage";
import { HomePage } from "@/pages/HomePage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { WarrantyPage } from "@/pages/warranty/WarrantyPage";
import { NewStockPage } from "@/pages/stock/NewStockPage";
import { PurchasesPage } from "@/pages/stock/PurchasesPage";
import { StockPage } from "@/pages/stock/StockPage";

function AppRoutes() {
  const { person, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="size-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-800" />
      </div>
    );
  }
  if (!person) return <LoginScreen />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="bills" element={<BillsListPage />} />
        <Route path="bills/new" element={<NewBillPage />} />
        <Route path="bills/:id" element={<BillPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="purchases/new" element={<NewStockPage />} />
        <Route path="payments/new" element={<PaymentReceivedPage />} />
        <Route path="warranty" element={<WarrantyPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="close-day" element={<CloseDayPage />} />
        <Route path="search" element={<ComingSoonPage feature="search" />} />
        <Route
          path="settings"
          element={
            <OwnerOnly>
              <SettingsPage />
            </OwnerOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SessionProvider>
          <Routes>
            {/* The bill link customers get on WhatsApp: no login needed. */}
            <Route path="/b/:token" element={<SharedBillPage />} />
            <Route path="*" element={<AppRoutes />} />
          </Routes>
        </SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
