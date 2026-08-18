import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const source = process.env.FURG_DESIGN_SYSTEM_PATH ?? "C:\\Projetos\\design-system-furg";
const destination = resolve("vendor");

if (!existsSync(source)) {
  throw new Error(`DS-FURG não encontrado em ${source}. Defina FURG_DESIGN_SYSTEM_PATH.`);
}
const sourcePackage = JSON.parse(readFileSync(resolve(source, "package.json"), "utf8"));
const expected = resolve(destination, `furg-design-system-${sourcePackage.version}.tgz`);
mkdirSync(destination, { recursive: true });
rmSync(expected, { force: true });
execFileSync("pnpm", ["pack", "--pack-destination", destination], { cwd: source, stdio: "inherit", shell: process.platform === "win32" });
if (!existsSync(expected)) throw new Error(`O empacotamento do DS-FURG não produziu a versão ${sourcePackage.version} esperada.`);
console.log(`DS-FURG preparado em ${expected}`);
