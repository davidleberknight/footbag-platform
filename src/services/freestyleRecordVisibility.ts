/**
 * The confidence levels at which a freestyle record stands publicly as a record.
 *
 * One list, read by every public record query and by the rule for when a record
 * holder's history page is linkable, so the record pages and the person pages
 * never disagree about which records count. A record below these levels is held
 * for review and never shown as a current record; the one public place it can
 * appear is as a step labelled provisional in the Unique Fearless progression on
 * the records page.
 */
export const PUBLIC_FREESTYLE_RECORD_CONFIDENCES = [
  'verified',
  'probable',
] as const;
