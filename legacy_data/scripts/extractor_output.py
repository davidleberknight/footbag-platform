#!/usr/bin/env python3
"""Shared output destination and regeneration control for the mirror extractors.

The mirror extractors write seed CSVs that are also committed, so comparing a
freshly generated file against the committed one requires sending the fresh copy
somewhere else entirely; writing it over the committed file destroys the very
thing the comparison is about. `--out-dir` is that redirect.

`--force` is separate and deliberately so. The extractors skip when their output
is newer than the extractor itself, which is a useful shortcut for an ordinary
rebuild but a hazard for a comparison run: a run that skipped produces exactly
the output a run that reproduced its input byte-for-byte would, so a comparison
that hit the skip path reports agreement while having generated nothing. A
redirected run that skips therefore exits non-zero, because the caller asked for
a fresh file and did not get one.

Both extractors share this module so the two spellings of the contract cannot
drift apart, and so the tests exercise the same resolution the extractors use.
"""

from pathlib import Path

# A destination that cannot be used at all, as distinct from a run that chose
# not to generate.
EXIT_INVALID_OUTPUT = 2
# A redirected run that skipped: nothing was written where the caller asked.
EXIT_SKIPPED_REDIRECTED = 3


class OutputDestinationError(Exception):
    """The requested output directory or file cannot be used."""


def add_output_arguments(parser):
    """Add the shared `--out-dir` and `--force` flags to an extractor's parser."""
    parser.add_argument(
        "--out-dir",
        metavar="PATH",
        default=None,
        help=(
            "Write this extractor's CSV beneath PATH instead of the committed "
            "seed directory. A relative PATH resolves against the current "
            "working directory and the resolved absolute path is printed. The "
            "directory is created when it does not exist. Does not affect which "
            "inputs are read."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Regenerate even when the existing CSV is newer than this script. "
            "Chooses no output directory of its own; combine it with --out-dir "
            "to redirect a run, or use it alone to refresh the default target."
        ),
    )
    return parser


def resolve_output_dir(out_dir_arg, default_dir):
    """Return (directory, redirected).

    Without the flag the committed default is used and reported as not
    redirected. With it, a relative path resolves against the current working
    directory, so a caller always knows where the output landed from the printed
    absolute path rather than from the shape of what they typed.
    """
    if out_dir_arg is None:
        return Path(default_dir), False
    return Path(out_dir_arg).expanduser().resolve(), True


def prepare_output_target(directory, filename):
    """Create the output directory if needed and return the CSV path inside it.

    Refuses a destination that exists as something other than a directory, a
    destination whose parent is a file, and a target CSV path already occupied by
    a directory. Each of those would otherwise surface much later as an opaque
    write failure, or worse, as a partially written run.
    """
    directory = Path(directory)
    if directory.exists() and not directory.is_dir():
        raise OutputDestinationError(
            f"output destination exists but is not a directory: {directory}"
        )
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except (NotADirectoryError, FileExistsError) as exc:
        raise OutputDestinationError(
            f"output destination cannot be created because part of the path is a "
            f"file: {directory}"
        ) from exc
    except OSError as exc:
        reason = exc.strerror or exc.__class__.__name__
        raise OutputDestinationError(
            f"output destination cannot be created: {directory} ({reason})"
        ) from exc

    target = directory / filename
    if target.exists() and target.is_dir():
        raise OutputDestinationError(
            f"output path is a directory, not a file: {target}"
        )
    return target


def decide_regeneration(output_csv, script_path, force):
    """Return (generate, reason).

    The freshness skip is preserved exactly as it was for an ordinary run, so
    existing callers see no change. `--force` defeats it unconditionally.
    """
    if force:
        return True, "--force was given"
    output_csv = Path(output_csv)
    if not output_csv.exists():
        return True, "no existing CSV at the target"
    if output_csv.stat().st_mtime > Path(script_path).stat().st_mtime:
        return False, "the existing CSV is newer than this script"
    return True, "the existing CSV is older than this script"


def skip_exit_code(redirected):
    """Exit status for a run that generated nothing.

    A default-target skip stays a success, which is the long-standing behavior
    every existing caller depends on. A redirected skip is a failure, because the
    caller asked for a file at a chosen location and none was produced.
    """
    return EXIT_SKIPPED_REDIRECTED if redirected else 0
