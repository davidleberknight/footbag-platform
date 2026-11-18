/**
 * A download's file name in the site's `name_kind_YYYYMMDD.ext` form, such as
 * `spring_jam_participants_20270412.csv`. The name is folded to lowercase
 * letters, digits and underscores, so it is safe in a header and on every
 * file system.
 */
export function downloadFilename(name: string, kind: string, isoDate: string, extension: string): string {
  const folded = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/, '');
  const day = isoDate.slice(0, 10).replace(/-/g, '');
  return `${folded || 'download'}_${kind}_${day}.${extension}`;
}
