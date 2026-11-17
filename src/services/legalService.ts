/**
 * LegalService -- public legal pages (read-only).
 *
 * Serves:
 *   - GET /legal (public, unauthenticated): canonical single legal page.
 *   - GET /community-standards (public, unauthenticated): the Community Standards, which the
 *     Terms of Use make part of the terms. The wording is adopted by the IFPA CTO.
 *
 * Rendering contract:
 *   - getLegalPage() and getCommunityStandardsPage() return PageViewModel<LegalContent>, and
 *     both render identically for every viewer.
 *   - The legal page composes Privacy, Terms of Use, and Copyright and Trademarks as three
 *     sections in fixed order with stable anchor ids `privacy`, `terms`, `copyright`. Footer
 *     links across the site deep-link to these anchors, so the ids are a stable contract.
 *   - The Community Standards page's section ids, and the `rights` id on its paragraph about
 *     rights to what is posted, are deep-link targets from the legal page and the forms that
 *     link to the standards, so they are a stable contract too.
 *   - Each paragraph is service-shaped prose: text segments rendered escaped, a segment carrying
 *     `href` rendered through the externalLink helper, a segment carrying `path` rendered as a
 *     link to that page of this site, and a segment carrying `email` rendered as a mailto link.
 *     A paragraph's `steps` render as a numbered list after its prose. No paragraph carries
 *     HTML. The lastUpdated ISO date is rendered.
 */
import { PageViewModel } from '../types/page';

// ---------------------------------------------------------------------------
// Shaped types for templates
// ---------------------------------------------------------------------------

/**
 * A run of paragraph text; `href` makes it an external link, `path` a link to a page of this
 * site, `email` a mailto link to that address.
 */
export interface LegalProseSegment {
  text: string;
  href?: string;
  path?: string;
  email?: string;
}

export interface LegalParagraph {
  /** Anchor id on the paragraph's subheading, for a paragraph other pages deep-link to. */
  id?: string;
  subheading?: string;
  body: LegalProseSegment[];
  /** Numbered steps shown after the paragraph's prose. */
  steps?: string[];
}

/** A paragraph of plain text, as one segment. */
const prose = (text: string): LegalProseSegment[] => [{ text }];

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: LegalParagraph[];
}

export interface LegalContent {
  lastUpdated: string;
  /** Accessible name of the page's table of contents. */
  tocLabel: string;
  sections: LegalSection[];
}

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const LAST_UPDATED = '2026-11-16';

const COMMUNITY_STANDARDS_PATH = '/community-standards';
const COMMUNITY_STANDARDS_LAST_UPDATED = '2026-11-16';

const PRIVACY_SECTION: LegalSection = {
  id: 'privacy',
  heading: 'Privacy',
  paragraphs: [
    {
      subheading: 'Overview',
      body: prose(
        'footbag.org is operated with the privacy of our community in mind. This section describes what data we collect, how we use it, and what rights you have over your information.'),
    },
    {
      subheading: 'What we collect',
      body: prose(
        'When you register we collect your name, email address and a password, stored only as a cryptographic hash. We also ask your city, country and date of birth, which we use to find any records of yours on the old footbag.org, and your gender, which decides which competition divisions you can enter. You may add a phone or WhatsApp number, shown only to signed-in members and only if you choose, a bio, profile links, a profile photo and your competition history. If you claim an account from the old footbag.org, we carry over what it held, which can include a street address and postal code. Payments and donations are processed by Stripe; card details never reach us, and we keep a record of each payment and any comment you add to a donation. Uploaded photos are re-encoded and stripped of EXIF and GPS metadata. We do not collect health, biometric or other sensitive categories of data; please keep such details out of your bio and other free text.'),
    },
    {
      subheading: 'Cookies',
      body: prose(
        'This site sets only strictly-necessary cookies. A session cookie is set when you sign in and keeps you signed in until it expires or you sign out. Where the members-only archive of the legacy site is available, signing in also sets short-lived access cookies that let the archive confirm you are signed in; they expire with your session and are cleared when you sign out. A separate cookie carries a one-time confirmation message (for example, "Profile updated") across a page redirect and expires within a minute. No tracking, advertising, or analytics cookies are used. A cookie consent banner is not required for strictly-necessary cookies under GDPR and the ePrivacy Directive.'),
    },
    {
      subheading: 'Analytics',
      body: prose(
        'This site does not use third-party analytics or advertising trackers.'),
    },
    {
      subheading: 'Email',
      body: [
        { text: 'Email is used for account-related actions (verification, password reset, receipts) and for IFPA announcements to members who have opted in, including a one-time announcement about the move to the new footbag.org. ' },
        { text: 'We do not send marketing email', path: `${COMMUNITY_STANDARDS_PATH}#announcements` },
        { text: ' and do not share member email addresses with third parties.' },
      ],
    },
    {
      subheading: 'Third-party embeds',
      body: prose(
        'Video embeds use a click-to-load facade: the YouTube or Vimeo player, and any cookies it sets, load only when you choose to play a video. The still image shown on a video tile is served by YouTube\'s or Vimeo\'s image servers, so displaying a page that lists videos does send a request to those image servers, including your IP address and browser details.'),
    },
    {
      subheading: 'Human verification',
      body: prose(
        'Sign-in, registration, the two password-reset pages and the confirm-your-email page use Cloudflare Turnstile to tell people apart from automated scripts. On those pages your browser loads a script from Cloudflare, which receives your IP address and browser details in order to run the check. It is used only on those pages and only to prevent abuse, not for analytics or advertising. No other third-party services are loaded.'),
    },
    {
      subheading: 'Your rights',
      body: prose(
        'We honor data export and deletion rights for all users regardless of location. EU and UK users have explicit rights under GDPR and UK GDPR; California users have rights under CCPA; we apply these standards globally as a matter of policy. You can download a complete copy of your personal data or delete your account at any time from your member account tools.'),
    },
    {
      subheading: 'Retention',
      body: prose(
        'Account data is retained while your account is active. On deletion, personal data is removed according to our retention policy; content you posted to public historical surfaces (e.g., event results) may be preserved for historical accuracy, with personal identifiers removed where feasible.'),
    },
    {
      subheading: 'Contact',
      body: [
        { text: 'For privacy questions or requests not handled by the automated account tools, contact ' },
        { text: 'admin@footbag.org', email: 'admin@footbag.org' },
        { text: '.' },
      ],
    },
  ],
};

