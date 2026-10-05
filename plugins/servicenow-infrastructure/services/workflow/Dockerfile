# Adapted from the Apache-2.0 RHDH Orchestrator reference build pattern.
FROM registry.redhat.io/openshift-serverless-1/logic-swf-builder-rhel9:1.38.0-3 AS builder
ENV QUARKUS_EXTENSIONS="io.quarkiverse.openapi.generator:quarkus-openapi-generator:2.11.0-lts,org.kie:kie-addons-quarkus-monitoring-sonataflow,org.kie:kogito-addons-quarkus-jobs-knative-eventing,org.kie:kie-addons-quarkus-persistence-jdbc,io.quarkus:quarkus-jdbc-postgresql:3.20.3.redhat-00003,io.quarkus:quarkus-agroal:3.20.3.redhat-00003"
COPY --chown=1001 . ./resources/
RUN /home/kogito/launch/build-app.sh ./resources
FROM registry.access.redhat.com/ubi9/openjdk-17:1.21-2
COPY --from=builder --chown=185 /home/kogito/serverless-workflow-project/target/quarkus-app/ /deployments/
EXPOSE 8080
USER 185
