import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { asBillError } from "@/data/errors";
import { removeUnit } from "@/data/stock";
import type { Role } from "@/data/types";

export interface SerialToRemove {
  unitId: string;
  serial: string;
  product: string;
  /** Pieces of this product in stock now, when known (shown as "3 → 2"). */
  inStock?: number;
}

/**
 * Owner / admin: take a serial number entered by mistake off the stock (it is not sold).
 * Asks first with a plain summary. Resolves true when it was removed.
 */
export function useRemoveSerial(role: Role | undefined) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();

  return async (unit: SerialToRemove): Promise<boolean> => {
    if (role !== "owner" && role !== "admin") return false;
    const ok = await confirm({
      title: t("stock.removeSerialTitle", { serial: unit.serial }),
      message: t("stock.removeSerialText"),
      lines: [
        {
          label: unit.product,
          value: unit.inStock !== undefined ? `${unit.inStock} → ${Math.max(unit.inStock - 1, 0)}` : t("stock.removeSerialLess"),
        },
      ],
      confirmLabel: t("stock.removeSerialYes"),
      tone: "danger",
    });
    if (!ok) return false;
    try {
      await removeUnit(unit.unitId, role);
      toast(t("stock.serialRemoved", { serial: unit.serial }));
      return true;
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
      return false;
    }
  };
}
