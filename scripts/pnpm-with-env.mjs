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

const child = spawn("pnpm", process.argv.slice(2), {
  env: process.env,
  shell: process.platform === "win32",
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
