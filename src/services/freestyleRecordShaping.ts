import { FreestyleRecordRow } from '../db/db';
import { personHref } from './personLink';

export function trickNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface FreestyleRecordViewModel {
  id: string;
  holderName: string;
  holderHref: string | null;
  trickName: string | null;
  trickHref: string | null;
  sortName: string | null;
  addsCount: number | null;
  valueNumeric: number;
  achievedDate: string | null;
  dateApproximate: boolean;
  videoUrl: string | null;
  videoTimecode: string | null;
}

export function shapeFreestyleRecord(row: FreestyleRecordRow): FreestyleRecordViewModel {
  return {
    id:              row.id,
    holderName:      row.holder_name,
    holderHref:      personHref(row.holder_member_slug, row.person_id),
    trickName:       row.trick_name,
    trickHref:       row.trick_name ? `/freestyle/tricks/${trickNameToSlug(row.trick_name)}` : null,
    sortName:        row.sort_name,
    addsCount:       row.adds_count,
    valueNumeric:    row.value_numeric,
    achievedDate:    row.achieved_date,
    dateApproximate: row.date_precision !== 'day',
    videoUrl:        row.video_url,
    videoTimecode:   row.video_timecode,
  };
}
