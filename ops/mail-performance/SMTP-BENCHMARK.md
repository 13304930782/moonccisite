# Controlled SMTP benchmark (2026-10-04)

Run the recipient helper on the US mail host with BaoTa Python. It creates an explicitly disposable, unforwarded local mailbox; it refuses existing state and verifies the Postfix alias resolves only to itself. Never use an external recipient. Run the benchmark on Beijing with the deployed backend dependencies and existing owner credentials read only in process. It performs 10 independent cold submissions, one pool setup, and 30 reused submissions, sequentially, with `maxRequeues: 0`. It does not call `verify()`, change application send logs, APPEND to the owner Sent folder, or retry errors. Finish with the helper's `disable` action (test messages remain for audit).

Observed using production Nodemailer 10.0.12 / implicit TLS 465:

| Sample | n | SMTP submit p50 | p95 |
|---|---:|---:|---:|
| Cold | 10 | 2989.3 ms | 5117.9 ms |
| Continuously reused | 30 | 918.2 ms | 1379.4 ms |

All 41 messages were accepted and counted in the dedicated local maildir. This is **not** a browser or HTTP `/send` benchmark, excludes DB/APPEND/UI, and does not establish real-user p95. Percentiles use nearest rank. Pool-wait timing is null because Nodemailer does not expose that interval through this harness; sequential work is not a measurement of zero queue time. `smtp_connect_ms` includes DNS/TCP/TLS, and `smtp_setup_ms` ends at authentication. Logger arguments, credentials, headers and bodies are never emitted.

Production currently creates a fresh transport for every send. TLS 465 involves TCP, TLS, greeting, EHLO, authentication, envelope, DATA and final acceptance. AUTH may contain multiple command exchanges; no exact per-command durations are inferred from total time. The installed library defaults `maxRequeues` to 5, so a pilot must explicitly set it to zero. Default pool socket timeout also applies while idle: keeping the original 30-second socket timeout cannot retain a connection across a minute of composition. Increasing it globally would also lengthen stalled active sends. Any pilot must separately bound active and idle socket lifetimes, enforce immediate invalidation and prove no message replay under failure before deployment.
