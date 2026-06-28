/**
 * Single source of truth for the Freestyle Media folder structure. Both the
 * /media hub's "Freestyle" card and the /freestyle/media section page read this
 * one definition, so the two surfaces present an identical content model and
 * cannot drift apart.
 *
 * Each folder names the Footbag-Hacky named gallery that backs it; the media
 * service resolves the live item count and link at read time. Order here is
 * display order. Labels stay beginner-friendly: no internal taxonomy terms.
 */
export interface FreestyleMediaFolderDef {
  /** Backing FH named-gallery id (gallery_*). */
  galleryId: string;
  /** Visitor-facing folder label. */
  label: string;
}

export interface FreestyleMediaSectionDef {
  /** Group heading, or null when these folders render as top-level cards. */
  heading: string | null;
  folders: FreestyleMediaFolderDef[];
}

export const FREESTYLE_MEDIA_STRUCTURE: FreestyleMediaSectionDef[] = [
  {
    heading: 'Tutorials & Demos',
    folders: [
      { galleryId: 'gallery_foundations_of_freestyle', label: 'Foundations of Freestyle' },
      { galleryId: 'gallery_tricks_of_the_trade', label: 'Tricks of the Trade' },
      { galleryId: 'gallery_anz_trikz', label: 'Anz Trikz' },
      { galleryId: 'gallery_shred_global', label: 'Shred Global' },
      { galleryId: 'gallery_footbag_finland', label: 'Footbag Finland' },
      { galleryId: 'gallery_footbag_org', label: 'Footbag.org' },
    ],
  },
  {
    heading: 'PassBack Tutorials',
    folders: [
      { galleryId: 'gallery_passback_tutorials', label: 'All PassBack Tutorials' },
      { galleryId: 'gallery_passback_how_to', label: 'How to Footbag Freestyle' },
      { galleryId: 'gallery_passback_beginner', label: 'Beginner PassBack Tutorials' },
      { galleryId: 'gallery_passback_advanced', label: 'Advanced PassBack Tutorials' },
    ],
  },
  {
    heading: 'Records & Reference',
    folders: [
      { galleryId: 'gallery_passback_records', label: 'Freestyle Records' },
      { galleryId: 'gallery_curated_freestyle_tricks', label: 'Curated Trick Videos' },
    ],
  },
  {
    heading: 'Individual Shred Videos',
    folders: [
      { galleryId: 'gallery_individual_shred_videos', label: 'All Shredders' },
      { galleryId: 'gallery_bap_originators', label: 'Originators (1992)' },
      { galleryId: 'gallery_bap_golden_age', label: 'Golden Age (1995-1999)' },
      { galleryId: 'gallery_bap_expansion', label: 'Expansion (2000-2009)' },
      { galleryId: 'gallery_bap_modern', label: 'Modern (2010-2019)' },
      { galleryId: 'gallery_bap_current', label: 'Current (2020-present)' },
    ],
  },
];
