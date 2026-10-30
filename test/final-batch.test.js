// Last review batch (30 Oct 2026): wording that must not drift back.
import test from 'node:test';
import assert from 'node:assert/strict';
import brand from '../config/brand.config.js';

const strings = [];
(function walk(o) {
  if (typeof o === 'string') strings.push(o);
  else if (o && typeof o === 'object') Object.values(o).forEach(walk);
})(brand.texts);

test('no bracketed placeholder or provisional marker is left in any text (links in markdown form are fine)', () => {
  for (const s of strings) {
    const bare = s.replace(/\[[^\]]*\]\((https?:\/\/|#|\/)[^)]*\)/g, '');
    assert.ok(!/[[\]]/.test(bare) && !/\bTODO\b|\bFIXME\b/.test(bare) && !/placeholder|lorem ipsum/i.test(bare), bare.slice(0, 80));
  }
});

test('certificate and email: no phone placeholder, an honest "this demo offers no assistance" line instead', () => {
  const line = 'En un seguro real, aquí tendrías un teléfono de asistencia 24 h. Esta demo no ofrece asistencia.';
  assert.equal(brand.texts.certificate.emergencyPhone, line);
  assert.ok(brand.texts.email.emergency.includes(line));
});

test('step 1: the daily difference is per person; Kilimanjaro goes in brackets', () => {
  const cmp = brand.texts.checkout.compare;
  assert.ok(cmp.upsellDaily.includes('al día por persona') && cmp.upsellDailyMax.includes('al día por persona'));
  assert.equal(cmp.trekkingHook, 'Hasta {altitude} m (el Kilimanjaro, incluido)');
  assert.ok(!strings.some(s => s.includes('m: el Kilimanjaro')));
});
