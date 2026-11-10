/**
 * Contract tests for scripts/restore-bucket.sh: putting lost objects back into a
 * main bucket, from its backup copy in the backup region or from the bucket's
 * own earlier versions.
 *
 * What carries the risk: a restore aimed at the wrong environment or bucket; a
 * write made without the typed confirmation, or on production without a person
 * at the terminal; a copy that removes objects from the served bucket or leaves
 * them in the backup's one-zone class; a bucket AWS refused to show read as
 * absent; a version restore that deletes a real object version, revives a key
 * that was already gone at the chosen time, or reports success for a key still
 * missing; and a restore that half-landed reported as done.
 *
 * Hermetic: a stand-in AWS CLI keeps a tiny model of each bucket in files (its
 * region, its current objects, its version listing), answers reads from it and
 * applies writes to it, so every verdict below comes from a real run of the
 * script against that model. A stand-in Terraform prints the tree's outputs.
 * The shared identity stub settles the profile.
 *
 * The dry-run copy line the stand-in prints, "(dryrun) copy: s3://<backup>/<key>
 * to s3://<main>/<key>", is the shape a live read-only staging dry run of the
 * photo bucket printed on 2026-11-10.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'restore-bucket.sh');

const MEDIA = 'footbag-staging-media';
const MEDIA_DR = 'footbag-staging-media-dr';
const ARCHIVE = 'footbag-staging-archive';
const ARCHIVE_DR = 'footbag-staging-archive-dr';
const SNAPSHOTS = 'footbag-staging-db-snapshots';

let dir: string;
let world: string;
let awsLog: string;
let tfOutputs: string;
let fakeAws: string;
let fakeTf: string;

/**
 * The stand-in AWS CLI. Each bucket is a directory under FAKE_WORLD holding
 * `region`, `objects.tsv` (key, size, storage class) for a bucket copied by
 * sync, or `versions.json` (the list-object-versions shape) for a versioned
 * one, and `deny` when AWS should refuse to show it. Any call carrying a region
 * other than the bucket's own is refused, as S3 refuses a request sent to the
 * wrong regional endpoint. Error lines follow the CLI's documented shape,
 * "An error occurred (<Code>) when calling the <Operation> operation: <Message>".
 */
