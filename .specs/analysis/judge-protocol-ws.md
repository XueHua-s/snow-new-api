# Independent S09 WS/protocol review

Verdict: **synthetic S09a/b PASS, 4.650/5**. Full S09/S09c and AC15 remain **HOLD** pending gated live model discovery, HTTP/SSE, multi-round WS and exact accounting. This is an independent source/evidence review and local regression execution; I did not rerun the expensive Docker matrix or send account traffic.

Reviewed source plan §5/§7, task S09/AC10/11 and panel rubric, `codex-transport-protocol.md`, `compare-baseline.py`, `sample.py`, nine tests and final `observed-calibrated.json`. Scope adaptation separates the requested synthetic gate from the original live-inclusive final criterion; it does not waive that final criterion.

| Synthetic criterion | Weight | Score | Basis |
| --- | --- | --- | --- |
| Fixed version/platform/conditions | .25 | 4.65 | Official SHA071cbe8d… and production sidecar SHA5f146857…; runtime/profile checks, offline fixed ARM64 container, same origin and captured requests. Official musl versus GNU is explicitly disclosed; effective OpenSSL3.6.4 is calibrated, no identical-build claim. |
| First/restored TLS | .25 | 4.60 | Ordered native fields match; rustls extension values match with original order retained. Actual CA-rustls false→true restoration on both; native and WS false→false documented with connector lifetime/source cause. No invented restored native/WS success. |
| Actual Responses H2/WS | .30 | 4.70 | Actual two-generation POST/H2 evidence, exact first HEADERS hash, settings/window/pseudo-headers; six WS cases preserve original ordered message bytes and full extension offers, including reconnect grouping. |
| Difference completeness | .20 | 4.65 | Pool/HPACK/stream/DATA/GOAWAY differences, three unsupported official routes, explicit sidecar extension templates, libc difference and compression/live limits all retained. |

Weighted result: .25×4.65 + .25×4.60 + .30×4.70 + .20×4.65 = **4.650**. No remaining hard gap within this synthetic observation scope.

## Independently observed evidence

