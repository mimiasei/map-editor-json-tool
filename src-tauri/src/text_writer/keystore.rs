//! The user's API key, kept in the operating system's credential store
//! (Windows Credential Manager, macOS Keychain, Secret Service on Linux).
//! Never written to disk by this app, never returned to the webview.

use keyring::Entry;

use super::error::WriterError;
use super::provider::Provider;

const SERVICE: &str = "map-editor-json-tool";

fn entry(provider: Provider) -> Result<Entry, WriterError> {
    Entry::new(SERVICE, &format!("text-writer-{}", provider.id()))
        .map_err(|e| WriterError::Store(format!("Could not open the key store: {e}")))
}

pub fn set(provider: Provider, key: &str) -> Result<(), WriterError> {
    entry(provider)?
        .set_password(key)
        .map_err(|e| WriterError::Store(format!("Could not save the key: {e}")))
}

pub fn get(provider: Provider) -> Result<String, WriterError> {
    match entry(provider)?.get_password() {
        Ok(k) if !k.is_empty() => Ok(k),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(WriterError::no_key()),
        Err(e) => Err(WriterError::Store(format!("Could not read the key: {e}"))),
    }
}

pub fn clear(provider: Provider) -> Result<(), WriterError> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(WriterError::Store(format!("Could not remove the key: {e}"))),
    }
}
