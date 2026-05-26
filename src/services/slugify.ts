export function slugify(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const PRE_NFD_MAP: Record<string, string> = {
  'Ł': 'L', 'ł': 'l',
  'Ø': 'O', 'ø': 'o',
  'Đ': 'D', 'đ': 'd',
};

export function slugifyForTag(input: string): string {
  let s = input;
  for (const [from, to] of Object.entries(PRE_NFD_MAP)) {
    s = s.replaceAll(from, to);
  }
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/__+/g, '_');
}
