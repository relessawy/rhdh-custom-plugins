# Jenkins extraction validation — 1 October 2026

| Check | Result |
|---|---|
| Backend authorization and behavior tests | 8 passed |
| Locked frontend export | Passed with Node 24.19.0, RHDH CLI 2.0.0 |
| Frontend/backend archives and SHA-256/SHA-512 integrity | Generated and inspected |
| Source-demo screenshot | Real RHDH CI view, WealthWise build 11; reference only |
| Standalone RHDH installation and real Jenkins data | **Pending a separate approved test instance** |
| Source repository protection | Before/after file hashes checked; no source edits |

Source-demo baseline: RHDH 1.10.4, Jenkins 2.568.3 and Pipeline REST API 2.41.
This is not a claim that the extracted package has passed live tests on those
versions, or on every Backstage/RHDH release. Shared Backstage APIs are supplied
by the RHDH host; dependency compatibility must be requalified when upgrading.

Differences: independent package names/build/release; explicit full entity/job
bindings replace folder/name/main assumptions; optional branch label; backend
configuration schema; no provisioning-runner or stock Jenkins plugin dependency.
The backend ID and demonstrated interface/limits remain unchanged. The original
implementation was neither replaced nor deployed from this repository.

`dependency-audit.json` records the locked frontend development-tree npm audit.
Current counts: 0 high, 44 moderate, 5 low; no critical.
The direct react-router-dom dependency was patched to 6.30.6.
Its findings include tooling and host-shared libraries, so they do not by themselves
establish runtime exploitability. This extraction is not production certification.

To finish live acceptance, use a separately authorized RHDH and Jenkins job.
Follow the guide's four steps and retain running, failed, successful, inline-log
and denied-access observations. No new namespace, workload, Secret, job or build
was created in the existing demo for this extraction.
