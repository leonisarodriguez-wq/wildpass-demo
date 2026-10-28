// WebMCP tools must be reachable via document.modelContext AND navigator.modelContext,
// registered once. Uses fake browser objects; the real browser is checked by hand with Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectModelContext, registerToolsOnce } from '../public/model-context.js';

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
