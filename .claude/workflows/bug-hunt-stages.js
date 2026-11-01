export const meta = {
  name: 'bug-hunt-stages',
  description: 'Bug hunt stages: write the oracle rows, or hunt, refute and cluster',
  whenToUse: 'Only from the bug-hunt skill, which passes the stage and its inputs in args',
  phases: [
    { title: 'Oracle', detail: 'Opus, expected outcomes from the stories, no code read', model: 'opus' },
    { title: 'Hunt', detail: 'one agent per pack, each probing its own candidates' },
    { title: 'Refute', detail: 'Opus, fresh context, real or not, pooled', model: 'opus' },
    { title: 'Cluster', detail: 'Sonnet, proposed findings-file entries', model: 'sonnet' },
  ],
}

const BRIEFS = '.claude/skills/bug-hunt/'
const ORACLE_SLICE = 10
// Candidates per refuter, drawn from any pack.
const REFUTE_POOL = 25
// Below this a candidate goes to the Leads, never dropped.
const CONFIDENCE = 0.8

const WRITTEN = { type: 'object', properties: { written: { type: 'integer' }, file: { type: 'string' } }, required: ['written', 'file'] }
const PROBE = {
  type: 'object',
  properties: { command: { type: 'string' }, output: { type: 'string' }, result: { type: 'string', enum: ['failed', 'passed', 'not-run'] } },
  required: ['command', 'output', 'result'],
}
const CANDIDATES = {
  type: 'object',
  properties: {
    candidates: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, title: { type: 'string' },
      layer: { type: 'string', enum: ['design', 'implementation', 'discrepancy'] },
      file: { type: 'string' }, line: { type: 'integer' }, trace: { type: 'string' }, cls: { type: 'string' },
      severity: { type: 'string', enum: ['Catastrophic', 'High', 'Medium', 'Low'] },
      confidence: { type: 'number' }, governing: { type: 'string' }, probe: PROBE,
    }, required: ['id', 'title', 'layer', 'file', 'line', 'trace', 'cls', 'severity', 'confidence', 'governing', 'probe'] } },
    rows: { type: 'array', items: { type: 'object', properties: { row: { type: 'string' }, status: { type: 'string' }, at: { type: 'string' } }, required: ['row', 'status'] } },
    units: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, status: { type: 'string', enum: ['read', 'not-reached'] } }, required: ['file', 'status'] } },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['candidates', 'rows', 'units', 'questions'],
}
const VERDICTS = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, verdict: { type: 'string', enum: ['real', 'not-real', 'unverified'] }, quote: { type: 'string' },
  }, required: ['id', 'verdict', 'quote'] } } },
  required: ['verdicts'],
}
const CLUSTERED = {
  type: 'object',
  properties: { findings: { type: 'integer' }, leads: { type: 'integer' }, questions: { type: 'integer' }, file: { type: 'string' } },
  required: ['findings', 'leads', 'questions', 'file'],
}

if (args.stage === 'oracle') {
  phase('Oracle')
  const slices = []
  for (let i = 0; i < args.stories.length; i += ORACLE_SLICE) slices.push(args.stories.slice(i, i + ORACLE_SLICE))
  const done = await parallel(slices.map((s, i) => () => agent(
    `Read the "Oracle: the expectation table" section of ${BRIEFS}DESIGN.md and follow it. Read no code.\n` +
    `Stories, by id, file and line:\n${JSON.stringify(s)}\nWrite one file per story, named <id>.json, to: ${args.oracleDir}`,
    { label: `oracle:${i + 1}`, phase: 'Oracle', model: 'opus', effort: 'medium', schema: WRITTEN },
  )))
  const failed = slices.filter((_, i) => !done[i]).map((s) => s.map((x) => x.id).join(','))
  if (failed.length) log(`oracle failed for: ${failed.join('; ')}`)
  return { slices: slices.length, written: done.filter(Boolean).reduce((n, r) => n + r.written, 0), failed }
}