Executed `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **9/9 PASS, exit0**. These include equal-length/count payload mutation and same-name extension-parameter removal, and propagation through the complete summarize entrypoint, not only a helper. TLS truncation/trailing bytes, ephemeral lengths, random exclusions, original extension order and missing matrix are checked.

Independently parsed final snapshot SHA256 `8e1dfa0eafce793327b69d582a175ebaf4a43c88031214952e29d068e2cb619e`: **15 cases**, no missing/errors. Both current harness file hashes match snapshot provenance. Independently compared retained resumed CA-rustls fields: all non-order values equal; extension values equal. H2 SETTINGS are `[(2,0),(4,2097152),(5,16384),(6,16384)]`, WINDOW_UPDATE5177345; first HEADERS1213bytes with matching SHA256 `c947db20f265b0725ad5488e8f7baa0a7499b09d61c0ed6e2eee6ffdcafeb862`. Actual DATA boundaries differ, as reported.

All six WS cases have identical expected/actual ordered message evidence (length, SHA256, type, generate presence/value) and full offers `permessage-deflate; client_max_window_bits`. Direct/four proxies have `[3]` messages per connection; clean reconnect has `[2,1]`, two connections on both. Evidence requires the initial response.create generate=false and exactly two generating creates. Fixture captures the received payload bytes before parsing, stores temporary base64 and replays those bytes without JSON reserialization. Local client masking is applied; fixture removes the frame mask before hashing application bytes. Random masking bytes are therefore not misrepresented as preserved message content.

HTTPS-proxy official WS fallback is not compared as WS: sidecar's expected three messages/offers explicitly come from direct official WS. HTTP SOCKS5/SOCKS5h use successful direct HTTP templates and are marked unsupported official routes. The fixture checks the actual official failure signatures; sidecar proxy extension completion is separately required. The two killed waiting CLI processes are not successful official calls.

## Limits and follow-through

The WS fixture does not negotiate compression, and its simple frame reader is not a fragmentation/control-frame conformance suite. This gate establishes exact observed uncompressed application messages and handshake extension offers; S06 remains responsible for negotiated deflate, fragmentation, control, limits and backpressure. It does not establish identical WS frame segmentation, masking randomness distributions, or byte-identical full headers.

`complete:true` is observation completeness, not universal protocol equivalence: TLS/H2 differences are retained for independent interpretation rather than every non-equality automatically failing the runner. This review inspected them. Neither native nor WS resumed traffic exists under the tested connector lifetimes; that explicit boundary is acceptable evidence, not a restored-handshake PASS. All live accounting and final integrated acceptance remain required.


## Final S09 live evidence review — full gate PASS

The earlier full-S09 HOLD is superseded by **full S09 PASS, 4.670/5**, based on the final live evidence plus the accepted synthetic review above. I inspected only the allowlisted `/tmp/codex-live-final-result.json` (SHA256 `58b570f793b9cdeac0203df9f145503fc6472044cba28cc4e5bb8cd523e4edbe`), runner source and tests; I did not access credentials or deployed resources and did not repeat billable calls. Root reports the executed final runner exited0; evidence interpretation is independent, execution was root-owned.

The runner discovers actual models through `/api/channel/fetch_models/9001` before selecting a returned known candidate, then makes one HTTP/SSE generation and two sequential WS creates on one connection. The second create uses the first response ID via previous_response_id. It rejects failed/incomplete responses, validates completed usage totals, and waits for exact accounting after each generation. Inspection confirms no synthetic response or Usage injection substitutes for live upstream data: only the local pricing fixture is seeded. The synthetic framing helper is reused solely for client frames.

Observed final discovery count10, selected `gpt-6-luna`; HTTP200, WS101 with two generations. Usage is 23+5=28, 23+5=28 and 37+5=42, totaling98. User balance999902/used98/request_count3, token balance999902/used98, channel used98; exactly three linked consume logs charge28/28/42 with matching prompt/completion quantities, channel/token9001 and distinct request IDs (WS -0/-1). Three response ID hashes are distinct. These are the new final run's values, not historical POC acceptance. The isolated `tier("live_verification", p * 2 + c * 2)` rate is explicitly validation pricing, not upstream retail cost.

Final artifact IDs are app `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204` and sidecar `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`. Source checks expected IDs and uses those immutable IDs for launches. The fixture origin correction to `https://chatgpt.com` is appropriate: discovery/inference append their protocol paths; the prior full-path base caused404 and is retained as failed history. Its seeded-row/composed-endpoint regression is included.

Independently executed again: `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **22/22 PASS, exit0**. Includes origin composition, strict accounting mismatch, immutable images, bounded diagnostic redaction, input protections, SIGTERM cleanup, cleanup inventory failures/leftovers, plus the nine protocol regressions. Successful return requires the finally cleanup to complete; inventory failure raises rather than generating successful output. No credential or resource access was needed for this review.

| Full S09 criterion | Weight | Score | Basis |
| --- | --- | --- | --- |
| Same version/platform/target/request/proxy/CA reproducibility | .25 | 4.65 | Frozen synthetic identities and explicit GNU/musl difference, plus immutable final live images and official origin/system trust. |
| Initial/restored native and rustls | .25 | 4.60 | Prior reviewed field-level results remain valid; native/WS no-resumption boundary remains explicitly disclosed. |
| Actual Responses H2/OAuth WS comparison | .30 | 4.70 | Accepted exact synthetic messages/offers/HPACK and independent live same-connection two-create evidence. |
| Real HTTP/multi-round WS and differences | .20 | 4.75 | Discovered model, three completed live generations, exact per-generation/final accounting and full difference report. |

Weighted full score: .25×4.65 + .25×4.60 + .30×4.70 + .20×4.75 = **4.670**. No remaining S09 hard gap found. This verdict does not replace S08's failure/concurrency/three-database gates, S10 operations, other independent reviewers or the final repository audit; retained synthetic equivalence limitations still apply.
