// Registers the WebMCP tools (spec draft 27 Oct 2026: document.modelContext.registerTool).
// They are reachable via BOTH document.modelContext and navigator.modelContext (see model-context.js).
// Each tool just forwards its input to the SAME server endpoint the website uses, and returns the
// server's structured answer. Tools never throw: errors come back as { ok:false, error_code, message, how_to_fix }.
import { callApi, loadConfig } from './api.js';
import { connectModelContext, registerToolsOnce } from './model-context.js';
import { buildTools } from './webmcp-tools.js';

const activity = document.getElementById('agent-activity');

function logActivity(tool, input, result) {
  if (!activity) return;
  const line = `${new Date().toLocaleTimeString('es-ES')} · ${tool} → ${result.ok ? 'ok' : result.error_code}`;
  activity.textContent = activity.textContent === '—' ? line : `${activity.textContent}\n${line}`;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

async function register() {
  const statusEl = document.getElementById('webmcp-status');
  try {
    const config = await loadConfig();
    // Prefer the browser's own WebMCP; only load the MCP-B polyfill when there is none.
    const { ctx, source, names } = await connectModelContext({ doc: document, nav: navigator, loadPolyfill: () => loadScript('/vendor/webmcp-polyfill.js') });
    // es / rulesEs are only for the "Para desarrolladores" list on the landing page, not part of the WebMCP tool.
    await registerToolsOnce(ctx, buildTools(config).map(({ es, rulesEs, ...tool }) => ({
      ...tool,
      execute: async input => {
        const result = await callApi(tool.name, input ?? {});
        logActivity(tool.name, input, result);
        return result;
      },
    })));
    window.__webmcpSource = source;
    window.__webmcpNames = names;
    if (statusEl) statusEl.textContent = `WebMCP: ${source}`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `WebMCP no disponible: ${err.message}`;
  }
}

register();