const FAKE_AWS = String.raw`#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_AWS_LOG"
W="$FAKE_WORLD"
bucket=""; key=""; region=""; vid=""; srcregion=""; sclass=""; query=""; excl=""; dryrun=0; del=0; prev=""
for a in "$@"; do
  case "$prev" in
    --bucket) bucket="$a" ;; --key) key="$a" ;; --region) region="$a" ;; --version-id) vid="$a" ;;
    --source-region) srcregion="$a" ;; --storage-class) sclass="$a" ;; --query) query="$a" ;;
    --exclude) excl="$a" ;;
  esac
  [[ "$a" == --dryrun ]] && dryrun=1
  [[ "$a" == --delete ]] && del=1
  prev="$a"
done
fail() { echo "An error occurred ($1) when calling the $2 operation: $3" >&2; exit 254; }
in_region() { # bucket op
  [[ "$region" == "$(cat "$W/$1/region")" ]] || fail PermanentRedirect "$2" "The bucket you are attempting to access must be addressed using the specified endpoint."
}
case "$1 $2" in
  "s3api get-bucket-location")
    [[ -f "$W/$bucket/deny" ]] && fail AccessDenied GetBucketLocation "Access Denied"
    [[ -d "$W/$bucket" ]] || fail NoSuchBucket GetBucketLocation "The specified bucket does not exist"
    r="$(cat "$W/$bucket/region")"; [[ "$r" == us-east-1 ]] && r=None; echo "$r"; exit 0 ;;
  "s3api head-bucket")
    [[ -f "$W/$bucket/deny" ]] && fail 403 HeadBucket Forbidden
    [[ -d "$W/$bucket" ]] || fail 404 HeadBucket "Not Found"
    in_region "$bucket" HeadBucket; exit 0 ;;
  "s3api list-objects-v2")
    in_region "$bucket" ListObjectsV2
    k="$(cut -f1 "$W/$bucket/objects.tsv" | head -n 1)"; echo "\${k:-None}"; exit 0 ;;
  "s3api head-object")
    in_region "$bucket" HeadObject
    [[ ",$FAKE_HEAD_ABSENT," == *",$key,"* ]] && fail 404 HeadObject "Not Found"
    if [[ -f "$W/$bucket/versions.json" ]]; then
      cur="$(jq -r --arg k "$key" '[(.Versions[]|select(.Key==$k)|{t:.LastModified,m:false}),(.DeleteMarkers[]|select(.Key==$k)|{t:.LastModified,m:true})] | sort_by(.t) | last | if . == null or .m then "gone" else "here" end' "$W/$bucket/versions.json")"
      [[ "$cur" == here ]] || fail 404 HeadObject "Not Found"
      echo "{}"; exit 0
    fi
    line="$(grep -P "^\Q$key\E\t" "$W/$bucket/objects.tsv")" || fail 404 HeadObject "Not Found"
    size="$(cut -f2 <<<"$line")"; class="$(cut -f3 <<<"$line")"
    [[ "$class" == STANDARD ]] && class=None
    if [[ "$query" == *StorageClass* ]]; then printf '%s\t%s\n' "$size" "$class"; else echo "$size"; fi
    exit 0 ;;
  "s3api list-object-versions")
    in_region "$bucket" ListObjectVersions
    cat "$W/$bucket/versions.json"; exit 0 ;;
  "s3api delete-object")
    in_region "$bucket" DeleteObject
    [[ -n "$FAKE_DELETE_FAIL" && "$key" == "$FAKE_DELETE_FAIL" ]] && fail AccessDenied DeleteObject "Access Denied"
    tmp="$(mktemp)"
    jq --arg v "$vid" '.Versions |= map(select(.VersionId != $v)) | .DeleteMarkers |= map(select(.VersionId != $v))' "$W/$bucket/versions.json" > "$tmp"
    cat "$tmp" > "$W/$bucket/versions.json"; rm -f "$tmp"
    exit 0 ;;
  "s3 sync")
    src="\${3#s3://}"; dst="\${4#s3://}"
    [[ "$srcregion" == "$(cat "$W/$src/region")" ]] || { echo "fatal error: source region mismatch" >&2; exit 1; }
    [[ "$region" == "$(cat "$W/$dst/region")" ]] || { echo "fatal error: destination region mismatch" >&2; exit 1; }
    n=0
    while IFS=$'\t' read -r k size _; do
      [[ -z "$k" ]] && continue
      [[ -n "$excl" && "$k" == $excl ]] && continue
      have="$(grep -P "^\Q$k\E\t" "$W/$dst/objects.tsv" | cut -f2)"
      [[ "$have" == "$size" ]] && continue
      if (( dryrun )); then echo "(dryrun) copy: s3://$src/$k to s3://$dst/$k"; continue; fi
      if [[ -n "$FAKE_SYNC_FAIL_AFTER" ]] && (( n >= FAKE_SYNC_FAIL_AFTER )); then
        echo "copy failed: s3://$src/$k to s3://$dst/$k An error occurred (InternalError) when calling the CopyObject operation: We encountered an internal error." >&2
        exit 1
      fi
      grep -vP "^\Q$k\E\t" "$W/$dst/objects.tsv" > "$W/$dst/objects.tmp" || true
      landed="$size"; [[ -n "$FAKE_COPY_SIZE" ]] && landed="$FAKE_COPY_SIZE"
      printf '%s\t%s\t%s\n' "$k" "$landed" "\${FAKE_COPY_CLASS:-\${sclass:-STANDARD}}" >> "$W/$dst/objects.tmp"
      cat "$W/$dst/objects.tmp" > "$W/$dst/objects.tsv"; rm -f "$W/$dst/objects.tmp"
      echo "copy: s3://$src/$k to s3://$dst/$k"; n=$((n + 1))
    done < "$W/$src/objects.tsv"
    [[ -n "$FAKE_DRY_EXTRA" && "$dryrun" == 1 ]] && echo "$FAKE_DRY_EXTRA"
    if (( del && ! dryrun )); then
      while IFS=$'\t' read -r k _; do
        grep -qP "^\Q$k\E\t" "$W/$src/objects.tsv" && continue
        grep -vP "^\Q$k\E\t" "$W/$dst/objects.tsv" > "$W/$dst/objects.tmp" || true
        cat "$W/$dst/objects.tmp" > "$W/$dst/objects.tsv"; rm -f "$W/$dst/objects.tmp"
      done < <(cat "$W/$dst/objects.tsv")
    fi
    exit 0 ;;
esac
echo "unexpected aws invocation: $*" >&2
exit 64
`.replace(/\\\$\{/g, '${');

const FAKE_TF = String.raw`#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_TF_LOG"
[[ -n "$FAKE_TF_FAIL" ]] && { echo "Error: Failed to load state: AccessDenied" >&2; exit 1; }
[[ "$*" == "-chdir=$FAKE_TF_TREE output -json" ]] || { echo "unexpected terraform invocation: $*" >&2; exit 64; }
cat "$FAKE_TF_OUTPUTS"
`;

type Obj = [key: string, size: number, storageClass: string];

function bucket(name: string, region: string, objects: Obj[] = []): void {
  fs.mkdirSync(path.join(world, name), { recursive: true });
  fs.writeFileSync(path.join(world, name, 'region'), `${region}\n`);
  fs.writeFileSync(path.join(world, name, 'objects.tsv'), objects.map((o) => `${o.join('\t')}\n`).join(''));
}

function objects(name: string): Obj[] {
  return fs.readFileSync(path.join(world, name, 'objects.tsv'), 'utf8').split('\n').filter(Boolean)
    .map((l) => { const [k, s, c] = l.split('\t'); return [k, Number(s), c] as Obj; });
}

interface VersionListing {
  Versions: Array<{ Key: string; VersionId: string; IsLatest: boolean; LastModified: string; Size: number }>;
  DeleteMarkers: Array<{ Key: string; VersionId: string; IsLatest: boolean; LastModified: string }>;
}

/** A versioned bucket built from each key's history, oldest first: 'v' a version, 'd' a delete marker. */
function versioned(name: string, history: Record<string, Array<['v' | 'd', string]>>): VersionListing {
  bucket(name, 'us-east-1');
  const listing: VersionListing = { Versions: [], DeleteMarkers: [] };
  for (const [key, entries] of Object.entries(history)) {
    entries.forEach(([kind, at], i) => {
      const entry = { Key: key, VersionId: `${key}-${kind}${i}`, IsLatest: i === entries.length - 1, LastModified: `${at}+00:00` };
      if (kind === 'v') listing.Versions.push({ ...entry, Size: 100 });
      else listing.DeleteMarkers.push(entry);
    });
  }
  fs.writeFileSync(path.join(world, name, 'versions.json'), JSON.stringify(listing));
  return listing;
}

function listing(name: string): VersionListing {
  return JSON.parse(fs.readFileSync(path.join(world, name, 'versions.json'), 'utf8')) as VersionListing;
}

/** What `terraform output -json` prints; a name left out is an output Terraform keeps no value for. */
function outputs(values: Record<string, string>): void {
  const json: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) json[k] = { sensitive: false, type: 'string', value: v };
  fs.writeFileSync(tfOutputs, JSON.stringify(json));
}

