use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenPayload {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}

#[tauri::command]
pub fn store_tokens(_tokens: TokenPayload) -> Result<(), String> {
    Ok(()) // stub — implemented in Task 4
}

#[tauri::command]
pub fn load_tokens() -> Result<Option<TokenPayload>, String> {
    Ok(None) // stub — implemented in Task 4
}

#[tauri::command]
pub fn clear_tokens() -> Result<(), String> {
    Ok(()) // stub — implemented in Task 4
}
