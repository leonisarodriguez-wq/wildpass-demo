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
