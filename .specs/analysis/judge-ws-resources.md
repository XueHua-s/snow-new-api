# S06 WebSocket resource pre-review

Status: design pre-review only; no score, no PASS. Sources inspected while the author is implementing S06 (2026-10-14). Final source, Linux evidence and contract amendments remain subject to the independent panel. No live credentials or large-memory stress tests were used.

## Decision

The 536870912-byte process reservation is an **application admission budget**, charging twice the configured decompressed message limit M per admitted session. It is not a bound on total assembly allocations, library retained capacity, allocator residency, kernel memory or process RSS. At M=128 MiB it admits two sessions. Preserve the legal 128 MiB message limit. The earlier sum of 15M per hop / 30M per session is not a demonstrated simultaneously-live allocation graph and must not be converted into a 10–12 GiB deployment requirement.

The README sentence “thus message assembly/queue memory is bounded” requires qualification: bounded by the library limits as well as admission, not necessarily by exactly 2M. Its “without a second full-message copy” requirement can describe the application forwarding path; the fixed fork itself copies fragments into collectors and serialized frames into an output Vec. State that distinction explicitly, rather than pretending this implementation satisfies a library-wide zero-copy promise.

## Allocation lifetime graph

Source paths are relative to `tools/codex-transport`.

| Phase | Live payloads and release boundary |
| --- | --- |
| Frame reception | `vendor/tungstenite/src/protocol/frame/mod.rs::read_frame` admits a declared length before reserve, then splits a BytesMut into a Frame. The payload and residual read buffer can share one backing allocation; counting each as a separate full allocation overstates memory. The residual buffer may keep that allocation alive after the payload is dropped. |
| Decompression | `protocol/mod.rs::read_message_frame` holds the compressed frame, any prior incomplete collector, and the bounded decompression output simultaneously. The decompressor receives `M - incomplete.len()`, so prior logical assembly plus decompressed output is at most M (plus the deliberate one-byte over-limit detection). Their capacities are separate from lengths. The compressed payload is dropped when the `unwrap_or(payload)` expression resolves to decompressed data, before collector extension. |
| Fragment assembly | `protocol/message.rs::IncompleteMessage::extend` copies the decoded fragment into a bounded collector. The decoded fragment and growing collector overlap transiently. On completion the collector is moved into the Message; there is no new application full-message clone. A nonfragmented message bypasses that collector. |
| Forward/compress | `src/ws.rs::forward` moves one Message from `read.next()` into `send().await` and does not read another message until send finishes. `protocol/mod.rs::write` compresses the owned input; input and compressor output overlap until the prepare-data-frame closure returns. The input is then dropped. This overlap must not also be counted during subsequent blocked output flush. |
| Frame serialization | `frame/mod.rs::buffer_frame` copies the outgoing Frame into `out_buffer`; `frame/frame.rs::format_into_buf` masks in the destination buffer, without a separate mask copy. Compressed frame and output buffer overlap until formatting returns. |
| Blocked flush | The serialized Vec remains while socket writes are Pending; the prior compression input and temporary compressed Frame have been released. `write_out_buffer` drains its length but retains capacity for the connection lifetime. SplitSink may hold one not-yet-started message while awaiting the other half’s lock; account for that payload, rather than an unbounded queue. |
| Termination | Dropping both split halves releases both WebSocket contexts, read/write buffers, compression contexts and session guards. Freeing Rust objects does not promise the allocator immediately returns RSS to the OS. |

Use a symbolic retained baseline `I_local + I_upstream + W_local + W_upstream` (read backing and historical write capacities), then add the actually coexisting phase temporaries. Do not sum every phase maximum. The two direction pumps share the bridge task; synchronous compression/formatting phases are polled serially there, although an opposite-direction pending payload and retained buffers can coexist. A conservative sum of direction maxima can be a documented engineering bound, but not a measured minimum deployment memory requirement.

