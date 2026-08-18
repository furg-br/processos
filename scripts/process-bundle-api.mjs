const normalizeApiUrl = (value) => value.replace(/\/$/, "");

export async function downloadProcessBundle({ processId, versionId, apiUrl = process.env.PROCESSOS_API_URL ?? "http://localhost:3000/api/v1", accessToken = process.env.PROCESSOS_ACCESS_TOKEN }) {
  if (!processId || !versionId) throw new Error("Informe processId e versionId para exportar o pacote armazenado.");
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  const url = `${normalizeApiUrl(apiUrl)}/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/export`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`A API recusou a exportação (${response.status}): ${detail}`);
  }
  return { content: Buffer.from(await response.arrayBuffer()), url };
}
