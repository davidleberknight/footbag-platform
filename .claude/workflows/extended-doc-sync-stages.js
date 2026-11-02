export const meta = {
  name: 'extended-doc-sync-stages',
  description: 'Extended doc sync stages: extract claims; compare, verify and cluster them; or draft the questions',
  whenToUse: 'Only from the extended-doc-sync skill, which passes the stage and its inputs in args',
  phases: [
    { title: 'Extract', detail: 'Sonnet, one pass per batch text', model: 'sonnet' },
    { title: 'Compare', detail: 'per entity bucket, Opus for requirement buckets, Sonnet for the rest' },
    { title: 'Coherence', detail: 'Opus over every design claim', model: 'opus' },
    { title: 'Verify', detail: 'Sonnet, blind to the finder, tries to refute, pooled across batches', model: 'sonnet' },
    { title: 'Cluster', detail: 'Sonnet, one ruling one item', model: 'sonnet' },
    { title: 'Draft', detail: 'Sonnet, each question written with its homework done', model: 'sonnet' },
  ],
}

// Candidates per verifier, drawn from any batch, so a batch with two candidates does not
// pay for a verifier of its own.
const VERIFY_POOL = 25
// Clusters per drafting agent.
const DRAFT_SLICE = 8

// The brief path comes first and the varying input last, so agents of one role share a
// cached prefix.
const BRIEFS = '.claude/skills/extended-doc-sync/'

const SIDE = {
  type: 'object',
  properties: { file: { type: 'string' }, line: { type: 'integer' }, quote: { type: 'string' } },
  required: ['file', 'line', 'quote'],
}
const WRITTEN = {
  type: 'object',
  properties: { written: { type: 'integer' }, file: { type: 'string' } },
  required: ['written', 'file'],
}
const CANDIDATES = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['doc-code', 'comment-code', 'doc-intent', 'code-intent', 'doc-doc', 'stale-intent'] },
          sideA: SIDE,
          sideB: SIDE,
          intent: { type: 'string' },
          wrongSide: { type: 'string', enum: ['A', 'B', 'unclear'] },
          why: { type: 'string' },
        },
        required: ['id', 'kind', 'sideA', 'sideB', 'intent', 'wrongSide', 'why'],
      },
    },
    omissions: { type: 'integer' },
  },
  required: ['candidates', 'omissions'],
}
const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refuted', 'unverified'] },
          quote: { type: 'string' },
        },
        required: ['id', 'verdict', 'quote'],
      },
    },
  },
  required: ['verdicts'],
}
const CLUSTERED = {
  type: 'object',
  properties: { clusters: { type: 'integer' }, findings: { type: 'integer' }, file: { type: 'string' } },
  required: ['clusters', 'findings', 'file'],
}

if (args.stage === 'extract') {
  phase('Extract')
  const work = [
    ...args.docBatches.map((units, i) => ({ name: `doc-${i}`, units })),
    ...args.commentBatches.map((units, i) => ({ name: `comments-${i}`, units })),
  ]
  const results = await parallel(work.map((w) => () => agent(
    `Read ${BRIEFS}EXTRACT_BRIEF.md and follow it.\n` +
    `Vocabulary file: ${args.vocabPath}\n` +
    `Batch text: ${args.textDir}/${w.name}.txt\n` +
    `Output file: ${args.claimsDir}/${w.name}.json`,
    { label: `extract:${w.name}`, phase: 'Extract', model: 'sonnet', effort: 'low', schema: WRITTEN },
  )))
  const failed = work.filter((_, i) => !results[i]).map((w) => w.name)
  if (failed.length) log(`extraction failed for ${failed.length} batch(es): ${failed.join(', ')}`)
  return {
    batches: work.length,
    claims: results.filter(Boolean).reduce((n, r) => n + r.written, 0),
    failed,
  }
}

