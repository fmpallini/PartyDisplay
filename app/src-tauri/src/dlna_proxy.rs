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
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

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

    let client = match reqwest::Client::builder().build() {
        Ok(c)  => c,
        Err(e) => {
            let msg = e.to_string();
            let _ = writer.write_all(
                format!("HTTP/1.1 500 Internal Server Error\r\nContent-Length: {}\r\n\r\n{}", msg.len(), msg)
                    .as_bytes(),
            ).await;
            return;
        }
    };

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

            let body = resp.bytes().await.unwrap_or_default();

            let mut hdr = format!(
                "HTTP/1.1 {status}\r\nContent-Type: {ct}\r\nAccess-Control-Allow-Origin: *\r\n"
            );
            if let Some(v) = cl { hdr += &format!("Content-Length: {v}\r\n"); }
            if let Some(v) = cr { hdr += &format!("Content-Range: {v}\r\n"); }
            if let Some(v) = ar { hdr += &format!("Accept-Ranges: {v}\r\n"); }
            hdr += "\r\n";

            let _ = writer.write_all(hdr.as_bytes()).await;
            let _ = writer.write_all(&body).await;
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
