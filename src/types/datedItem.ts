/**
 * One entry in a list of things that happen or were published on a date, an
 * event or a news item, as the `dated-item` partial draws it. The page service
 * shapes every field; the template only renders them.
 */
export interface DatedItemLabel {
  text: string;
  cssClass: string;
}

/**
 * One part of the meta line; a part with an href renders as a link. A hashtag
 * part renders as the shared hashtag token, linked to its gallery when an href
 * is set (media carries it) and plain otherwise.
 */
export interface DatedItemMeta {
  text: string;
  href?: string;
  isHashtag?: boolean;
}

export interface DatedItemView {
  /** Preformatted date or date range. */
  date: string;
  title: string;
  href: string;
  label: DatedItemLabel | null;
  meta: DatedItemMeta[];
  excerpt: string | null;
  /**
   * A small square thumbnail of the item's cover photo, drawn at the card's top
   * right; decorative, so the title stays the card's one link. Absent or null
   * when the item has no cover, and never drawn on the compact form.
   */
  image?: { thumbUrl: string } | null;
}
