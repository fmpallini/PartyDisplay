use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "party-display";
const USER:    &str = "spotify-tokens";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenPayload {
    pub access_token:  String,
    pub refresh_token: String,
    pub expires_at:    u64, // unix timestamp ms
}

#[tauri::command]
pub fn store_tokens(tokens: TokenPayload) -> Result<(), String> {
    let json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;
    Entry::new(SERVICE, USER)
        .map_err(|e| e.to_string())?
        .set_password(&json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_tokens() -> Result<Option<TokenPayload>, String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(json) => {
            let tokens: TokenPayload =
                serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(tokens))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_tokens() -> Result<(), String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_round_trip() {
        let tokens = TokenPayload {
            access_token:  "test_access".into(),
            refresh_token: "test_refresh".into(),
            expires_at:    9999999999,
        };
        store_tokens(tokens.clone()).unwrap();
        let loaded = load_tokens().unwrap().expect("tokens should exist after store");
        assert_eq!(loaded.access_token,  tokens.access_token);
        assert_eq!(loaded.refresh_token, tokens.refresh_token);
        assert_eq!(loaded.expires_at,    tokens.expires_at);
        clear_tokens().unwrap();
        let after_clear = load_tokens().unwrap();
        assert!(after_clear.is_none(), "tokens should be gone after clear");
    }
}
