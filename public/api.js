// Shared by the website (app.js) and the WebMCP tools (webmcp.js): both call the SAME server API.
// Always resolves to { ok: true, ... } or { ok: false, error_code, message, how_to_fix } — never throws.

export async function callApi(action, input) {
  let res;
  try {
    res = await fetch(`/api/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
  } catch {
    return { ok: false, error_code: 'NETWORK_ERROR', message: 'No se pudo conectar con el servidor.', how_to_fix: 'Comprueba la conexión a internet y vuelve a intentarlo.' };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, error_code: 'BAD_RESPONSE', message: `Respuesta inesperada del servidor (HTTP ${res.status}).`, how_to_fix: 'Vuelve a intentarlo en unos segundos.' };
  }
}

let configPromise;
export function loadConfig() {
  configPromise ??= fetch('/api/config').then(r => r.json());
  return configPromise;
}
