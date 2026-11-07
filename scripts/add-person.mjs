// Adds someone who can log in to the app (owner, staff or admin).
// Usage: npm run add-person   (asks for name, role and a 6-digit PIN; the PIN is hidden as you type)
// Needs VITE_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local — see supabase/SETUP.md.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.VITE_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secret) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SECRET_KEY must be filled in .env.local first.");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/** Ask without showing what's typed (dots instead), for the PIN. */
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      // Not a real terminal: fall back to a normal question.
      ask("").then(resolve);
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(1);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += ch;
        process.stdout.write("•");
      }
    };
    stdin.on("data", onData);
  });
}

console.log("\nAdd a person who can log in to Jay Electronics\n");

let name = "";
while (!name) name = await ask("Name (as shown on the login screen, e.g. Papa or Ramesh): ");

const roles = { 1: "owner", 2: "staff", 3: "admin" };
let role;
while (!role) {
  const pick = await ask("What can they do?  1 = Owner (everything)  2 = Staff (billing, no profit)  3 = Admin (you): ");
  role = roles[pick] ?? (Object.values(roles).includes(pick.toLowerCase()) ? pick.toLowerCase() : undefined);
}

let pin = "";
for (;;) {
  pin = await askHidden("6-digit PIN: ");
  if (!/^\d{6}$/.test(pin)) {
    console.log("The PIN must be exactly 6 digits. Try again.");
    continue;
  }
  const again = await askHidden("Type the PIN again: ");
  if (again === pin) break;
  console.log("The two PINs were different. Try again.");
}

// Logins need an email behind the scenes. People never see or type it, and it can't receive mail,
// so nobody's real email is exposed on the login screen.
const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person";
let email = `${slug}-${randomBytes(3).toString("hex")}@jay-electronics.invalid`;

let created = await admin.auth.admin.createUser({ email, password: pin, email_confirm: true, user_metadata: { name } });
if (created.error && /email/i.test(created.error.message)) {
  console.log("\nSupabase wants a real-looking email for this login. It's only used behind the scenes.");
  console.log("Tip: use your Gmail with a + tag, e.g. yourname+" + slug + "@gmail.com\n");
  email = await ask("Email for this login: ");
  created = await admin.auth.admin.createUser({ email, password: pin, email_confirm: true, user_metadata: { name } });
}
if (created.error) {
  console.error(`\nCould not create the login: ${created.error.message}`);
  process.exit(1);
}

const { error } = await admin.from("people").insert({ id: created.data.user.id, name, role, login_email: email });
if (error) {
  // Don't leave a half-made login behind.
  await admin.auth.admin.deleteUser(created.data.user.id);
  console.error(`\nCould not save ${name}: ${error.message}`);
  console.error("Has the database been set up yet? Run: npm run db:migrate");
  process.exit(1);
}

console.log(`\n✓ ${name} added as ${role}. They can now tap their name on the login screen and enter their PIN.`);
