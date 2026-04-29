use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct IpLocation {
    pub lat:     f64,
    pub lon:     f64,
    pub city:    String,
    pub country: String,
}

pub fn parse_ip_location(json: &serde_json::Value) -> Result<IpLocation, String> {
    if json["status"].as_str() != Some("success") {
        return Err(format!(
            "ip geolocation: {}",
            json["message"].as_str().unwrap_or("unknown"),
        ));
    }
    let lat     = json["lat"]    .as_f64() .ok_or_else(|| "missing lat".to_string())?;
    let lon     = json["lon"]    .as_f64() .ok_or_else(|| "missing lon".to_string())?;
    let city    = json["city"]   .as_str() .ok_or_else(|| "missing city".to_string())?   .to_string();
    let country = json["country"].as_str() .ok_or_else(|| "missing country".to_string())?.to_string();
    Ok(IpLocation { lat, lon, city, country })
}

#[derive(Debug, Serialize, Clone)]
pub struct BatteryStatus {
    pub level:     u8,
    pub charging:  bool,
    pub available: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_valid_response() {
        let j = json!({
            "status": "success",
            "lat": 48.85, "lon": 2.35,
            "city": "Paris", "country": "France",
        });
        let loc = parse_ip_location(&j).unwrap();
        assert_eq!(loc.city, "Paris");
        assert_eq!(loc.country, "France");
        assert!((loc.lat - 48.85).abs() < 0.001);
        assert!((loc.lon - 2.35).abs() < 0.001);
    }

    #[test]
    fn parse_fails_when_status_is_not_success() {
        let j = json!({ "status": "fail", "message": "private range" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("private range"), "expected 'private range' in: {err}");
    }

    #[test]
    fn parse_fails_when_status_absent() {
        let j = json!({ "lat": 0.0, "lon": 0.0, "city": "X", "country": "Y" });
        assert!(parse_ip_location(&j).is_err());
    }

    #[test]
    fn parse_fails_when_lat_missing() {
        let j = json!({ "status": "success", "lon": 2.35, "city": "Paris", "country": "France" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("lat"), "expected 'lat' in: {err}");
    }

    #[test]
    fn parse_fails_when_city_missing() {
        let j = json!({ "status": "success", "lat": 0.0, "lon": 0.0, "country": "France" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("city"), "expected 'city' in: {err}");
    }

    #[test]
    fn parse_unknown_failure_uses_fallback_message() {
        let j = json!({ "status": "fail" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("unknown"), "expected 'unknown' in: {err}");
    }
}
