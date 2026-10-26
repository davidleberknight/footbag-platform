export const meta = {
  name: 'extended-doc-sync-stages',
  description: 'Extended doc sync stages: extract claims, or compare, verify and cluster them',
  whenToUse: 'Only from the extended-doc-sync skill, which passes the stage and its inputs in args',
  phases: [
    { title: 'Extract', detail: 'Sonnet, one pass per batch text', model: 'sonnet' },
    { title: 'Compare', detail: 'per entity bucket, Opus for requirement buckets, Sonnet for the rest' },
    { title: 'Coherence', detail: 'Opus over every design claim', model: 'opus' },
    { title: 'Verify', detail: 'Opus, blind to the finder, tries to refute', model: 'opus' },
    { title: 'Cluster', detail: 'Sonnet, one ruling one item', model: 'sonnet' },
  ],
}

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
  const verified = await pipeline(
    work,
    (w) => agent(
      `Read ${BRIEFS}${w.brief}_BRIEF.md and follow it.\nBatch file: ${w.file}${reopen}${ruled}`,
      { label: `${w.brief.toLowerCase()}:${w.file.split('/').pop()}`, phase: w.phase, model: w.model, effort: 'medium', schema: CANDIDATES },
    ),
    (found, w) => {
      if (!found || found.candidates.length === 0) return { candidates: [], omissions: found ? found.omissions : 0, verdicts: [] }
      // Blind: the verifier sees the sides and the intent, never the finder's reasoning.
      const blind = found.candidates.map(({ id, kind, sideA, sideB, intent }) => ({ id, kind, sideA, sideB, intent }))
      return agent(
        `Read ${BRIEFS}VERIFY_BRIEF.md and follow it.\nCandidates:\n${JSON.stringify(blind, null, 1)}`,
        { label: `verify:${w.file.split('/').pop()}`, phase: 'Verify', model: 'opus', effort: 'medium', schema: VERDICTS },
      ).then((v) => ({ candidates: found.candidates, omissions: found.omissions, verdicts: v ? v.verdicts : [] }))
    },
  )

  const done = verified.filter(Boolean)
  if (done.length < work.length) log(`${work.length - done.length} batch(es) produced nothing and were not verified`)
  const survivors = []
  let refuted = 0
  let omissions = 0
  for (const r of done) {
    omissions += r.omissions
    const byId = new Map(r.verdicts.map((v) => [v.id, v]))
    for (const c of r.candidates) {
      const v = byId.get(c.id)
      // A candidate the verifier never answered is kept and labelled, never dropped.
      const verdict = v ? v.verdict : 'unverified'
      if (verdict === 'refuted') refuted++
      else survivors.push({ ...c, verdict, verdictQuote: v ? v.quote : '' })
    }
  }

  phase('Cluster')
  const clustered = survivors.length === 0 ? null : await agent(
    'Group these verified drift findings so that one maintainer ruling settles each group: ' +
    'the same renamed term or moved fact drifting in several places is one group; unrelated ' +
    'findings are their own groups. Rank groups by severity: wrong requirement or decision ' +
    'first, then wrong behaviour description, then stale comment, then wording. Keep every ' +
    'finding\'s fields unchanged. Write one JSON object { "clusters": [ { "title", "severity", ' +
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

throw new Error(`extended-doc-sync: unknown stage '${args && args.stage}'; expected extract or compare`)
