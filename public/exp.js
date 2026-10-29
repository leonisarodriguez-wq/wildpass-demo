// A/B experiments: each browser gets variant a or b (50/50) per experiment, kept in localStorage; ?exp_hero=a|b and
// ?exp_upsell=a|b force (and keep) a variant. A classic <head> script, so html[data-exp-hero] is set before the first
// paint: the right headline shows at once, nothing swaps or moves later. The variants go with every event (public/track.js).
(function () {
  var names = ['hero', 'upsell'];
  var exp = {};
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem('wildpass-exp') || '{}') || {}; } catch (e) { /* storage blocked */ }
  var params = new URLSearchParams(location.search);
  names.forEach(function (name) {
    var forced = params.get('exp_' + name);
    var ok = function (v) { return v === 'a' || v === 'b'; };
    exp[name] = ok(forced) ? forced : ok(saved[name]) ? saved[name] : (Math.random() < 0.5 ? 'a' : 'b');
    document.documentElement.setAttribute('data-exp-' + name, exp[name]);
  });
  try { localStorage.setItem('wildpass-exp', JSON.stringify(exp)); } catch (e) { /* storage blocked: still this page's variant */ }
  window.__wildpassExp = exp;
})();
