# Security report format, schemaVersion 1

`assemble.py` writes `report.json`. Jenkins archives it even when a gate fails.
The backend accepts these fields and drops unrecognized fields from its response:

| Field | Required meaning |
|---|---|
| `schemaVersion` | Integer `1` |
| `entityRef` | Full catalog component reference, matching the backend binding |
| `commit` | 40-character Git SHA |
| `buildNumber` | Positive Jenkins build number, serialized as string or number |
| `observedAt` | ISO timestamp when the combined report was assembled |
| `scans` | Exactly one entry each for `code`, `dependencies`, `container` |

Each scan contains `kind`, `status`, `counts` by severity, and `findings`.
Completed scans also contain `schemaVersion`, matching `entityRef` and `commit`,
`threshold`, and CLI `exitCode`. A passing container scan requires `archiveSha256`.
`status` is `PASSED`, `BLOCKED`, `ERROR`, or `NOT_RUN`; a scan missing from disk is
`NOT_RUN`. Counts include all normalized findings; only the first 200 findings
per scan are included, with `truncated` set when necessary.

Findings contain `id`, `severity`, `title`, `file`, optional `line`, `package`,
`version`, and `fixedIn`. Severity is critical/high/medium/low/info. Unknown
scanner output fails closed. Source SARIF error/warning/note levels map to
high/medium/low. Duplicate dependency paths are collapsed by affected location.

The displayed scan-policy outcome is derived from the three recorded scan statuses.
It is not proof that an image was published or deployed. `gate.py` enforces all
three passes and re-hashes the exact archive immediately before publication.
Keep reports read-only in RHDH; only trusted pipeline writers should publish them.
A mounted report is a recorded snapshot; it cannot independently establish the
latest Jenkins build. Jenkins mode checks build number and commit against build
metadata, and reads the artifact through that resolved numeric build URL.