Current configuration is read chunk 65536, frame/write length ceiling `2*M+65536`, message ceiling M, write threshold zero. These are length/admission limits, not exact allocator-capacity limits. Compression contexts, TLS records, runtime structures, handshake roots and kernel socket buffers are additional. At very small M the 256-session count cap matters for those fixed per-session overheads; the 512 MiB variable-payload budget alone does not bound that overhead.

## Required before freeze

1. Finish and document the narrow decompression patch. It now requests at most `min(4096, remaining+1)` rather than growth proportional to attacker-controlled compressed bytes. Test the actual extra output at the remaining-message boundary. Consider capped geometric reserve growth: repeated exact 4 KiB reallocations can create excessive copying at M=128 MiB. Do not turn this recommendation into an unrelated library redesign.
2. Prove a bounded outgoing compressed length/allocation path. `max_write_buffer_size` is checked after compression and cannot itself prove compressor allocation is bounded. Cite the fixed compression backend’s expansion bound or apply a narrow explicit cap with deterministic incompressible-input tests. Account separately for Vec growth/retention.
3. Freeze frame/write limits and overflow arithmetic in README/fixtures, documenting application logical limits versus library allocations. Reject overlarge frame declarations before payload reads/reservation. Preserve legitimate maximum decompressed messages, including compressed output expansion.
4. Demonstrate application backpressure with observable Pending on a blocked destination, no further completed-message reads by that direction, and successful cancellation. Test both directions and simultaneous blocked directions using small synthetic limits and barriers, not sleeps or multi-GiB pressure.
5. Prove all resource guards return after failed handshake, rejected local upgrade, peer disconnect, blocked send cancellation, protocol/limit error and server shutdown. Readmission of the complete previously exhausted reservation is stronger evidence than admitting one small session. A capacity rejection must show zero upstream attempts.
6. Use one sequential legal-max message check if needed to verify 128 MiB compatibility; avoid interpreting arithmetic-only admission tests as real max-message transport evidence. Keep large-message validation isolated and proportionate.

The reviewer read implementation and fixed-fork source directly; no production source/lock changes were made. Author and root received these findings. Final scoring waits for frozen evidence.


# Frozen S06 final resource-panel review

Date: 2026-10-14. Verdict: **PASS for S06 resource-panel scope, 4.65/5**. This supersedes the pre-review’s open resource findings only. It is not an S07 session-invalidation, billing/database, live-account, protocol-fingerprint or final deployment verdict.

| S06 rubric | Weight | Score | Independent assessment |
| --- | --- | --- | --- |
| Upstream-first handshake and bounded rejection | .25 | 4.65 | Source creates/transfers local upgrade only after verified upstream success; fixed rejection capture and deadline bound; metadata validation and both permits precede dialing. Rejection and failed handshakes drop RAII guards. Reviewed actual implementation and exact test assertions. |
| Text/binary/fragments/control/close | .30 | 4.65 | Opaque message moves preserve data, no create replay loop; fixed codec performs decompressed-fragment limits and UTF8/control validation. Hop-local automatic pong avoids duplicated control traffic. Both close directions preserve code/reason; five-second close cleanup bounds uncooperative peers. Reviewed tests and author’s final Linux evidence. |
| Bidirectional backpressure, limits, cancellation | .25 | 4.70 | Independently reran both directional blocked-consumer tests, full application-budget readmission and shared 256-exchange enforcement/readmission. Application pump polls no next message until current send flushes. Fork growth patch removes attacker-input-proportional decompression allocation; independently reran its allocation regression. |
| Fixed forks/features and WS proxies/certificates | .20 | 4.60 | Exact fork revisions retained with explicit audited patches, licenses and locked dependencies. Actual WSS uses its own verified rustls and explicit proxy path; reviewed actual connect source and recorded all-four-proxy/TLS negative tests. This resource reviewer did not independently repeat that full network matrix. |

Weighted score: `.25*4.65 + .30*4.65 + .25*4.70 + .20*4.60 = 4.6525`, rounded 4.65. Every rubric is above 4.5. No unresolved S06 resource hard-gate finding.

