import { supabase } from "@/lib/supabase";
import { previewDb } from "./preview-billing";
import { previewDelay } from "./preview-store";
import type { Customer, CustomerType } from "./types";

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  area: string;
  customer_type: CustomerType;
}

const toCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  area: r.area,
  type: r.customer_type,
});

/** Escape % and _ so they are matched literally in a LIKE search. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Find customers by the start of their phone number, or by part of their name. */
export async function searchCustomers(query: string, limit = 6): Promise<Customer[]> {
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  const byPhone = /^[\d\s+-]+$/.test(q);
  if (byPhone ? digits.length < 3 : q.length < 2) return [];

  if (!supabase) {
    await previewDelay(80);
    const lower = q.toLowerCase();
    return previewDb()
      .customers.filter((c) => (byPhone ? (c.phone ?? "").startsWith(digits) : c.name.toLowerCase().includes(lower)))
      .slice(0, limit)
      .map((c) => ({ ...c }));
  }
  let request = supabase.from("customers").select("id, name, phone, area, customer_type").eq("active", true);
  request = byPhone ? request.like("phone", `${digits}%`) : request.ilike("name", `%${escapeLike(q)}%`);
  const { data, error } = await request.order("name").limit(limit);
  if (error) throw error;
  return (data as CustomerRow[]).map(toCustomer);
}

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  if (!supabase) {
    const found = previewDb().customers.find((c) => c.phone === digits);
    return found ? { ...found } : null;
  }
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, area, customer_type")
    .eq("phone", digits)
    .maybeSingle<CustomerRow>();
  if (error) throw error;
  return data ? toCustomer(data) : null;
}
