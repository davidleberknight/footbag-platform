/**
 * LegalService -- public legal page (read-only).
 *
 * Serves:
 *   - GET /legal (public, unauthenticated): canonical single legal page.
 *
 * Rendering contract:
 *   - getLegalPage() returns PageViewModel<LegalContent>.
 *   - Composes Privacy, Terms of Use, and Copyright and Trademarks as three sections in fixed
 *     order with stable anchor ids `privacy`, `terms`, `copyright`. Footer links across the site
 *     deep-link to these anchors, so the ids are a stable contract.
 *   - Each paragraph is service-shaped prose: text segments rendered escaped, a segment carrying
 *     `href` rendered through the externalLink helper, and a segment marked `pending` rendered as
 *     a not-yet-active contact. No paragraph carries HTML. The lastUpdated ISO date is rendered.
 */
import { PageViewModel } from '../types/page';

// ---------------------------------------------------------------------------
// Shaped types for templates
// ---------------------------------------------------------------------------

/** A run of paragraph text; `href` makes it an external link, `pending` a contact not yet active. */
export interface LegalProseSegment {
  text: string;
  href?: string;
  pending?: boolean;
}

export interface LegalParagraph {
  subheading?: string;
  body: LegalProseSegment[];
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
  sections: LegalSection[];
}

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const LAST_UPDATED = '2026-10-08';

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
        'When you register an account we collect your name, email address, and a password, which is stored only as a cryptographic hash. You may optionally add profile information such as location, bio, and competition history. When you upload photos, images are re-encoded and stored on our image server; metadata such as EXIF and GPS information is stripped at upload.'),
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
      body: prose(
        'Email is used for account-related actions (verification, password reset, receipts) and for IFPA announcements to members who have opted in, including a one-time announcement about the move to the new footbag.org. We do not send marketing email and do not share member email addresses with third parties.'),
    },
    {
      subheading: 'Third-party embeds',
      body: prose(
        'Video embeds use a click-to-load facade: the YouTube or Vimeo player, and any cookies it sets, load only when you choose to play a video. The still image shown on a video tile is served by YouTube\'s or Vimeo\'s image servers, so displaying a page that lists videos does send a request to those image servers, including your IP address and browser details.'),
    },
    {
      subheading: 'Human verification',
      body: prose(
        'Sign-in, registration, the two password-reset pages, the confirm-your-email page, and the legacy-account claim step in the registration wizard use Cloudflare Turnstile to tell people apart from automated scripts. On those pages your browser loads a script from Cloudflare, which receives your IP address and browser details in order to run the check. It is used only on those pages and only to prevent abuse, not for analytics or advertising. No other third-party services are loaded.'),
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
        { text: 'admin@footbag.org (mailbox not yet active)', pending: true },
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
        { text: 'admin@footbag.org (mailbox not yet active)', pending: true },
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
      body: prose(
        'Member-contributed content (photos, profile text, video links) remains the copyright of its author. By submitting content, members grant IFPA a license to display it as described in the Terms of Use.'),
    },
    {
      subheading: 'Contact',
      body: [
        { text: 'For copyright or trademark inquiries, contact ' },
        { text: 'admin@footbag.org (mailbox not yet active)', pending: true },
        { text: '.' },
      ],
    },
  ],
};

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
        sections: [PRIVACY_SECTION, TERMS_SECTION, COPYRIGHT_SECTION],
      },
    };
  },
};
