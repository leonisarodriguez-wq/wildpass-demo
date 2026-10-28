// The hero sunrise plays once per visit (browser tab session): on later page loads the sun is already up.
// A tiny classic script in <head> so the class is set before the first paint (no sun jumping down and up again).
try {
  if (sessionStorage.getItem('wildpass-sunrise')) document.documentElement.classList.add('sun-seen');
  else sessionStorage.setItem('wildpass-sunrise', '1');
} catch { /* storage blocked: just play it */ }
