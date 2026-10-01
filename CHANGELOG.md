# Releases

## Splunk Application Logs 0.1.0

- Add scoped request/error summaries and seven-day search windows.
- Support custom CA trust, optional REST tokens and a reusable HEC collector.

## Jira Work Items 0.1.0

- Add project issues, dynamic workflow transitions and group-restricted status changes.
- Record durable transition intent/outcomes and the initiating RHDH identity.

## Build tooling

- Add all-plugin builds, prerequisite checks, checkout locking and complete build instructions.
- Build and package all four integrations independently in CI.

## Snyk Security 0.2.0

- Display source, dependency and container scan policies with build/commit context.
- Read bounded Jenkins artifacts or read-only mounted reports.
- Include CLI scan, normalization, exact-image gate and report assembly scripts.
- Validate catalog bindings, build identity and scan evidence; flag stale reports.
- Configure Jenkins credentials instead of Snyk REST credentials (breaking change).

## Jenkins Stage Progress & Logs 0.1.1

- Bundle Express and its private dependencies; declare the host Backstage API peer.
- Check the release archive with the RHDH CommonJS dynamic module loader and
  initialize its real backend feature and Express router.
- Include dependency licenses and clarify standalone installation instructions.
- Pipeline stages, history and inline-log behavior are unchanged.

## Snyk Security 0.1.0

- Add an independent Snyk REST API backend and component security panel.
- Support explicit entity, organization, project and optional target mappings.
- Show project activity, severity counts, findings and Snyk project links.
- Enforce catalog access and server-side credentials; bound API responses and
  clearly indicate unavailable or partial data.

## Jenkins Stage Progress & Logs 0.1.0

Initial release with pipeline stages, status, durations, recent build selection,
inline stage logs and explicit catalog component mappings.
