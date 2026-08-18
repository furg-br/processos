import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

const snapshotKind = "processos-furg-postgresql-snapshot";
const snapshotFormatVersion = 1;
const defaultDatabase = "processos";
const defaultUser = "processos";
const postgresService = "postgres";

function fail(message) {
  throw new Error(message);
}

function usage() {
  console.log(`Uso:
  pnpm db:snapshot:create -- [diretório]
  pnpm db:snapshot:inspect -- <diretório>
  pnpm db:snapshot:restore -- <diretório> --confirm-replace=<banco> [--target-database=<banco>]

Exemplos:
  pnpm db:snapshot:create -- C:\\Backups\\processos-2026-08-18
  pnpm db:snapshot:inspect -- C:\\Backups\\processos-2026-08-18
  pnpm db:snapshot:restore -- C:\\Backups\\processos-2026-08-18 --confirm-replace=processos
  pnpm db:snapshot:restore -- C:\\Backups\\processos-2026-08-18 --target-database=processos_restore_test --confirm-replace=processos_restore_test`);
}

function parseArguments(argv) {
  const [action, ...rest] = argv;
  const options = new Map();
  const positional = [];
  for (const argument of rest) {
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [name, ...valueParts] = argument.slice(2).split("=");
    options.set(name, valueParts.length ? valueParts.join("=") : true);
  }
  return { action, location: positional[0], options };
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

function dockerCompose(args, options = {}) {
  return run("docker", ["compose", ...args], options);
}

function postgres(args, options = {}) {
  return dockerCompose(["exec", "-T", postgresService, ...args], options);
}

function query(database, sql) {
  return postgres([
    "psql",
    "--username", defaultUser,
    "--dbname", database,
    "--tuples-only",
    "--no-align",
    "--set", "ON_ERROR_STOP=1",
    "--command", sql,
  ], { capture: true }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function optionalCommand(command, args) {
  try {
    return run(command, args, { capture: true }).trim();
  } catch {
    return null;
  }
}

function assertSafeSnapshotTarget(path) {
  const resolved = resolve(path);
  const forbidden = new Set([parse(resolved).root, resolve(process.cwd()), resolve(homedir())]);
  if (forbidden.has(resolved)) fail(`Diretório de snapshot inseguro: ${resolved}`);
  if (existsSync(resolved)) fail(`O diretório de destino já existe: ${resolved}`);
  return resolved;
}

function defaultSnapshotPath() {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  return resolve("snapshots", `processos-${timestamp}`);
}

function readAndValidateSnapshot(location) {
  if (!location) fail("Informe o diretório do snapshot.");
  const directory = resolve(location);
  const manifestPath = join(directory, "manifest.json");
  const dumpPath = join(directory, "postgres.dump");
  const checksumPath = join(directory, "SHA256SUMS");
  for (const path of [manifestPath, dumpPath, checksumPath]) {
    if (!existsSync(path) || !statSync(path).isFile()) fail(`Arquivo obrigatório ausente: ${path}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.kind !== snapshotKind || manifest.formatVersion !== snapshotFormatVersion) {
    fail("Formato de snapshot desconhecido ou incompatível.");
  }
  const expectedHash = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase();
  const actualHash = sha256(dumpPath);
  if (!expectedHash || expectedHash !== actualHash || manifest.dump.sha256 !== actualHash) {
    fail("O checksum do snapshot não confere. O arquivo pode estar corrompido ou alterado.");
  }
  return { directory, manifest, dumpPath, actualHash };
}

function databaseSummary(database) {
  const raw = query(database, `
    SELECT json_build_object(
      'processes', (SELECT count(*) FROM "Process"),
      'processVersions', (SELECT count(*) FROM "ProcessVersion"),
      'bundleResources', (SELECT count(*) FROM "BundleResource"),
      'auditEvents', (SELECT count(*) FROM "AuditEvent"),
      'migrations', (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL),
      'latestMigration', COALESCE((
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 1
      ), ''),
      'sizeBytes', pg_database_size(current_database())
    )::text;
  `);
  return JSON.parse(raw);
}

function inspect(location) {
  const snapshot = readAndValidateSnapshot(location);
  console.log(JSON.stringify({ valid: true, directory: snapshot.directory, ...snapshot.manifest }, null, 2));
}

function create(location) {
  const target = assertSafeSnapshotTarget(location ? resolve(location) : defaultSnapshotPath());
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(parent, ".processos-snapshot-"));
  const containerDump = `/tmp/processos-snapshot-${randomUUID()}.dump`;
  const localDump = join(temporaryDirectory, "postgres.dump");
  try {
    dockerCompose(["up", "-d", postgresService]);
    const before = databaseSummary(defaultDatabase);
    const postgresVersion = query(defaultDatabase, "SHOW server_version;");
    postgres([
      "pg_dump",
      "--username", defaultUser,
      "--dbname", defaultDatabase,
      "--format", "custom",
      "--compress", "6",
      "--file", containerDump,
    ]);
    dockerCompose(["cp", `${postgresService}:${containerDump}`, localDump]);
    const after = databaseSummary(defaultDatabase);
    const controlFields = ["processes", "processVersions", "bundleResources", "auditEvents", "migrations", "latestMigration"];
    if (controlFields.some((field) => before[field] !== after[field])) {
      fail("O banco mudou durante a geração do snapshot. Interrompa importações e publicações e tente novamente.");
    }
    const dumpHash = sha256(localDump);
    const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    const gitCommit = optionalCommand("git", ["rev-parse", "HEAD"]);
    const gitStatus = optionalCommand("git", ["status", "--porcelain"]);
    const manifest = {
      kind: snapshotKind,
      formatVersion: snapshotFormatVersion,
      createdAt: new Date().toISOString(),
      application: {
        name: rootPackage.name,
        version: rootPackage.version,
        gitCommit,
        gitDirty: gitStatus === null ? null : gitStatus.length > 0,
      },
      database: {
        name: defaultDatabase,
        user: defaultUser,
        postgresVersion,
        schemaMigrationCount: Number(before.migrations),
        latestMigration: before.latestMigration,
        sizeBytes: Number(before.sizeBytes),
      },
      counts: {
        processes: Number(before.processes),
        processVersions: Number(before.processVersions),
        bundleResources: Number(before.bundleResources),
        auditEvents: Number(before.auditEvents),
      },
      dump: { file: "postgres.dump", format: "postgresql-custom", sha256: dumpHash },
    };
    writeFileSync(join(temporaryDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(temporaryDirectory, "SHA256SUMS"), `${dumpHash}  postgres.dump\n`);
    writeFileSync(join(temporaryDirectory, "INSTRUCOES.txt"), [
      "Snapshot completo do PostgreSQL da plataforma Processos FURG.",
      "",
      "Valide antes de restaurar:",
      "  pnpm db:snapshot:inspect -- <diretório>",
      "",
      "Restaure somente em um ambiente cujo banco possa ser substituido:",
      `  pnpm db:snapshot:restore -- <diretório> --confirm-replace=${defaultDatabase}`,
      "",
      "Consulte docs/operacao-on-premises.md no repositório da aplicação.",
      "",
    ].join("\n"));
    renameSync(temporaryDirectory, target);
    console.log(`Snapshot criado em ${target}`);
    console.log(`SHA-256: ${dumpHash}`);
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    try {
      postgres(["rm", "-f", containerDump]);
    } catch {
      // O arquivo temporário desaparece com o contêiner mesmo se a limpeza falhar.
    }
  }
}

function restore(location, options) {
  const snapshot = readAndValidateSnapshot(location);
  const targetDatabase = String(options.get("target-database") || defaultDatabase);
  const confirmation = options.get("confirm-replace");
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(targetDatabase)) fail("Nome de banco de destino inválido.");
  if (confirmation !== targetDatabase) fail(`Confirme explicitamente a substituição com --confirm-replace=${targetDatabase}`);
  if (targetDatabase !== defaultDatabase && !targetDatabase.endsWith("_restore_test")) {
    fail("Bancos alternativos de validação devem terminar em _restore_test.");
  }

  const currentCommit = optionalCommand("git", ["rev-parse", "HEAD"]);
  if (snapshot.manifest.application.gitCommit && currentCommit && snapshot.manifest.application.gitCommit !== currentCommit) {
    console.warn(`Aviso: o snapshot foi criado no commit ${snapshot.manifest.application.gitCommit}, mas o repositório está no commit ${currentCommit}.`);
  }

  const containerDump = `/tmp/processos-restore-${randomUUID()}.dump`;
  dockerCompose(["up", "-d", postgresService]);
  if (targetDatabase === defaultDatabase) dockerCompose(["stop", "api", "web"]);
  try {
    dockerCompose(["cp", snapshot.dumpPath, `${postgresService}:${containerDump}`]);
    query("postgres", `DROP DATABASE IF EXISTS "${targetDatabase}" WITH (FORCE);`);
    query("postgres", `CREATE DATABASE "${targetDatabase}" OWNER "${defaultUser}";`);
    postgres([
      "pg_restore",
      "--username", defaultUser,
      "--dbname", targetDatabase,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      containerDump,
    ]);
    const restored = databaseSummary(targetDatabase);
    const expectedCounts = snapshot.manifest.counts;
    const actualCounts = {
      processes: Number(restored.processes),
      processVersions: Number(restored.processVersions),
      bundleResources: Number(restored.bundleResources),
      auditEvents: Number(restored.auditEvents),
    };
    if (JSON.stringify(actualCounts) !== JSON.stringify(expectedCounts)) {
      fail(`A validação pós-restauração encontrou contagens divergentes. Esperado ${JSON.stringify(expectedCounts)}, obtido ${JSON.stringify(actualCounts)}.`);
    }
    if (restored.latestMigration !== snapshot.manifest.database.latestMigration) {
      fail(`A ultima migration restaurada diverge do manifesto. Esperado ${snapshot.manifest.database.latestMigration}, obtido ${restored.latestMigration}.`);
    }
    console.log(`Snapshot restaurado e validado no banco ${targetDatabase}.`);
    console.log(JSON.stringify(actualCounts, null, 2));
    if (targetDatabase === defaultDatabase) console.log("A API e a interface foram mantidas paradas. Inicie-as com: docker compose up -d api web");
  } finally {
    try {
      postgres(["rm", "-f", containerDump]);
    } catch {
      // O arquivo temporário desaparece com o contêiner mesmo se a limpeza falhar.
    }
  }
}

const { action, location, options } = parseArguments(process.argv.slice(2));

try {
  if (action === "create") create(location);
  else if (action === "inspect") inspect(location);
  else if (action === "restore") restore(location, options);
  else {
    usage();
    process.exit(action ? 1 : 0);
  }
} catch (error) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
