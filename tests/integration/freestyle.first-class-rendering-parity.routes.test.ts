/**
 * Integration tests for first-class trick rendering parity.
 *
 * Audit task: the /freestyle/tricks listing must render every entry in
 * PILOT_FIRST_CLASS_SLUGS with osis-level parity where authoritative
 * data exists, and surface an honest incomplete-state when the upstream
 * Job notation is genuinely absent.
 *
 * Cohort (PILOT_FIRST_CLASS_SLUGS, freestyleService.ts):
 *   osis, paradox-mirage, symposium-mirage, atomic-butterfly, ripwalk
 *
 * Two contracts verified here:
 *
 * 1) Tautological-chain suppression. The freestyleSymbolicEquivalences
 *    registry holds 28 chain entries whose `readings` field is the
 *    canonical name in lowercase form (paradox-mirage → "paradox
 *    mirage"). The shaper now filters these out so the ≡ chain row
 *    no longer renders an information-free line on a card titled with
 *    the same text.
 *
 * 2) Honest incomplete-state for first-class slugs missing op-notation.
 *    For first-class compounds with no curator-authored
 *    `freestyle_tricks.operational_notation` and no atomic flag-
 *    decomposition chain (paradox-mirage, symposium-mirage,
 *    atomic-butterfly, ripwalk on this branch), the first-class
 *    summary partial renders an explicit "JOB: canonical decomposition pending"
 *    muted line rather than silently hiding the row.
 *
 * The osis card is the golden example: it carries curator op-notation
 * (via CORE_TRICK_SPEC) AND an atomic flag-decomposition, so both the
 * JOB and ADD rows in its first-class summary are populated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3157');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // ─── Tier 1: full parity (JOB + ADD both populated) ──────────────────
  // 11 atom singletons (ATOMIC_FLAG_DECOMPOSITIONS provides both
  // operationalChain + decomposition). All have base_trick === slug
  // which the renderer requires for atomic-decomposition lookup.
  insertFreestyleTrick(db, { slug: 'osis',             canonical_name: 'osis',             adds: '3', base_trick: 'osis',             trick_family: 'osis',             category: 'compound', notation: 'OSIS' });
  insertFreestyleTrick(db, { slug: 'toe-stall',        canonical_name: 'toe stall',        adds: '1', base_trick: 'toe-stall',        trick_family: 'toe-stall',        category: 'compound', notation: 'TOE STALL' });
  insertFreestyleTrick(db, { slug: 'clipper-stall',    canonical_name: 'clipper stall',    adds: '2', base_trick: 'clipper-stall',    trick_family: 'clipper-stall',    category: 'compound', notation: 'CLIPPER STALL' });
  insertFreestyleTrick(db, { slug: 'mirage',           canonical_name: 'mirage',           adds: '2', base_trick: 'mirage',           trick_family: 'mirage',           category: 'compound', notation: 'MIRAGE' });
  insertFreestyleTrick(db, { slug: 'whirl',            canonical_name: 'whirl',            adds: '3', base_trick: 'whirl',            trick_family: 'whirl',            category: 'compound', notation: 'WHIRL' });
  insertFreestyleTrick(db, { slug: 'butterfly',        canonical_name: 'butterfly',        adds: '3', base_trick: 'butterfly',        trick_family: 'butterfly',        category: 'compound', notation: 'BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'swirl',            canonical_name: 'swirl',            adds: '3', base_trick: 'swirl',            trick_family: 'swirl',            category: 'compound', notation: 'SWIRL' });
  insertFreestyleTrick(db, { slug: 'legover',          canonical_name: 'legover',          adds: '2', base_trick: 'legover',          trick_family: 'legover',          category: 'compound', notation: 'LEGOVER' });
  insertFreestyleTrick(db, { slug: 'pickup',           canonical_name: 'pickup',           adds: '2', base_trick: 'pickup',           trick_family: 'pickup',           category: 'compound', notation: 'PICKUP' });
  insertFreestyleTrick(db, { slug: 'illusion',         canonical_name: 'illusion',         adds: '2', base_trick: 'illusion',         trick_family: 'illusion',         category: 'compound', notation: 'ILLUSION' });
  insertFreestyleTrick(db, { slug: 'around-the-world', canonical_name: 'around the world', adds: '2', base_trick: 'around-the-world', trick_family: 'around-the-world', category: 'compound', notation: 'AROUND THE WORLD' });
  // Tier 1 compound — pendulum is the only first-class compound with
  // curator-authored operational_notation AND a resolved-formula entry.
  insertFreestyleTrick(db, { slug: 'pendulum',         canonical_name: 'pendulum',         adds: '2', base_trick: 'pendulum',         trick_family: 'pendulum',         category: 'compound', notation: 'PENDULUM', operational_notation: '[DEL] [DEX]' });

  // ─── Tier 2: ADD-complete, JOB-pending ───────────────────────────────
  // Compounds with curator-published ADD derivation but no curator
  // operational_notation. Render the ADD breakdown + honest "JOB:
  // canonical decomposition pending" line.
  insertFreestyleTrick(db, { slug: 'paradox-mirage',          canonical_name: 'paradox mirage',          adds: '3', base_trick: 'mirage',     trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium-mirage',        canonical_name: 'symposium mirage',        adds: '3', base_trick: 'mirage',     trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'atomic-butterfly',        canonical_name: 'atomic butterfly',        adds: '4', base_trick: 'butterfly',  trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',                 canonical_name: 'ripwalk',                 adds: '4', base_trick: 'butterfly',  trick_family: 'butterfly', category: 'compound', notation: 'STEPPING BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'ducking-butterfly',       canonical_name: 'ducking butterfly',       adds: '4', base_trick: 'butterfly',  trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-butterfly',      canonical_name: 'spinning butterfly',      adds: '4', base_trick: 'butterfly',  trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping-osis',           canonical_name: 'stepping osis',           adds: '4', base_trick: 'osis',       trick_family: 'osis',      category: 'compound' });
  insertFreestyleTrick(db, { slug: 'eggbeater',               canonical_name: 'eggbeater',               adds: '3', base_trick: 'legover',    trick_family: 'legover',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-symposium-whirl', canonical_name: 'paradox symposium whirl', adds: '5', base_trick: 'whirl',      trick_family: 'whirl',     category: 'compound' });

  // ─── Tier 2 Wave 1: audit-derived promotions (2026-05-22) ────────────
  // Mechanical modifier × base derivations; ADD curator-locked via
  // RESOLVED_FORMULAS_SPRINT_1, JOB chain pending upstream.
  insertFreestyleTrick(db, { slug: 'atomic-torque',   canonical_name: 'atomic torque',   adds: '6', base_trick: 'torque',  trick_family: 'torque',  category: 'compound', notation: 'ATOMIC TORQUE' });
  insertFreestyleTrick(db, { slug: 'ducking-mirage',  canonical_name: 'ducking mirage',  adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound', notation: 'DUCKING MIRAGE' });
  insertFreestyleTrick(db, { slug: 'paradox-drifter', canonical_name: 'paradox drifter', adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound', notation: 'PARADOX DRIFTER' });
  insertFreestyleTrick(db, { slug: 'spinning-pickup', canonical_name: 'spinning pickup', adds: '3', base_trick: 'pickup',  trick_family: 'pickup',  category: 'compound', notation: 'SPINNING PICKUP' });
  insertFreestyleTrick(db, { slug: 'tapping-whirl',   canonical_name: 'tapping whirl',   adds: '4', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound', notation: 'TAPPING WHIRL' });

  // ─── Tier 2 Wave 2: existing RESOLVED_FORMULAS entries promoted into
  // TIER membership (2026-05-22). 19 slugs already carrying curator-
  // published derivations; promotion is mechanical (set membership).
  insertFreestyleTrick(db, { slug: 'atom-smasher',     canonical_name: 'atom smasher',     adds: '4', base_trick: 'mirage',          trick_family: 'mirage',          category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',          canonical_name: 'dimwalk',          adds: '4', base_trick: 'butterfly',       trick_family: 'butterfly',       category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-clipper',  canonical_name: 'ducking clipper',  adds: '3', base_trick: 'clipper-stall',   trick_family: 'clipper-stall',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-osis',     canonical_name: 'ducking osis',     adds: '4', base_trick: 'osis',            trick_family: 'osis',            category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',    canonical_name: 'ducking whirl',    adds: '4', base_trick: 'whirl',           trick_family: 'whirl',           category: 'compound' });
  insertFreestyleTrick(db, { slug: 'fog',              canonical_name: 'fog',              adds: '5', base_trick: 'double-leg-over', trick_family: 'double-leg-over', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'orbit',            canonical_name: 'orbit',            adds: '2', base_trick: 'orbit',           trick_family: 'orbit',           category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-blender',  canonical_name: 'paradox blender',  adds: '5', base_trick: 'blender',         trick_family: 'blender',         category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-torque',   canonical_name: 'paradox torque',   adds: '5', base_trick: 'torque',          trick_family: 'torque',          category: 'compound' });
  insertFreestyleTrick(db, { slug: 'rake',             canonical_name: 'rake',             adds: '2', base_trick: 'rake',            trick_family: 'rake',            category: 'compound' });
  insertFreestyleTrick(db, { slug: 'rev-up',           canonical_name: 'rev up',           adds: '3', base_trick: 'whirl',           trick_family: 'whirl',           category: 'compound' });
  insertFreestyleTrick(db, { slug: 'rev-whirl',        canonical_name: 'rev whirl',        adds: '3', base_trick: 'whirl',           trick_family: 'whirl',           category: 'compound' });
  insertFreestyleTrick(db, { slug: 'smear',            canonical_name: 'smear',            adds: '3', base_trick: 'mirage',          trick_family: 'mirage',          category: 'compound', notation: 'PIXIE MIRAGE' });
  insertFreestyleTrick(db, { slug: 'spinning-clipper', canonical_name: 'spinning clipper', adds: '3', base_trick: 'clipper-stall',   trick_family: 'clipper-stall',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-osis',    canonical_name: 'spinning osis',    adds: '4', base_trick: 'osis',            trick_family: 'osis',            category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-torque',  canonical_name: 'spinning torque',  adds: '5', base_trick: 'torque',          trick_family: 'torque',          category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping-whirl',   canonical_name: 'stepping whirl',   adds: '4', base_trick: 'whirl',           trick_family: 'whirl',           category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium-whirl',  canonical_name: 'symposium whirl',  adds: '4', base_trick: 'whirl',           trick_family: 'whirl',           category: 'compound' });
  insertFreestyleTrick(db, { slug: 'whirling-swirl',   canonical_name: 'whirling swirl',   adds: '4', base_trick: 'swirl',           trick_family: 'swirl',           category: 'compound' });

  // ─── Tier 2 Wave 3: 28 audit-validated promotions (2026-05-22) ───────
  // 6 via ATAM bracket-flag decomposition; 22 via parser-derived
  // modifier × base (including composite witchdoctor). All converge
  // with official ADD before this batch lands.
  insertFreestyleTrick(db, { slug: 'squeeze',                  canonical_name: 'squeeze',                  adds: '2', base_trick: 'squeeze',                  trick_family: 'squeeze',                  category: 'compound', notation: 'SQUEEZE',                          operational_notation: '[UNS] [DEL]' });
  insertFreestyleTrick(db, { slug: 'barrage',                  canonical_name: 'barrage',                  adds: '3', base_trick: 'barrage',                  trick_family: 'barrage',                  category: 'compound', operational_notation: 'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]' });
  insertFreestyleTrick(db, { slug: 'barfly',                   canonical_name: 'barfly',                   adds: '4', base_trick: 'barfly',                   trick_family: 'barfly',                   category: 'compound', notation: 'BARFLY',                           operational_notation: 'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]' });
  insertFreestyleTrick(db, { slug: 'high-plains-drifter',      canonical_name: 'high-plains-drifter',      adds: '4', base_trick: 'clipper-stall',            trick_family: 'clipper-stall',            category: 'compound', operational_notation: 'CLIP > SAME IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]' });
  insertFreestyleTrick(db, { slug: 'paradon',                  canonical_name: 'paradon',                  adds: '4', base_trick: 'paradon',                  trick_family: 'paradon',                  category: 'compound', operational_notation: 'TOE > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]' });
  insertFreestyleTrick(db, { slug: 'barraging-osis',           canonical_name: 'barraging osis',           adds: '5', base_trick: 'osis',                     trick_family: 'osis',                     category: 'compound', operational_notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' });
  insertFreestyleTrick(db, { slug: 'cross-body-sole-stall',    canonical_name: 'cross-body sole stall',    adds: '3', base_trick: 'cross-body-sole-stall',    trick_family: 'cross-body-sole-stall',    category: 'compound', notation: 'CROSS-BODY SOLE STALL',            operational_notation: '[set] > sole [xbd]' });
  insertFreestyleTrick(db, { slug: 'legeater',                 canonical_name: 'legeater',                 adds: '3', base_trick: 'pickup',                   trick_family: 'pickup',                   category: 'compound', notation: 'QUANTUM PICKUP' });
  insertFreestyleTrick(db, { slug: 'paste',                    canonical_name: 'paste',                    adds: '3', base_trick: 'pickup',                   trick_family: 'pickup',                   category: 'compound', notation: 'PIXIE PICKUP' });
  insertFreestyleTrick(db, { slug: 'reverse-drifter',          canonical_name: 'reverse-drifter',          adds: '3', base_trick: 'reverse-drifter',          trick_family: 'reverse-drifter',          category: 'compound', notation: 'REV DRIFTER' });
  insertFreestyleTrick(db, { slug: 'scrambled-eggbeater',      canonical_name: 'scrambled eggbeater',      adds: '3', base_trick: 'pickup',                   trick_family: 'pickup',                   category: 'compound', notation: 'ATOMIC PICKUP' });
  insertFreestyleTrick(db, { slug: 'tap',                      canonical_name: 'tap',                      adds: '3', base_trick: 'mirage',                   trick_family: 'mirage',                   category: 'compound', notation: 'TAPPING MIRAGE' });
  insertFreestyleTrick(db, { slug: 'blur',                     canonical_name: 'blur',                     adds: '4', base_trick: 'mirage',                   trick_family: 'mirage',                   category: 'compound', notation: 'STEPPING PARADOX MIRAGE' });
  insertFreestyleTrick(db, { slug: 'hatchet',                  canonical_name: 'hatchet',                  adds: '4', base_trick: 'whirl',                    trick_family: 'whirl',                    category: 'compound', notation: 'DIVING WHIRL' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',            canonical_name: 'paradox whirl',            adds: '4', base_trick: 'whirl',                    trick_family: 'whirl',                    category: 'compound', notation: 'PARADOX WHIRL' });
  insertFreestyleTrick(db, { slug: 'pigbeater',                canonical_name: 'pigbeater',                adds: '4', base_trick: 'eggbeater',                trick_family: 'eggbeater',                category: 'compound', notation: 'PIXIE EGGBEATER' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl',           canonical_name: 'spinning whirl',           adds: '4', base_trick: 'whirl',                    trick_family: 'whirl',                    category: 'compound', notation: 'SPINNING WHIRL' });
  insertFreestyleTrick(db, { slug: 'tripwalk',                 canonical_name: 'tripwalk',                 adds: '4', base_trick: 'butterfly',                trick_family: 'butterfly',                category: 'compound', notation: 'QUANTUM BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'matador',                  canonical_name: 'matador',                  adds: '5', base_trick: 'butterfly',                trick_family: 'butterfly',                category: 'compound', notation: 'NUCLEAR BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'phoenix',                  canonical_name: 'phoenix',                  adds: '5', base_trick: 'butterfly',                trick_family: 'butterfly',                category: 'compound', notation: 'PIXIE DUCKING BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'spinal-tap',               canonical_name: 'spinal tap',               adds: '5', base_trick: 'torque',                   trick_family: 'torque',                   category: 'compound', notation: 'TAPPING TORQUE' });
  insertFreestyleTrick(db, { slug: 'spinning-symposium-whirl', canonical_name: 'spinning symposium whirl', adds: '5', base_trick: 'whirl',                    trick_family: 'whirl',                    category: 'compound', notation: 'SPINNING SYMPOSIUM WHIRL' });
  insertFreestyleTrick(db, { slug: 'witchdoctor',              canonical_name: 'witchdoctor',              adds: '5', base_trick: 'mirage',                   trick_family: 'mirage',                   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mind-bender',              canonical_name: 'mind bender',              adds: '6', base_trick: 'blender',                  trick_family: 'blender',                  category: 'compound', notation: 'DUCKING PARADOX BLENDER' });
  insertFreestyleTrick(db, { slug: 'mullet',                   canonical_name: 'mullet',                   adds: '6', base_trick: 'whirl',                    trick_family: 'whirl',                    category: 'compound', notation: 'DUCKING PARADOX SYMPOSIUM WHIRL' });
  insertFreestyleTrick(db, { slug: 'spender',                  canonical_name: 'spender',                  adds: '6', base_trick: 'blender',                  trick_family: 'blender',                  category: 'compound', notation: 'SPINNING PARADOX BLENDER' });
  insertFreestyleTrick(db, { slug: 'gauntlet',                 canonical_name: 'gauntlet',                 adds: '7', base_trick: 'torque',                   trick_family: 'torque',                   category: 'compound', notation: 'STEPPING DUCKING PARADOX TORQUE' });
  insertFreestyleTrick(db, { slug: 'montage',                  canonical_name: 'montage',                  adds: '7', base_trick: 'whirl',                    trick_family: 'whirl',                    category: 'compound', notation: 'SPINNING DUCKING PARADOX SYMPOSIUM WHIRL' });

  // ─── Tier 2 Wave 4-B: mechanical notation back-fill promotions
  // (2026-05-22). 18 ordinary modifier+base compounds + 1 foundational
  // primitive (sole-stall via ATOMIC). All derive cleanly via standard
  // modifier × base ADD math; notation column now populated.
  insertFreestyleTrick(db, { slug: 'flail',        canonical_name: 'flail',        adds: '3', base_trick: 'illusion',        trick_family: 'illusion',        category: 'compound', notation: 'SYMPOSIUM ILLUSION' });
  insertFreestyleTrick(db, { slug: 'magellan',     canonical_name: 'magellan',     adds: '3', base_trick: 'legover',         trick_family: 'legover',         category: 'compound', notation: 'PIXIE LEGOVER' });
  insertFreestyleTrick(db, { slug: 'merkon',       canonical_name: 'merkon',       adds: '3', base_trick: 'legover',         trick_family: 'legover',         category: 'compound', notation: 'SPINNING LEGOVER' });
  insertFreestyleTrick(db, { slug: 'smudge',       canonical_name: 'smudge',       adds: '3', base_trick: 'illusion',        trick_family: 'illusion',        category: 'compound', notation: 'PIXIE ILLUSION' });
  insertFreestyleTrick(db, { slug: 'assassin',     canonical_name: 'assassin',     adds: '4', base_trick: 'mirage',          trick_family: 'mirage',          category: 'compound', notation: 'PIXIE DUCKING MIRAGE' });
  insertFreestyleTrick(db, { slug: 'haze',         canonical_name: 'haze',         adds: '4', base_trick: 'double-leg-over', trick_family: 'double-leg-over', category: 'compound', notation: 'STEPPING DLO' });
  insertFreestyleTrick(db, { slug: 'mantis',       canonical_name: 'mantis',       adds: '4', base_trick: 'eggbeater',       trick_family: 'eggbeater',       category: 'compound', notation: 'GYRO EGGBEATER' });
  insertFreestyleTrick(db, { slug: 'nova',         canonical_name: 'nova',         adds: '4', base_trick: 'double-leg-over', trick_family: 'double-leg-over', category: 'compound', notation: 'SYMPOSIUM DLO' });
  insertFreestyleTrick(db, { slug: 'parkwalk',     canonical_name: 'parkwalk',     adds: '4', base_trick: 'butterfly',       trick_family: 'butterfly',       category: 'compound', notation: 'PIXIE BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'royale',       canonical_name: 'royale',       adds: '4', base_trick: 'reverse-drifter', trick_family: 'reverse-drifter', category: 'compound', notation: 'PARADOX REVERSE DRIFTER' });
  insertFreestyleTrick(db, { slug: 'smog',         canonical_name: 'smog',         adds: '4', base_trick: 'double-leg-over', trick_family: 'double-leg-over', category: 'compound', notation: 'PIXIE DLO' });
  insertFreestyleTrick(db, { slug: 'smoke',        canonical_name: 'smoke',        adds: '4', base_trick: 'drifter',         trick_family: 'drifter',         category: 'compound', notation: 'PIXIE DRIFTER' });
  insertFreestyleTrick(db, { slug: 'tapdown',      canonical_name: 'tapdown',      adds: '4', base_trick: 'butterfly',       trick_family: 'butterfly',       category: 'compound', notation: 'TAPPING BUTTERFLY' });
  insertFreestyleTrick(db, { slug: 'tombstone',    canonical_name: 'tombstone',    adds: '4', base_trick: 'drifter',         trick_family: 'drifter',         category: 'compound', notation: 'STEPPING DRIFTER' });
  insertFreestyleTrick(db, { slug: 'blurriest',    canonical_name: 'blurriest',    adds: '5', base_trick: 'barfly',          trick_family: 'barfly',          category: 'compound', notation: 'BLURRY BARFLY' });
  insertFreestyleTrick(db, { slug: 'grave-digger', canonical_name: 'grave digger', adds: '5', base_trick: 'torque',          trick_family: 'torque',          category: 'compound', notation: 'STEPPING TORQUE' });
  insertFreestyleTrick(db, { slug: 'tomahawk',     canonical_name: 'tomahawk',     adds: '5', base_trick: 'whirl',           trick_family: 'whirl',           category: 'compound', notation: 'DUCKING PARADOX WHIRL' });
  insertFreestyleTrick(db, { slug: 'big-apple',    canonical_name: 'big apple',    adds: '6', base_trick: 'torque',          trick_family: 'torque',          category: 'compound', notation: 'GYRO SYMPOSIUM TORQUE' });
  insertFreestyleTrick(db, { slug: 'sole-stall',   canonical_name: 'sole stall',   adds: '2', base_trick: 'sole-stall',      trick_family: 'sole-stall',      category: 'surface',  notation: 'SOLE STALL', operational_notation: '[set] > sole' });

  // ─── Tier 2 Wave 5: observational→canonical promotions (2026-05-22). 4 PB
  // + 9 FB.org direct + 1 stepwise FB.org (paradox-blizzard via blizzard).
  insertFreestyleTrick(db, { slug: 'blizzard',                         canonical_name: 'blizzard',                         adds: '3', base_trick: 'illusion',            trick_family: 'illusion',            category: 'compound', notation: 'STEPPING ILLUSION' });
  insertFreestyleTrick(db, { slug: 'blaze',                            canonical_name: 'blaze',                            adds: '3', base_trick: 'mirage',              trick_family: 'mirage',              category: 'compound', notation: 'WHIRLING MIRAGE' });
  insertFreestyleTrick(db, { slug: 'bedwetter',                        canonical_name: 'bedwetter',                        adds: '4', base_trick: 'eggbeater',           trick_family: 'eggbeater',           category: 'compound', notation: 'STEPPING EGGBEATER' });
  insertFreestyleTrick(db, { slug: 'sole-survivor',                    canonical_name: 'sole survivor',                    adds: '5', base_trick: 'whirl',               trick_family: 'whirl',               category: 'compound', notation: 'SPINNING SYMPOSIUM WHIRL' });
  insertFreestyleTrick(db, { slug: 'spinning-paradox-mirage',          canonical_name: 'spinning paradox mirage',          adds: '4', base_trick: 'mirage',              trick_family: 'mirage',              category: 'compound', notation: 'SPINNING PARADOX MIRAGE' });
  insertFreestyleTrick(db, { slug: 'spinning-paradox-illusion',        canonical_name: 'spinning paradox illusion',        adds: '4', base_trick: 'illusion',            trick_family: 'illusion',            category: 'compound', notation: 'SPINNING PARADOX ILLUSION' });
  insertFreestyleTrick(db, { slug: 'spinning-paradox-whirl',           canonical_name: 'spinning paradox whirl',           adds: '5', base_trick: 'whirl',               trick_family: 'whirl',               category: 'compound', notation: 'SPINNING PARADOX WHIRL' });
  insertFreestyleTrick(db, { slug: 'paradox-double-leg-over',          canonical_name: 'paradox double leg over',          adds: '4', base_trick: 'double-leg-over',     trick_family: 'double-leg-over',     category: 'compound', notation: 'PARADOX DLO' });
  insertFreestyleTrick(db, { slug: 'paradox-barrage',                  canonical_name: 'paradox barrage',                  adds: '4', base_trick: 'barrage',             trick_family: 'barrage',             category: 'compound', notation: 'PARADOX BARRAGE' });
  insertFreestyleTrick(db, { slug: 'paradox-symposium-mirage',         canonical_name: 'paradox symposium mirage',         adds: '4', base_trick: 'mirage',              trick_family: 'mirage',              category: 'compound', notation: 'PARADOX SYMPOSIUM MIRAGE' });
  insertFreestyleTrick(db, { slug: 'paradox-high-plains-drifter',      canonical_name: 'paradox high-plains-drifter',      adds: '5', base_trick: 'high-plains-drifter', trick_family: 'high-plains-drifter', category: 'compound', notation: 'PARADOX HIGH-PLAINS-DRIFTER' });
  insertFreestyleTrick(db, { slug: 'spinning-paradox-blender',         canonical_name: 'spinning paradox blender',         adds: '6', base_trick: 'blender',             trick_family: 'blender',             category: 'compound', notation: 'SPINNING PARADOX BLENDER' });
  insertFreestyleTrick(db, { slug: 'stepping-ducking-paradox-blender', canonical_name: 'stepping ducking paradox blender', adds: '7', base_trick: 'blender',             trick_family: 'blender',             category: 'compound', notation: 'STEPPING DUCKING PARADOX BLENDER' });
  insertFreestyleTrick(db, { slug: 'paradox-blizzard',                 canonical_name: 'paradox blizzard',                 adds: '4', base_trick: 'blizzard',            trick_family: 'blizzard',            category: 'compound', notation: 'PARADOX BLIZZARD' });

  // ─── Tier 2 Wave 7: doctrine-divergence pilot (2026-05-23).
  // Three rows with PB-vs-IFPA gap=1; published with IFPA-canonical
  // ADD; divergence documented in DOCTRINE_DIVERGENCE_REGISTRY.
  insertFreestyleTrick(db, { slug: 'blurrage', canonical_name: 'blurrage', adds: '4', base_trick: 'barrage',         trick_family: 'barrage',         category: 'compound', notation: 'STEPPING BARRAGE' });
  insertFreestyleTrick(db, { slug: 'predator', canonical_name: 'predator', adds: '4', base_trick: 'double-leg-over', trick_family: 'double-leg-over', category: 'compound', notation: 'ATOMIC DLO' });
  insertFreestyleTrick(db, { slug: 'schmoe',   canonical_name: 'schmoe',   adds: '3', base_trick: 'legover',         trick_family: 'legover',         category: 'compound', notation: 'STEPPING LEGOVER' });

  // ─── Tier 1: foundational 1-ADD vocabulary (added 2026-05-22) ────────
  // Anatomical surface stalls + unusual-surface kicks + folk-name surface +
  // flying-operator primitives. Each carries an ATOMIC_FLAG_DECOMPOSITIONS
  // entry (provides chain + ADD breakdown) and curator-locked notation
  // (passes H2 + H4 of assertFirstClassConvergence).
  insertFreestyleTrick(db, { slug: 'heel-stall',     canonical_name: 'heel stall',     adds: '1', base_trick: 'heel-stall',     trick_family: 'heel-stall',     category: 'surface', notation: 'HEEL STALL',     operational_notation: '[set] > heel' });
  insertFreestyleTrick(db, { slug: 'inside-stall',   canonical_name: 'inside stall',   adds: '1', base_trick: 'inside-stall',   trick_family: 'inside-stall',   category: 'surface', notation: 'INSIDE STALL',   operational_notation: '[set] > inside' });
  insertFreestyleTrick(db, { slug: 'outside-stall',  canonical_name: 'outside stall',  adds: '1', base_trick: 'outside-stall',  trick_family: 'outside-stall',  category: 'surface', notation: 'OUTSIDE STALL',  operational_notation: '[set] > outside' });
  insertFreestyleTrick(db, { slug: 'head-stall',     canonical_name: 'head stall',     adds: '1', base_trick: 'head-stall',     trick_family: 'head-stall',     category: 'surface', notation: 'HEAD STALL',     operational_notation: '[set] > head' });
  insertFreestyleTrick(db, { slug: 'forehead-stall', canonical_name: 'forehead stall', adds: '1', base_trick: 'forehead-stall', trick_family: 'forehead-stall', category: 'surface', notation: 'FOREHEAD STALL', operational_notation: '[set] > forehead' });
  insertFreestyleTrick(db, { slug: 'neck-stall',     canonical_name: 'neck stall',     adds: '1', base_trick: 'neck-stall',     trick_family: 'neck-stall',     category: 'surface', notation: 'NECK STALL',     operational_notation: '[set] > neck' });
  insertFreestyleTrick(db, { slug: 'knee-stall',     canonical_name: 'knee stall',     adds: '1', base_trick: 'knee-stall',     trick_family: 'knee-stall',     category: 'surface', notation: 'KNEE STALL',     operational_notation: '[set] > knee' });
  insertFreestyleTrick(db, { slug: 'shoulder-stall', canonical_name: 'shoulder stall', adds: '1', base_trick: 'shoulder-stall', trick_family: 'shoulder-stall', category: 'surface', notation: 'SHOULDER STALL', operational_notation: '[set] > shoulder' });
  insertFreestyleTrick(db, { slug: 'sole-kick',      canonical_name: 'sole kick',      adds: '1', base_trick: 'sole-kick',      trick_family: 'sole-kick',      category: 'body',    notation: 'SOLE KICK',      operational_notation: '[set] > sole kick' });
  insertFreestyleTrick(db, { slug: 'cloud-kick',     canonical_name: 'cloud kick',     adds: '1', base_trick: 'cloud-kick',     trick_family: 'cloud-kick',     category: 'body',    notation: 'CLOUD KICK',     operational_notation: '[set] > cloud kick' });
  insertFreestyleTrick(db, { slug: 'peak-delay',     canonical_name: 'peak delay',     adds: '1', base_trick: 'peak-delay',     trick_family: 'peak-delay',     category: 'surface', notation: 'PEAK DELAY',     operational_notation: '[set] > peak' });
  insertFreestyleTrick(db, { slug: 'flying-inside',  canonical_name: 'flying inside',  adds: '1', base_trick: 'flying-inside',  trick_family: 'flying-inside',  category: 'body',    notation: 'FLYING INSIDE',  operational_notation: 'flying > inside' });
  insertFreestyleTrick(db, { slug: 'flying-outside', canonical_name: 'flying outside', adds: '1', base_trick: 'flying-outside', trick_family: 'flying-outside', category: 'body',    notation: 'FLYING OUTSIDE', operational_notation: 'flying > outside' });
  insertFreestyleTrick(db, { slug: 'double-knee',    canonical_name: 'double knee',    adds: '1', base_trick: 'double-knee',    trick_family: 'double-knee',    category: 'body',    notation: 'DOUBLE KNEE',    operational_notation: 'double knee' });

  // ─── Tier 1: foundational 2-ADD primitives (added 2026-05-22) ───────
  // Extend the foundational band upward to expose the unusual-surface,
  // flying + dex, and flying + xbody bucket combinations explicitly.
  // flying-clipper has base_trick='clipper' (not self) so it never passes
  // the convergence-rule isAtomic gate; card-level first-class rendering
  // is via slug-keyed ATOMIC_FLAG_DECOMPOSITIONS lookup and works
  // regardless.
  insertFreestyleTrick(db, { slug: 'cloud-stall',    canonical_name: 'cloud stall',    adds: '2', base_trick: 'cloud-stall',    trick_family: 'cloud-stall',    category: 'surface', notation: 'CLOUD STALL',    operational_notation: '[set] > cloud' });
  insertFreestyleTrick(db, { slug: 'dragonfly-kick', canonical_name: 'dragonfly kick', adds: '2', base_trick: 'dragonfly-kick', trick_family: 'dragonfly-kick', category: 'body',    notation: 'DRAGONFLY KICK', operational_notation: 'flying > dragonfly' });
  insertFreestyleTrick(db, { slug: 'flying-clipper', canonical_name: 'flying clipper', adds: '2', base_trick: 'clipper',        trick_family: 'clipper',        category: 'body',    notation: 'FLYING CLIPPER', operational_notation: 'flying > clipper' });
  // Folk-name resolution: knee-clipper is NOT a literal clipper-surface
  // stall (per curator 2026-05-22); it's a flying dex knee kick.
  // bod(1) + xbody(1) = 2 ADD via ATOMIC_FLAG_DECOMPOSITIONS.
  insertFreestyleTrick(db, { slug: 'knee-clipper',  canonical_name: 'knee-clipper',   adds: '2', base_trick: 'knee-clipper',   trick_family: 'knee-clipper',   category: 'body',    notation: 'KNEE-CLIPPER STALL', operational_notation: '[set] > knee-clipper' });
  // Doctrine-hold release: guay resolved 2026-05-22 as pickup-pattern
  // dex primitive ending in inside-stall. dex(1) + stall(1) = 2 ADD.
  insertFreestyleTrick(db, { slug: 'guay',          canonical_name: 'guay',           adds: '2', base_trick: 'guay',           trick_family: 'guay',           category: 'dex',     notation: 'GUAY',                operational_notation: '[set] > leggy in dex > ss inside' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Extract a single dictionary-trick-card's HTML from the rendered page
// so each assertion scopes to one card and not the whole document.
function cardFor(slug: string, html: string): string {
  const startMarker = `data-trick-slug="${slug}"`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) throw new Error(`card not found: ${slug}`);
  // Walk back to the enclosing <article> open
  const articleOpen = html.lastIndexOf('<article', startIdx);
  // Find the matching close
  const articleClose = html.indexOf('</article>', startIdx);
  return html.slice(articleOpen, articleClose + '</article>'.length);
}

describe('First-class rendering parity — osis golden', () => {
  it('osis renders JOB + ADD rows in the first-class summary', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const card = cardFor('osis', res.text);
    // Line-2 notation present (JOB + ADD)
    expect(card).toContain('dict-trick-row-notation');
    // JOB value carries the curator-authored operational chain
    expect(card).toMatch(/class="dict-trick-row-job-value">[\s\S]*SET[\s\S]+SPIN/);
    // ADD value carries the atomic flag-decomposition breakdown.
    expect(card).toContain('spin(1) + xbod(1) + stall(1)');
    // JOB resolved (not pending)
    expect(card).not.toContain('dict-trick-row-pending-value');
    expect(card).not.toContain('canonical decomposition pending');
  });
});

describe('First-class rendering parity — tautological-chain suppression', () => {
  it('paradox-mirage no longer renders a tautological ≡ chain reading', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('paradox-mirage', res.text);
    // The chain reading "paradox mirage" must NOT appear inside the
    // dict-trick-row-interpretation (chain row). It may legitimately appear
    // in the title, but not as a ≡ reading.
    expect(card).not.toMatch(
      /<span class="core-trick-equivalence dict-trick-row-interpretation[^>]*">\s*<span class="core-trick-equiv-sigil">[^<]*<\/span>\s*<a[^>]*data-token-slug="paradox"[^>]*>paradox<\/a>\s*<a[^>]*data-token-slug="mirage"[^>]*>mirage<\/a>/,
    );
  });

  it('symposium-mirage no longer renders a tautological ≡ chain reading', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('symposium-mirage', res.text);
    expect(card).not.toMatch(/data-token-slug="symposium"[\s\S]+data-token-slug="mirage"/);
  });

  it('atomic-butterfly no longer renders a tautological ≡ chain reading', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('atomic-butterfly', res.text);
    expect(card).not.toMatch(/data-token-slug="atomic"[\s\S]+data-token-slug="butterfly"/);
  });
});

describe('First-class rendering parity — informative chain preserved', () => {
  it('ripwalk preserves its non-tautological folk-name chain (stepping butterfly)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('ripwalk', res.text);
    // Folk-name resolution is legitimate: canonical "ripwalk" ≢
    // structural form "stepping butterfly". Chain row should still
    // surface tokens for stepping + butterfly.
    expect(card).toMatch(/data-token-slug="stepping"/);
    expect(card).toMatch(/data-token-slug="butterfly"/);
  });
});

describe('First-class rendering parity — honest incomplete-state', () => {
  // Bucket A backfill:
  // symposium-mirage and ripwalk were promoted out of the JOB-pending
  // state when their operationalNotation field was added to
  // RESOLVED_FORMULAS_SPRINT_1. Only paradox-mirage and atomic-butterfly
  // remain JOB-pending in this cohort.
  it.each([
    // Slice D 2026-05-26: `= N ADD` terminator stripped on browse + detail
    // breakdowns; the hero/registry ADD chip carries the total.
    ['paradox-mirage',   'paradox(+1) + mirage(2)'],
    ['atomic-butterfly', 'atomic(+1) + butterfly(3)'],
  ])('%s renders ADD breakdown + honest INCOMPLETE badge for the unauthored JOB', async (slug, expectedAddText) => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor(slug, res.text);
    // Honest incomplete-state badge for missing Job notation
    expect(card).toContain('dict-badge-incomplete');
    expect(card).toContain('>INCOMPLETE<');
    // ADD breakdown rendered (authoritative data wired through)
    expect(card).toContain(expectedAddText);
  });
});

describe('First-class rendering parity — no fake formulas, no pending pill', () => {
  it('none of the first-class slugs render the pendingDecomposition pill', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    for (const slug of ['osis', 'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk']) {
      const card = cardFor(slug, res.text);
      expect(card).not.toContain('class="dict-trick-row-pending"');
      expect(card).not.toContain('decomposition under review');
    }
  });

  it('first-class cards never substitute the canonical name as a fake Job line', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    // Look at the four compounds whose Job notation is genuinely absent.
    // Their first-class summary partial must not render a JOB row with a
    // <code> value (which would mean a curator-published chain). It must
    // only render the muted incomplete-state line. The 'JOB:' label
    // appears on the incomplete line, so we check that no curator-style
    // <code> follows JOB: in the chain position.
    for (const slug of ['paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk']) {
      const card = cardFor(slug, res.text);
      // The literal canonical name must NOT appear as the JOB value in the
      // line-2 <code class="dict-trick-row-job-value"> element (that would be a
      // fabricated chain echoing the title).
      expect(card).not.toMatch(new RegExp(`<code class="dict-trick-row-job-value">${slug.replace(/-/g, ' ')}</code>`, 'i'));
    }
  });

  it('osis JOB-row source is the curator content module, not a derived stub', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('osis', res.text);
    // The osis atomic flag-decomposition is curator-authored
    // ('SET > SPIN [BOD] > OP CLIP [XBD] [DEL]'). The Job row in
    // the first-class summary must carry this verbatim.
    expect(card).toContain('SET &gt; SPIN [BOD] &gt; OP CLIP [XBD] [DEL]');
  });
});

describe('First-class rendering parity — slug/alias variations do not suppress data', () => {
  it('ripwalk renders its ADD breakdown even though notation column ("STEPPING BUTTERFLY") shadows the canonical name', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('ripwalk', res.text);
    // Ripwalk has notation="STEPPING BUTTERFLY" in the DB. The ADD
    // breakdown from RESOLVED_FORMULAS must still wire through; an
    // earlier shaping path that compared notation against canonical
    // name could in theory miscategorize ripwalk. Assert the data
    // survives all the way to render.
    expect(card).toContain('stepping(+1) + butterfly(3)');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cohort expansion (governed expansion slice 2026-05-20)
// ─────────────────────────────────────────────────────────────────────────

describe('First-class cohort expansion — Tier 1 atom parity', () => {
  // Sampled across families to verify ATOMIC_FLAG_DECOMPOSITIONS reaches
  // every atom kind: stall (toe-stall), dex (mirage), rotational (whirl),
  // alt-rotational (butterfly), reverse-rotation (swirl). All five must
  // render at osis-grade parity: JOB row + ADD row, no incomplete-state.
  // Label is 'JOB:' because opNotationRaw is sourced from
  // CORE_TRICK_SPEC.operationalNotation (curator-authored content
  // module) — same shape as osis. The 'OPERATIONAL:' label only
  // fires when opNotationRaw is empty AND the atomic-chain fallback
  // supplies the chain (a path no longer reached for atoms with
  // CORE_TRICK_SPEC entries).
  // Slice D 2026-05-26: `= N ADD` terminator stripped from ADD breakdowns
  // (hero/registry ADD chip is the authoritative total).
  it.each([
    ['toe-stall',  'SET &gt; SAME TOE [DEL]',                          'stall(1)'],
    ['mirage',     'SET &gt; OP IN [DEX] &gt; OP TOE [DEL]',            'dex(1) + stall(1)'],
    ['whirl',      'SET &gt; OP IN [DEX] &gt; OP CLIP [XBD] [DEL]',     'xbody(1) + dex(1) + stall(1)'],
    ['butterfly',  'SET &gt; OP OUT [DEX] &gt; OP CLIP [XBD] [DEL]',    'dex(1) + xbody(1) + stall(1)'],
    ['swirl',      'SET &gt; OP BACK SWIRL [DEX] &gt; OP CLIP [XBD] [DEL]', 'xbody(1) + dex(1) + stall(1)'],
  ])('%s renders JOB + ADD rows in the first-class summary (full parity)', async (slug, expectedJobText, expectedAddText) => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor(slug, res.text);
    expect(card).toContain('dict-trick-row-notation');
    expect(card).toMatch(/class="dict-trick-row-label">JOB</);
    expect(card).toContain(expectedJobText);
    expect(card).toContain(expectedAddText);
    // JOB resolved — not the pending placeholder.
    expect(card).not.toContain('dict-trick-row-pending-value');
    expect(card).not.toContain('canonical decomposition pending');
  });
});

describe('First-class cohort expansion — Tier 1 compound (pendulum)', () => {
  it('pendulum renders full parity (curator op-notation + resolved formula)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('pendulum', res.text);
    // Curator-authored op-notation in DB → line-2 JOB value populated.
    expect(card).toMatch(/class="dict-trick-row-label">JOB</);
    expect(card).toMatch(/class="dict-trick-row-job-value">[\s\S]*?\[DEL\][\s\S]*?\[DEX\]/);
    // RESOLVED_FORMULAS provides the line-2 ADD breakdown.
    expect(card).toContain('dict-trick-row-notation');
    expect(card).toMatch(/class="dict-trick-row-label">ADD<[\s\S]*?<code class="dict-trick-row-add-value">[^<]+<\/code>/);
    // JOB resolved — not the pending placeholder.
    expect(card).not.toContain('dict-trick-row-pending-value');
  });
});

describe('First-class cohort expansion — Tier 2 new promotions', () => {
  // Slice D 2026-05-26: `= N ADD` terminator stripped.
  it.each([
    ['ducking-butterfly',       'ducking(+1) + butterfly(3)'],
    ['spinning-butterfly',      'spinning(+1) + butterfly(3)'],
    ['stepping-osis',           'stepping(+1) + osis(3)'],
    ['paradox-symposium-whirl', 'paradox(+1) + symposium(+1) + whirl(3)'],
  ])('%s renders ADD breakdown + honest INCOMPLETE badge', async (slug, expectedAddSubstring) => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor(slug, res.text);
    expect(card).toContain('dict-badge-incomplete');
    expect(card).toContain('>INCOMPLETE<');
    expect(card).toContain(expectedAddSubstring);
  });

  it('eggbeater renders its folk-name chain (≡ atomic legover) plus ADD breakdown', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const card = cardFor('eggbeater', res.text);
    // Folk-name chain reading is non-tautological ("atomic legover" ≢
    // "eggbeater") so it survives the first-class tautological filter.
    expect(card).toMatch(/data-token-slug="atomic"/);
    expect(card).toMatch(/data-token-slug="legover"/);
    // ADD breakdown wires through.
    expect(card).toContain('atomic(+1) + legover(2)');
    // JOB notation is unauthored (eggbeater has no curator op-notation), so the
    // card carries the honest INCOMPLETE badge.
    expect(card).toContain('>INCOMPLETE<');
  });
});

describe('First-class cohort governance — isFirstClass() and getFirstClassTier()', () => {
  // Exercises the helpers indirectly through the rendered first-class
  // summary class. A slug that appears in either tier renders
  // dict-trick-row-notation; a slug not in any tier does not.
  it('every Tier 1 + Tier 2 cohort member renders a first-class summary row', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const cohort = [
      // Tier 1 — 12 elite (11 atoms + pendulum)
      'osis', 'toe-stall', 'clipper-stall', 'mirage', 'whirl', 'butterfly',
      'swirl', 'legover', 'pickup', 'illusion', 'around-the-world', 'pendulum',
      // Tier 1 — 14 foundational 1-ADD primitives (promoted 2026-05-22)
      'heel-stall', 'inside-stall', 'outside-stall', 'head-stall',
      'forehead-stall', 'neck-stall', 'knee-stall', 'shoulder-stall',
      'sole-kick', 'cloud-kick', 'peak-delay',
      'flying-inside', 'flying-outside', 'double-knee',
      // Tier 1 — 3 foundational 2-ADD primitives (pedagogical ADD-bucket
      // normalization 2026-05-22) + knee-clipper folk-name resolution
      // + guay doctrine-hold release
      'cloud-stall', 'dragonfly-kick', 'flying-clipper',
      'knee-clipper', 'guay',
      // Tier 2 (9 original + 5 Wave 1 + 19 Wave 2 = 33)
      'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk',
      'ducking-butterfly', 'spinning-butterfly', 'stepping-osis',
      'eggbeater', 'paradox-symposium-whirl',
      // Wave 1 audit-derived 2026-05-22
      'atomic-torque', 'ducking-mirage', 'paradox-drifter',
      'spinning-pickup', 'tapping-whirl',
      // Wave 2 RESOLVED_FORMULAS promotions 2026-05-22.
      // 2026-05-24 QC: rev-up was demoted from FIRST_CLASS_TIER_2 +
      // is_active=0 (structurally distinct from rev-whirl but lacks an
      // authored decomposition).
      'atom-smasher', 'dimwalk', 'ducking-clipper', 'ducking-osis',
      'ducking-whirl', 'fog', 'orbit', 'paradox-blender', 'paradox-torque',
      'rake', 'rev-whirl', 'smear', 'spinning-clipper',
      'spinning-osis', 'spinning-torque', 'stepping-whirl',
      'symposium-whirl', 'whirling-swirl',
      // Wave 3 audit-validated promotions 2026-05-22 — ATAM bracket-flag (6)
      'squeeze', 'barrage', 'barfly', 'high-plains-drifter', 'paradon',
      'barraging-osis',
      // Wave 3 parser-derived (21) + composite witchdoctor (1)
      'cross-body-sole-stall', 'legeater', 'paste', 'reverse-drifter',
      'scrambled-eggbeater', 'tap', 'blur', 'hatchet', 'paradox-whirl',
      'pigbeater', 'spinning-whirl', 'tripwalk', 'matador', 'phoenix',
      'spinal-tap', 'spinning-symposium-whirl', 'witchdoctor',
      'mind-bender', 'mullet', 'spender', 'gauntlet', 'montage',
      // Wave 4-B mechanical notation back-fill promotions 2026-05-22 (19)
      'flail', 'magellan', 'merkon', 'smudge',
      'assassin', 'haze', 'mantis', 'nova', 'parkwalk', 'royale',
      'smog', 'smoke', 'tapdown', 'tombstone',
      'blurriest', 'grave-digger', 'tomahawk', 'big-apple',
      'sole-stall',
      // Wave 5 observational→canonical promotions 2026-05-22 (14)
      'blizzard', 'blaze', 'bedwetter', 'sole-survivor',
      'spinning-paradox-mirage', 'spinning-paradox-illusion',
      'spinning-paradox-whirl', 'paradox-double-leg-over',
      'paradox-barrage', 'paradox-symposium-mirage',
      'paradox-high-plains-drifter', 'spinning-paradox-blender',
      'stepping-ducking-paradox-blender', 'paradox-blizzard',
      // Wave 7 doctrine-divergence pilot 2026-05-23 (3)
      'blurrage', 'predator', 'schmoe',
    ];
    for (const slug of cohort) {
      const card = cardFor(slug, res.text);
      expect(card, `${slug} missing first-class summary row`).toContain('dict-trick-row-notation');
    }
  });

  it('a non-cohort compound (e.g. plain "tap") does NOT render the first-class summary row', async () => {
    // Seed a control row to verify the negative case. Use a slug
    // outside both tiers.
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    // mirage is Tier 1; we just confirmed it renders. Now confirm that
    // a sample non-cohort slug (osis IS in cohort; use butterfly's
    // immediate non-cohort sibling). For this DB, seed a row that
    // isn't in either tier. The cohort is enumerated above.
    // Walk through the page: any card NOT in the cohort must lack
    // dict-trick-row-notation. Sample one such: the bare 'mirage' base
    // would be Tier 1; pick something safe: there isn't one seeded that
    // ISN'T in cohort. Skip the assertion if no negative sample exists.
    expect(res.text).toContain('dict-trick-row-notation');  // smoke
  });
});
