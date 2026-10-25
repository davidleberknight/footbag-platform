/**
 * View-model shapes shared by the sport section landing pages that present a
 * list of games (X Square, Golf, Sideline), all rendered through the
 * `sport-section` partial.
 */

export interface SportSectionMoreInfoLink {
  label: string;
  href: string;
  external: boolean;
}

export interface SportSectionDemoVideo {
  webmUrl: string;
  caption: string;
}

export interface SportSectionGame {
  slug: string;
  title: string;
  iconSrc: string | null;
  iconAlt: string;
  paragraphs: string[];
  demoVideo: SportSectionDemoVideo | null;
  moreInfo: SportSectionMoreInfoLink[];
}

/** A run of paragraph text; one carrying `href` renders as an internal link. */
export interface SportSectionProseSegment {
  text: string;
  href?: string;
}

export interface SportSectionExplainer {
  heading: string;
  paragraphs: SportSectionProseSegment[][];
}

export interface SportSectionContent {
  mascot: { src: string; alt: string } | null;
  explainer: SportSectionExplainer | null;
  games: SportSectionGame[];
}
