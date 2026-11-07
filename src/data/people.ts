import { supabase } from "@/lib/supabase";
import { NotAvailableYetError } from "./errors";
import { previewDelay, previewStore } from "./preview-store";
import type { LoginPerson, Person, Role } from "./types";

interface PersonRow {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  login_email: string;
}

const toPerson = (row: PersonRow): Person => ({
  id: row.id,
  name: row.name,
  role: row.role,
  active: row.active,
  loginEmail: row.login_email,
});

/** People shown on the "Who is using the app?" screen. */
export async function listLoginPeople(): Promise<LoginPerson[]> {
  if (!supabase) {
    await previewDelay();
    return previewStore.people.filter((p) => p.active).map(({ active: _active, ...p }) => p);
  }
  const { data, error } = await supabase.rpc("login_people");
  if (error) throw error;
  return (data as PersonRow[]).map(({ id, name, role, login_email }) => ({ id, name, role, loginEmail: login_email }));
}

export async function listPeople(): Promise<Person[]> {
  if (!supabase) {
    await previewDelay();
    return structuredClone(previewStore.people);
  }
  const { data, error } = await supabase.from("people").select("id, name, role, active, login_email").order("name");
  if (error) throw error;
  return (data as PersonRow[]).map(toPerson);
}

export async function getPerson(id: string): Promise<Person | null> {
  if (!supabase) return structuredClone(previewStore.people.find((p) => p.id === id) ?? null);
  const { data, error } = await supabase
    .from("people")
    .select("id, name, role, active, login_email")
    .eq("id", id)
    .maybeSingle<PersonRow>();
  if (error) throw error;
  return data ? toPerson(data) : null;
}

export interface NewPerson {
  name: string;
  role: Role;
  pin: string;
}

export async function addPerson(input: NewPerson): Promise<Person> {
  if (!supabase) {
    await previewDelay(300);
    const person: Person = {
      id: `p-${crypto.randomUUID()}`,
      name: input.name,
      role: input.role,
      active: true,
      loginEmail: `${crypto.randomUUID()}@preview`,
    };
    previewStore.people.push(person);
    return structuredClone(person);
  }
  // Creating a login needs a secure server function (Supabase Edge Function). Comes with the database setup.
  throw new NotAvailableYetError("Adding people");
}

export async function updatePerson(id: string, changes: Pick<Person, "name" | "role" | "active">): Promise<void> {
  if (!supabase) {
    await previewDelay(300);
    const person = previewStore.people.find((p) => p.id === id);
    if (person) Object.assign(person, changes);
    return;
  }
  const { error } = await supabase.from("people").update(changes).eq("id", id);
  if (error) throw error;
}

export async function changePin(id: string, pin: string, currentPersonId: string | undefined): Promise<void> {
  if (!supabase) {
    await previewDelay(300);
    return;
  }
  if (id === currentPersonId) {
    const { error } = await supabase.auth.updateUser({ password: pin });
    if (error) throw error;
    return;
  }
  // Changing someone else's PIN needs the same secure server function as adding people.
  throw new NotAvailableYetError("Changing another person's PIN");
}