const TERMS_SECTION: LegalSection = {
  id: 'terms',
  heading: 'Terms of Use',
  paragraphs: [
    {
      subheading: 'Operator',
      body: prose(
        'footbag.org is operated by David Leberknight, volunteer maintainer, under authorization from the International Footbag Players Association Incorporated (IFPA), pending transfer of operational responsibility to IFPA.'),
    },
    {
      subheading: 'Acceptance',
      body: prose(
        'By using this site you agree to these Terms. If you do not agree, please do not use the site.'),
    },
    {
      subheading: 'Accounts',
      body: prose(
        'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information during registration and keep it current. One person, one account.'),
    },
    {
      subheading: 'User content license',
      body: prose(
        'By submitting content (including photos, profile text, and video links) to footbag.org, you grant IFPA a non-exclusive, worldwide, royalty-free license to host, display, distribute, and adapt that content as necessary to operate the site and its features. You retain all other rights to your content. You may remove your content at any time via the account tools; removal revokes future use but does not affect archived copies (e.g., backups) retained for operational and legal requirements.'),
    },
    {
      subheading: 'Acceptable use',
      body: prose(
        'You agree not to: (a) impersonate another person or misrepresent your identity; (b) submit content that is illegal, harassing, defamatory, or infringes others\' rights; (c) attempt to gain unauthorized access to member accounts, data, or infrastructure; (d) scrape, mass-download, or re-publish site content at scale; (e) submit false or manipulated historical, competitive, or identity information; (f) use the site to send spam or unsolicited commercial messages. Violations may result in content removal, account suspension, or account termination at IFPA\'s discretion.'),
    },
    {
      subheading: 'Community Standards',
      body: [
        { text: 'The ' },
        { text: 'Community Standards', path: COMMUNITY_STANDARDS_PATH },
        { text: ' are part of these Terms, so breaking them breaches these Terms. If we remove your content or restrict your account in breach of these Terms, you have the right to bring a claim for breach of contract.' },
      ],
    },
    {
      subheading: 'Disclaimer',
      body: prose(
        'The site and its content are provided "as is" without warranties of any kind, express or implied. The maintainers make reasonable efforts to keep information accurate but do not guarantee completeness, correctness, or uninterrupted availability.'),
    },
    {
      subheading: 'Limitation of liability',
      body: prose(
        'To the fullest extent permitted by law, IFPA, the maintainers, and contributors are not liable for any indirect, incidental, consequential, or punitive damages arising from use of the site.'),
    },
    {
      subheading: 'Changes',
      body: prose(
        'These Terms may be updated from time to time. Substantive changes will be reflected in the "Last updated" date at the top of this page. Continued use of the site after changes constitutes acceptance.'),
    },
    {
      subheading: 'Governing law',
      body: prose(
        'These Terms are governed by and construed in accordance with the laws of the State of California, United States of America, where the International Footbag Players Association Incorporated is registered as a 501(c)(3) nonprofit corporation. Any disputes not resolved through good-faith community processes shall be subject to the jurisdiction of courts located in California.'),
    },
    {
      subheading: 'Contact',
      body: [
        { text: 'For Terms questions or administrative matters, contact ' },
        { text: 'admin@footbag.org', email: 'admin@footbag.org' },
        { text: '.' },
      ],
    },
  ],
};

