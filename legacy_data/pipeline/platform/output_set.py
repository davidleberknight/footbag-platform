#!/usr/bin/env python3
"""Whole-set output destination and publication for the canonical platform export.

The five canonical_input CSVs are one output set, not five files that happen to
share a directory. An event key written into events.csv is referenced by rows in
the other four, so a half-updated set is not merely incomplete, it is internally
inconsistent and will still load. Writing them one by one straight onto their
targets leaves exactly that state behind whenever anything fails partway through.

Publication therefore happens in three phases. Every file is generated to a
uniquely named temporary file inside the destination directory. Every target that
already exists is copied to a recovery file, also inside the destination. Only
then are the targets replaced. If a replacement fails, the replacements that
already landed are undone: a target that existed before the run is restored from
its recovery copy, and a target the run created is removed. So a caller sees
either the complete new set or the complete previous set.

The guarantee, stated exactly and not more strongly than it holds:

  - `os.replace` is atomic per file, so no reader ever sees a partially written
    CSV.
  - Five replacements in sequence are NOT a transactional five-file commit. A
    reader arriving mid-sequence can still observe a mixed set. Nothing in this
    pipeline does, because every consumer is a batch script the orchestrator runs
    in sequence and nothing in the running application reads the set.
  - Recovery covers a failed replacement. It does not cover the process being
    killed between replacements, which leaves the recovery copies on disk for an
    operator rather than restoring anything.
  - If recovery itself fails, the set is left inconsistent and said to be so. The
    recovery copies are kept in that case, because they are the only remaining
    route back.

Temporary and recovery files are created with `tempfile.mkstemp` in the
destination directory, so a name is reserved atomically and can never collide
with an artifact a crashed earlier run left behind. Such an artifact is
deliberately not cleaned up on sight: it may be the only surviving copy of a
previous set, and deleting recovery evidence to tidy a directory is how a
recoverable incident becomes an unrecoverable one.

Exit codes are numeric here so the exporter and any drift gate agree on them. The
unusable-destination code deliberately matches the one the mirror seed extractors
use, since it means the same thing. The missing-intermediates code is distinct
because "the mirror pipeline has not run here" and "you pointed me at a bad
directory" call for opposite operator responses.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

# A failure during generation or publication. Matches the status the exporter
# already used for a referential-closure failure.
EXIT_GENERATION_FAILURE = 1
# The destination cannot be used at all.
EXIT_INVALID_OUTPUT = 2
# A required upstream artifact is absent, so there is nothing to export from.
EXIT_MISSING_INTERMEDIATES = 4

STAGED_MARKER = ".partial-"
RECOVERY_MARKER = ".recovery-"


class OutputDestinationError(Exception):
    """The requested destination cannot hold the output set."""


class PublicationError(Exception):
    """The generated set could not be published, and the previous set stands."""


class UnrecoveredPublicationError(PublicationError):
    """Publication failed and the previous set could not be put back.

    Carries the targets whose state is unknown and the recovery files kept on
    disk, so the caller can name both rather than reporting a bare failure.
    """

    def __init__(self, message, unrecovered, retained):
        super().__init__(message)
        self.unrecovered = list(unrecovered)
        self.retained = list(retained)


def add_output_argument(parser):
    """Add the whole-set `--out-dir` flag.

    There is deliberately no per-file flag: a caller able to redirect three of
    five outputs could produce the mixed set this module exists to prevent.
    """
    parser.add_argument(
        "--out-dir",
        metavar="PATH",
        default=None,
        help=(
            "Write all five canonical_input CSVs beneath PATH instead of the "
            "committed canonical_input directory. A relative PATH resolves "
            "against the current working directory and the resolved absolute "
            "path is printed. The whole set moves together; individual files "
            "cannot be redirected separately."
        ),
    )
    return parser


def resolve_output_dir(out_dir_arg, default_dir):
    """Return (directory, redirected), resolving a relative path against cwd."""
    if out_dir_arg is None:
        return Path(default_dir), False
    return Path(out_dir_arg).expanduser().resolve(), True


def validate_destination(directory, filenames):
    """Check the entire destination before any output is generated.

    Refuses a destination that exists as a non-directory, one whose parent is a
    file, one that cannot be created or written, and any target name already
    occupied by a directory. Checking all of it up front is the point: finding
    the fourth target unusable after three have been written is the failure this
    ordering removes.
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

    for name in filenames:
        target = directory / name
        if target.exists() and not target.is_file():
            raise OutputDestinationError(
                f"output path is a directory, not a file: {target}"
            )

    # Writability is proved by writing, not by reading permission bits, which
    # misreport on several filesystems.
    try:
        handle, probe = tempfile.mkstemp(prefix=".write-probe-", dir=str(directory))
    except OSError as exc:
        reason = exc.strerror or exc.__class__.__name__
        raise OutputDestinationError(
            f"output destination is not writable: {directory} ({reason})"
        ) from exc
    os.close(handle)
    try:
        os.unlink(probe)
    except OSError:
        pass


