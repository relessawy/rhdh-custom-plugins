# Jira Work Items

Shows Jira project issues, status counts, assignees, priorities and links in RHDH. Authorized groups can move work to
an available Jira workflow status without leaving the tab. Destinations are read
from Jira, exclude the current status, and can include custom states such as Revoked.

## Prerequisites

- RHDH with authenticated users, catalog permissions and the backend database
  service configured with persistent PostgreSQL and dynamic frontend/backend plugin support.
- Jira Cloud site, cloud UUID, a project and an integration user's scoped API token.
  Use that user's email/token with `https://api.atlassian.com/ex/jira/<cloudId>`.
  Jira Data Center, OAuth delegation and per-user Jira tokens are not implemented.
- The Jira account needs Browse Projects plus access to the relevant issues.
  To allow updates it also needs Transition Issues and applicable workflow rights.
  Configure read/write token scopes for the used REST endpoints; common classic
  scopes are `read:jira-work` and `write:jira-work`. For granular tokens use the
  endpoint documentation below; token scopes do not grant missing Jira permissions.
- Backend HTTPS access to Atlassian APIs and browser access to issue links.
- Trusted RHDH group ownership references identifying users allowed to transition.
  Empty `transitionGroups` makes the plugin read-only; no administrator role is needed.

## Configuration

Merge [app-config.yaml](examples/app-config.yaml). Populate the placeholder
[Secret](examples/secret.yaml) privately and reference it from the RHDH deployment
using [deployment fragments](examples/deployment.yaml). Set the site URL and cloud
UUID for the same tenant. Keep email and API token backend-only.

### Entity mapping

Add each full component entity reference to `jiraWorkItems.entities` (frontend
visibility) and `jiraWorkItems.bindings` (backend project mapping). See
[catalog-info.yaml](examples/catalog-info.yaml). No annotation is required. Backend mappings and catalog access control reads
and writes; `entities` controls tab visibility only.

Set `transitionGroups` to canonical ownership references, such as
`group:default/developers`. Each eligible user also needs catalog access. Jira
attributes changes to the shared account; the RHDH audit table records the initiating
user, entity, issue, transition, previous/resulting status, outcome and timestamp.
The backend database service manages storage for plugin ID `jira-work-items`; the
plugin creates `jira_transition_audit`. Permit its normal table initialization.

## Installation

```sh
bash scripts/build.sh jira-work-items
```

Follow the [common build/install instructions](../../docs/BUILDING.md) to host the
two archives and apply generated `dynamic-plugins.yaml`. Use
[deployment fragments](examples/deployment.yaml) for Secret and configuration references.

## Usage

Open the component's **Jira** tab to browse issues, assignees, priorities and statuses.
Counts cover the 50 most recently updated issues, including Done items. The tab
refreshes every 30 seconds and supports manual refresh. Authorized users choose
**Change status**, select an available destination and apply it. The current status
is excluded. The resulting status and audit reference appear after the action.

## Screenshot

![Jira Work Items](../../docs/images/jira-work-items.png)

## Troubleshooting

- Missing data: check site/cloud ID, token expiry/scopes, project mapping and Jira
  account permissions. No arbitrary browser-supplied JQL is accepted.
- Missing action: check group ownership references and Jira workflow permissions.
  Only available transitions without mandatory extra fields are offered. Open Jira
  for transitions requiring additional input. No hard-coded status list is used.

## Limitations

- Conflict: refresh and choose again. The backend rereads status/updated time and
  available transitions immediately before writing. Jira does not provide an atomic
  conditional transition here, so a remote concurrent update remains possible.
- Audit intent is persisted before sending a transition. If the response is uncertain,
  refresh Jira before retrying; the plugin never automatically retries mutations.
- The in-flight guard is per backend process, not a distributed lock. Use one backend
  replica for process-wide serialization or add external serialization for stronger guarantees.
- Shared credentials mean Jira authorization is the integration account's access;
  RHDH catalog and group restrictions are additional controls, not user impersonation.
- Responses are capped at 1 MB, transitions at 100 and issues at 50. Further work
  items remain available through Jira. This is a project-level view, so components
  mapped to the same project see the same visible issues.
- Uninstall by removing frontend/backend entries and configuration and rolling out
  RHDH. Retain the database audit records according to your retention policy.

APIs: [issues and transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/),
[issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).