const COPYRIGHT_SECTION: LegalSection = {
  id: 'copyright',
  heading: 'Copyright & Trademarks',
  paragraphs: [
    {
      subheading: 'Copyright',
      body: prose(
        'Site content, including rules of play, governance documents, historical records, event archives, and IFPA marks, is © 1994–2026 International Footbag Players Association Incorporated. All rights reserved.'),
    },
    {
      subheading: 'Source code',
      body: [
        { text: 'The source code for this site is published as open source under the Apache License 2.0. The repository is available at ' },
        { text: 'github.com/davidleberknight/footbag-platform', href: 'https://github.com/davidleberknight/footbag-platform' },
        { text: '. The open-source code license grants rights to the code only; it does not grant any rights to IFPA branding, IFPA marks, IFPA-owned content, or the data hosted on footbag.org.' },
      ],
    },
    {
      subheading: 'IFPA trademarks',
      body: prose(
        '"International Footbag Players Association," "IFPA," and the IFPA logo are marks of the International Footbag Players Association Incorporated, used on this site with permission.'),
    },
    {
      subheading: 'Hacky Sack',
      body: prose(
        '"Hacky Sack" is a trademark of its respective owner. References on this site are descriptive (e.g., "footbag, commonly known as Hacky Sack") and do not imply endorsement, sponsorship, or affiliation.'),
    },
    {
      subheading: 'Member-contributed content',
      body: [
        { text: 'Member-contributed content (photos, profile text, video links) ' },
        { text: 'remains the copyright of its author', path: `${COMMUNITY_STANDARDS_PATH}#rights` },
        { text: '. By submitting content, members grant IFPA a license to display it as described in the Terms of Use.' },
      ],
    },
    {
      subheading: 'Contact',
      body: [
        { text: 'For copyright or trademark inquiries, contact ' },
        { text: 'admin@footbag.org', email: 'admin@footbag.org' },
        { text: '.' },
      ],
    },
  ],
};

// The Community Standards, in the wording the IFPA CTO adopted. Edit only on a new adoption.
const COMMUNITY_STANDARDS_INTRO =
  'These standards apply to everything members publish on footbag.org. They are short on purpose: if something is not covered here, ask whether it is respectful, honest, safe and about footbag.';

