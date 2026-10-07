/**
 * The audience of every seeded private value, taken from the member-data
 * governance taxonomy, and the spellings a page could render it in.
 *
 * - Birth date: the owner and administrators only.
 * - Login email, phone and WhatsApp: hidden by default (owner and
 *   administrators); a member who opts a field in shows it to signed-in members,
 *   never to a visitor.
 * - Biography and city: signed-in members, even on a Hall of Fame honoree's
 *   public profile, where a visitor sees the honor record and not the profile.
 * - Declared former surname and old email: private matching anchors. The
 *   governance text clears them on erasure and states no wider audience, so
 *   they are treated as owner and administrators only.
 * - Donation dedication: never published; the donor's own history and the
 *   administrative payment views only.
 * - An administrator's direct message: the recipient and administrators only.
 *
 * "Members" means onboarded members: a registrant still in the wizard is signed
 * in but is not yet a member.
 */
import type { Canary, ViewerClass } from './oracles';
import type { PrivateFieldCanaries } from '../factories';

const PRIVATE: ReadonlySet<ViewerClass> = new Set(['owner', 'admin']);
const MEMBERS: ReadonlySet<ViewerClass> = new Set(['member', 'owner', 'admin']);

function phoneForms(v: string): string[] {
  return [v, v.replace(/\D/g, '')];
}

const BIRTH_DATE_FORMS = ['1931-02-03', 'February 3, 1931', '3 February 1931', 'Feb 3, 1931'];

export function canariesFor(seed: PrivateFieldCanaries): Canary[] {
  const h = seed.hidden;
  const s = seed.shown;
  return [
    { field: 'birth date', subjectMemberId: h.id, forms: BIRTH_DATE_FORMS, audience: PRIVATE },
    { field: 'login email (not opted in)', subjectMemberId: h.id, forms: [h.loginEmail], audience: PRIVATE },
    { field: 'phone (not opted in)', subjectMemberId: h.id, forms: phoneForms(h.phone), audience: PRIVATE },
    { field: 'WhatsApp (not opted in)', subjectMemberId: h.id, forms: phoneForms(h.whatsapp), audience: PRIVATE },
    { field: 'biography', subjectMemberId: h.id, forms: [h.bio], audience: MEMBERS },
    { field: 'city', subjectMemberId: h.id, forms: [h.city], audience: MEMBERS },
    { field: 'declared former surname', subjectMemberId: h.id, forms: [h.formerSurname], audience: PRIVATE },
    { field: 'declared old email', subjectMemberId: h.id, forms: [h.oldEmail], audience: PRIVATE },
    { field: 'donation dedication', subjectMemberId: h.id, forms: [h.donationNote], audience: PRIVATE },
    { field: 'administrator message', subjectMemberId: h.id, forms: [h.adminMessageBody], audience: PRIVATE },
    { field: 'login email (opted in)', subjectMemberId: s.id, forms: [s.loginEmail], audience: MEMBERS },
    { field: 'phone (opted in)', subjectMemberId: s.id, forms: phoneForms(s.phone), audience: MEMBERS },
    { field: 'WhatsApp (opted in)', subjectMemberId: s.id, forms: phoneForms(s.whatsapp), audience: MEMBERS },
    { field: 'honoree biography', subjectMemberId: s.id, forms: [s.bio], audience: MEMBERS },
    { field: 'honoree city', subjectMemberId: s.id, forms: [s.city], audience: MEMBERS },
  ];
}
