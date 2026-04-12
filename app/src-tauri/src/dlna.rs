use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct DlnaServer {
    pub name:     String,
    pub location: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct DlnaContainer {
    pub id:    String,
    pub title: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct DlnaItem {
    pub id:          String,
    pub title:       String,
    pub artist:      Option<String>,
    pub album_art:   Option<String>,
    pub url:         String,
    pub mime:        String,
    pub duration_ms: Option<u64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct DlnaBrowseResult {
    pub containers: Vec<DlnaContainer>,
    pub items:      Vec<DlnaItem>,
}

fn parse_duration(s: &str) -> Option<u64> {
    // Format: H:MM:SS.mmm  or  H:MM:SS
    let parts: Vec<&str> = s.splitn(3, ':').collect();
    if parts.len() < 3 { return None; }
    let h: u64  = parts[0].parse().ok()?;
    let m: u64  = parts[1].parse().ok()?;
    let sec_parts: Vec<&str> = parts[2].splitn(2, '.').collect();
    let s: u64  = sec_parts[0].parse().ok()?;
    if m > 59 || s > 59 { return None; }
    let ms: u64 = if sec_parts.len() > 1 {
        let frac = sec_parts[1];
        let trimmed: String = frac.chars().take(3).collect();
        format!("{:0<3}", trimmed).parse().unwrap_or(0)
    } else { 0 };
    Some((h * 3_600 + m * 60 + s) * 1_000 + ms)
}

pub fn parse_didl_lite(xml: &str) -> DlnaBrowseResult {
    let doc = match roxmltree::Document::parse(xml) {
        Ok(d)  => d,
        Err(e) => {
            eprintln!("[dlna] DIDL-Lite parse error: {e}");
            return DlnaBrowseResult { containers: vec![], items: vec![] };
        }
    };

    let mut containers = Vec::new();
    let mut items      = Vec::new();

    // roxmltree exposes the local name (without prefix), so "title" matches
    // both dc:title and plain title regardless of namespace. This is correct
    // behaviour for DIDL-Lite where dc:, upnp: etc. are well-known prefixes.
    for node in doc.root().descendants() {
        if !node.is_element() { continue; }
        match node.tag_name().name() {
            "container" => {
                let id    = node.attribute("id").unwrap_or("").to_owned();
                let title = node.descendants()
                    .find(|n| n.tag_name().name() == "title")
                    .and_then(|n| n.text())
                    .unwrap_or("")
                    .to_owned();
                containers.push(DlnaContainer { id, title });
            }
            "item" => {
                let id    = node.attribute("id").unwrap_or("").to_owned();
                let title = node.descendants()
                    .find(|n| n.tag_name().name() == "title")
                    .and_then(|n| n.text())
                    .unwrap_or("")
                    .to_owned();
                let artist = node.descendants()
                    .find(|n| matches!(n.tag_name().name(), "creator" | "artist"))
                    .and_then(|n| n.text())
                    .map(str::to_owned);
                let album_art = node.descendants()
                    .find(|n| n.tag_name().name() == "albumArtURI")
                    .and_then(|n| n.text())
                    .map(str::to_owned);
                let res_node = node.descendants()
                    .find(|n| n.tag_name().name() == "res");
                let url = res_node
                    .and_then(|n| n.text())
                    .unwrap_or("")
                    .trim()
                    .to_owned();
                let mime = res_node
                    .and_then(|n| n.attribute("protocolInfo"))
                    .and_then(|p| p.split(':').nth(2))
                    .unwrap_or("")
                    .to_owned();
                if url.is_empty() { continue; }  // no <res> element — not a playable item
                let duration_ms = res_node
                    .and_then(|n| n.attribute("duration"))
                    .and_then(parse_duration);
                items.push(DlnaItem { id, title, artist, album_art, url, mime, duration_ms });
            }
            _ => {}
        }
    }

    DlnaBrowseResult { containers, items }
}

/// SSDP M-SEARCH for UPnP MediaServer devices with a 3-second timeout.
/// Returns an empty list (never an error) if no servers are found.
#[tauri::command]
pub async fn dlna_discover() -> Vec<DlnaServer> {
    use futures::TryStreamExt;

    let search_target = match "urn:schemas-upnp-org:device:MediaServer:1"
        .parse::<rupnp::ssdp::SearchTarget>()
    {
        Ok(st) => st,
        Err(e) => {
            eprintln!("[dlna] bad search target: {e}");
            return vec![];
        }
    };

    let mut servers = Vec::new();
    match rupnp::discover(&search_target, std::time::Duration::from_secs(3)).await {
        Ok(stream) => {
            futures::pin_mut!(stream);
            loop {
                match stream.try_next().await {
                    Ok(Some(device)) => {
                        servers.push(DlnaServer {
                            name:     device.friendly_name().to_owned(),
                            location: device.url().to_string(),
                        });
                    }
                    Ok(None) | Err(_) => break,
                }
            }
        }
        Err(e) => eprintln!("[dlna] discovery error: {e}"),
    }
    servers
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_DIDL: &str = r#"<?xml version="1.0"?>
<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL/"
           xmlns:dc="http://purl.org/dc/elements/1.1/"
           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
  <container id="10" parentID="0">
    <dc:title>Music</dc:title>
  </container>
  <item id="20" parentID="0">
    <dc:title>Test Track</dc:title>
    <dc:creator>Test Artist</dc:creator>
    <upnp:albumArtURI>http://server/art.jpg</upnp:albumArtURI>
    <res protocolInfo="http-get:*:audio/mpeg:*" duration="0:03:45.000">http://server/track.mp3</res>
  </item>
  <item id="21" parentID="0">
    <dc:title>Photo.jpg</dc:title>
    <res protocolInfo="http-get:*:image/jpeg:*">http://server/photo.jpg</res>
  </item>
</DIDL-Lite>"#;

    #[test]
    fn test_parse_containers() {
        let result = parse_didl_lite(SAMPLE_DIDL);
        assert_eq!(result.containers.len(), 1);
        assert_eq!(result.containers[0].id, "10");
        assert_eq!(result.containers[0].title, "Music");
    }

    #[test]
    fn test_parse_items() {
        let result = parse_didl_lite(SAMPLE_DIDL);
        assert_eq!(result.items.len(), 2);
        let audio = &result.items[0];
        assert_eq!(audio.id, "20");
        assert_eq!(audio.title, "Test Track");
        assert_eq!(audio.artist.as_deref(), Some("Test Artist"));
        assert_eq!(audio.album_art.as_deref(), Some("http://server/art.jpg"));
        assert_eq!(audio.url, "http://server/track.mp3");
        assert_eq!(audio.mime, "audio/mpeg");
        assert_eq!(audio.duration_ms, Some(225_000));
    }

    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration("0:03:45.000"), Some(225_000));
        assert_eq!(parse_duration("1:00:00.000"), Some(3_600_000));
        assert_eq!(parse_duration("0:00:01.500"), Some(1_500));
        assert_eq!(parse_duration("bad"),          None);
    }

    #[test]
    fn test_parse_duration_rejects_out_of_range() {
        assert_eq!(parse_duration("0:99:99.000"), None);
        assert_eq!(parse_duration("0:00:60.000"), None);
    }

    #[test]
    fn test_parse_empty_xml() {
        let result = parse_didl_lite(
            r#"<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL/"></DIDL-Lite>"#
        );
        assert_eq!(result.containers.len(), 0);
        assert_eq!(result.items.len(), 0);
    }

    #[test]
    fn test_parse_malformed_xml_returns_empty() {
        let result = parse_didl_lite("not xml at all");
        assert_eq!(result.containers.len(), 0);
        assert_eq!(result.items.len(), 0);
    }
}
