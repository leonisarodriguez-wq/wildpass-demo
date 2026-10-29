// Searchable destination box (WAI-ARIA 1.2 "combobox with listbox popup"), built on top of the server-rendered
// <select id="destination">, which stays the single source of truth: the rest of the page keeps reading
// select.value and listening to its "change" event. Without JavaScript the plain <select> still works.
// Keyboard: type to filter, ↓/↑ to move, Enter to choose, Esc to close (or clear), Tab leaves.
// Screen readers: aria-activedescendant follows the highlighted option and a polite live region says how many match.

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.\s]+/g, ' ').trim();

// "España", "Madrid", "Canarias"…: the trip has to leave Spain (texts.homeAliases). Used by the form's check too.
export const isHomeQuery = (text, texts) => {
  const q = norm(text ?? '');
  return q.length >= 3 && texts.homeAliases.some(a => norm(a) === q || (q.length >= 4 && norm(a).startsWith(q)));
};

export function enhanceDestination(select, texts) {
  const groups = [...select.querySelectorAll('optgroup')].map(g => ({
    label: g.label,
    items: [...g.querySelectorAll('option')].map(o => ({ code: o.value, name: o.textContent, key: norm(o.textContent),
      aliases: (texts.destinationAliases?.[o.value] ?? []).map(a => ({ text: a, key: norm(a) })) })),
  }));
  const all = groups.flatMap(g => g.items).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const byCode = new Map(all.map(item => [item.code, item]));

  const box = document.createElement('div');
  box.className = 'combo';
  box.innerHTML = `<input type="text" id="destination-search" class="combo-input" role="combobox" aria-autocomplete="list"
      aria-expanded="false" aria-controls="destination-list" autocomplete="off" autocapitalize="words" spellcheck="false">
    <div class="combo-list" id="destination-list" role="listbox" hidden></div>
    <div class="sr-only" aria-live="polite" id="destination-count"></div>`;
  const input = box.querySelector('input');
  const list = box.querySelector('[role=listbox]');
  const count = box.querySelector('#destination-count');
  input.placeholder = texts.destinationSearch;
  list.setAttribute('aria-label', select.labels[0]?.textContent ?? '');
  select.after(box);
  select.hidden = true;
  select.tabIndex = -1;
  for (const label of select.labels) label.htmlFor = input.id;
  if (select.getAttribute('aria-required')) input.setAttribute('aria-required', 'true');

  let options = []; // the option elements currently shown, in order
  let active = -1;

  // `via` = the other name that matched ("Nueva York"), shown small after the country.
  function optionEl(item, via) {
    const li = document.createElement('div');
    li.className = 'combo-option';
    li.id = `dest-opt-${item.code}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(item.code === select.value));
    li.dataset.code = item.code;
    li.textContent = item.name;
    if (via) {
      const note = document.createElement('span');
      note.className = 'combo-alias';
      note.textContent = via;
      li.append(' ', note);
    }
    return li;
  }
  function groupEl(label, items, i) {
    const g = document.createElement('div');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-labelledby', `dest-group-${i}`);
    const h = document.createElement('div');
    h.className = 'combo-group';
    h.id = `dest-group-${i}`;
    h.setAttribute('role', 'presentation');
    h.textContent = label;
    g.append(h, ...items.map(item => optionEl(item))); // not map(optionEl): the index would become `via`
    return g;
  }

  // Empty query: "Destinos populares" first, then every destination A–Z. Typing: names that start with the text
  // first, then names that contain it (accents and capitals ignored).
  function renderList() {
    const q = norm(input.value);
    const selected = byCode.get(select.value);
    const showGroups = !q || (selected && input.value === selected.name);
    list.replaceChildren();
    let message = texts.noResults;
    if (showGroups) groups.forEach((g, i) => list.append(groupEl(g.label, g.items, i)));
    else {
      // Names first (starting with the text, then containing it), then other names: "usa", "tokio", "nueva york"…
      const starts = all.filter(item => item.key.startsWith(q));
      const contains = all.filter(item => !item.key.startsWith(q) && item.key.includes(q));
      const byName = new Set([...starts, ...contains]);
      const byAlias = all.filter(item => !byName.has(item)).map(item => [item, item.aliases.find(a => a.key.startsWith(q)) ?? (q.length >= 3 ? item.aliases.find(a => a.key.includes(q)) : null)]).filter(([, a]) => a);
      if (byName.size || byAlias.length) list.append(...[...byName].map(item => optionEl(item)), ...byAlias.map(([item, a]) => optionEl(item, a.text)));
      else {
        if (isHomeQuery(input.value, texts)) message = texts.homeMessage;
        const none = document.createElement('div');
        none.className = 'combo-empty';
        none.textContent = message;
        list.append(none);
      }
    }
    options = [...list.querySelectorAll('[role=option]')];
    const n = showGroups ? all.length : options.length;
    count.textContent = n === 0 ? message : n === 1 ? texts.resultsOne : texts.resultsCount.replace('{n}', n);
    setActive(-1);
  }
  function setActive(i) {
    options[active]?.classList.remove('is-active');
    active = i;
    const el = options[i];
    if (el) {
      el.classList.add('is-active');
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (!list.hidden) return;
    renderList();
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }
  function choose(code) {
    const changed = select.value !== code;
    select.value = code;
    input.value = byCode.get(code)?.name ?? '';
    close();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  input.addEventListener('input', () => { list.hidden ? open() : renderList(); });
  input.addEventListener('click', open);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) { open(); if (e.key === 'ArrowUp') setActive(options.length - 1); else setActive(0); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.max(0, Math.min(options.length - 1, active + step)));
    } else if (e.key === 'Enter') {
      if (list.hidden) return; // closed: Enter submits the form as usual
      e.preventDefault();
      const pick = options[active] ?? (options.length === 1 ? options[0] : null);
      if (pick) choose(pick.dataset.code);
    } else if (e.key === 'Escape') {
      if (!list.hidden) { e.preventDefault(); close(); input.value = byCode.get(select.value)?.name ?? ''; }
      else if (input.value) { e.preventDefault(); input.value = ''; }
    }
  });
  // Choosing with the mouse/finger: mousedown so the input does not lose focus first.
  list.addEventListener('mousedown', e => {
    const opt = e.target.closest('[role=option]');
    e.preventDefault();
    if (opt) choose(opt.dataset.code);
  });
  // Leaving the box: an exact name typed counts as a choice; otherwise show the current choice again.
  input.addEventListener('blur', () => {
    const q = norm(input.value);
    const exact = all.find(item => item.key === q) ?? all.find(item => item.aliases.some(a => a.key === q));
    if (exact && exact.code !== select.value) choose(exact.code);
    else { close(); input.value = byCode.get(select.value)?.name ?? (input.value && !exact ? input.value : ''); }
  });
  // Other parts of the page (destination cards, browser form restore) change the select: show it in the box.
  select.addEventListener('change', () => { input.value = byCode.get(select.value)?.name ?? ''; });
  if (select.value) input.value = byCode.get(select.value)?.name ?? '';
  return input;
}
