// Registers the WebMCP tools (spec draft 27 Oct 2026: document.modelContext.registerTool).
// They are reachable via BOTH document.modelContext and navigator.modelContext (see model-context.js).
// Each tool just forwards its input to the SAME server endpoint the website uses, and returns the
// server's structured answer. Tools never throw: errors come back as { ok:false, error_code, message, how_to_fix }.
import { callApi, loadConfig } from './api.js';
import { connectModelContext, installExecuteTool, normalizeInput, registerToolsOnce } from './model-context.js';
import { buildTools } from './webmcp-tools.js';
import { showAgentStep } from './agent-pill.js';
import { track } from './track.js';

// Each successful tool call = the matching funnel event, with channel "agent" (src/events.js).
export function agentEvents(tool, input, result) {
  if (tool === 'confirm_payment') return result?.ok ? [['payment_started'], ['policy_issued']] : [['payment_started']];
  if (!result?.ok) return [];
  return {
    get_quote: [['quote_viewed']],
    select_plan: [['plan_selected', input?.plan]],
    set_traveler_details: [['details_completed']],
    review_order: [['review_viewed']],
  }[tool] ?? [];
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
  try {
    const config = await loadConfig();
    // Prefer the browser's own WebMCP; only load the MCP-B polyfill when there is none.
    const { ctx, source, names } = await connectModelContext({ doc: document, nav: navigator, loadPolyfill: () => loadScript('/vendor/webmcp-polyfill.js') });
    // es / rulesEs are only for the "Para desarrolladores" list on the landing page, not part of the WebMCP tool.
    const tools = buildTools(config).map(({ es, rulesEs, ...tool }) => ({
      ...tool,
      execute: async raw => {
        // Object or JSON string; anything else gets a structured INVALID_INPUT answer (never an exception).
        const { input, error } = normalizeInput(raw);
        const result = error ?? await callApi(tool.name, input);
        showAgentStep(config.brand.texts.agentPill, config.plans, tool.name, input, result);
        for (const [event, plan] of agentEvents(tool.name, input, result)) track(event, { channel: 'agent', plan: plan ?? (event === 'policy_issued' ? result.plan : undefined) });
        return result;
      },
    }));
    // executeTool(name or tool object, object or JSON string); only once, like the tools themselves.
    if (await registerToolsOnce(ctx, tools)) installExecuteTool(ctx, tools);
    // One line for developers: which WebMCP this browser uses (native or the MCP-B polyfill) and under which names.
    console.info(`[Wildpass] WebMCP: ${source} · ${Object.entries(names).map(([n, how]) => `${n}: ${how}`).join(' · ')}`);
    window.__webmcpSource = source;
    window.__webmcpNames = names;
  } catch (err) {
    console.info(`[Wildpass] WebMCP not available: ${err.message}`);
  }
}

register();
