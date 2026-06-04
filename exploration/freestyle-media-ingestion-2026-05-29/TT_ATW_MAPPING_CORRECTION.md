# Media-track handoff: Around-the-World TT tutorial mapping is backwards

**Owner:** media / gallery track (seeder edit to `media_links.csv`; not touched from the freestyle-doctrine track).

## Problem

The two Tricks-of-the-Trade tutorials for Around the World are mapped to the wrong tricks. The 2-ADD stall trick currently shows the kick's video, and the 1-ADD kick trick has no video at all.

## Evidence (from `legacy_data/inputs/curated/media/`)

`media_assets.csv` video titles:

| Asset id | TT # | Title |
|---|---|---|
| `037d1575-35f8-5e64-86b8-d859e3d16edc` | **#14** | "Tricks of the Trade #14 - Around The World" |
| `4de01909-cab9-5cd1-91d3-4eb21a1e39be` | **#15** | "Tricks of the Trade #15 - Around The World **Toe Stall** (2 add)" |

`media_links.csv` current state:

| Asset | Linked trick | is_active |
|---|---|---|
| `037d1575` (TT#14, "Around The World") | `around-the-world` (the 2-ADD stall trick) | **1** |
| `4de01909` (TT#15, "Around The World Toe Stall") | `around-the-world` | 0 |

So TT#15 ("Toe Stall", the actual stall tutorial) is inactive, and TT#14 (the kick/basic) is the one shown on the stall trick. `around-the-world-kick` has no media link.

## Correction (curator-confirmed mapping)

- **`around-the-world`** (2-ADD, toe stall) → activate **TT#15** (`4de01909`); retire TT#14 from this trick.
- **`around-the-world-kick`** (1-ADD, kick) → add an active link to **TT#14** (`037d1575`).

Net: the stall trick points at the "Toe Stall" video; the kick trick points at the plain "Around The World" video.

## Status: applied (media-track edit)

The two cells above were applied to `media_links.csv` at the maintainer's direction, crossing into the media seeder from the doctrine track. Two follow-ups remain for the media track:

- a DB rebuild for the remap to render on the site;
- Dave's awareness, in case it intersects gallery-edit-tool state.

This file documents the evidence and the exact change so the media track can verify or revert it cleanly.
