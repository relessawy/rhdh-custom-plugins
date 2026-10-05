# Contributing

Add integrations under `plugins/<integration>/{frontend,backend,examples}` with
installation instructions and a functional screenshot. Use package names
`@rhdh-custom-plugins/plugin-<integration>[-backend]` and register the integration
in the build dispatcher and CI matrix.

Include appropriate automated tests, lockfiles and generic configuration examples.
Keep credentials server-side, enforce catalog access and preserve dependency licenses.
Document current behavior and installation requirements; keep generated reports
and development history out of product documentation.

For changes to the ServiceNow services or Vault collector, run their Python tests:

```sh
python -m unittest discover -s plugins/servicenow-infrastructure/services/test
python -m unittest discover -s plugins/vault-health/collector/test
```

ServiceNow tests use the dependencies in `services/requirements.txt` and
`services/runtime/requirements.txt` under that plugin.
