# Make a visible change

1. Open **Dev Spaces** from the application's catalog links. The first visit creates
   your workspace from `devfile.yaml`.
2. Run `mvn -B -ntp verify` from the workspace terminal.
3. Change the savings guidance in `ww-frontend/src/main/java/com/acme/wealthwise/SavingsGuidance.java`,
   update its tests and document the behavior in `docs/savings-api.md`.
4. Commit and push to `main`. Jenkins detects the change within two minutes.
5. Follow **CI** in RHDH. The pipeline tests all services and publishes their images
   to Quay, then commits the image digests to the deployment values.
6. Follow **CD** until Argo CD has synchronized and the workloads are healthy.
7. Open WealthWise and its Swagger UI to validate the changed response. Refresh
   **Docs** to show the documentation update.

Deployment-only commits use `[skip ci]`. Jenkins may record a skipped run, but
it does not test, rebuild or republish images for that commit.
