# Adding an integration

Use `plugins/<integration>/{frontend,backend,examples}` with a concise README.
Package names follow `@rhdh-custom-plugins/plugin-<integration>[-backend]`.
Add the integration to the build dispatcher, packaging checks and CI matrix.

Each plugin must work independently, declare its dependencies, keep credentials
server-side, enforce catalog authorization, and bound provider responses. Include
unit/API tests, frontend state tests, real archive loading, configuration examples,
troubleshooting and uninstall steps. Validate the provider's current API and account
requirements; do not assume that CLI access includes API access.

Documentation should describe installation and behavior directly. Include real
screenshots with neutral captions, exact tested versions, and separate build,
package-loading and live-installation results. Live acceptance requires installation of the packaged plugin and real provider data. Keep example URLs and
identifiers generic, and scan source, archives and Git history for credentials
before publication. Preserve required third-party licenses in packaged assets.

Inspect the intended user experience and its actual data path before implementation.
Preserve legitimate external-system prerequisites while keeping plugins independently
installable. Include any required report producers and schemas in this repository.