const ALL_OUTPUTS = {
  media_bucket_name: MEDIA, media_dr_bucket_name: MEDIA_DR,
  archive_bucket_name: ARCHIVE, archive_dr_bucket_name: ARCHIVE_DR,
  snapshots_bucket_name: SNAPSHOTS,
};

function run(args: string[], env: Record<string, string> = {}, target = 'staging') {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      RESTORE_BUCKET_AWS_BIN: fakeAws,
      RESTORE_BUCKET_TERRAFORM_BIN: fakeTf,
      FAKE_WORLD: world,
      FAKE_AWS_LOG: awsLog,
      FAKE_TF_LOG: path.join(dir, 'tf.log'),
      FAKE_TF_OUTPUTS: tfOutputs,
      FAKE_TF_TREE: path.join(REPO_ROOT, 'terraform', target),
      FAKE_TF_FAIL: '', FAKE_HEAD_ABSENT: '', FAKE_DELETE_FAIL: '', FAKE_SYNC_FAIL_AFTER: '',
      FAKE_COPY_CLASS: '', FAKE_COPY_SIZE: '', FAKE_DRY_EXTRA: '',
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const awsCalls = (): string[] => fs.readFileSync(awsLog, 'utf8').split('\n').filter(Boolean);
const syncs = (): string[] => awsCalls().filter((c) => c.startsWith('s3 sync'));
const writes = (): string[] => awsCalls().filter((c) => (c.startsWith('s3 sync') && !c.includes('--dryrun')) || c.includes('delete-object'));

beforeEach(() => {
  dir = createScratchDir('restore-bucket');
  world = path.join(dir, 'world');
  fs.mkdirSync(world);
  awsLog = path.join(dir, 'aws.log');
  fs.writeFileSync(awsLog, '');
  tfOutputs = path.join(dir, 'outputs.json');
  outputs(ALL_OUTPUTS);
  fakeAws = path.join(dir, 'aws');
  fs.writeFileSync(fakeAws, FAKE_AWS, { mode: 0o755 });
  fakeTf = path.join(dir, 'terraform');
  fs.writeFileSync(fakeTf, FAKE_TF, { mode: 0o755 });
  // The photo buckets as replication leaves them after a loss: the backup
  // holds three photos in the one-zone class, the served bucket lost two and
  // holds one the backup never saw.
  bucket(MEDIA_DR, 'us-west-2', [
    ['photos/a.jpg', 10, 'ONEZONE_IA'], ['photos/b.jpg', 20, 'ONEZONE_IA'], ['photos/c.jpg', 30, 'ONEZONE_IA'],
  ]);
  bucket(MEDIA, 'us-east-1', [['photos/a.jpg', 10, 'STANDARD'], ['photos/new.jpg', 5, 'STANDARD']]);
});

afterEach(() => {
  removeScratch(dir);
});

describe('restore-bucket: from the backup copy', () => {
  it('copies back what the served bucket lost, in the standard class, removing nothing, and proves it', () => {
    // Defect caught: lost photos left lost, copied into the one-zone class,
    // read in the wrong region, or the served bucket's own newer photo
    // deleted by a mirror-style copy.
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('2 object(s) would be copied');
    expect(objects(MEDIA)).toEqual(expect.arrayContaining([
      ['photos/a.jpg', 10, 'STANDARD'], ['photos/b.jpg', 20, 'STANDARD'],
      ['photos/c.jpg', 30, 'STANDARD'], ['photos/new.jpg', 5, 'STANDARD'],
    ]));
    expect(objects(MEDIA)).toHaveLength(4);
    for (const s of syncs()) {
      expect(s).toContain(`s3 sync s3://${MEDIA_DR} s3://${MEDIA}`);
      expect(s).not.toContain('--delete');
      // The class is asked for by name, so the copy never depends on what
      // the CLI picks when none is given.
      expect(s).toContain('--storage-class STANDARD');
    }
    // The plan, the copy, and the second dry run that proves nothing is left.
    expect(syncs().map((s) => s.includes('--dryrun'))).toEqual([true, false, true]);
    expect(res.stderr).toContain('finds nothing left to copy');
    expect(res.stderr).toContain('2 copied key(s) read back');
  });

  it('reports a finished run with nothing to copy when the served bucket already holds everything', () => {
    // Defect caught: a re-run after a completed restore reported as a failure,
    // or a copy made when there was nothing to make.
    bucket(MEDIA, 'us-east-1', [['photos/a.jpg', 10, 'STANDARD'], ['photos/b.jpg', 20, 'STANDARD'], ['photos/c.jpg', 30, 'STANDARD']]);
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toContain('VERDICT: DONE, NOTHING TO COPY');
    expect(writes()).toEqual([]);
  });

  it('shows what would be copied on a dry run and changes nothing', () => {
    // Defect caught: a dry run that writes into the served bucket.
    const before = objects(MEDIA);
    const res = run(['--target', 'staging', '--bucket', 'media', '--dry-run']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('photos/b.jpg');
    expect(res.stdout).toContain('photos/c.jpg');
    expect(writes()).toEqual([]);
    expect(objects(MEDIA)).toEqual(before);
  });

  it('fails, naming what is still missing, when the copy stops part way, and a re-run finishes it', () => {
    // Defect caught: a half-landed restore reported as done because the
    // script trusted the copy's start rather than measuring the bucket.
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes'], { FAKE_SYNC_FAIL_AFTER: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('1 object(s) are still missing');
    expect(res.stderr).toContain('VERDICT: FAILED');
    const again = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(again.status, again.stderr).toBe(0);
    expect(objects(MEDIA)).toHaveLength(4);
  });

  it('fails when a copied object reads back in the one-zone class', () => {
    // Defect caught: the served bucket left holding photos in the backup's
    // cheaper, single-zone class, with the run reporting success.
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes'], { FAKE_COPY_CLASS: 'ONEZONE_IA' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('is stored in ONEZONE_IA, not the standard class');
  });

  it('fails when a copied object reads back at a different size from the backup', () => {
    // Defect caught: a truncated copy reported as a restored photo. The
    // stand-in lands every copy at 1 byte, so the second dry run also sees
    // the sizes differ.
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes'], { FAKE_COPY_SIZE: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/photos\/b\.jpg in s3:\/\/footbag-staging-media is 1 bytes, but 20 in the backup copy/);
  });

  it('stops on a dry-run line it does not recognise rather than counting it as nothing to do', () => {
    // Defect caught: a change in what the copy prints read as zero objects
    // to copy, so a restore that never ran reports success.
    bucket(MEDIA, 'us-east-1', [['photos/a.jpg', 10, 'STANDARD'], ['photos/b.jpg', 20, 'STANDARD'], ['photos/c.jpg', 30, 'STANDARD']]);
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes'], { FAKE_DRY_EXTRA: '(dryrun) move: s3://x/y to s3://z/y' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not recognise');
    expect(writes()).toEqual([]);
  });

  it('refuses an empty backup copy, and copies from one holding objects', () => {
    // Defect caught: an empty or wrong backup bucket reported as a restore
    // with nothing to copy.
    bucket(MEDIA_DR, 'us-west-2', []);
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('holds no object');
    expect(writes()).toEqual([]);
  });

  it('restores the archive from its own backup copy', () => {
    // Defect caught: the archive restore reading the photo buckets' names.
    bucket(ARCHIVE_DR, 'us-west-2', [['index.html', 7, 'ONEZONE_IA']]);
    bucket(ARCHIVE, 'us-east-1', []);
    const res = run(['--target', 'staging', '--bucket', 'archive', '--yes']);
    expect(res.status, res.stderr).toBe(0);
    expect(objects(ARCHIVE)).toEqual([['index.html', 7, 'STANDARD']]);
    expect(objects(MEDIA)).toHaveLength(2);
  });
});

describe('restore-bucket: the confirmation', () => {
  it('changes nothing without the typed APPLY when no terminal is attached', () => {
    // Defect caught: a restore that writes into the served bucket with no
    // one confirming it.
    const res = run(['--target', 'staging', '--bucket', 'media']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('VERDICT: ABORTED');
    expect(writes()).toEqual([]);
    expect(objects(MEDIA)).toHaveLength(2);
  });

  it('refuses --yes on production before touching AWS, and runs a production dry run without it', () => {
    // Defect caught: a production restore made unattended by a flag.
    outputs({ ...ALL_OUTPUTS, media_bucket_name: 'footbag-production-media', media_dr_bucket_name: 'footbag-production-media-dr' });
    bucket('footbag-production-media', 'us-east-1', []);
    bucket('footbag-production-media-dr', 'us-west-2', [['photos/a.jpg', 10, 'ONEZONE_IA']]);
    const refused = run(['--target', 'production', '--bucket', 'media', '--yes'], {}, 'production');
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('--yes does not carry a production restore');
    expect(awsCalls()).toEqual([]);
    const dry = run(['--target', 'production', '--bucket', 'media', '--dry-run'], {}, 'production');
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('1 object(s) would be copied');
    const unattended = run(['--target', 'production', '--bucket', 'media'], {}, 'production');
    expect(unattended.status).toBe(1);
    expect(writes()).toEqual([]);
  });
});

describe('restore-bucket: which buckets', () => {
  it('refuses the archive while its stack is off, and restores the photos from the same state', () => {
    // Defect caught: an archive whose stack is off read as an unreadable
    // state, or a stale name restored into.
    outputs({ media_bucket_name: MEDIA, media_dr_bucket_name: MEDIA_DR, snapshots_bucket_name: SNAPSHOTS });
    const res = run(['--target', 'staging', '--bucket', 'archive', '--yes']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('the archive stack is off');
    expect(awsCalls()).toEqual([]);
    expect(run(['--target', 'staging', '--bucket', 'media', '--yes']).status).toBe(0);
  });

  it('refuses when the Terraform state cannot be read, before any AWS call', () => {
    // Defect caught: a failed state read taken as an archive that is off,
    // or names guessed instead of read.
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes'], { FAKE_TF_FAIL: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not read the terraform/staging state');
    expect(awsCalls()).toEqual([]);
  });

  it('says a bucket does not exist only when AWS says so, and gives AWS\'s words when it refuses to show one', () => {
    // Defect caught: an identity that may not look at the bucket reported as
    // a missing bucket, sending the operator after the wrong problem.
    fs.rmSync(path.join(world, MEDIA_DR), { recursive: true });
    const absent = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(absent.status).toBe(1);
    expect(absent.stderr).toContain(`s3://${MEDIA_DR} does not exist`);
    bucket(MEDIA_DR, 'us-west-2', [['photos/a.jpg', 10, 'ONEZONE_IA']]);
    fs.writeFileSync(path.join(world, MEDIA_DR, 'deny'), '');
    const denied = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(denied.status).toBe(1);
    expect(denied.stderr).toContain('AWS answered: An error occurred (AccessDenied)');
    expect(denied.stderr).not.toContain('does not exist');
    expect(writes()).toEqual([]);
  });

  it('restores the CloudTrail log bucket from its versions on production, and refuses it on staging and without versions', () => {
    // Defect caught: a deleted audit log file left lost because the trail's
    // bucket cannot be named; a staging run sent after a log bucket staging
    // does not have; or a copy-back attempted from a backup that bucket lacks.
    const TRAIL = 'footbag-production-cloudtrail';
    const asOf = ['--from-versions', '--as-of', '2026-11-01T12:00:00Z'];
    const onStaging = run(['--target', 'staging', '--bucket', 'cloudtrail', ...asOf, '--dry-run']);
    expect(onStaging.status).toBe(2);
    expect(onStaging.stderr).toContain('staging has no CloudTrail log bucket');
    const noVersions = run(['--target', 'production', '--bucket', 'cloudtrail', '--dry-run'], {}, 'production');
    expect(noVersions.status).toBe(2);
    expect(noVersions.stderr).toContain('has no backup copy');
    expect(awsCalls()).toEqual([]);

    outputs({ ...ALL_OUTPUTS });
    const off = run(['--target', 'production', '--bucket', 'cloudtrail', ...asOf, '--dry-run'], {}, 'production');
    expect(off.status).toBe(1);
    expect(off.stderr).toContain('the trail is off here');

    outputs({ ...ALL_OUTPUTS, cloudtrail_bucket_name: TRAIL });
    versioned(TRAIL, {
      'AWSLogs/0/CloudTrail/us-east-1/a.json.gz': [['v', '2026-10-01T00:00:00'], ['d', '2026-11-02T00:00:00']],
    });
    const dry = run(['--target', 'production', '--bucket', 'cloudtrail', ...asOf, '--dry-run'], {}, 'production');
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('1 key(s) deleted after 2026-11-01T12:00:00 would be restored');
    expect(dry.stdout).toContain('AWSLogs/0/CloudTrail/us-east-1/a.json.gz');
    expect(writes()).toEqual([]);
  });

  it('never copies photo upload staging back from the backup, nor counts it as missing', () => {
    // Defect caught: abandoned uploads the pending/ lifecycle rule expired
    // from the served bucket, which the backup still holds because S3 does
    // not replicate an expiry, revived by a restore; or the verifying dry run
    // reporting them as still missing, failing a restore that landed.
    bucket(MEDIA_DR, 'us-west-2', [
      ['photos/a.jpg', 10, 'ONEZONE_IA'], ['photos/b.jpg', 20, 'ONEZONE_IA'],
      ['pending/abandoned.mp4', 40, 'ONEZONE_IA'],
    ]);
    const res = run(['--target', 'staging', '--bucket', 'media', '--yes']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('1 object(s) would be copied');
    expect(objects(MEDIA).map((o) => o[0])).not.toContain('pending/abandoned.mp4');
    expect(objects(MEDIA).map((o) => o[0])).toContain('photos/b.jpg');
    for (const s of syncs()) expect(s).toContain('--exclude pending/*');
  });

  it('leaves out the prefix the media bucket\'s pending-upload lifecycle rule expires, in both trees', () => {
    // Defect caught: the rule's prefix moved in Terraform while the restore
    // keeps excluding the old one, so abandoned uploads come back again.
    const script = fs.readFileSync(SCRIPT, 'utf8');
    const excluded = script.match(/^MEDIA_PENDING_PREFIX="([^"]+)"$/m)?.[1];
    for (const tree of ['staging', 'production']) {
      const s3 = fs.readFileSync(path.join(REPO_ROOT, 'terraform', tree, 's3.tf'), 'utf8');
      const rule = s3.match(/id\s*=\s*"expire-pending-uploads"[\s\S]*?prefix\s*=\s*"([^"]+)"/)?.[1];
      expect(rule, tree).toBeDefined();
      expect(excluded, tree).toBe(rule);
    }
  });

  it('reads only bucket outputs the production tree declares', () => {
    // Defect caught: the script reading an output name no tree declares, so
    // every restore of that bucket refuses as "apply that tree first" while
    // the bucket stands.
    const script = fs.readFileSync(SCRIPT, 'utf8');
    const declared = fs.readFileSync(path.join(REPO_ROOT, 'terraform', 'production', 'outputs.tf'), 'utf8');
    const names = [...script.matchAll(/(?:MAIN|DR)_OUT=([a-z_]+)/g)].map((m) => m[1]);
    expect(names).toContain('cloudtrail_bucket_name');
    for (const name of names) expect(declared, name).toContain(`output "${name}" {`);
  });
});

describe('restore-bucket: usage refusals', () => {
  const refused = (args: string[]) => {
    const res = run(args);
    expect(res.status, `${args.join(' ')}\n${res.stderr}`).toBe(2);
    return res;
  };

  it('refuses a missing or unknown target', () => {
    // Defect caught: a restore landing on an environment nobody named.
    refused(['--bucket', 'media', '--dry-run']);
    refused(['--target', 'prod', '--bucket', 'media', '--dry-run']);
    expect(awsCalls()).toEqual([]);
    expect(run(['--target', 'staging', '--bucket', 'media', '--dry-run']).status).toBe(0);
  });

  it('refuses an unknown bucket, and the snapshot bucket outside --from-versions', () => {
    // Defect caught: a mistyped bucket restored into, or database copies
    // overwritten by a copy-back that belongs to the database restore.
    refused(['--target', 'staging', '--bucket', 'photos', '--dry-run']);
    refused(['--target', 'staging', '--bucket', 'snapshots', '--dry-run']);
    refused(['--target', 'staging', '--bucket', 'photos', '--from-versions', '--as-of', '2026-11-01T12:00:00Z', '--dry-run']);
    expect(awsCalls()).toEqual([]);
    versioned(SNAPSHOTS, {});
    expect(run(['--target', 'staging', '--bucket', 'snapshots', '--from-versions', '--as-of', '2026-11-01T12:00:00Z', '--dry-run']).status).toBe(0);
  });

  it('refuses --as-of without --from-versions, and --from-versions without --as-of', () => {
    // Defect caught: an operator believing a backup copy-back honoured a
    // time, or a version restore with no time undoing every delete ever made.
    const timeAlone = refused(['--target', 'staging', '--bucket', 'media', '--as-of', '2026-11-01T12:00:00Z', '--dry-run']);
    expect(timeAlone.stderr).toContain('--as-of belongs to --from-versions');
    const versionsAlone = refused(['--target', 'staging', '--bucket', 'media', '--from-versions', '--dry-run']);
    expect(versionsAlone.stderr).toContain('--from-versions requires --as-of');
    expect(awsCalls()).toEqual([]);
  });

  it('refuses a time that is not a time, or has no zone', () => {
    // Defect caught: a local time read as UTC, shifting which deletes are
    // undone by hours, or a nonsense date compared as a string.
    for (const bad of ['yesterday', '2026-11-01T12:00:00', '2026-13-45T12:00:00Z', '2026-11-01 12:00Z']) {
      const res = refused(['--target', 'staging', '--bucket', 'media', '--from-versions', '--as-of', bad, '--dry-run']);
      expect(res.stderr, bad).toContain('--as-of must be an ISO 8601 time with its zone');
    }
    expect(awsCalls()).toEqual([]);
  });
});

describe('restore-bucket: from earlier versions', () => {
  const AS_OF = '2026-11-01T12:00:00Z';
  // Each key's history, oldest first.
  const HISTORY: Record<string, Array<['v' | 'd', string]>> = {
    // Deleted after the time: restored.
    'photos/deleted.jpg': [['v', '2026-10-01T00:00:00'], ['d', '2026-11-02T00:00:00']],
    // Deleted twice after the time: both markers go.
    'photos/twice.jpg': [['v', '2026-10-01T00:00:00'], ['d', '2026-11-02T00:00:00'], ['d', '2026-11-03T00:00:00']],
    // Already deleted at the time: left alone.
    'photos/old-delete.jpg': [['v', '2026-10-01T00:00:00'], ['d', '2026-10-15T00:00:00']],
    // Deleted before the time and again after: still absent at the time, left alone.
    'photos/gone-at-time.jpg': [['v', '2026-10-01T00:00:00'], ['d', '2026-10-20T00:00:00'], ['d', '2026-11-02T00:00:00']],
    // Overwritten, not deleted: untouched.
    'photos/replaced.jpg': [['v', '2026-10-01T00:00:00'], ['v', '2026-11-02T00:00:00']],
    // Deleted after the time, its earlier version aged out of the window.
    'photos/aged-out.jpg': [['d', '2026-11-02T00:00:00']],
  };
  const args = ['--target', 'staging', '--bucket', 'media', '--from-versions', '--as-of', AS_OF];

  it('removes only the delete markers newer than the time, restoring those keys, and proves each present', () => {
    // Defect caught: a real object version deleted; a key that was already
    // gone at the chosen time revived; a stacked delete left in place so the
    // key stays missing; or a success reported for a key still absent.
    const before = versioned(MEDIA, HISTORY);
    const res = run([...args, '--yes']);
    expect(res.status, res.stderr).toBe(0);
    const after = listing(MEDIA);
    expect(after.Versions).toEqual(before.Versions);
    expect(after.DeleteMarkers.map((d) => d.VersionId).sort()).toEqual([
      'photos/aged-out.jpg-d0', 'photos/gone-at-time.jpg-d1', 'photos/gone-at-time.jpg-d2', 'photos/old-delete.jpg-d1',
    ]);
    expect(res.stderr).toContain('all 2 restored key(s) read back as present');
    expect(res.stderr).toContain('1 key(s) deleted after 2026-11-01T12:00:00 in s3://footbag-staging-media are beyond the version window');
  });

  it('lists the keys on a dry run and removes nothing', () => {
    // Defect caught: a dry run that deletes markers.
    const before = versioned(MEDIA, HISTORY);
    const res = run([...args, '--dry-run']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('2 key(s) deleted after 2026-11-01T12:00:00 would be restored');
    expect(res.stdout).toContain('photos/deleted.jpg');
    expect(res.stdout).not.toContain('photos/old-delete.jpg');
    expect(writes()).toEqual([]);
    expect(listing(MEDIA)).toEqual(before);
  });

  it('reads the time in its own zone and treats a delete exactly at the time as before it', () => {
    // Defect caught: an offset dropped, so the window moves by hours; or a
    // key deleted at the very moment chosen revived.
    versioned(MEDIA, {
      'photos/after.jpg': [['v', '2026-10-01T00:00:00'], ['d', '2026-11-01T10:30:00']],
      'photos/exact.jpg': [['v', '2026-10-01T00:00:00'], ['d', '2026-11-01T10:00:00']],
    });
    const res = run(['--target', 'staging', '--bucket', 'media', '--from-versions', '--as-of', '2026-11-01T12:00:00+02:00', '--dry-run']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('1 key(s) deleted after 2026-11-01T10:00:00 would be restored');
    expect(res.stdout).toContain('photos/after.jpg');
    expect(res.stdout).not.toContain('photos/exact.jpg');
  });

  it('reports a finished run with nothing to restore', () => {
    // Defect caught: a bucket with nothing to undo reported as a failure.
    versioned(MEDIA, { 'photos/old-delete.jpg': HISTORY['photos/old-delete.jpg'] });
    const res = run([...args, '--yes']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toContain('VERDICT: DONE, NOTHING TO RESTORE');
    expect(writes()).toEqual([]);
  });

  it('changes nothing without the typed APPLY when no terminal is attached', () => {
    // Defect caught: delete markers removed with no one confirming it.
    const before = versioned(MEDIA, HISTORY);
    const res = run(args);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('VERDICT: ABORTED');
    expect(listing(MEDIA)).toEqual(before);
  });

  it('stops when a marker cannot be removed, saying how far it got', () => {
    // Defect caught: a refused removal skipped and the restore reported done.
    versioned(MEDIA, HISTORY);
    const res = run([...args, '--yes'], { FAKE_DELETE_FAIL: 'photos/twice.jpg' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/could not be removed; AWS answered: An error occurred \(AccessDenied\)/);
    expect(res.stderr).toContain('a re-run finishes the rest');
  });

  it('fails when a restored key does not read back as present', () => {
    // Defect caught: success reported from the removal calls alone while the
    // key is still missing for members.
    versioned(MEDIA, HISTORY);
    const res = run([...args, '--yes'], { FAKE_HEAD_ABSENT: 'photos/deleted.jpg' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('photos/deleted.jpg is still absent');
    expect(res.stderr).not.toContain('restored key(s) read back as present');
  });
});

describe('restore-bucket: test seams', () => {
  it('says on stderr that a stand-in AWS CLI and Terraform prove nothing about the estate', () => {
    const res = run(['--target', 'staging', '--bucket', 'media', '--dry-run']);
    expect(res.stderr).toContain('TEST SEAM RESTORE_BUCKET_AWS_BIN is set');
    expect(res.stderr).toContain('TEST SEAM RESTORE_BUCKET_TERRAFORM_BIN is set');
  });
});
