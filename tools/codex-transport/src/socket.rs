use std::{
    fs, io,
    os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt},
    path::{Path, PathBuf},
};
use tokio::net::UnixListener;

// The parent must be provisioned by deployment; do not silently chmod a shared directory.
pub struct SocketGuard {
    path: PathBuf,
    device: u64,
    inode: u64,
}
impl SocketGuard {
    pub async fn bind(path: &Path, uid: u32, gid: u32) -> io::Result<(UnixListener, Self)> {
        if !path.is_absolute() {
            return Err(io::Error::other("socket path must be absolute"));
        }
        let parent = path
            .parent()
            .ok_or_else(|| io::Error::other("socket parent missing"))?;
        // Reject symlink components, not only a symlink in the final pathname.
        let mut component_path = PathBuf::new();
        for component in parent.components() {
            component_path.push(component);
            if fs::symlink_metadata(&component_path)?
                .file_type()
                .is_symlink()
            {
                return Err(io::Error::other("symlink socket directory"));
            }
        }
        let directory = fs::symlink_metadata(parent)?;
        let mode = directory.mode() & 0o7777;
        if !directory.is_dir()
            || directory.uid() != uid
            || directory.gid() != gid
            || !matches!(mode, 0o700 | 0o750)
        {
            return Err(io::Error::other("unsafe socket directory"));
        }
        match fs::symlink_metadata(path) {
            Ok(meta) => {
                if !meta.file_type().is_socket()
                    || meta.uid() != uid
                    || meta.gid() != gid
                    || meta.mode() & 0o7777 != if mode == 0o700 { 0o600 } else { 0o660 }
                {
                    return Err(io::Error::other("unsafe socket endpoint"));
                }
                match tokio::net::UnixStream::connect(path).await {
                    Err(e) if e.kind() == io::ErrorKind::ConnectionRefused => {
                        let current = fs::symlink_metadata(path)?;
                        if current.dev() != meta.dev() || current.ino() != meta.ino() {
                            return Err(io::Error::other("socket changed"));
                        }
                        fs::remove_file(path)?;
                    }
                    _ => return Err(io::Error::other("socket occupied")),
                }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        let listener = UnixListener::bind(path)?;
        let meta = fs::symlink_metadata(path)?;
        let guard = Self {
            path: path.to_owned(),
            device: meta.dev(),
            inode: meta.ino(),
        };
        fs::set_permissions(
            path,
            fs::Permissions::from_mode(if mode == 0o700 { 0o600 } else { 0o660 }),
        )?;
        if meta.uid() != uid || meta.gid() != gid {
            return Err(io::Error::other("socket identity mismatch"));
        }
        Ok((listener, guard))
    }
}
impl Drop for SocketGuard {
    fn drop(&mut self) {
        if let Ok(meta) = fs::symlink_metadata(&self.path)
            && meta.file_type().is_socket()
            && meta.dev() == self.device
            && meta.ino() == self.inode
        {
            let _ = fs::remove_file(&self.path);
        }
    }
}
