const test = require('node:test');
const assert = require('node:assert');
const { explainMacro, parseMacro } = require('../src/macro-parser');

test('parses conditionals', () => {
  const [c] = parseMacro('/cast [form:3] Battle Stance');
  assert.deepStrictEqual(c.alternatives[0].conditions, [['form:3']]);
  assert.strictEqual(c.alternatives[0].target, 'Battle Stance');
});

test('maul + use at the same time', () => {
  const out = explainMacro('#showtooltip Maul\n/cast Maul\n/use Faintly Glowing Skull').join(' ');
  assert.match(out, /cast \[Maul\] and use \[Faintly Glowing Skull\] at the same time/i);
});

test('rend macro', () => {
  const out = explainMacro('#showtooltip Rend\n/startattack\n/cast [form:3] Battle Stance\n/cast Rend').join('\n');
  assert.match(out, /start auto-attacking/i);
  assert.match(out, /cast \[Battle Stance\] if in form 3/);
  assert.match(out, /Then cast \[Rend\]/);
  assert.match(out, /skipped/);
});
