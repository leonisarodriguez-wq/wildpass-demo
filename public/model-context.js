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
