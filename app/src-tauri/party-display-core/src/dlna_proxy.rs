/// Minimal HTTP proxy that allows the WebView2 webview to stream DLNA media.
///
/// The custom-scheme protocol approach (`register_asynchronous_uri_scheme_protocol`)
/// does not intercept requests in Tauri dev mode because WebView2 only registers
/// custom schemes during environment creation, before the dev-server URL is loaded.
///
/// Instead we run a tiny HTTP/1.1 proxy on 127.0.0.1:PROXY_PORT.
/// The frontend converts DLNA URLs:
///   http://192.168.x.x:8200/MediaItems/xyz.mp3
///   → http://127.0.0.1:PROXY_PORT/192.168.x.x:8200/MediaItems/xyz.mp3
///
/// The proxy strips its own host/port from the path and fetches the original
/// URL via reqwest, forwarding Range / Content-Range / Accept-Ranges headers
/// so seeking works.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use futures::StreamExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| reqwest::Client::new())
}

/// Port the proxy server listens on.  Must match the CSP and the TS constant.
pub const PORT: u16 = 29341;

static STARTED: AtomicBool = AtomicBool::new(false);

/// Spawn this in the Tauri async runtime.  Idempotent: calling it twice is safe.
pub async fn start() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let listener = match TcpListener::bind(("127.0.0.1", PORT)).await {
        Ok(l)  => l,
        Err(e) => {
            eprintln!("[dlna_proxy] bind 127.0.0.1:{PORT} failed: {e}");
            return;
        }
    };
    eprintln!("[dlna_proxy] listening on 127.0.0.1:{PORT}");
    loop {
        match listener.accept().await {
            Ok((stream, _)) => { tokio::spawn(handle(stream)); }
            Err(e)          => eprintln!("[dlna_proxy] accept error: {e}"),
        }
    }
}

/// Returns true only if the URL's host resolves to an RFC-1918 private address.
/// Rejects loopback (127.x), link-local (169.254.x), and all public IPs.
fn is_private_lan_url(url: &str) -> bool {
    let host = match url.parse::<reqwest::Url>() {
        Ok(u) => u.host_str().unwrap_or("").to_owned(),
        Err(_) => return false,
    };
    // Strip port if present (host may be "192.168.1.1:8200")
    let ip_str = host.split(':').next().unwrap_or("");
    let ip: std::net::Ipv4Addr = match ip_str.parse() {
        Ok(ip) => ip,
        Err(_) => return false,  // hostnames not accepted — DLNA URLs are always bare IPs
    };
    let [a, b, c, _] = ip.octets();
    matches!(
        (a, b, c),
        (10, _, _)                          // 10.0.0.0/8
        | (172, 16..=31, _)                 // 172.16.0.0/12
        | (192, 168, _)                     // 192.168.0.0/16
    )
}

async fn handle(stream: tokio::net::TcpStream) {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);

    // Read request line
    let mut req_line = String::new();
    if reader.read_line(&mut req_line).await.is_err() { return; }

    // Read headers — capture Range if present
    let mut range_hdr: Option<String> = None;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).await.is_err() { break; }
        let trimmed = header.trim_end();
        if trimmed.is_empty() { break; }
        if trimmed.to_lowercase().starts_with("range:") {
            range_hdr = Some(trimmed["range:".len()..].trim().to_owned());
        }
    }

    // req_line: "GET /192.168.x.x:8200/MediaItems/xyz.mp3 HTTP/1.1"
    let path = match req_line.split_whitespace().nth(1) {
        Some(p) => p.to_owned(),
        None    => return,
    };

    // path starts with '/', so "http:/" + path == "http://192.168.x.x:8200/..."
    let target_url = format!("http:/{path}");

    // Restrict forwarding to RFC-1918 LAN addresses only.
    // Blocks cloud-metadata endpoints (169.254.169.254) and loopback self-requests.
    if !is_private_lan_url(&target_url) {
        let msg = "403 target host is not a private LAN address";
        let _ = writer.write_all(
            format!("HTTP/1.1 403 Forbidden\r\nContent-Length: {}\r\n\r\n{}", msg.len(), msg)
                .as_bytes(),
        ).await;
        return;
    }

    let client = get_client();
    let mut req = client.get(&target_url);
    if let Some(r) = range_hdr {
        req = req.header("Range", r);
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ct = resp.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_owned();
            let cl = resp.headers().get("content-length")
                .and_then(|v| v.to_str().ok()).map(str::to_owned);
            let cr = resp.headers().get("content-range")
                .and_then(|v| v.to_str().ok()).map(str::to_owned);
            let ar = resp.headers().get("accept-ranges")
                .and_then(|v| v.to_str().ok()).map(str::to_owned);

            let mut hdr = format!(
                "HTTP/1.1 {status}\r\nContent-Type: {ct}\r\nAccess-Control-Allow-Origin: *\r\n"
            );
            if let Some(v) = cl { hdr += &format!("Content-Length: {v}\r\n"); }
            if let Some(v) = cr { hdr += &format!("Content-Range: {v}\r\n"); }
            if let Some(v) = ar { hdr += &format!("Accept-Ranges: {v}\r\n"); }
            hdr += "\r\n";

            // Stream chunks as they arrive — never buffer the entire file in memory.
            if writer.write_all(hdr.as_bytes()).await.is_err() { return; }
            let mut stream = resp.bytes_stream();
            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bytes) => { if writer.write_all(&bytes).await.is_err() { return; } }
                    Err(_) => return,
                }
            }
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = writer.write_all(
                format!("HTTP/1.1 502 Bad Gateway\r\nContent-Length: {}\r\n\r\n{}", msg.len(), msg)
                    .as_bytes(),
            ).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_private_lan_url;

    #[test]
    fn allows_rfc1918_ranges() {
        assert!(is_private_lan_url("http://10.0.0.1:8200/media/track.mp3"));
        assert!(is_private_lan_url("http://10.255.255.255/x"));
        assert!(is_private_lan_url("http://172.16.0.1/x"));
        assert!(is_private_lan_url("http://172.31.255.255/x"));
        assert!(is_private_lan_url("http://192.168.1.100:8200/x"));
        assert!(is_private_lan_url("http://192.168.0.1/x"));
    }

    #[test]
    fn blocks_loopback() {
        assert!(!is_private_lan_url("http://127.0.0.1:7357/callback"));
        assert!(!is_private_lan_url("http://127.0.0.1:29341/192.168.1.1/x")); // proxy self-request
        assert!(!is_private_lan_url("http://127.1.2.3/x"));
    }

    #[test]
    fn blocks_link_local_metadata() {
        assert!(!is_private_lan_url("http://169.254.169.254/latest/meta-data/"));
        assert!(!is_private_lan_url("http://169.254.0.1/x"));
    }

    #[test]
    fn blocks_public_ips() {
        assert!(!is_private_lan_url("http://8.8.8.8/x"));
        assert!(!is_private_lan_url("http://1.1.1.1/x"));
        assert!(!is_private_lan_url("http://172.32.0.1/x")); // just outside 172.16-31
        assert!(!is_private_lan_url("http://172.15.0.1/x")); // just outside 172.16-31
    }

    #[test]
    fn blocks_hostnames_and_malformed() {
        assert!(!is_private_lan_url("http://nas.local/x"));
        assert!(!is_private_lan_url("not-a-url"));
        assert!(!is_private_lan_url(""));
    }
}
