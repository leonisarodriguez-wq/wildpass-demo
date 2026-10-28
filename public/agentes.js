// /agentes: the "Copiar" button for the example prompt (clipboard, with a select-the-text fallback).
const button = document.querySelector('#copy-prompt');
const prompt = document.querySelector('#example-prompt');
const status = document.querySelector('#copy-status');
const label = button.textContent;
button.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(prompt.textContent.trim());
  } catch {
    getSelection().selectAllChildren(prompt); // no clipboard access: select it so the user can copy by hand
    return;
  }
  button.textContent = button.dataset.copied;
  status.textContent = button.dataset.copied;
  clearTimeout(button.reset);
  button.reset = setTimeout(() => { button.textContent = label; status.textContent = ''; }, 2000);
});

// "WebMCP en tu navegador": native WebMCP or the MCP-B polyfill (which the main page loads when there is none).
const provider = document.querySelector('#webmcp-provider');
if (provider) {
  const name = document.modelContext ? 'document.modelContext' : navigator.modelContext ? 'navigator.modelContext' : null;
  provider.textContent = name
    ? provider.dataset.native.replace('{name}', name).replace('{other}', name.startsWith('document') ? 'navigator.modelContext' : 'document.modelContext')
    : provider.dataset.polyfill;
}
