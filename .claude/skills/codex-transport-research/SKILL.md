---
name: codex-transport-research
description: Maintain version-specific evidence for the new-api Codex Rust outbound transport
---

# Codex transport evidence maintenance

- Start from `CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md` and `.specs/analysis/codex-transport-research.md`. Recheck current source rather than inheriting old report claims.
- Preserve first implementation baseline Codex CLI 0.162.1 / Linux ARM64. Record official binary hash, Cargo.lock, fork revisions, target and effective features; never silently follow latest.
- Verify HTTP default/native and explicit-CA rustls separately from WS rustls. Same crate versions alone do not prove ClientHello/HTTP2/WS equivalence.
- Use isolated synthetic credentials and locally generated temporary CA fixtures. Never promote real traffic, private keys, auth databases, build output or an entire ignored POC directory.
- Label source inspection, historical evidence and newly executed tests separately. Do not claim tests ran merely because their scripts or reports exist.
- Keep Go ownership of credentials, requests, usage and billing; transport only carries bytes/events. Read billing rules before examining settlement behavior.
- For upgrades, compare initial/resumed TLS, H2 frames, WS handshake/control/close, proxies and failure-stage replay safety. List uncovered conditions explicitly.
