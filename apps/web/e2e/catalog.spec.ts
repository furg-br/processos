import { expect, test } from "@playwright/test";
import { demoDetails, demoProcesses } from "../src/demo-data";

function titleSlug(title: string) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function processUrl(process: { id: string; title: string }, view?: "diagrama" | "estrutura" | "versoes") {
  return `/processos/${process.id}/${titleSlug(process.title)}${view ? `/${view}` : ""}`;
}

test("abre a criação de um processo BPMN do zero", async ({ page }) => {
  await page.route("**/api/v1/processes", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/catalog/organizations", async (route) => {
    await route.fulfill({ json: [{
      id: "00000000-0000-4000-8000-000000000001",
      externalId: "FURG-CGTI",
      acronym: "CGTI",
      name: "Centro de Gestão de Tecnologia da Informação",
      active: true,
    }] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Novo processo" }).click();

  await expect(page.getByRole("dialog", { name: "Criar processo" })).toBeVisible();
  await expect(page.getByText("Início", { exact: true })).toBeVisible();
  await expect(page.getByText("Descrever a atividade", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Unidade responsável/)).toHaveValue("00000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("button", { name: "Criar e abrir diagrama" })).toBeVisible();
});

test("importa um ProcessBundle pela interface e abre o diagrama", async ({ page }) => {
  const base = demoDetails[demoProcesses[3]!.id]!;
  const importedProcess = {
    ...base,
    id: "90000000-0000-4000-8000-000000000001",
    slug: "processo-importado",
    title: "Processo importado",
    currentVersion: base.currentVersion ? { ...base.currentVersion, id: "91000000-0000-4000-8000-000000000001" } : undefined,
    versions: base.versions.map((version) => ({ ...version, id: "91000000-0000-4000-8000-000000000001" })),
  };
  let imported = false;
  await page.route("**/api/v1/processes", async (route) => route.fulfill({ json: imported ? [importedProcess] : [] }));
  await page.route("**/api/v1/catalog/organizations", async (route) => route.fulfill({ json: [{
    id: base.ownerUnit.id!, externalId: "FURG-CGTI", acronym: base.ownerUnit.acronym, name: base.ownerUnit.name, active: true,
  }] }));
  await page.route(`**/api/v1/processes/${importedProcess.id}`, async (route) => route.fulfill({ json: importedProcess }));
  await page.route("**/api/v1/processes/import", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ fileName: "processo.zip", contentBase64: Buffer.from("bundle").toString("base64") });
    imported = true;
    await route.fulfill({ json: { kind: "process-bundle", processId: importedProcess.id, versionId: importedProcess.currentVersion!.id, revision: 1, warnings: [] } });
  });

  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Importar processo" }).click();
  await expect(page.getByRole("dialog", { name: "Importar processo" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "processo.zip", mimeType: "application/zip", buffer: Buffer.from("bundle") });
  await expect(page.getByText("Pacote completo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Importar e abrir" }).click();

  await expect(page.getByRole("heading", { name: importedProcess.title })).toBeVisible();
  await expect(page.getByText("O pacote foi restaurado como uma nova versão em rascunho.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${processUrl(importedProcess, "diagrama")}$`));
  await expect(page.locator(".bpmn-workspace")).toBeVisible();
});

test("ajusta os dados cadastrados em um processo editável", async ({ page }) => {
  const process = demoDetails[demoProcesses[3]!.id]!;
  let updatedTitle = process.title;
  await page.route("**/api/v1/processes", async (route) => route.fulfill({ json: [{ ...process, bpmnXml: undefined }] }));
  await page.route(`**/api/v1/processes/${process.id}`, async (route) => route.fulfill({ json: { ...process, title: updatedTitle } }));
  await page.route("**/api/v1/catalog/organizations", async (route) => route.fulfill({ json: [{
    id: process.ownerUnit.id!,
    externalId: "FURG-CGTI",
    acronym: process.ownerUnit.acronym,
    name: process.ownerUnit.name,
    active: true,
  }] }));
  await page.route(`**/api/v1/processes/${process.id}/versions/${process.currentVersion!.id}/metadata`, async (route) => {
    const input = route.request().postDataJSON();
    updatedTitle = input.title;
    await route.fulfill({ json: { ...process, ...input, title: updatedTitle, ownerUnit: process.ownerUnit } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: process.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${processUrl(process)}$`));
  await page.getByRole("button", { name: "Editar dados" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar dados do processo" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Nome do processo/).fill("Publicação controlada em produção");
  await dialog.getByRole("button", { name: "Salvar dados" }).click();

  await expect(page.getByRole("heading", { name: "Publicação controlada em produção" })).toBeVisible();
  await expect(page.getByText("As informações cadastrais do processo foram salvas.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${processUrl({ ...process, title: updatedTitle })}$`));
});

test("mantém o BPMN confirmado ao navegar entre abas", async ({ page }) => {
  const process = demoDetails[demoProcesses[3]!.id]!;
  let persistedXml = process.bpmnXml;
  await page.route("**/api/v1/processes", async (route) => route.fulfill({ json: [process] }));
  await page.route(`**/api/v1/processes/${process.id}`, async (route) => route.fulfill({ json: { ...process, bpmnXml: persistedXml } }));
  await page.route(`**/api/v1/processes/${process.id}/versions/${process.currentVersion!.id}/lease`, async (route) => route.fulfill({ json: { token: "lease-token", expiresAt: "2099-01-01T00:00:00.000Z" } }));
  await page.route(`**/api/v1/processes/${process.id}/versions/${process.currentVersion!.id}/bpmn`, async (route) => {
    persistedXml = route.request().postDataJSON().bpmnXml;
    await route.fulfill({ json: { savedAt: new Date().toISOString(), contentHash: "saved-hash", issues: [] } });
  });
  await page.route("**/api/v1/processes/leases/lease-token", async (route) => route.fulfill({ json: { released: true } }));

  await page.goto("/");
  await page.getByRole("link", { name: process.title, exact: true }).click();
  await page.getByRole("link", { name: "Diagrama", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${processUrl(process, "diagrama")}$`));
  await page.getByRole("button", { name: "Editar diagrama" }).click();
  await page.locator('[data-element-id="Activity_1"]').dblclick();
  const directEditor = page.locator(".djs-direct-editing-content");
  await directEditor.fill("Atividade confirmada no servidor");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();

  await page.getByRole("link", { name: "Visão textual" }).click();
  await expect(page.getByRole("heading", { name: "Atividade confirmada no servidor" })).toBeVisible();
  await page.getByRole("link", { name: "Diagrama", exact: true }).click();
  await expect(page.locator(".djs-label").filter({ hasText: "Atividade confirmada no servidor" })).toBeVisible();

  await page.locator('[data-element-id="Activity_1"]').dblclick();
  await page.locator(".djs-direct-editing-content").fill("Alteração ainda não salva");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Visão geral" }).click();
  await expect(page.getByText("Salve o rascunho ou encerre a edição antes de trocar de aba.")).toBeVisible();
  await expect(page.locator(".bpmn-workspace")).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("alterações não salvas");
    await dialog.dismiss();
  });
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(new RegExp(`${processUrl(process, "diagrama")}$`));
  await expect(page.getByText("A navegação foi cancelada.")).toBeVisible();
});

test("navega do catálogo para a visão textual do processo", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Do trabalho institucional/i })).toBeVisible();
  await page.getByRole("link", { name: "Solicitação de desenvolvimento de software", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Solicitação de desenvolvimento de software" })).toBeVisible();
  await page.getByRole("link", { name: "Visão textual" }).click();
  await expect(page).toHaveURL(new RegExp(`${processUrl(demoProcesses[0]!, "estrutura")}$`));
  await expect(page.getByRole("heading", { name: "Fluxo em formato textual" })).toBeVisible();
  await expect(page.getByText("Qualificar a necessidade")).toBeVisible();
});

test("ativa o editor governado com paleta, lint e atribuição bpmn.io", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("net::ERR_FAILED")) runtimeErrors.push(message.text());
  });
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("link", { name: "Publicação em produção", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicação em produção" })).toBeVisible();
  await page.getByRole("link", { name: "Diagrama", exact: true }).click();
  await page.waitForTimeout(500);
  expect(runtimeErrors).toEqual([]);
  await expect(page.locator(".bpmn-workspace")).toBeVisible();
  await page.getByRole("button", { name: "Editar diagrama" }).click();

  await expect.poll(() => runtimeErrors).toEqual([]);
  await expect(page.locator(".djs-palette")).toBeVisible();
  await expect(page.locator(".bjsl-button")).toBeVisible();
  await expect(page.locator('a[href*="bpmn.io"]')).toBeVisible();
  await page.getByRole("button", { name: "Tela cheia" }).click();
  await expect(page.locator(".bpmn-workspace")).toHaveClass(/is-fullscreen/);
  await expect(page.getByRole("button", { name: "Sair da tela cheia" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".bpmn-workspace")).not.toHaveClass(/is-fullscreen/);
});

test("abre diretamente um link compartilhado e mantém título e URL canônica", async ({ page }) => {
  const process = demoDetails[demoProcesses[0]!.id]!;
  await page.route("**/api/v1/processes", async (route) => route.fulfill({ json: demoProcesses }));
  await page.route(`**/api/v1/processes/${process.slug}`, async (route) => route.fulfill({ json: process }));

  await page.goto(`/processos/${process.slug}/estrutura`);

  await expect(page.getByRole("heading", { name: process.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fluxo em formato textual" })).toBeVisible();
  await expect(page).toHaveTitle(`${process.title} — Visão textual | FURG`);
  await expect(page).toHaveURL(new RegExp(`${processUrl(process, "estrutura")}$`));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${processUrl(process, "estrutura")}$`));
});
