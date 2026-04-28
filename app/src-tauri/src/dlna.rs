use party_display_core::dlna::{
    DlnaServer, DlnaBrowseResult, parse_didl_lite, xml_escape,
};
pub use party_display_core::dlna::{DlnaContainer, DlnaItem};

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

/// ContentDirectory Browse(BrowseDirectChildren) via UPnP SOAP.
/// Use container_id = "0" for the root container (DLNA spec).
/// Returns parsed containers and items; returns Err on network/SOAP failure.
#[tauri::command]
pub async fn dlna_browse(location: String, container_id: String) -> Result<DlnaBrowseResult, String> {
    use tokio::time::{timeout, Duration};

    let safe_id = xml_escape(&container_id);

    timeout(Duration::from_secs(10), async move {
        let url = location
            .parse::<rupnp::http::Uri>()
            .map_err(|e| format!("Invalid location URL: {e}"))?;

        let device = rupnp::Device::from_url(url)
            .await
            .map_err(|e| format!("Could not reach device: {e}"))?;

        let urn = "urn:schemas-upnp-org:service:ContentDirectory:1"
            .parse::<rupnp::ssdp::URN>()
            .map_err(|e| format!("Bad URN: {e}"))?;

        let service = device
            .find_service(&urn)
            .ok_or_else(|| "ContentDirectory service not found on device".to_string())?;

        // Build the inner SOAP payload fragment (rupnp wraps it in the full envelope)
        let payload = format!(
            "<ObjectID>{safe_id}</ObjectID>\
             <BrowseFlag>BrowseDirectChildren</BrowseFlag>\
             <Filter>*</Filter>\
             <StartingIndex>0</StartingIndex>\
             <RequestedCount>0</RequestedCount>\
             <SortCriteria></SortCriteria>"
        );

        let response = service
            .action(device.url(), "Browse", &payload)
            .await
            .map_err(|e| format!("Browse action failed: {e}"))?;

        let didl = response
            .get("Result")
            .map(String::as_str)
            .ok_or_else(|| "No Result field in Browse response".to_string())?;

        Ok::<DlnaBrowseResult, String>(parse_didl_lite(didl))
    })
    .await
    .map_err(|_| "Browse timed out after 10s".to_string())?
}
