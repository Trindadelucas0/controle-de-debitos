#!/usr/bin/env python3
"""Probe filename/codigo and duplicate dest naming. Temporary."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extrair_debitos import codigo_from_filename, strip_inbox_upload_prefix, INBOX_UPLOAD_PREFIX_RE
from ingest_upload import force_filename

print("regex", INBOX_UPLOAD_PREFIX_RE.pattern)
for name in [
    "0_09-ECAC.pdf",
    "09-ECAC.pdf",
    "1787583980649_0_09-ECAC.pdf",
    "0_45-ECAC.pdf",
    "0_0_138-ECAC.pdf",
]:
    print(
        name,
        "strip=",
        strip_inbox_upload_prefix(Path(name).stem),
        "cod=",
        codigo_from_filename(name),
        "forced=",
        force_filename(codigo_from_filename(name), "ECAC", name),
    )
