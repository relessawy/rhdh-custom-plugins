# Application event ingestion

Configure a Splunk index (for example `applications`) and an HEC input restricted
to that index. Configure the sourcetype to extract JSON fields. Keep the HEC endpoint
private or authenticated and store its token in a Secret separate from RHDH's
optional management API token. Set index retention to cover the required query period.

Each completed HTTP request emits one NDJSON line, with a unique request ID:

```json
{"event_type":"http_request_completed","service":"payments-api","environment":"production","request_id":"unique-request-id","status":200,"time":1790852400}
```

`time` is optional Unix epoch seconds. Without it, HEC uses ingestion time. The
other five fields are required. Do not record authorization headers, cookies,
request/response bodies or personal data. `service` and `environment` must match
RHDH's administrator binding exactly. Splunk populates `_time` from HEC time.

A standard collector can send the event in an HEC envelope:

```json
{"index":"applications","sourcetype":"application:request","event":{"event_type":"http_request_completed","service":"payments-api","environment":"production","request_id":"unique-request-id","status":500}}
```

Alternatively, run the included Python 3 collector with a shared application log
volume and writable checkpoint path. It forwards only the documented fields:

```sh
export HEC_URL=https://splunk.example.com:8088/services/collector/event
export SPLUNK_INDEX=applications
export SPLUNK_SOURCETYPE=application:request
export EVENT_FILE=/events/requests.ndjson
export STATE_FILE=/events/collector-state.json
export HEC_TOKEN_FILE=/splunk-access/token
export HEC_CA_FILE=/splunk-access/ca.crt
# Optional when routing through an internal hostname:
export HEC_SERVER_NAME=splunk.example.com
python3 plugins/splunk-logs/ingestion/forward.py
```

Mount token/CA read-only. Do not put the token itself in a command or commit it.
Omit `HEC_CA_FILE` for system CA trust. Persist the checkpoint with the log volume.
The collector retries failed delivery, records progress after HEC accepts an event,
and does not log event bodies or tokens. A malformed line stops progress until
corrected; monitor the generic retry message. Single active collector per log file.
The application instrumentation is language-specific; write these fields in its
request-completion handler or adapt its existing structured logging.
