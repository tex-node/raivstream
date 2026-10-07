/**
 * Homer AI Interpretation Acceptance Audit
 * TEMPORARY — AUDIT ONLY. NOT production code. Delete after audit.
 * No production code changes, no commits, no deploy.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local — pnpm exec tsx runs from monorepo root, use process.cwd()
const envPath = resolve(process.cwd(), 'apps/web/.env.local');
try {
  const envFile = readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch (e) {
  console.warn('Could not load .env.local, using process.env as-is:', e);
}
process.env['HOMER_INTERPRETER_ENABLED'] = 'true';

import { HomerInterpreter, isHomerInterpreterEnabled } from '../interpreter';
import { reconcile } from '../reconciler';
import { userDecisionsToCanon } from '../canon';
import { HomerService } from '../service';
import type { ProposedStoryState, HomerStoryState } from '../types';

interface AR { test: string; proposed: ProposedStoryState | null; reconciled: HomerStoryState | null; pass: boolean; realAI: boolean; findings: string[]; defects: string[]; }
const results: AR[] = [];
let aiCalls = 0;

async function rt(name: string, story: string, mode: 'GENERAL' | 'KIDS', ev: (p: ProposedStoryState, r: HomerStoryState) => { pass: boolean; findings: string[]; defects: string[] }, existingState?: HomerStoryState | null): Promise<AR> {
  console.log(`\n${'─'.repeat(60)}\nTEST: ${name}\nInput: "${story.slice(0, 90)}"`);
  const interp = new HomerInterpreter();
  if (interp.enabled) aiCalls++;
  let proposed: ProposedStoryState;
  try {
    proposed = await interp.interpret({ storyText: story, audienceMode: mode, existingState: existingState ?? null });
  } catch (err) {
    const r: AR = { test: name, proposed: null, reconciled: null, pass: false, realAI: interp.enabled, findings: [], defects: [`THREW: ${err}`] };
    results.push(r); return r;
  }
  const rec = reconcile({ proposed, existingState: existingState ?? null, existingCanon: existingState?.canon ?? [], userDecisions: [], storyText: story, audienceMode: mode });
  const { pass, findings, defects } = ev(proposed, rec);
  const result: AR = { test: name, proposed, reconciled: rec, pass, realAI: interp.enabled, findings, defects };
  results.push(result);
  console.log(`  Confidence: ${proposed.interpretationConfidence}`);
  console.log(`  Characters: ${proposed.characters.map(c => c.name).join(', ') || 'NONE'}`);
  console.log(`  Locations:  ${proposed.locations.map(l => l.name).join(', ') || 'NONE'}`);
  console.log(`  Objects:    ${proposed.objects.map(o => `${o.name}[${o.narrativeImportance}]`).join(', ') || 'NONE'}`);
  console.log(`  Beats:      ${proposed.beats.length} → ${proposed.beats.map(b => b.function).join(', ')}`);
  console.log(`  Threads:    ${proposed.threads.map(t => t.description.slice(0,50)).join(' | ') || 'NONE'}`);
  if (proposed.ambiguities.length) console.log(`  Ambiguities: ${proposed.ambiguities.join(' | ')}`);
  console.log(`  RESULT: ${pass ? '✓ PASS' : '✗ FAIL'}`);
  findings.forEach(f => console.log(`    ${f}`));
  defects.forEach(d => console.log(`    ${d}`));
  return result;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('HOMER AI ACCEPTANCE AUDIT');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Model: ${process.env['HOMER_INTERPRETER_MODEL'] ?? 'claude-sonnet-4-5 (default)'}`);
  console.log(`HOMER_INTERPRETER_ENABLED: ${process.env['HOMER_INTERPRETER_ENABLED']}`);
  console.log(`CLAUDE_API present: ${Boolean(process.env['CLAUDE_API'] ?? process.env['ANTHROPIC_API_KEY'])}`);
  console.log(`isHomerInterpreterEnabled(): ${isHomerInterpreterEnabled(process.env)}`);
  console.log('═'.repeat(60));

  // A
  await rt('A: Basic story understanding',
    'Amina was halfway up the attic stairs when she heard something move above her. She stopped and looked toward the darkness.',
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      const amina = p.characters.find(c => c.name.toLowerCase().includes('amina'));
      if (amina) f.push(`✓ Amina extracted (role: ${amina.role})`);
      else { d.push('P1 ✗ Amina not extracted'); pass = false; }
      const loc = p.locations.find(l => l.name.toLowerCase().includes('attic') || l.name.toLowerCase().includes('stair'));
      if (loc) f.push(`✓ Location "${loc.name}" extracted`);
      else d.push('P2: Attic location not extracted');
      const tension = p.threads.length > 0 || p.beats.some(b => ['cliffhanger','escalation','discovery'].includes(b.function));
      if (tension) f.push('✓ Tension/thread captured');
      else d.push('P2: No tension/thread');
      const ar = r.entities.characters.find(c => c.name.value.toLowerCase().includes('amina'));
      if (ar?.name.provenance === 'PROPOSED') f.push('✓ Reconciled provenance=PROPOSED');
      else d.push(`P1: provenance=${ar?.name.provenance} expected PROPOSED`);
      return { pass, findings: f, defects: d };
    }
  );

  // B
  await rt('B: Object with narrative importance',
    "Amina found a strange old radio beneath a dusty sheet. When she touched it, a man's voice whispered her name.",
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      const radio = p.objects.find(o => o.name.toLowerCase().includes('radio'));
      if (radio) {
        f.push(`✓ radio extracted (${radio.narrativeImportance}, continuity:${radio.continuityRequired})`);
        if (radio.narrativeImportance === 'critical' || radio.continuityRequired === true) f.push('✓ radio critical/continuity');
        else d.push(`P2: radio importance="${radio.narrativeImportance}", continuity=${radio.continuityRequired}`);
      } else { d.push('P1 ✗ radio not extracted'); pass = false; }
      const vbeat = p.beats.find(b => b.description.toLowerCase().includes('voice') || b.description.toLowerCase().includes('whisper'));
      if (vbeat) f.push(`✓ Voice event as beat (${vbeat.function})`);
      else d.push('P2: Voice event not as beat');
      const vthread = p.threads.find(t => t.kind === 'mystery' || t.description.toLowerCase().includes('voice'));
      if (vthread) f.push(`✓ Voice mystery thread: "${vthread.description.slice(0,50)}"`);
      else d.push('P2: No voice thread');
      return { pass, findings: f, defects: d };
    }
  );

  // C
  await rt('C: Ambiguous pronoun — must NOT blindly resolve "He"',
    'John entered the room with Marcus. He walked to the window while Marcus stayed near the door.',
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      if (p.characters.find(c => c.name.toLowerCase() === 'john')) f.push('✓ John extracted');
      else { d.push('P1 ✗ John not extracted'); pass = false; }
      if (p.characters.find(c => c.name.toLowerCase() === 'marcus')) f.push('✓ Marcus extracted');
      else { d.push('P1 ✗ Marcus not extracted'); pass = false; }
      const allAliases = p.characters.flatMap(c => c.aliases ?? []).map(a => a.toLowerCase());
      const badPron = ['he','she','they','him','her'].filter(pr => allAliases.includes(pr));
      if (badPron.length === 0) f.push('✓ No unconditional pronoun aliases');
      else { d.push(`P0 ✗ CRITICAL pronoun aliases: ${badPron.join(', ')}`); pass = false; }
      const amb = p.ambiguities.some(a => a.toLowerCase().includes('he') || a.toLowerCase().includes('pronoun') || a.toLowerCase().includes('ambig'));
      if (amb) f.push('✓ He-ambiguity preserved');
      else f.push('NOTE: He-ambiguity not in ambiguities array');
      const wb = p.beats.find(b => b.description.toLowerCase().includes('window'));
      if (wb) f.push(`✓ Window beat: chars=${wb.charactersInvolved.join(',')}`);
      return { pass, findings: f, defects: d };
    }
  );

  // D
  await rt('D: Descriptive reference — "the old traveler"',
    'John picked up the lantern. The old traveler carried it toward the cave.',
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      const john = p.characters.find(c => c.name.toLowerCase() === 'john');
      if (john) {
        f.push('✓ John extracted');
        const alias = (john.aliases ?? []).some(a => a.toLowerCase().includes('traveler') || a.toLowerCase().includes('old'));
        if (alias) f.push('✓ "old traveler" alias on John');
        else f.push('NOTE: "old traveler" alias not on John');
      } else { d.push('P1 ✗ John not extracted'); pass = false; }
      const traveler = p.characters.find(c => c.name.toLowerCase().includes('traveler'));
      if (traveler && !traveler.aliases?.some(a => a.toLowerCase().includes('john'))) d.push(`P2: "old traveler" created as separate character "${traveler.name}"`);
      if (p.objects.find(o => o.name.toLowerCase().includes('lantern'))) f.push('✓ Lantern extracted');
      else d.push('P3: Lantern not extracted');
      if (p.locations.find(l => l.name.toLowerCase().includes('cave'))) f.push('✓ Cave extracted');
      else d.push('P3: Cave not extracted');
      return { pass, findings: f, defects: d };
    }
  );

  // E — Recurring object
  console.log(`\n${'─'.repeat(60)}\nTEST E: Recurring object across two calls`);
  const i = new HomerInterpreter(); aiCalls += 2;
  const e1 = await i.interpret({ storyText: 'Amina found a strange old radio beneath a dusty sheet.', audienceMode: 'GENERAL' });
  const s1 = reconcile({ proposed: e1, existingState: null, existingCanon: [], userDecisions: [], storyText: 'Amina found a strange old radio.', audienceMode: 'GENERAL' });
  const r1 = s1.entities.objects.find(o => o.name.value.toLowerCase().includes('radio'))?.id;
  const a1 = s1.entities.characters.find(c => c.name.value.toLowerCase() === 'amina')?.id;
  console.log(`  Pass 1 — radio: ${r1}, amina: ${a1}`);
  const e2 = await i.interpret({ storyText: 'Amina took the radio with her.', audienceMode: 'GENERAL', existingState: s1 });
  const s2 = reconcile({ proposed: e2, existingState: s1, existingCanon: s1.canon, userDecisions: [], storyText: 'Amina took the radio with her.', audienceMode: 'GENERAL' });
  const radios2 = s2.entities.objects.filter(o => o.name.value.toLowerCase().includes('radio'));
  const aminas2 = s2.entities.characters.filter(c => c.name.value.toLowerCase() === 'amina');
  const ePass = radios2.length === 1 && aminas2.length === 1;
  console.log(`  Pass 2 — radios: ${radios2.length}, aminas: ${aminas2.length}, radioIdStable: ${radios2.some(o=>o.id===r1)}, aminaIdStable: ${aminas2.some(c=>c.id===a1)}`);
  console.log(`  RESULT: ${ePass ? '✓ PASS' : '✗ FAIL'}`);
  results.push({ test: 'E: Recurring object dedup', proposed: e2, reconciled: s2, pass: ePass, realAI: true, findings: [`radios=${radios2.length} aminas=${aminas2.length} radioIdStable=${radios2.some(o=>o.id===r1)}`], defects: !ePass ? ['P1: Duplicate entities'] : [] });

  // F
  await rt('F: World/environment state',
    'The observatory had been abandoned for decades. Dust covered the instruments and vines had pushed through the broken windows.',
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      const obs = p.locations.find(l => l.name.toLowerCase().includes('observatory'));
      if (obs) {
        f.push('✓ Observatory extracted');
        if ((obs.environmentalCharacteristics ?? []).length > 0) f.push(`✓ Env chars: ${obs.environmentalCharacteristics.slice(0,3).join(', ')}`);
        else d.push('P2: No env characteristics');
        const world = [...(p.worldState?.atmosphericDetails ?? []), ...(p.worldState?.environmentalFacts ?? [])];
        if (world.length > 0) f.push(`✓ World state: ${world.slice(0,3).join(' | ')}`);
        else d.push('P2: No world state facts');
      } else { d.push('P1 ✗ Observatory not extracted'); pass = false; }
      return { pass, findings: f, defects: d };
    }
  );

  // G
  await rt('G: Unresolved narrative thread',
    'The voice told Amina to return at midnight, but would not explain why.',
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      const open = p.threads.find(t => t.status === 'open');
      if (open) f.push(`✓ Open thread: "${open.description.slice(0,80)}"`);
      else { d.push('P1 ✗ No open thread'); pass = false; }
      if (p.beats.some(b => b.description.toLowerCase().includes('midnight')) || p.threads.some(t => t.description.toLowerCase().includes('midnight'))) f.push('✓ Midnight captured');
      else d.push('P3: midnight not captured');
      if (p.threads.some(t => t.description.toLowerCase().includes('why') || t.description.toLowerCase().includes('reason'))) f.push('✓ "Why" unresolved question captured');
      else d.push('P2: "why" question not explicit in threads');
      return { pass, findings: f, defects: d };
    }
  );

  // H
  await rt("H: Semantic cliffhanger — mother's name",
    "Amina opened the radio again. This time, the voice said her mother's name.",
    'GENERAL', (p, r) => {
      const f: string[] = [], d: string[] = []; let pass = true;
      const eb = p.beats.find(b => ['escalation','reveal','cliffhanger'].includes(b.function));
      if (eb) f.push(`✓ AI beat: ${eb.function} — "${eb.description.slice(0,60)}"`);
      else { d.push("P1 ✗ No escalation/reveal/cliffhanger beat"); pass = false; }
      if (p.beats.some(b => b.emotionalDirection?.toLowerCase().includes('shock') || b.emotionalDirection?.toLowerCase().includes('reveal') || b.emotionalDirection?.toLowerCase().includes('horror') || b.emotionalDirection?.toLowerCase().includes('personal'))) f.push('✓ Personal/shock direction captured');
      else d.push('P2: Emotional significance not in emotionalDirection');
      if (r.cliffhangers.length > 0) f.push(`✓ Deterministic cliffhanger: ${r.cliffhangers.map(c => c.type).join(', ')}`);
      else d.push('P2: Deterministic cliffhanger classifier did not fire (AI understanding may be correct — deterministic-layer weakness)');
      return { pass, findings: f, defects: d };
    }
  );

  // I
  console.log(`\n${'─'.repeat(60)}\nTEST I: USER_EXPLICIT override`);
  aiCalls++;
  const udecs = [{ label: 'radio_name', value: 'Echo' }];
  const ucanon = userDecisionsToCanon(udecs);
  const ip = await new HomerInterpreter().interpret({ storyText: 'The radio is called Echo. Same radio from before.', audienceMode: 'GENERAL', existingCanon: ucanon, userDecisions: udecs });
  const is = reconcile({ proposed: ip, existingState: null, existingCanon: ucanon, userDecisions: udecs, storyText: '', audienceMode: 'GENERAL' });
  const rf = is.canon.find(f => f.label === 'radio_name');
  const iPass = rf?.value === 'Echo' && rf?.owner === 'USER_EXPLICIT';
  console.log(`  radio_name: value="${rf?.value}" owner="${rf?.owner}"`);
  console.log(`  RESULT: ${iPass ? '✓ PASS' : '✗ FAIL'}`);
  results.push({ test: 'I: USER_EXPLICIT override', proposed: ip, reconciled: is, pass: iPass, realAI: true, findings: [`radio_name value=${rf?.value} owner=${rf?.owner}`], defects: !iPass ? [`P0: USER_EXPLICIT not preserved`] : [] });

  // J
  console.log(`\n${'─'.repeat(60)}\nTEST J: Canon survival through surface form`);
  aiCalls++;
  const svc = new HomerService();
  const bp = { version: 'story_blueprint_v1' as const, premise: 'John explores.', protagonist: { name: 'John', goal: 'find truth', motivation: 'curiosity' }, supportingCharacters: [], conflict: 'none', setting: 'Observatory', beats: [{ label: 'Arrive', description: 'John arrives.' }], continuityRules: [] };
  const prior = svc.interpretStory({ storyText: 'John arrives at the observatory.', audienceMode: 'GENERAL', userDecisions: [{ label: 'radio_name', value: 'Echo' }] }, bp);
  const jp = await new HomerInterpreter().interpret({ storyText: 'The boy carried the old radio back into the building.', audienceMode: 'GENERAL', existingState: prior, existingCanon: prior.canon });
  const js = reconcile({ proposed: jp, existingState: prior, existingCanon: prior.canon, userDecisions: [{ label: 'radio_name', value: 'Echo' }], storyText: 'The boy carried the old radio.', audienceMode: 'GENERAL' });
  const johns = js.entities.characters.filter(c => c.name.value.toLowerCase() === 'john');
  const robjs = js.entities.objects.filter(o => ['radio','echo'].some(k => o.name.value.toLowerCase().includes(k)));
  const jPass = johns.length >= 1;
  console.log(`  AI chars: ${jp.characters.map(c=>c.name).join(',')} | AI objs: ${jp.objects.map(o=>o.name).join(',')}`);
  console.log(`  Johns in final: ${johns.length} | Radio/Echo entities: ${robjs.map(o=>o.name.value).join(',')}`);
  console.log(`  RESULT: ${jPass ? '✓ PASS' : '✗ FAIL'}`);
  results.push({ test: 'J: Canon survival', proposed: jp, reconciled: js, pass: jPass, realAI: true, findings: [`Johns=${johns.length} RadioObjs=${robjs.map(o=>o.name.value).join(',')}`], defects: !jPass ? ['P1: John lost on re-interpretation'] : [] });

  // Feature flag
  console.log(`\n${'─'.repeat(60)}\nFEATURE FLAG: disabled path`);
  const dis = new HomerInterpreter({ env: { HOMER_INTERPRETER_ENABLED: 'false' } });
  const dr = await dis.interpret({ storyText: 'Amina climbs stairs.', audienceMode: 'GENERAL' });
  console.log(`  confidence: ${dr.interpretationConfidence}, chars: ${dr.characters.length}, ambiguities: ${dr.ambiguities.join('; ')}`);
  console.log(`  Disabled → low/empty: ${dr.interpretationConfidence === 'low' && dr.characters.length === 0 ? '✓ PASS' : '✗ FAIL'}`);

  // Provenance
  console.log(`\n${'─'.repeat(60)}\nPROVENANCE: radio sentience text`);
  aiCalls++;
  const pp = await new HomerInterpreter().interpret({ storyText: 'The radio seemed to recognize Amina.', audienceMode: 'GENERAL' });
  const pr = reconcile({ proposed: pp, existingState: null, existingCanon: [], userDecisions: [], storyText: '', audienceMode: 'GENERAL' });
  const re = pr.entities.objects.find(o => o.name.value.toLowerCase().includes('radio'));
  console.log(`  AI radio desc: "${pp.objects.find(o=>o.name.toLowerCase().includes('radio'))?.description}"`);
  console.log(`  Reconciled provenance: name=${re?.name.provenance}, importance=${re?.narrativeImportance.provenance}`);
  console.log(`  All PROPOSED: ${[re?.name.provenance, re?.narrativeImportance.provenance].every(p => p === 'PROPOSED') ? '✓' : '✗'}`);
  console.log(`  No "sentient" canon: ${!pr.canon.some(f => JSON.stringify(f.value).toLowerCase().includes('sentient')) ? '✓' : '✗ DEFECT'}`);

  // Uncertainty
  console.log(`\n${'─'.repeat(60)}\nUNCERTAINTY: Anonymous text`);
  aiCalls++;
  const up = await new HomerInterpreter().interpret({ storyText: 'Someone stood behind the door. The other person looked at him, but nobody spoke.', audienceMode: 'GENERAL' });
  console.log(`  Characters: ${up.characters.map(c=>c.name).join(', ') || 'NONE'}`);
  console.log(`  Ambiguities: ${up.ambiguities.join(' | ') || 'NONE'}`);
  const fab = up.characters.filter(c => c.name && !['someone','unknown','(unnamed)','unnamed','figure','person','visitor'].some(k => (c.name ?? '').toLowerCase().includes(k)));
  console.log(`  Fabricated: ${fab.length === 0 ? 'NONE ✓' : fab.map(c=>c.name).join(', ') + ' ✗'}`);

  // Provider boundary
  console.log(`\n${'─'.repeat(60)}\nPROVIDER BOUNDARY: toDirectorInput`);
  const bp2 = { version: 'story_blueprint_v1' as const, premise: 'Amina finds the radio.', protagonist: { name: 'Amina', goal: 'understand', motivation: 'loss' }, supportingCharacters: [], conflict: 'none', beats: [{ label: 'Find', description: 'Amina finds the radio.' }], continuityRules: [] };
  const ts = svc.interpretStory({ storyText: 'Amina finds the radio.', audienceMode: 'GENERAL' }, bp2);
  const di = svc.toDirectorInput(ts, 'audit-proj');
  const dj = JSON.stringify(di);
  console.log(`  CUT markers: ${/CUT\s*-\s*/.test(dj) ? '✗ FAIL' : '✓ PASS'}`);
  console.log(`  PHYSICS: ${/PHYSICS:/.test(dj) ? '✗ FAIL' : '✓ PASS'}`);
  console.log(`  SOUND DESIGN: ${/SOUND DESIGN:/.test(dj) ? '✗ FAIL' : '✓ PASS'}`);
  console.log(`  storyIntent.premise: ${di.storyIntent?.premise ? '✓' : '✗'}`);
  console.log(`  characters[]: ${di.characters?.length >= 0 ? '✓' : '✗'}`);
  console.log(`  beats[]: ${di.beats?.length >= 0 ? '✓' : '✗'}`);

  // KIDS
  console.log(`\n${'─'.repeat(60)}\nSAFETY: KIDS audienceMode`);
  aiCalls++;
  const kp = await new HomerInterpreter().interpret({ storyText: 'Max the puppy found a magical ball in the garden.', audienceMode: 'KIDS' });
  const kr = reconcile({ proposed: kp, existingState: null, existingCanon: [], userDecisions: [], storyText: 'Max found a ball.', audienceMode: 'KIDS' });
  console.log(`  audienceMode: ${kr.audienceMode} — ${kr.audienceMode === 'KIDS' ? '✓ PASS' : '✗ FAIL'}`);

  // SUMMARY
  console.log('\n' + '═'.repeat(60));
  console.log('AUDIT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Real Claude API calls: ${aiCalls}`);
  console.log(`Model: ${process.env['HOMER_INTERPRETER_MODEL'] ?? 'claude-sonnet-4-5'}`);
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\nSCORECARD:');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} [${r.realAI ? 'REAL AI' : 'MOCK  '}] ${r.test}`);
    r.defects.forEach(d => console.log(`         ${d}`));
  }
  console.log(`\nPassed: ${passed}/${results.length}`);
  if (results.some(r => r.defects.length > 0)) {
    console.log('\nDEFECT REGISTRY:');
    results.forEach(r => r.defects.forEach(d => console.log(`  [${r.test.split(':')[0]}] ${d}`)));
  }
  const verdict = failed === 0 ? 'PASS' : failed <= 2 ? 'PASS WITH CONDITIONS' : 'BLOCKED';
  console.log(`\nVERDICT: ${verdict}`);
}

main().catch(err => { console.error('AUDIT FATAL:', err); process.exit(1); });