if (args.stage === 'hunt') {
  phase('Hunt')
  const probes = args.probes
    ? `allowed: write them in ${args.scratchDir} and run them against the local dev stack at ${args.devUrl}`
    : 'not allowed this run: record each probe as not-run'
  const tracked = args.tracked && args.tracked.length ? `\nTracked already, skip: ${args.tracked.join('; ')}` : ''
  const found = await parallel(args.packs.map((p) => () => agent(
    `Read ${BRIEFS}HUNT_BRIEF.md and follow it.\nPack: ${p.file}\nOracle rows: ${args.oracleDir}\nProbes: ${probes}${tracked}`,
    { label: `hunt:${p.file.split('/').pop()}`, phase: 'Hunt', model: p.model, effort: p.model === 'opus' ? 'high' : 'medium', schema: CANDIDATES },
  )))
  const missing = args.packs.filter((_, i) => !found[i]).map((p) => p.file)
  if (missing.length) log(`${missing.length} pack(s) returned nothing: ${missing.join(', ')}`)
  // Each hunter numbers its own candidates, so ids are prefixed with the pack before pooling.
  const all = found.flatMap((f, i) => (f ? f.candidates.map((c) => ({ ...c, id: `${i}:${c.id}` })) : []))
  const notReached = found.flatMap((f) => (f ? f.units.filter((u) => u.status === 'not-reached').map((u) => u.file) : []))
  const questions = found.flatMap((f) => (f ? f.questions : []))
  const rows = found.flatMap((f) => (f ? f.rows : []))
  const confident = all.filter((c) => c.confidence >= CONFIDENCE)
  const leads = all.filter((c) => c.confidence < CONFIDENCE).map((c) => ({ ...c, verdict: 'below-confidence' }))

  phase('Refute')
  const pools = []
  for (let i = 0; i < confident.length; i += REFUTE_POOL) pools.push(confident.slice(i, i + REFUTE_POOL))
  const verdictSets = await parallel(pools.map((pool, i) => () => agent(
    `Read ${BRIEFS}REFUTE_BRIEF.md and follow it.\nCandidates:\n${JSON.stringify(pool.map(({ id, title, file, line, trace, governing, probe }) => ({ id, title, file, line, trace, governing, probe })), null, 1)}`,
    { label: `refute:${i + 1}`, phase: 'Refute', model: 'opus', effort: 'medium', schema: VERDICTS },
  )))
  const byId = new Map(verdictSets.filter(Boolean).flatMap((v) => v.verdicts).map((v) => [v.id, v]))
  const real = []
  let refuted = 0
  for (const c of confident) {
    const v = byId.get(c.id)
    // A candidate no refuter answered is kept as a Lead, never dropped.
    if (!v || v.verdict === 'unverified') leads.push({ ...c, verdict: 'unverified' })
    else if (v.verdict === 'not-real') refuted++
    else real.push({ ...c, verdictQuote: v.quote })
  }

  phase('Cluster')
  const clustered = await agent(
    `Read the "Severity and output" section of ${BRIEFS}SKILL.md. Merge duplicate findings, calibrate each ` +
    'severity from its probe output, and write each finding as an entry in that section\'s format, ' +
    'with no ID yet; write each Lead with the step that would settle it, and list each question ' +
    'with its owner. Keep every finding and Lead. Write one JSON object ' +
    `{ "findings": [...], "leads": [...], "questions": [...] } to ${args.resultsPath}, then return the counts and the path.\n` +
    `Findings:\n${JSON.stringify(real, null, 1)}\nLeads:\n${JSON.stringify(leads, null, 1)}\nQuestions:\n${JSON.stringify(questions, null, 1)}`,
    { label: 'cluster', phase: 'Cluster', model: 'sonnet', effort: 'low', schema: CLUSTERED },
  )
  return {
    packs: args.packs.length, missing, candidates: all.length, refuted, real: real.length, leads: leads.length,
    notReached, rows, resultsPath: clustered ? clustered.file : null,
  }
}

throw new Error(`bug-hunt: unknown stage '${args && args.stage}'; expected oracle or hunt`)
