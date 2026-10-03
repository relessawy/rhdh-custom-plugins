# Adding an integration

Use `plugins/<integration>/{frontend,backend,examples}` with a concise README.
Package names follow `@rhdh-custom-plugins/plugin-<integration>[-backend]`.
Add the integration to the build dispatcher, packaging checks and CI matrix.

Each plugin must work independently, declare its dependencies, keep credentials
server-side, enforce catalog authorization, and bound provider responses. Include
unit/API tests, frontend state tests, real archive loading, configuration examples,
troubleshooting and uninstall steps. Validate the provider's current API and account
requirements; do not assume that CLI access includes API access.

Documentation describes current capabilities, requirements, configuration and usage.
Keep one functional screenshot per plugin, without captions or remarks. Keep examples
generic and credentials out of source, archives and Git history. Preserve required
third-party licenses. Do not add execution results, development narratives or history
files to product documentation. Keep automated checks in the build and CI workflow.

Inspect the intended user experience and its actual data path before implementation.
Preserve legitimate external-system prerequisites while keeping plugins independently
installable. Include any required report producers and schemas in this repository.
