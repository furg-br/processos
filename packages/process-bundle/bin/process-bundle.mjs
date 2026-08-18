#!/usr/bin/env node

try {
  await import("../dist/cli.js");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("dist/cli.js")) {
    console.error("O CLI process-bundle ainda não foi compilado. Execute: pnpm --filter @furg/processos-bundle build");
    process.exitCode = 1;
  } else {
    throw error;
  }
}
