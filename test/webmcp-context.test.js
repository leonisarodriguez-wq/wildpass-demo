// WebMCP tools must be reachable via document.modelContext AND navigator.modelContext,
// registered once. Uses fake browser objects; the real browser is checked by hand with Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectModelContext, installExecuteTool, normalizeInput, registerToolsOnce } from '../public/model-context.js';

function fakeModelContext() {
  const tools = [];
  return {
    tools,
    registerTool(tool) {
      if (tools.some(t => t.name === tool.name)) throw new Error(`duplicate tool ${tool.name}`);
      tools.push(tool);
    },
  };
}

const TOOLS = ['get_quote', 'select_plan', 'set_traveler_details', 'review_order', 'confirm_payment', 'get_policy'].map(name => ({ name }));
const noPolyfill = () => { throw new Error('polyfill must not load when WebMCP exists'); };

async function check({ doc, nav, loadPolyfill = noPolyfill }) {
  const { ctx, source } = await connectModelContext({ doc, nav, loadPolyfill });
  assert.equal(doc.modelContext, ctx, 'document.modelContext is the registered object');
  assert.equal(nav.modelContext, ctx, 'navigator.modelContext is the same object');
  assert.equal(await registerToolsOnce(ctx, TOOLS), true);
  assert.equal(await registerToolsOnce(ctx, TOOLS), false, 'second call registers nothing');
  assert.deepEqual(doc.modelContext.tools.map(t => t.name), TOOLS.map(t => t.name));
  return source;
}

test('browser with document.modelContext only (current spec, Chrome 156)', async () => {
  assert.equal(await check({ doc: { modelContext: fakeModelContext() }, nav: {} }), 'native document.modelContext');
});

test('browser with navigator.modelContext only (older drafts)', async () => {
  assert.equal(await check({ doc: {}, nav: { modelContext: fakeModelContext() } }), 'native navigator.modelContext');
});

test('browser without WebMCP: the polyfill is loaded and aliased', async () => {
  const doc = {};
  let loads = 0;
  const source = await check({ doc, nav: {}, loadPolyfill: async () => { loads++; doc.modelContext = fakeModelContext(); } });
  assert.equal(loads, 1);
  assert.match(source, /polyfill/);
});

test('browser exposing both names as the same object: registered once', async () => {
  const ctx = fakeModelContext();
  await check({ doc: { modelContext: ctx }, nav: { modelContext: ctx } });
});

test('browser exposing two different objects: tools go to document.modelContext only (never twice)', async () => {
  const docCtx = fakeModelContext();
  const navCtx = fakeModelContext();
  const { ctx, names } = await connectModelContext({ doc: { modelContext: docCtx }, nav: { modelContext: navCtx }, loadPolyfill: noPolyfill });
  await registerToolsOnce(ctx, TOOLS);
  assert.equal(ctx, docCtx);
  assert.equal(docCtx.tools.length, 6);
  assert.equal(navCtx.tools.length, 0);
  assert.equal(names['navigator.modelContext'], 'separate native object (not used)');
});

// ---------- executeTool: tool name or object, input object or JSON string, INVALID_INPUT otherwise ----------
const echoTools = () => TOOLS.map(({ name }) => ({ name, execute: async input => ({ ok: true, tool: name, input }) }));

test('executeTool (native WebMCP without one): name or object, object or JSON string', async () => {
  const ctx = fakeModelContext();
  installExecuteTool(ctx, echoTools());
  const want = { ok: true, tool: 'select_plan', input: { quote_id: 'q1', plan: 'wild' } };
  assert.deepEqual(await ctx.executeTool('select_plan', { quote_id: 'q1', plan: 'wild' }), want);
  assert.deepEqual(await ctx.executeTool('select_plan', '{"quote_id":"q1","plan":"wild"}'), want);
  assert.deepEqual(await ctx.executeTool({ name: 'select_plan', description: '…' }, ' {"quote_id":"q1","plan":"wild"} '), want);
  assert.deepEqual(await ctx.executeTool('get_policy'), { ok: true, tool: 'get_policy', input: {} }, 'no input = {}');
  assert.deepEqual(await ctx.executeTool('get_policy', ''), { ok: true, tool: 'get_policy', input: {} }, 'empty string = {}');
});

test('executeTool: bad calls come back as INVALID_INPUT (never thrown)', async () => {
  const ctx = fakeModelContext();
  installExecuteTool(ctx, echoTools());
  for (const [tool, input, why] of [
    ['get_quote', '{not json', /not valid JSON/],
    ['get_quote', '[1,2]', /must be an object/],
    ['get_quote', '"text"', /must be an object/],
    ['get_quote', 42, /must be an object/],
    ['get_quote', [{}], /must be an object/],
    ['buy_everything', {}, /Unknown tool "buy_everything"/],
    [{ title: 'no name' }, {}, /tool name or a tool object/],
    [null, {}, /tool name or a tool object/],
    [7, {}, /tool name or a tool object/],
  ]) {
    const out = await ctx.executeTool(tool, input);
    assert.equal(out.ok, false, JSON.stringify([tool, input]));
    assert.equal(out.error_code, 'INVALID_INPUT');
    assert.match(out.message, why);
    assert.ok(out.how_to_fix.length > 10);
  }
});

test('executeTool on the MCP-B polyfill: normalised, then handed to its own executeTool with the getTools() entry', async () => {
  const calls = [];
  const entries = TOOLS.map(({ name }) => ({ name, origin: 'https://example.test', window: {} }));
  const ctx = {
    getTools: async () => entries,
    // Like the polyfill: only a real getTools() entry and an object input are accepted; answers are JSON strings.
    async executeTool(entry, input) {
      if (!entries.includes(entry)) throw new TypeError('not a getTools() entry');
      if (typeof input !== 'object' || input === null) throw new TypeError('inputObject must be an object');
      calls.push([entry.name, input]);
      return JSON.stringify({ ok: true, tool: entry.name });
    },
  };
  installExecuteTool(ctx, echoTools());
  assert.equal(await ctx.executeTool('review_order', '{"order_id":"o1"}'), '{"ok":true,"tool":"review_order"}');
  assert.equal(await ctx.executeTool({ name: 'review_order' }, { order_id: 'o1' }), '{"ok":true,"tool":"review_order"}');
  assert.equal(await ctx.executeTool(entries[3], { order_id: 'o1' }), '{"ok":true,"tool":"review_order"}', 'a real entry still works');
  assert.deepEqual(calls, [['review_order', { order_id: 'o1' }], ['review_order', { order_id: 'o1' }], ['review_order', { order_id: 'o1' }]]);
  const bad = JSON.parse(await ctx.executeTool('review_order', '{oops'));
  assert.equal(bad.error_code, 'INVALID_INPUT', 'errors use the polyfill answer format (JSON string)');
  assert.equal(calls.length, 3, 'a bad call never reaches the provider');
});

test('normalizeInput: the tools themselves accept an object or a JSON string', () => {
  assert.deepEqual(normalizeInput('{"a":1}'), { input: { a: 1 } });
  assert.deepEqual(normalizeInput({ a: 1 }), { input: { a: 1 } });
  assert.deepEqual(normalizeInput(undefined), { input: {} });
  assert.equal(normalizeInput('nope').error.error_code, 'INVALID_INPUT');
});
