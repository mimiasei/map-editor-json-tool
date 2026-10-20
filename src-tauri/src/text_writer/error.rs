use serde::Serialize;

/// Errors returned to the frontend as `{ code, message }`. The frontend treats
/// every one of them as "use the built-in text"; the code only decides whether
/// to tell the user something (a rejected key, say) or stay quiet.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum WriterError {
    /// No key stored for this provider.
    NoKey(String),
    /// The service rejected the key.
    Auth(String),
    /// Quota or rate limit reached.
    RateLimited(String),
    /// Could not reach the service.
    Network(String),
    /// The service answered, but not with anything usable.
    BadResponse(String),
    /// A request or reply failed validation.
    Invalid(String),
    /// The key store itself failed.
    Store(String),
}

impl WriterError {
    pub fn no_key() -> Self {
        WriterError::NoKey("No key has been set.".into())
    }

    pub fn network() -> Self {
        WriterError::Network("Could not reach the text service.".into())
    }

    pub fn invalid(msg: String) -> Self {
        WriterError::Invalid(msg)
    }
}