if (args.stage === 'compare') {
  const reopen = args.reopen && args.reopen.length ? `\nEntities whose code changed since the last run: ${args.reopen.join(', ')}` : ''
  const ruled = args.priorRulings && args.priorRulings.length
    ? `\nAlready ruled by the maintainer, do not report again:\n${JSON.stringify(args.priorRulings)}`
    : ''
  const work = [
    ...args.files.opus.map((file) => ({ file, model: 'opus', brief: 'COMPARE', phase: 'Compare' })),
    ...args.files.sonnet.map((file) => ({ file, model: 'sonnet', brief: 'COMPARE', phase: 'Compare' })),
    ...args.files.coherence.map((file) => ({ file, model: 'opus', brief: 'COHERENCE', phase: 'Coherence' })),
  ]
  const found = await parallel(work.map((w) => () => agent(
    `Read ${BRIEFS}${w.brief}_BRIEF.md and follow it.\nBatch file: ${w.file}${reopen}${ruled}`,
    { label: `${w.brief.toLowerCase()}:${w.file.split('/').pop()}`, phase: w.phase, model: w.model, effort: 'medium', schema: CANDIDATES },
  )))
  const missing = found.filter((f) => !f).length
  if (missing) log(`${missing} batch(es) produced nothing and were not verified`)
  // Each finder numbers its own candidates, so ids are prefixed with the batch before pooling.
  const candidates = found.flatMap((f, i) => (f ? f.candidates.map((c) => ({ ...c, id: `${i}:${c.id}` })) : []))
  let omissions = found.reduce((n, f) => n + (f ? f.omissions : 0), 0)

  phase('Verify')
  const pools = []
  for (let i = 0; i < candidates.length; i += VERIFY_POOL) pools.push(candidates.slice(i, i + VERIFY_POOL))
  const verdictSets = await parallel(pools.map((pool, i) => () => {
    // Blind: the verifier sees the sides and the intent, never the finder's reasoning.
    const blind = pool.map(({ id, kind, sideA, sideB, intent }) => ({ id, kind, sideA, sideB, intent }))
    return agent(
      `Read ${BRIEFS}VERIFY_BRIEF.md and follow it.\nCandidates:\n${JSON.stringify(blind, null, 1)}`,
      { label: `verify:${i + 1}`, phase: 'Verify', model: 'sonnet', effort: 'medium', schema: VERDICTS },
    )
  }))
  const byId = new Map(verdictSets.filter(Boolean).flatMap((v) => v.verdicts).map((v) => [v.id, v]))
  const survivors = []
  let refuted = 0
  for (const c of candidates) {
    const v = byId.get(c.id)
    // A candidate the verifier never answered is kept and labelled, never dropped.
    const verdict = v ? v.verdict : 'unverified'
    if (verdict === 'refuted') refuted++
    else survivors.push({ ...c, verdict, verdictQuote: v ? v.quote : '' })
  }

  phase('Cluster')
  const clustered = survivors.length === 0 ? null : await agent(
    'Group these verified drift findings so that one maintainer ruling settles each group: ' +
    'the same renamed term or moved fact drifting in several places is one group; unrelated ' +
    'findings are their own groups. Give each group a "severity": "S1" when code breaks a ' +
    'requirement or decision, the design contradicts itself, an IFPA governing document is a ' +
    'side, or a security, privacy or operations document is wrong; "S2" when a service header, ' +
    'comment or data-model entry misdescribes behaviour, or one rule is stated differently in ' +
    'two homes; "S3" for a stale fact with no effect on behaviour (a path, count, cost or ' +
    'term); "S4" for form. Give each a "resolution": "settled" when every finding was ' +
    'confirmed and its quoted intent decides which side is wrong, otherwise "disputed". Order ' +
    'S1 first; severity sets order only, so keep every group. Keep every ' +
    'finding\'s fields unchanged. Write one JSON object { "clusters": [ { "title", "severity", "resolution", ' +
    `"findings": [...] } ] } to ${args.resultsPath}, then return the counts and the path.\n` +
    `Findings:\n${JSON.stringify(survivors, null, 1)}`,
    { label: 'cluster', phase: 'Cluster', model: 'sonnet', effort: 'low', schema: CLUSTERED },
  )
  return {
    batches: work.length,
    candidates: survivors.length + refuted,
    refuted,
    confirmed: survivors.filter((s) => s.verdict === 'confirmed').length,
    unverified: survivors.filter((s) => s.verdict === 'unverified').length,
    omissions,
    clusters: clustered ? clustered.clusters : 0,
    resultsPath: clustered ? clustered.file : null,
  }
}

if (args.stage === 'draft') {
  phase('Draft')
  const slices = []
  for (let a = 0; a < args.clusters; a += DRAFT_SLICE) slices.push([a, Math.min(args.clusters, a + DRAFT_SLICE) - 1])
  const done = await parallel(slices.map(([a, b]) => () => agent(
    `Read ${BRIEFS}DRAFT_BRIEF.md and follow it.\nResults file: ${args.resultsPath}\n` +
    `Clusters: ${a} to ${b}, counted from 0 in file order\nOutput file: ${args.draftsDir}/draft-${a}.json`,
    { label: `draft:${a}-${b}`, phase: 'Draft', model: 'sonnet', effort: 'medium', schema: WRITTEN },
  )))
  const failed = slices.filter((_, i) => !done[i]).map(([a, b]) => `${a}-${b}`)
  if (failed.length) log(`drafting failed for cluster slice(s): ${failed.join(', ')}`)
  return { slices: slices.length, drafted: done.filter(Boolean).reduce((n, r) => n + r.written, 0), failed }
}

throw new Error(`extended-doc-sync: unknown stage '${args && args.stage}'; expected extract, compare or draft`)
