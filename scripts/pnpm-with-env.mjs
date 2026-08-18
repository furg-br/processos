import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

try {
  Object.assign(process.env, parseEnv(readFileSync(".env", "utf8")));
} catch (error) {
  if (error?.code === "ENOENT") {
    console.error("Arquivo .env não encontrado. Copie .env.example para .env antes de continuar.");
    process.exit(1);
  }
  throw error;
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("Execute este wrapper por meio de um script pnpm do projeto.");
  process.exit(1);
}
const child = spawn(process.execPath, [pnpmCli, ...process.argv.slice(2)], {
  env: process.env,
  shell: false,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Não foi possível iniciar o pnpm: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