def missing_inputs(paths):
    """Return every absent or non-regular required input, not just the first.

    Reporting one missing file at a time turns a single misconfiguration into as
    many failed runs as there are missing inputs.
    """
    return [Path(p) for p in paths if not Path(p).is_file()]


class OutputSetPublisher:
    """Stage the whole set, back up what is there, then publish or roll back."""

    def __init__(self, directory, filenames):
        self.directory = Path(directory)
        self.filenames = list(filenames)
        self._staged: dict[str, Path] = {}
        self._recovery: dict[str, Path] = {}
        self._pre_existing: set[str] = set()
        self._replaced: list[str] = []
        self._unrecovered: list[str] = []

    def __enter__(self):
        return self

    # ── staging ──────────────────────────────────────────────────────────────

    def staged_path(self, name):
        """Reserve a temporary path for one member of the set.

        `mkstemp` reserves the name atomically, so a leftover from a crashed
        earlier run can never be reused or overwritten.
        """
        if name not in self.filenames:
            raise PublicationError(f"{name} is not part of this output set")
        handle, path = tempfile.mkstemp(
            prefix=f".{name}{STAGED_MARKER}", dir=str(self.directory)
        )
        os.close(handle)
        self._staged[name] = Path(path)
        return Path(path)

    # ── publication ──────────────────────────────────────────────────────────

    def publish(self):
        """Replace every target, only once all five are complete on disk."""
        absent = [name for name in self.filenames if name not in self._staged]
        if absent:
            raise PublicationError(
                "refusing to publish an incomplete set; never generated: "
                + ", ".join(sorted(absent))
            )
        for name in self.filenames:
            staged = self._staged[name]
            if not staged.is_file():
                raise PublicationError(
                    f"staged output is missing or not a regular file: {staged}"
                )

        try:
            self._preserve_existing()
        except OSError as exc:
            raise PublicationError(
                "could not preserve the existing output set, so nothing was "
                f"replaced and the previous set stands: {exc}"
            ) from exc

        try:
            for name in self.filenames:
                # The staged entry is dropped only after its replacement lands,
                # so a failure leaves it for cleanup rather than orphaning it.
                os.replace(self._staged[name], self.directory / name)
                self._replaced.append(name)
                del self._staged[name]
        except OSError as exc:
            self._roll_back(exc)
            raise PublicationError(
                f"replacement failed and the previous set was restored: {exc}"
            ) from exc

        self._discard_recovery()

    def _preserve_existing(self):
        """Copy every target that already exists to a recovery file.

        A reserved name is registered for cleanup before it is filled, so a copy
        that fails midway leaves no orphan behind. `_pre_existing` is only
        recorded once the copy has actually succeeded, which is what rollback
        keys on, so a half-written recovery file can never be restored over a
        live target.
        """
        for name in self.filenames:
            target = self.directory / name
            if not target.is_file():
                continue
            handle, path = tempfile.mkstemp(
                prefix=f".{name}{RECOVERY_MARKER}", dir=str(self.directory)
            )
            os.close(handle)
            self._recovery[name] = Path(path)
            shutil.copy2(target, path)
            self._pre_existing.add(name)

    def _roll_back(self, cause):
        """Undo the replacements that landed, or say which could not be undone."""
        failed = []
        for name in list(self._replaced):
            target = self.directory / name
            try:
                if name in self._pre_existing:
                    # The recovery entry is dropped only after the restore
                    # lands, so a failed restore still reports its copy as
                    # retained rather than losing track of the only route back.
                    os.replace(self._recovery[name], target)
                    del self._recovery[name]
                else:
                    target.unlink(missing_ok=True)
            except OSError:
                failed.append(name)
        if failed:
            self._unrecovered = failed
            raise UnrecoveredPublicationError(
                f"replacement failed and the previous set could not be restored: {cause}",
                unrecovered=[str(self.directory / name) for name in failed],
                retained=[str(path) for path in self._recovery.values()],
            )
        self._replaced.clear()

    # ── cleanup ──────────────────────────────────────────────────────────────

    def _discard_recovery(self):
        for path in self._recovery.values():
            try:
                path.unlink()
            except OSError:
                pass
        self._recovery.clear()

    def __exit__(self, exc_type, exc, tb):
        for staged in self._staged.values():
            try:
                staged.unlink()
            except OSError:
                # Cleanup never masks the error that caused it.
                pass
        self._staged.clear()
        # Recovery copies are kept whenever they are the only route back to the
        # previous set. Everywhere else they are spent and safe to remove.
        if not self._unrecovered:
            self._discard_recovery()
        return False
