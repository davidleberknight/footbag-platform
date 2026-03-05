# legacy_data

Tooling for archiving and migrating content from the legacy footbag.org site.

## Contents

| File | Purpose |
|---|---|
| `create_mirror_footbag_org.py` | Crawls and archives the legacy footbag.org site for offline reference and data migration |
| `requirements.txt` | Python dependencies for the mirror script |

## Future

Code to clean up event results data to a canonical format.
Code to merge that data from other historical event results datasets.
Code to migrate other useful data from the live site (the future archive.footbag.org) into the new database.

## What the mirror script does

`create_mirror_footbag_org.py` logs into footbag.org (for member-only content),
crawls pages and media, rewrites links for offline browsing, converts legacy media
formats (requires `ffmpeg`), and saves progress so it can resume after interruption.

**Expect ~60 GB disk usage and multi-day runtime.**

## Generated artifacts (not committed)

The following are produced by running the script and are excluded from the repository:

- `mirror_footbag_org/` — the downloaded site archive
- `mirror_progress.json` — resumable crawl state
- `mirror.log` — run log
- `footbag_venv/` — Python virtual environment
- `create_mirror.sh` — local run script (git-ignored, as this keeps the user name and password for footbag.org)

## Usage

```bash
python -m venv footbag_venv
source footbag_venv/bin/activate
pip install -r requirements.txt
python create_mirror_footbag_org.py username password 
```

`ffmpeg` must be installed separately (e.g. `sudo apt install ffmpeg`).
