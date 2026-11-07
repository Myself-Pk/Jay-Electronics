import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/auth/LoginScreen";
import { useSession } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { RadioCard } from "@/components/ui/RadioCard";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { NotAvailableYetError } from "@/data/errors";
import { addPerson, changePin, listPeople, updatePerson } from "@/data/people";
import type { Person, Role } from "@/data/types";
import { useAsync } from "@/lib/useAsync";
import { isValidPin } from "@/lib/validation";

const ROLES: Role[] = ["owner", "staff", "admin"];
const isOwnerRole = (role: Role) => role === "owner" || role === "admin";
const digitsOnly = (text: string) => text.replace(/\D/g, "").slice(0, 6);

function PinInputs({
  pin,
  pin2,
  setPin,
  setPin2,
  errors,
}: {
  pin: string;
  pin2: string;
  setPin: (v: string) => void;
  setPin2: (v: string) => void;
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("settings.people.pin")} htmlFor="person-pin" error={errors.pin ? t(errors.pin) : undefined}>
        <Input
          id="person-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(digitsOnly(e.target.value))}
          invalid={!!errors.pin}
          className="tracking-[0.4em]"
        />
      </Field>
      <Field label={t("settings.people.confirmPin")} htmlFor="person-pin2" error={errors.pin2 ? t(errors.pin2) : undefined}>
        <Input
          id="person-pin2"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin2}
          onChange={(e) => setPin2(digitsOnly(e.target.value))}
          invalid={!!errors.pin2}
          className="tracking-[0.4em]"
        />
      </Field>
    </div>
  );
}

function checkPins(pin: string, pin2: string): Record<string, string> {
  if (!isValidPin(pin)) return { pin: "settings.people.pinInvalid" };
  if (pin !== pin2) return { pin2: "settings.people.pinMismatch" };
  return {};
}

function PersonDialog({
  open,
  person,
  people,
  onClose,
  onSaved,
}: {
  open: boolean;
  person: Person | null;
  people: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [active, setActive] = useState(true);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(person?.name ?? "");
    setRole(person?.role ?? "staff");
    setActive(person?.active ?? true);
    setPin("");
    setPin2("");
    setErrors({});
  }, [open, person]);

  const save = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "validation.required";
    if (!person) Object.assign(next, checkPins(pin, pin2));
    if (person && isOwnerRole(person.role) && person.active && (!isOwnerRole(role) || !active)) {
      const otherOwners = people.filter((p) => p.id !== person.id && p.active && isOwnerRole(p.role));
      if (otherOwners.length === 0) next.role = "settings.people.lastOwner";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      if (person) {
        await updatePerson(person.id, { name: name.trim(), role, active });
        toast(t("settings.people.updated", { name: name.trim() }));
      } else {
        await addPerson({ name: name.trim(), role, pin });
        toast(t("settings.people.added", { name: name.trim() }));
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof NotAvailableYetError) toast(t("common.notYet"), "info");
      else {
        console.error(err);
        toast(t("common.somethingWrong"), "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={person ? t("settings.people.edit") : t("settings.people.add")}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label={t("settings.people.name")} htmlFor="person-name" error={errors.name ? t(errors.name) : undefined}>
          <Input
            id="person-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            invalid={!!errors.name}
            autoFocus
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t("settings.people.role")}</p>
          <div role="radiogroup" className="flex flex-col gap-2">
            {ROLES.map((r) => (
              <RadioCard
                key={r}
                selected={role === r}
                onSelect={() => setRole(r)}
                title={t(`common.roles.${r}`)}
                text={t(`settings.people.roleText.${r}`)}
              />
            ))}
          </div>
          {errors.role ? <p className="mt-2 text-sm text-red-600">{t(errors.role)}</p> : null}
        </div>
        {person ? (
          <Switch checked={active} onChange={setActive} label={active ? t("common.active") : t("common.inactive")} />
        ) : (
          <PinInputs pin={pin} pin2={pin2} setPin={setPin} setPin2={setPin2} errors={errors} />
        )}
      </div>
    </Dialog>
  );
}

function PinDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { person: me } = useSession();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPin("");
    setPin2("");
    setErrors({});
  }, [person]);

  const save = async () => {
    if (!person) return;
    const next = checkPins(pin, pin2);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      await changePin(person.id, pin, me?.id);
      toast(t("settings.people.pinChanged", { name: person.name }));
      onClose();
    } catch (err) {
      if (err instanceof NotAvailableYetError) toast(t("common.notYet"), "info");
      else {
        console.error(err);
        toast(t("common.somethingWrong"), "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={person !== null}
      onClose={onClose}
      size="sm"
      title={t("settings.people.changePin")}
      description={person?.name}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <PinInputs pin={pin} pin2={pin2} setPin={setPin} setPin2={setPin2} errors={errors} />
      </div>
    </Dialog>
  );
}

export function PeopleSection() {
  const { t } = useTranslation();
  const { person: me } = useSession();
  const people = useAsync(listPeople);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [pinFor, setPinFor] = useState<Person | null>(null);
  const list = people.data ?? [];

  return (
    <Card>
      <CardHeader
        icon={Users}
        title={t("settings.people.title")}
        description={t("settings.people.description")}
        actions={
          <Button size="sm" icon={Plus} onClick={() => setEditing("new")}>
            <span className="hidden sm:inline">{t("settings.people.add")}</span>
          </Button>
        }
      />
      {people.loading ? (
        <div className="space-y-3 p-5">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
              <Avatar name={p.name} index={i} className="size-10 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-slate-900">
                  {p.name}
                  {p.id === me?.id ? <span className="font-normal text-slate-500"> ({t("common.you")})</span> : null}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  <Badge tone={isOwnerRole(p.role) ? "brand" : "neutral"}>{t(`common.roles.${p.role}`)}</Badge>
                  {p.active ? null : <Badge tone="red">{t("common.inactive")}</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setPinFor(p)}>
                  {t("settings.people.changePin")}
                </Button>
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(p)}>
                  {t("common.edit")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PersonDialog
        open={editing !== null}
        person={editing === "new" ? null : editing}
        people={list}
        onClose={() => setEditing(null)}
        onSaved={people.reload}
      />
      <PinDialog person={pinFor} onClose={() => setPinFor(null)} />
    </Card>
  );
}