const COMMUNITY_STANDARDS_SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    heading: 'What These Standards Cover',
    paragraphs: [
      {
        body: [
          { text: 'They apply to everything footbag.org publishes for members: profile text and links, club and event descriptions, photos, links to video hosted elsewhere, captions, hashtags, gallery names and community announcements. They are part of the ' },
          { text: 'Terms of Use', path: '/legal#terms' },
          { text: ', so breaking them is a breach of the terms. We may remove anything that breaks these standards or the law.' },
        ],
      },
    ],
  },
  {
    id: 'general',
    heading: 'General Standards',
    paragraphs: [
      { subheading: 'Respect People', body: prose('No harassment, bullying, hate, threats or personal attacks.') },
      {
        subheading: 'Be Honest',
        body: prose('Do not pretend to be someone else. Do not post results, records or claims you know are false, or a misleading subject line.'),
      },
      {
        subheading: 'Stay Safe',
        body: prose('No sexual content and no violence. Nothing that encourages dangerous behavior or puts someone at risk. Take extra care with anyone under 18.'),
      },
      {
        subheading: 'Protect Privacy',
        body: prose('Do not publish anyone else\'s contact details, address or private messages. Never post intimate images of anyone.'),
      },
      {
        id: 'rights',
        subheading: 'Post Only What You Have the Right to Post',
        body: prose('Photos, video, text and music must be yours or shared with permission. Giving credit, or writing "no infringement intended", is not permission.'),
      },
      { subheading: 'Keep to Footbag', body: prose('Content should be about footbag or the footbag community.') },
      {
        subheading: 'No Spam or Hidden Selling',
        body: prose('No repeated or off-topic posts, no keyword stuffing, and no commercial content that is not clearly disclosed.'),
      },
      { subheading: 'Follow the Law', body: prose('Do not post anything illegal.') },
    ],
  },
  {
    id: 'links',
    heading: 'Links to Video Hosted Elsewhere',
    paragraphs: [
      {
        body: prose('The hosting platform\'s rules apply as well as these. If a video breaks either, we remove the link from footbag.org; only the platform can remove the video itself. Link straight to the video, not through a link shortener or redirect, and never to an infringing copy.'),
      },
    ],
  },
  {
    id: 'text',
    heading: 'Text You Write',
    paragraphs: [
      {
        body: prose('This covers bios, descriptions, captions, hashtags and gallery names. Describe footbag accurately, in your own words or with permission. Keep hashtags and gallery names honest and plain: no insults or slurs, and no keywords added to attract unrelated searches.'),
      },
    ],
  },
  {
    id: 'photos',
    heading: 'Photos',
    paragraphs: [
      {
        body: prose('Post photos you took or have permission to use, and none taken where people expect privacy, such as changing areas. An identifiable person under 18 needs a parent\'s or guardian\'s consent before their photo is posted, and their name, school and address stay out of captions and hashtags. If you appear in a photo and do not want it shown, ask and we will remove it. A parent or guardian can ask the same for their child at any time.'),
      },
    ],
  },
  {
    id: 'announcements',
    heading: 'Community Announcements',
    paragraphs: [
      {
        body: prose('Announcements are emailed to members who chose to receive them, so they carry the strictest rules. Keep to one footbag topic, with an honest subject line and plain links (no shorteners or redirects). Footbag products and services appear only as clearly disclosed news, never as an advert. No political or religious campaigning. Fundraising is for footbag causes only. We may decline an announcement or ask you to change it.'),
      },
    ],
  },
  {
    id: 'enforcement',
    heading: 'What Happens When Standards Are Broken',
    paragraphs: [
      {
        body: prose('The same steps apply to every kind of content, and we use the lightest one that fits:'),
        steps: [
          'We remove the item and tell you why.',
          'We send you a written warning.',
          'You lose the privilege involved, such as uploading or sending announcements, for up to 30 days.',
          'You lose that privilege for longer or for good. The IFPA board decides this step under the bylaws.',
        ],
      },
      {
        body: prose('The most serious harms go straight to step 4: sexual content involving a minor, threats, and publishing someone\'s private details. While the board decides, an administrator may restrict the account at once. We may report serious cases to the authorities.'),
      },
      {
        body: prose('For copyright, step 4 is also our repeat-infringer policy: a member who repeatedly posts work they have no right to share loses the right to post, and in appropriate cases their account.'),
      },
      {
        body: prose('Suspension and expulsion from IFPA follow the bylaws: the board decides, after notice and a chance to be heard.'),
      },
      {
        body: prose('When we act, we tell you what we removed or limited, for how long, why, which standard it broke, and how to appeal. People, not automated tools, make these decisions. Reports made in bad faith can themselves break these standards.'),
      },
    ],
  },
  {
    id: 'reporting',
    heading: 'How to Report a Problem',
    paragraphs: [
      {
        body: [
          { text: 'Members: use the flag on any photo or video. For anything else, use the contact form and choose "Content that breaks the community standards". Visitors: email ' },
          { text: 'admin@footbag.org', email: 'admin@footbag.org' },
          { text: '. Tell us the page address, what is wrong and why. Copyright owners can send a notice as the ' },
          { text: 'Legal page', path: '/legal#copyright' },
          { text: ' describes. If anyone is in immediate danger, contact local emergency services first.' },
        ],
      },
    ],
  },
  {
    id: 'appeals',
    heading: 'Appeals',
    paragraphs: [
      {
        body: prose('If we tell you about a decision on your content, you can appeal within 30 days through the contact form on your profile, saying which decision you are appealing. An administrator who did not make the decision reviews it and replies with reasons. Board decisions follow the bylaws.'),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const legalService = {
  getLegalPage(): PageViewModel<LegalContent> {
    return {
      seo: {
        title: 'Legal',
        description: 'Privacy, Terms of Use, Copyright, and Trademarks for footbag.org.',
      },
      page: {
        sectionKey: '',
        pageKey: 'legal_index',
        title: 'Legal',
        intro: 'Privacy, Terms of Use, and Copyright & Trademarks for footbag.org.',
      },
      content: {
        lastUpdated: LAST_UPDATED,
        tocLabel: 'Legal contents',
        sections: [PRIVACY_SECTION, TERMS_SECTION, COPYRIGHT_SECTION],
      },
    };
  },

  getCommunityStandardsPage(): PageViewModel<LegalContent> {
    return {
      seo: {
        title: 'Community Standards',
        description: 'What footbag.org publishes for members, what is removed, and how to report a problem or appeal a decision.',
      },
      page: {
        sectionKey: '',
        pageKey: 'legal_community_standards',
        title: 'Community Standards',
        intro: COMMUNITY_STANDARDS_INTRO,
      },
      content: {
        lastUpdated: COMMUNITY_STANDARDS_LAST_UPDATED,
        tocLabel: 'Community Standards contents',
        sections: COMMUNITY_STANDARDS_SECTIONS,
      },
    };
  },
};
