# Validation — updated 2 October 2026

| Plugin | Build and automated checks | Live installation |
|---|---|---|
| Jenkins Stage Progress & Logs 0.1.1 | 8 backend behavior tests, TypeScript check, frontend export, backend bundle and real loader test | Pending |
| Snyk Security 0.2.0 | 12 backend authorization/report tests, 9 pipeline tests, 4 frontend state tests, TypeScript check, frontend export, backend bundle and real loader test | Passed: RHDH 1.10.4 + Jenkins reports |
| Splunk Application Logs 0.1.0 | 8 backend tests, 3 frontend tests, 2 collector tests; build/package/loader verification | Passed: RHDH 1.10.4 + Splunk Free 9.4.15 |
| Jira Work Items 0.1.0 | 9 backend tests, 3 frontend tests; build/package/loader verification | Passed: RHDH 1.10.4 + Jira Cloud |

Snyk 0.2.0 frontend and backend archives were installed in RHDH 1.10.4.
The authenticated tab displayed real Jenkins build 11, the matching commit,
three scan-policy outcomes, 14 medium source findings, image archive SHA-256,
stale-evidence notice and a build link. The report was read from the numeric build's
artifact after verifying Jenkins SCM metadata. Anonymous API access returned 401.
Mounted-report mode, denial paths and malformed evidence are covered by automated
tests; a complete live RBAC persona matrix and a new scan execution were not run.

![Snyk Security in RHDH](images/snyk-security-packaged-rhdh.png)

Snyk Security displaying build-linked scan evidence in Red Hat Developer Hub.

Live installation validation of the packaged Jenkins dynamic plugin has not yet
been completed. Jenkins behavior and package-loader tests passed.

## Jira and Splunk live checks

Jira Work Items 0.1.0 archives were installed in RHDH 1.10.4. The tab read real
Jira Cloud issues, loaded available transitions without the current status, and
moved a designated issue from Done to In Progress and back to Done. Each change
returned a persisted audit reference. Anonymous API access returned 401. Group
denial, stale versions, required fields and uncertain writes are automated checks;
a complete live multi-persona matrix has not been run.

![Jira Work Items in RHDH](images/jira-work-items-rhdh.png)

Splunk Application Logs 0.1.0 archives loaded in RHDH 1.10.4. Initial testing
verified the unavailable state during an existing Splunk startup failure. On
2 October, the unused KV Store was disabled in the demo runtime using the numeric
configuration value `1`; the operator-created replacement pod became Ready with
zero container restarts. Both PVCs were preserved and backed up beforehand.

The recovered seven-day view displayed 33 requests and 7 HTTP 5xx events, including
historical events from 29 September. A new controlled application error was
correlated by request ID through both the original and standalone plugin APIs.
The subsequent request returned HTTP 200. Splunk Free HEC ingestion/search passed.
Anonymous access was previously verified as 401; authorization-denial cases remain
covered by automated tests. No full-environment restart was performed.

![Splunk Application Logs after recovery](images/splunk-logs-recovered-rhdh.png)

The live test used additional Work items/Application logs tabs to avoid replacing
existing integrations. The reusable examples use Jira/Splunk tab names.

## Versions and packaging

- Build runtime: Node **24.19.0**; frontend RHDH CLI **2.0.0**; TypeScript **5.8.3**.
- Backend host peer: `@backstage/backend-plugin-api` **1.8.0**.
- Loader exercised: `@backstage/backend-dynamic-feature-service` **0.8.0**, using
  `CommonJSModuleLoader.bootstrap/load`, the real backend feature registrations,
  and real Express router initialization. This is a package smoke test, not a full
  RHDH server boot or cluster deployment.
- Express **4.22.1**, patched query parser qs **6.16.0**, and private dependencies are bundled by esbuild **0.25.12**.
  Build verification rejects unexpected external runtime imports. Release archives
  retain only the explicit Backstage backend API peer; no host Express is assumed.
  Backend archives include the actual private dependency list and license texts.
- Frontend shared dependencies: React **18.3.1**, Backstage core-plugin-api **1.11.0**,
  plugin-catalog-react **1.21.0**, catalog-model **1.7.7**, react-router-dom **6.30.6**.
- Target baseline: RHDH **1.10.4**. Jenkins service baseline **2.568.3**, Pipeline REST API
  **2.41**. Requalify host-shared dependency compatibility on other RHDH versions.
- Report schema **1**; pipeline scripts use Python **3** and Snyk CLI JSON/SARIF.

## Reproduce

Run each command separately from the repository root:

```sh
bash scripts/build.sh jenkins-stage-progress
bash scripts/build.sh snyk-security
bash scripts/build.sh splunk-logs
bash scripts/build.sh jira-work-items
# Or run all four sequentially:
bash scripts/build.sh all
```

Tests include denied access, mapping checks, malformed/oversized upstream responses,
truncated findings, safe errors, refresh behavior and stale-response handling. Build
output includes SHA-256 checksums and SHA-512 installation integrity values.
Follow each plugin's verification section for the remaining live checks.

## Repository checks

Gitleaks **8.30.1** reported no findings in the current source files, packaged archives or reachable
Git history. Tracked-text checks passed. These checks reduce risk; they do not certify the absence of every
possible secret or vulnerability. Dependency audit results describe development
and host-shared packages as well as runtime code; review them for the target host.

Dependency audit: all four frontend trees report 0 critical, 0 high, 35 moderate
and 5 low findings. The shared build/test tree reports 0 critical, 8 high and
23 moderate findings, including the RHDH loader's Infinispan/urllib/undici chain
and test tooling's mockttp/pac-proxy-agent/get-uri/basic-ftp chain. These packages
are not bundled into the plugin backends. The toolchain remains pinned for host
compatibility testing; upgrades require requalification. The Express query-parser
advisory was resolved by pinning bundled qs to 6.16.0. Counts reflect the registry
advisory data available on the validation date and may change.
