use crate::wire::{TransportError, Validated};
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

pub struct PolicyPool {
    clients: Vec<Client>,
    next: AtomicUsize,
}
impl PolicyPool {
    pub fn client(&self) -> Client {
        self.clients[self.next.fetch_add(1, Ordering::Relaxed) % self.clients.len()].clone()
    }
}
struct Entry {
    pool: Arc<PolicyPool>,
    last_use: Instant,
    idle: Duration,
    group: [u8; 32],
    reserved_idle: usize,
}
#[derive(Default)]
pub struct Pools {
    entries: Mutex<HashMap<[u8; 32], Entry>>,
}
impl Pools {
    pub fn acquire(&self, request: &Validated) -> Result<Arc<PolicyPool>, TransportError> {
        let m = &request.meta;
        // No identity headers, token, account or request path in pool identity.
        let bytes = serde_json::to_vec(&(
            &m.purpose,
            request.url.origin().ascii_serialization(),
            &m.proxy_url,
            &m.profile,
            &m.http_protocol,
            m.shards,
            m.idle_timeout_ms,
            m.max_idle_connections,
            m.max_idle_per_host,
            m.connect_timeout_ms,
            m.header_timeout_ms,
            m.total_timeout_ms,
            &m.ca_pem_b64,
        ))
        .map_err(|_| TransportError::local("internal"))?;
        let key: [u8; 32] = Sha256::digest(bytes).into();
        let group_bytes = serde_json::to_vec(&(
            &m.purpose,
            &m.proxy_url,
            &m.profile,
            &m.http_protocol,
            m.shards,
            m.idle_timeout_ms,
            m.max_idle_connections,
            m.max_idle_per_host,
            m.connect_timeout_ms,
            m.header_timeout_ms,
            m.total_timeout_ms,
            &m.ca_pem_b64,
        ))
        .map_err(|_| TransportError::local("internal"))?;
        let group: [u8; 32] = Sha256::digest(group_bytes).into();
        let idle_budget = m.max_idle_connections.min(m.max_idle_per_host);
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| TransportError::local("internal"))?;
        entries.retain(|_, entry| {
            Arc::strong_count(&entry.pool) > 1 || entry.last_use.elapsed() < entry.idle
        });
        if let Some(entry) = entries.get_mut(&key) {
            entry.last_use = Instant::now();
            return Ok(entry.pool.clone());
        }
        if entries.len() >= 128 {
            let oldest = entries
                .iter()
                .filter(|(_, e)| Arc::strong_count(&e.pool) == 1)
                .min_by_key(|(_, e)| e.last_use)
                .map(|(k, _)| *k);
            if let Some(oldest) = oldest {
                entries.remove(&oldest);
            } else {
                return Err(TransportError::local("capacity"));
            }
        }
        // Reserve the maximum idle capacity for this origin, including all shards.
        // This conservative accounting does not depend on undocumented pool internals.
        // Only idle policy entries can be evicted; active requests retain their clients.
        loop {
            let reserved: usize = entries
                .values()
                .filter(|e| e.group == group)
                .map(|e| e.reserved_idle)
                .sum();
            if reserved + idle_budget <= m.max_idle_connections {
                break;
            }
            let victim = entries
                .iter()
                .filter(|(_, e)| e.group == group && Arc::strong_count(&e.pool) == 1)
                .min_by_key(|(_, e)| e.last_use)
                .map(|(k, _)| *k);
            if let Some(key) = victim {
                entries.remove(&key);
            } else {
                return Err(TransportError::local("capacity"));
            }
        }
        let mut clients = Vec::with_capacity(m.shards);
        for shard in 0..m.shards {
            let mut builder = Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .retry(reqwest::retry::never())
                .no_gzip()
                .no_brotli()
                .no_deflate()
                .no_zstd()
                .connect_timeout(Duration::from_millis(m.connect_timeout_ms))
                .pool_idle_timeout(Duration::from_millis(m.idle_timeout_ms))
                .pool_max_idle_per_host(
                    idle_budget / m.shards + usize::from(shard < idle_budget % m.shards),
                );
            if m.http_protocol == "http1" {
                builder = builder.http1_only();
            }
            if let Some(ca) = &request.ca {
                let certificates = reqwest::Certificate::from_pem_bundle(ca)
                    .map_err(|_| TransportError::local("unsupported_policy"))?;
                if certificates.is_empty() {
                    return Err(TransportError::local("unsupported_policy"));
                }
                builder = builder.use_rustls_tls();
                for certificate in certificates {
                    builder = builder.add_root_certificate(certificate);
                }
            } else {
                builder = builder.use_native_tls();
            }
            if let Some(proxy) = &m.proxy_url {
                builder = builder.proxy(
                    reqwest::Proxy::all(proxy)
                        .map_err(|_| TransportError::local("unsupported_policy"))?,
                );
            }
            if m.total_timeout_ms != 0 {
                builder = builder.timeout(Duration::from_millis(m.total_timeout_ms));
            }
            clients.push(
                builder
                    .build()
                    .map_err(|_| TransportError::local("unsupported_policy"))?,
            );
        }
        let pool = Arc::new(PolicyPool {
            clients,
            next: AtomicUsize::new(0),
        });
        entries.insert(
            key,
            Entry {
                pool: pool.clone(),
                last_use: Instant::now(),
                idle: Duration::from_millis(m.idle_timeout_ms),
                group,
                reserved_idle: idle_budget,
            },
        );
        Ok(pool)
    }
    pub fn reap(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.retain(|_, e| Arc::strong_count(&e.pool) > 1 || e.last_use.elapsed() < e.idle);
        }
    }
}
