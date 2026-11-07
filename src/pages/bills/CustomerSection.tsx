import { useEffect, useRef, useState } from "react";
import { CircleCheck, MapPin, Phone, UserRound, UserRoundPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/auth/LoginScreen";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { findCustomerByPhone, searchCustomers } from "@/data/customers";
import type { Customer, CustomerType } from "@/data/types";
import { isValidMobile, normalizeMobile } from "@/lib/validation";
import type { DraftCustomer } from "./billDraft";

/** 9876500001 → "98765 00001" */
export const formatPhone = (phone: string) => (phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone);

interface Props {
  customer: DraftCustomer;
  onChange: (customer: DraftCustomer, options?: { typeChanged?: boolean }) => void;
  invalid?: { phone?: boolean; name?: boolean };
}

export function CustomerSection({ customer, onChange, invalid }: Props) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [focus, setFocus] = useState<"phone" | "name" | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  const choose = (c: Customer) => {
    onChange(
      { id: c.id, phone: c.phone ?? "", name: c.name, area: c.area, type: c.type },
      { typeChanged: c.type !== customer.type },
    );
    setSuggestions([]);
    setFocus(null);
  };

  // Suggest customers while typing a phone number or name.
  useEffect(() => {
    if (customer.id || !focus) {
      setSuggestions([]);
      return;
    }
    const query = focus === "name" ? customer.name : customer.phone;
    const handle = window.setTimeout(() => {
      searchCustomers(query).then(setSuggestions, () => setSuggestions([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [customer.phone, customer.name, customer.id, focus]);

  // A full 10-digit number that belongs to a customer picks them straight away.
  useEffect(() => {
    if (customer.id) return;
    const digits = normalizeMobile(customer.phone);
    if (digits.length !== 10) return;
    let cancelled = false;
    findCustomerByPhone(digits).then(
      (found) => {
        if (!cancelled && found) choose(found);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.phone, customer.id]);

  const set = (patch: Partial<DraftCustomer>) => onChange({ ...customer, ...patch });
  const setType = (type: CustomerType) => onChange({ ...customer, type }, { typeChanged: type !== customer.type });
  const onFocus = (field: "phone" | "name") => {
    window.clearTimeout(blurTimer.current);
    setFocus(field);
  };
  // Wait a moment before hiding suggestions so a tap on one still registers.
  const onBlur = () => {
    blurTimer.current = window.setTimeout(() => setFocus(null), 150);
  };

  const typeSwitch = (
    <Segmented<CustomerType>
      label={t("newBill.customer")}
      value={customer.type}
      onChange={setType}
      options={[
        { value: "retail", label: t("newBill.retail") },
        { value: "dealer", label: t("newBill.dealer") },
      ]}
    />
  );

  const suggestionList =
    suggestions.length > 0 ? (
      <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        {suggestions.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-brand-50"
            >
              <Avatar name={c.name} index={i} className="size-9 text-sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-900">{c.name}</span>
                <span className="block text-sm text-slate-500">
                  {formatPhone(c.phone ?? "")}
                  {c.area ? ` · ${c.area}` : ""}
                </span>
              </span>
              {c.type === "dealer" ? <Badge tone="brand">{t("newBill.dealer")}</Badge> : null}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <Card>
      <CardHeader icon={UserRound} title={t("newBill.customer")} actions={customer.id ? null : typeSwitch} />
      <CardBody>
        {customer.id ? (
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={customer.name} className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-slate-900">{customer.name}</p>
              <p className="text-sm text-slate-500">
                {formatPhone(customer.phone)}
                {customer.area ? ` · ${customer.area}` : ""}
              </p>
              <Badge tone="green" className="mt-1">
                <CircleCheck className="size-3.5" />
                {t("newBill.existingCustomer")}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {typeSwitch}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange({ id: null, phone: "", name: "", area: "", type: "retail" }, { typeChanged: customer.type !== "retail" })}
              >
                {t("newBill.change")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("newBill.phone")} htmlFor="bill-phone">
              <div className="relative">
                <Input
                  id="bill-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  prefix={<Phone className="size-4" />}
                  value={customer.phone}
                  onChange={(e) => set({ phone: e.target.value.replace(/[^\d\s+-]/g, "").slice(0, 14) })}
                  onFocus={() => onFocus("phone")}
                  onBlur={onBlur}
                  invalid={invalid?.phone}
                  className="text-[17px] tracking-wide"
                />
                {focus === "phone" ? suggestionList : null}
              </div>
            </Field>
            <Field label={t("newBill.name")} htmlFor="bill-name">
              <div className="relative">
                <Input
                  id="bill-name"
                  autoComplete="off"
                  value={customer.name}
                  onChange={(e) => set({ name: e.target.value })}
                  onFocus={() => onFocus("name")}
                  onBlur={onBlur}
                  invalid={invalid?.name}
                />
                {focus === "name" ? suggestionList : null}
              </div>
            </Field>
            <Field label={t("newBill.area")} htmlFor="bill-area" optional={t("common.optional")}>
              <Input
                id="bill-area"
                prefix={<MapPin className="size-4" />}
                value={customer.area}
                onChange={(e) => set({ area: e.target.value })}
              />
            </Field>
            <div className="flex items-end pb-1">
              {isValidMobile(customer.phone) ? (
                <Badge tone="brand">
                  <UserRoundPlus className="size-3.5" />
                  {t("newBill.newCustomer")}
                </Badge>
              ) : (
                <p className="text-sm text-slate-500">{t("newBill.customerHint")}</p>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
