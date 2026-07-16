import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const source = process.env.FURG_DESIGN_SYSTEM_PATH ?? "C:\\Projetos\\design-system-furg";
const destination = resolve("vendor");
const expected = resolve(destination, "furg-design-system-0.4.0.tgz");

if (!existsSync(source)) {
  throw new Error(`DS-FURG não encontrado em ${source}. Defina FURG_DESIGN_SYSTEM_PATH.`);
}
mkdirSync(destination, { recursive: true });
rmSync(expected, { force: true });
execFileSync("pnpm", ["pack", "--pack-destination", destination], { cwd: source, stdio: "inherit", shell: process.platform === "win32" });
const generated = resolve(destination, "furg-design-system-0.4.0.tgz");
if (!existsSync(generated)) throw new Error("O empacotamento do DS-FURG não produziu a versão 0.4.0 esperada.");
if (generated !== expected) renameSync(generated, expected);
console.log(`DS-FURG preparado em ${expected}`);
