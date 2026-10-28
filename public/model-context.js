// Finds the page's WebMCP object and makes it reachable under BOTH names:
//   document.modelContext  (current spec draft, Chrome 156, MCP-B polyfill)
//   navigator.modelContext (older drafts and some agents/extensions)
// The tools are registered on ONE object only; the other name is an alias to that same object,
// so an agent sees each tool exactly once, whichever name it uses.
// No DOM access at import time, so this file can also be tested in Node with fake objects.

const REGISTERED = Symbol.for('wildpass.webmcp.registered');

function alias(target, name, ctx) {
  try {
    Object.defineProperty(target, name, { get: () => ctx, configurable: true, enumerable: true });
    return target[name] === ctx;
  } catch {
    return false;
  }
}

// doc/nav are `document`/`navigator`; loadPolyfill() loads the MCP-B polyfill when there is no native WebMCP.
export async function connectModelContext({ doc, nav, loadPolyfill }) {
  let ctx, source;
  if (doc.modelContext) [ctx, source] = [doc.modelContext, 'native document.modelContext'];
  else if (nav.modelContext) [ctx, source] = [nav.modelContext, 'native navigator.modelContext'];
  else {
    await loadPolyfill();
    if (doc.modelContext) [ctx, source] = [doc.modelContext, 'MCP-B polyfill (document.modelContext)'];
    else if (nav.modelContext) [ctx, source] = [nav.modelContext, 'MCP-B polyfill (navigator.modelContext)'];
    else throw new Error('WebMCP is not available in this browser.');
  }

  // Missing name → alias it to the chosen object. If the browser already has a DIFFERENT object
  // under the other name we leave it alone: browsers that expose both normally share one tool list,
  // and registering on both could show every tool twice.
  const names = {};
  for (const [target, name] of [[doc, 'document.modelContext'], [nav, 'navigator.modelContext']]) {
    const current = target.modelContext;
    if (current === ctx) names[name] = 'same object';
    else if (!current) names[name] = alias(target, 'modelContext', ctx) ? 'alias' : 'unavailable';
    else names[name] = 'separate native object (not used)';
  }
  return { ctx, source, names };
}

// Registers every tool once on ctx. Calling it again (e.g. the script loaded twice) does nothing.
export async function registerToolsOnce(ctx, tools) {
  if (ctx[REGISTERED]) return false;
  Object.defineProperty(ctx, REGISTERED, { value: true });
  for (const tool of tools) await ctx.registerTool(tool);
  return true;
}

// ---------- executeTool: forgiving about HOW a tool is called, strict about WHAT ----------
// Agents call tools in different ways. ctx.executeTool(tool, input) accepts:
//   tool  = the tool name ("get_quote") or any tool object with a name (e.g. an entry from getTools())
//   input = an object, a JSON string of an object, or nothing ({}).
// Anything else is answered (never thrown) with { ok:false, error_code:'INVALID_INPUT', message, how_to_fix },
// the same structured error style as the server. The tools' own rules are still checked by the server.

const invalidInput = (message, how_to_fix) => ({ ok: false, error_code: 'INVALID_INPUT', message, how_to_fix });

// Input → plain object, or an INVALID_INPUT error.
export function normalizeInput(input) {
  let value = input ?? {};
  if (typeof value === 'string') {
    if (!value.trim()) value = {};
    else {
      try { value = JSON.parse(value); } catch {
        return { error: invalidInput('The input is not valid JSON.', 'Send an object, or a JSON string of an object, e.g. {"quote_id":"…","plan":"wild"}.') };
      }
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: invalidInput('The input must be an object (or a JSON string of an object).', 'Wrap the fields in an object, e.g. {"policy_number":"WILD-2026-…","email":"…"}.') };
  }
  return { input: value };
}

// Tool name or tool object → known tool name, or an INVALID_INPUT error.
export function normalizeToolName(tool, names) {
  const name = typeof tool === 'string' ? tool.trim() : typeof tool?.name === 'string' ? tool.name : null;
  if (!name) return { error: invalidInput('The tool must be a tool name or a tool object with a "name".', `Pass a name such as "${names[0]}", or an entry from getTools().`) };
  if (!names.includes(name)) return { error: invalidInput(`Unknown tool "${name}".`, `Use one of: ${names.join(', ')}.`) };
  return { name };
}

// Installs the forgiving executeTool on ctx. tools = our tools ({ name, execute }).
// If the provider already has executeTool (MCP-B polyfill), we normalise and hand over to it with the matching
// getTools() entry, keeping its own answer format (the polyfill answers with a JSON string, so our errors are too).
// Otherwise (native WebMCP without executeTool) the tool's own execute() runs and answers with an object.
export function installExecuteTool(ctx, tools) {
  const own = new Map(tools.map(t => [t.name, t]));
  const names = [...own.keys()];
  const original = typeof ctx.executeTool === 'function' ? ctx.executeTool.bind(ctx) : null;
  const answer = original ? value => JSON.stringify(value) : value => value;
  async function executeTool(tool, input, options) {
    const t = normalizeToolName(tool, names);
    if (t.error) return answer(t.error);
    const i = normalizeInput(input);
    if (i.error) return answer(i.error);
    if (!original) return own.get(t.name).execute(i.input);
    const entry = (await ctx.getTools?.())?.find(e => e.name === t.name);
    return entry ? original(entry, i.input, options) : answer(await own.get(t.name).execute(i.input));
  }
  Object.defineProperty(ctx, 'executeTool', { value: executeTool, configurable: true, writable: true });
  return executeTool;
}