## Closed resource findings

- README and fixture `memory_accounting` now distinguish the application 2M admission reservation from library memory and RSS. The application makes no full-message clone; library fragment assembly and frame serialization copies are disclosed. The retained-base/phase graph above remains applicable. No speculative 10–12 GiB deployment requirement was introduced.
- Decompression uses capped geometric capacity requests up to remaining-message-limit+1; the old compressed-input-proportional reserve is gone. The codec derives remaining from the incomplete message length before invoking decompression. The one extra produced byte deterministically rejects the message. Actual Vec capacity in the pinned environment is observed in a test-only seam.
- Compression likewise caps its requested output capacity at `2*input+65536`, preventing the later write-buffer check from being the only allocation defense. Outgoing serialized frame limit and incoming frame limit remain finite. Capacity requests are not promises about allocator or kernel resident bytes.
- RAII owns the shared active permit and payload reservation across handshake and upgraded lifetime. The session stays in the connection task; shutdown aborts and joins all connection tasks. A bounded duplicated UDS descriptor observes caller read closure without consuming messages, so cancellation can interrupt blocked peer writes. No detached lifetime retains an admitted session.
- The upper configured M is still 134217728. The full-budget regression opens two sessions at that M, rejects a third before any extra upstream attempt, cancels both and successfully readmits both. This tests maximum admission configuration and full return, not transport of a 128 MiB payload. Parametric 63/64/65 complete/fragmented/compressed cases cover the actual message boundary behavior.

## Independently executed checks

Container `codex-s03-build`, `/tmp/codex-transport`, Linux ARM64 GNU, `ulimit -n 8192` for fixtures:

1. `cargo test --locked --test transport backpressure -- --nocapture`: **2 passed**, 0 failed, 48 filtered, 0.05s. Both upstream-to-local and local-to-upstream tests observe a real send Future Pending while the destination is held and prove cancellation releases the session. These are two separate direction cases, not a claimed simultaneous-duplex stress test.
2. `cargo test --locked --test transport ws_payload_reservation -- --nocapture`: **1 passed**, 0 failed, 49 filtered, 0.08s. Exact zero-attempt rejection plus complete 512 MiB logical reservation readmission.
3. `cargo test --locked --test transport active_exchange_cap -- --nocapture`: **1 passed**, 0 failed, 49 filtered, 26.64s. Holds 256 real HTTP responses, proves both HTTP and WS reject before another dial, cancels all, readmits all 256.
4. `cargo test --locked --manifest-path vendor/tungstenite/Cargo.toml --features deflate codex_decompression_allocation_is_bounded_before_limit_rejection -- --nocapture`: **1 unit test passed**, 0 failed, 75 filtered. Other integration executables matched zero tests and are not counted as evidence. Existing upstream unused-parentheses warning does not affect the result.

Author evidence, separately attributed: final mandatory Linux script ran 50 integration tests and two required vendor single-test regressions, all PASS; release build PASS. The independent focused rerun above supplements that evidence rather than falsely claiming this reviewer ran the entire matrix.

All 13 named frozen source/contract/provenance hashes in `codex-transport-rust-ws.md` were independently recomputed in the implementation tree and matched, including `src/ws.rs` a3bc834da3db898de03ca933f4d50747caab1105e9a560f6144965b7087b7db6, `tests/transport.rs` 11f287efe286936891737fcb4e026c50e2c8c7c52fc4308b74f362b67299c2ef, README 6bfe047bba6b855c7f80af3beddfe11642ed287fd9648dbbbbdb5a81001bb0ec, fixtures 8d2c864397b674d885dd0e3fe6baec1ea6c7eeda9c215d2ab5ac53b3694947e1 and tungstenite patch 497bb68fac7654ac3d63ac875ef7a2cbb7ff0c98b387beb8d8c457c268a83d27.

No credential, production source, dependency lock or test file was modified by this reviewer. Isolated deployment measurements and maximum-payload operational sizing remain S10 evidence, not an inferred RSS guarantee from S06.
