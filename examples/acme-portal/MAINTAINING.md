# Build and publish the ACME chart

These steps are for maintaining the chart. To install an existing package, follow
the [installation guide](README.md).

The chart source is in [charts/acme-portal-experience](../../charts/acme-portal-experience).
Build its two frontend archives using the supported
[build.sh workflow](../../docs/BUILDING.md):

```sh
bash scripts/build.sh portal-appearance
bash scripts/build.sh application-health
```

With Helm 3 and PyYAML 6.0.2 available, run the packager from the repository root:

```sh
python3 scripts/package-acme-chart.py
```

The packager reads the chart and plugin versions from their manifests, verifies
archive integrity, embeds the packages, lints and packages the chart, and writes
checksums under `artifacts/acme-portal-experience/`.

Before publishing a new version, update the chart version in
`charts/acme-portal-experience/Chart.yaml`. Package it into the Helm distribution
folder and regenerate the index:

```sh
python3 scripts/package-acme-chart.py --output helm
helm repo index helm
```

Keep relative URLs in the index so it works on both a review branch and `main`.
Submit the package, `SHA256SUMS` and index together for production PR review.
Never replace a published version with different bytes. CI validates builds but
does not merge or publish releases.

After the production PR is approved and merged, the stable index can be published
from `main/helm`. Until the package is present there, keep the installation guide
pointing to its review branch.
