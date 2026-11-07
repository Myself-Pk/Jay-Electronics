import { Navigate, Route, Routes } from "react-router";
import { LoginScreen } from "@/auth/LoginScreen";
import { OwnerOnly } from "@/auth/OwnerOnly";
import { SessionProvider, useSession } from "@/auth/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { ToastProvider } from "@/components/ui/Toast";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

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
        <Route path="bills" element={<ComingSoonPage feature="bills" />} />
        <Route path="bills/new" element={<ComingSoonPage feature="newBill" />} />
        <Route path="customers" element={<ComingSoonPage feature="customers" />} />
        <Route path="stock" element={<ComingSoonPage feature="stock" />} />
        <Route path="purchases" element={<ComingSoonPage feature="purchases" />} />
        <Route path="purchases/new" element={<ComingSoonPage feature="purchases" />} />
        <Route path="payments/new" element={<ComingSoonPage feature="payment" />} />
        <Route path="warranty" element={<ComingSoonPage feature="warranty" />} />
        <Route path="reports" element={<ComingSoonPage feature="reports" />} />
        <Route path="close-day" element={<ComingSoonPage feature="closeDay" />} />
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
          <AppRoutes />
        </SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
