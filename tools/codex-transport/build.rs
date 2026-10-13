fn main() {
    println!("cargo:rerun-if-env-changed=AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_NO_VENDOR");
    println!("cargo:rerun-if-env-changed=AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_STATIC");
    if std::env::var("TARGET").as_deref() != Ok("aarch64-unknown-linux-gnu") {
        return;
    }
    assert_eq!(
        std::env::var("DEP_OPENSSL_VERSION_NUMBER").as_deref(),
        Ok("30600040"),
        "production target requires OpenSSL 3.6.4; source scripts/build-openssl.sh before cargo"
    );
    for key in [
        "AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_NO_VENDOR",
        "AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_STATIC",
    ] {
        assert_eq!(std::env::var(key).as_deref(), Ok("1"), "{key} must be 1");
    }
}
