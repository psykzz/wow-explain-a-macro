(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MacroParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Abilities that do not trigger the global cooldown (or piggy-back on the next swing).
  var OFF_GCD = ['maul', 'heroic strike', 'cleave', 'raptor strike', 'trinket'];
  var CAST_CMDS = ['cast', 'castrandom', 'use', 'userandom'];

  var SIMPLE = {
    combat: 'in combat', nocombat: 'out of combat', harm: 'the target is hostile',
    help: 'the target is friendly', exists: 'the target exists', noexists: 'there is no target',
    dead: 'the target is dead', nodead: 'the target is alive', mounted: 'mounted',
    nomounted: 'not mounted', flying: 'flying', noflying: 'not flying', swimming: 'swimming',
    stealth: 'stealthed', nostealth: 'not stealthed', indoors: 'indoors', outdoors: 'outdoors',
    party: 'in a party', raid: 'in a raid', group: 'in a group', pet: 'you have a pet',
    nopet: 'you have no pet', channeling: 'channeling a spell', nochanneling: 'not channeling',
    harmful: 'the target is hostile', helpful: 'the target is friendly',
    form: 'in any form', noform: 'not in any form', stance: 'in any stance', nostance: 'not in any stance'
  };
  var UNITS = { player: 'yourself', target: 'your target', focus: 'your focus',
    mouseover: 'your mouseover target', pet: 'your pet', targettarget: "your target's target",
    cursor: 'the cursor' };

  function unitName(u) { return UNITS[u] || u; }

  function describeCondition(raw) {
    var c = raw.trim();
    if (!c) return null;
    var m;
    if ((m = /^(?:@|target=)(.+)$/i.exec(c))) return 'targeting ' + unitName(m[1].toLowerCase());
    var neg = false;
    var parts = c.split(':');
    var key = parts[0].toLowerCase().trim();
    var val = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
    if (key.indexOf('no') === 0 && !SIMPLE[key] && ['mod', 'modifier', 'form', 'stance', 'spec', 'btn', 'button', 'buff', 'debuff', 'equipped', 'worn', 'bar', 'actionbar'].indexOf(key.slice(2)) !== -1) {
      neg = true; key = key.slice(2);
    }
    var n = neg ? 'not ' : '';
    var v = val.split('/').join(' or ');
    switch (key) {
      case 'mod': case 'modifier': return n + 'holding ' + (v ? v : 'a modifier key');
      case 'form': case 'stance': return n + 'in ' + key + ' ' + (v || '(any)');
      case 'spec': return n + 'in specialization ' + v;
      case 'btn': case 'button': return n + 'using mouse button ' + v;
      case 'buff': return 'the target ' + (neg ? 'does not have' : 'has') + ' buff ' + v;
      case 'debuff': return 'the target ' + (neg ? 'does not have' : 'has') + ' debuff ' + v;
      case 'equipped': case 'worn': return n + 'wearing ' + v;
      case 'bar': case 'actionbar': return n + 'on action bar ' + v;
      case 'unit': return 'targeting ' + unitName(v);
    }
    if (SIMPLE[key] && !val) return SIMPLE[key];
    return c;
  }

  function parseConditionals(text) {
    // text begins right after optional whitespace; returns {clauses, rest}
    var clauses = [];
    var s = text.trim();
    var re = /^\[([^\]]*)\]\s*/;
    var m;
    while ((m = re.exec(s))) {
      clauses.push(m[1].split(',').map(function (x) { return x.trim(); }).filter(Boolean));
      s = s.slice(m[0].length);
    }
    return { clauses: clauses, rest: s };
  }

  function parseLine(line) {
    var t = line.trim();
    if (!t) return null;
    var m = /^#(\w+)\s*(.*)$/.exec(t);
    if (m) return { type: 'directive', name: m[1].toLowerCase(), arg: m[2].trim() };
    m = /^\/(\S+)\s*(.*)$/.exec(t);
    if (!m) return { type: 'unknown', raw: t };
    var command = m[1].toLowerCase();
    var args = m[2];
    // Split alternatives on ';', each with its own conditionals.
    var alternatives = args.split(';').map(function (a) {
      var p = parseConditionals(a);
      var rest = p.rest.replace(/^!/, '').trim();
      return { conditions: p.clauses, target: rest };
    }).filter(function (a) { return a.target || a.conditions.length; });
    return { type: 'command', command: command, alternatives: alternatives, raw: t };
  }

  function parseMacro(text) {
    return String(text || '').split(/\r?\n/).map(parseLine).filter(Boolean);
  }

  function describeConditions(clauses) {
    if (!clauses.length) return '';
    var texts = clauses.map(function (cl) {
      var d = cl.map(describeCondition).filter(Boolean);
      return d.length ? d.join(' and ') : 'always';
    });
    return 'if ' + texts.join(', or else if ');
  }

  function isOffGcd(name) { return OFF_GCD.indexOf(name.toLowerCase()) !== -1; }

  var VERBS = {
    cast: 'cast', castrandom: 'cast a random one of', use: 'use', userandom: 'use a random one of',
    castsequence: 'cast in sequence', equip: 'equip', equipslot: 'equip', target: 'target',
    focus: 'set focus to', assist: 'assist', follow: 'follow', cancelaura: 'cancel the aura',
    cancelform: 'leave your current form', dismount: 'dismount', petattack: 'send your pet to attack',
    startattack: 'start auto-attacking', stopattack: 'stop auto-attacking',
    stopcasting: 'stop casting', say: 'say', yell: 'yell', emote: 'emote', run: 'run script'
  };
  VERBS.s = VERBS.say; VERBS.y = VERBS.yell; VERBS.e = VERBS.emote;

  function bracket(name) { return '[' + name + ']'; }

  function describeCommand(cmd) {
    var verb = VERBS[cmd.command] || ('run /' + cmd.command + ' on');
    var isCast = CAST_CMDS.indexOf(cmd.command) !== -1 || cmd.command === 'castsequence';
    var noArgs = ['startattack', 'stopattack', 'stopcasting', 'dismount', 'cancelform'];
    var alts = cmd.alternatives;
    if (!alts.length) return { text: verb, gcd: false, conditional: false, names: [] };
    var names = [];
    var pieces = alts.map(function (a, i) {
      var what = a.target;
      if (what && (isCast || /^(target|focus|cancelaura|equip|equipslot)$/.test(cmd.command))) {
        what = bracket(what.replace(/^reset=\S+\s*/i, ''));
        names.push(a.target);
      }
      var base = noArgs.indexOf(cmd.command) !== -1 || !what ? verb : verb + ' ' + what;
      var cond = describeConditions(a.conditions);
      var s = cond ? base + ' ' + cond : base;
      return i === 0 ? s : 'otherwise ' + s;
    });
    var conditional = alts.every(function (a) { return a.conditions.length > 0; });
    var text = pieces.join('; ');
    var gcd = (cmd.command === 'cast' || cmd.command === 'castsequence' || cmd.command === 'castrandom') &&
      names.length > 0 && !names.every(isOffGcd);
    return { text: text, gcd: gcd, conditional: conditional, names: names, cmd: cmd.command };
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function explainMacro(text) {
    var lines = parseMacro(text);
    var out = [];
    var tooltip = null;
    var steps = [];
    lines.forEach(function (l) {
      if (l.type === 'directive') {
        if (l.name === 'showtooltip' || l.name === 'show') tooltip = l.arg;
        return;
      }
      if (l.type === 'unknown') return;
      steps.push(describeCommand(l));
    });
    if (tooltip) out.push('The button icon and tooltip show ' + bracket(tooltip) + '.');
    else if (tooltip === '') out.push('The button icon and tooltip follow the first usable spell.');

    // Group: unconditional steps that don't compete for the global cooldown run together.
    var i = 0;
    var gcdUsedUnconditional = false;
    var groups = [];
    while (i < steps.length) {
      var group = [steps[i]];
      var s = steps[i];
      i++;
      if (!s.conditional) {
        while (i < steps.length && !steps[i].conditional && !(s.gcd && steps[i].gcd) &&
               !(group.some(function (g) { return g.gcd; }) && steps[i].gcd)) {
          group.push(steps[i]); i++;
        }
      }
      groups.push(group);
    }
    groups.forEach(function (g, idx) {
      var joined;
      var texts = g.map(function (x) { return x.text; });
      if (texts.length === 1) joined = texts[0];
      else joined = texts.slice(0, -1).join(', ') + ' and ' + texts[texts.length - 1] + ' at the same time';
      var prefix = idx === 0 ? '' : 'Then ';
      out.push(prefix === '' ? cap(joined) + '.' : prefix + joined + '.');
    });
    var gcdLines = steps.filter(function (x) { return x.gcd; });
    if (gcdLines.length > 1) {
      out.push('Only one global-cooldown spell can be cast per press; lines with conditions that are not met are skipped, letting the next line cast.');
    }
    return out;
  }

  return { parseMacro: parseMacro, parseLine: parseLine, explainMacro: explainMacro, describeCondition: describeCondition };
});
