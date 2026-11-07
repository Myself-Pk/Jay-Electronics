// Sets up (or removes) the hourly Windows task that keeps the shop backed up.
// The task checks every hour, hidden in the background (`backup.mjs --if-due`), and takes ONE backup
// a day: after 7 PM, or as soon as the computer is on if the last backup is more than a day old.
//
//   npm run backup:schedule            set it up
//   npm run backup:schedule -- --remove   remove it
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TASK = "Jay Electronics backup";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts", "backup.mjs");

const args = process.argv.includes("--remove")
  ? ["/delete", "/tn", TASK, "/f"]
  : // conhost --headless runs it without a window popping up every hour.
    ["/create", "/tn", TASK, "/sc", "hourly", "/tr", `conhost.exe --headless "${process.execPath}" "${script}" --if-due`, "/f"];

const result = spawnSync("schtasks", args, { encoding: "utf8" });
if (result.status !== 0) {
  console.error(`✗ ${(result.stderr || result.stdout).trim()}`);
  process.exit(1);
}
console.log(
  process.argv.includes("--remove")
    ? `✓ Removed the "${TASK}" task.`
    : `✓ "${TASK}" is on: one backup a day, after 7 PM (or as soon as the computer is on, if it was off).`,
);
