import { useParams } from "react-router";
import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getSharedBill } from "@/data/bills";
import { useAsync } from "@/lib/useAsync";
import { BillSheet } from "./BillSheet";

/** What the customer sees when they open the bill link from WhatsApp. No login needed. */
export function SharedBillPage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const billQ = useAsync(() => getSharedBill(token), [token]);
  const bill = billQ.data;

  return (
    <div className="min-h-dvh bg-slate-100 px-3 py-5 sm:px-6 print:bg-white print:p-0">
      {billQ.loading ? (
        <div className="mx-auto h-[600px] max-w-[210mm] animate-pulse rounded bg-white" />
      ) : !bill ? (
        <Card className="mx-auto mt-10 max-w-md p-8 text-center text-[15px] text-slate-700">{t("bills.shared.notFound")}</Card>
      ) : (
        <>
          <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
            <h1 className="text-lg font-bold text-slate-900">{t("bills.shared.title", { shop: bill.shop.shopName })}</h1>
            <Button icon={Printer} onClick={() => window.print()}>
              {t("bills.shared.print")}
            </Button>
          </div>
          <div className="overflow-x-auto print:overflow-visible">
            <BillSheet bill={bill} className="min-w-[640px] print:min-w-0" />
          </div>
        </>
      )}
    </div>
  );
}
