//! Text writer: turns structured story-text requests into dialog text through an
//! online text service, using the user's own key.
//!
//! Design rules (see plans/ in the repo):
//! * The frontend only ever sends structured data (enums, short names). The
//!   prompts live in `prompt.rs` and never reach the UI.
//! * Everything the service returns is validated (`validate.rs`) before it is
//!   handed back; anything that does not fit the expected shape is rejected.
//! * The key lives in the OS credential store (`keystore.rs`) and is only read
//!   here, in Rust. It is never returned to the webview or logged.

mod error;
mod import;
mod keystore;
mod prompt;
mod provider;
mod types;
mod validate;

pub use error::WriterError;
pub use import::StoryDraft;
pub use provider::Provider;
pub use types::{GeneratedText, TextRequest};

use std::time::Duration;

/// Requests per call to the service; keeps a long story from one huge prompt.
const BATCH_SIZE: usize = 10;

fn client() -> Result<reqwest::Client, WriterError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| {
            log::warn!("text writer: could not set up the HTTP client: {e:?}");
            WriterError::Network(format!("Could not set up the connection: {e}"))
        })
}

/// One validated round trip: build the prompt, call the service, validate the
/// reply, and retry once with the reason if the reply was unusable.
async fn complete_validated<T>(
    provider: Provider,
    key: &str,
    system: &str,
    user: &str,
    check: impl Fn(&str) -> Result<T, String>,
) -> Result<T, WriterError> {
    let client = client()?;
    let first = provider.complete(&client, key, system, user).await?;
    match check(&first) {
        Ok(v) => Ok(v),
        Err(reason) => {
            log::info!("text writer: first reply rejected ({reason}), retrying once");
            let retry_user = format!(
                "{user}\n\nYour previous reply was rejected: {reason}. Reply again with only the JSON in the required shape."
            );
            let second = provider.complete(&client, key, system, &retry_user).await?;
            check(&second).map_err(WriterError::invalid)
        }
    }
}

pub async fn generate(
    provider: Provider,
    requests: Vec<TextRequest>,
) -> Result<Vec<GeneratedText>, WriterError> {
    let key = keystore::get(provider)?;
    for r in &requests {
        r.check()?;
    }
    let mut out = Vec::with_capacity(requests.len());
    for batch in requests.chunks(BATCH_SIZE) {
        let system = prompt::system_for_texts();
        let user = prompt::user_for_texts(batch);
        let texts = complete_validated(provider, &key, &system, &user, |raw| {
            validate::validate_texts(batch, raw)
        })
        .await?;
        out.extend(texts);
    }
    Ok(out)
}

pub async fn import_story(
    provider: Provider,
    text: &str,
    lang: &str,
) -> Result<StoryDraft, WriterError> {
    let key = keystore::get(provider)?;
    let text = import::prepare_input(text)?;
    types::check_lang(lang)?;
    let system = prompt::system_for_import();
    let user = prompt::user_for_import(&text, lang);
    complete_validated(provider, &key, &system, &user, |raw| {
        import::parse_and_validate(raw)
    })
    .await
}

pub fn set_key(provider: Provider, key: &str) -> Result<(), WriterError> {
    let key = key.trim();
    if key.len() < 8 || key.len() > 400 || key.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(WriterError::invalid("That does not look like a valid key.".into()));
    }
    keystore::set(provider, key)
}

pub fn has_key(provider: Provider) -> bool {
    keystore::get(provider).is_ok()
}

pub fn clear_key(provider: Provider) -> Result<(), WriterError> {
    keystore::clear(provider)
}

/// A tiny real request, to check the key and the connection work.
pub async fn test(provider: Provider) -> Result<(), WriterError> {
    let req = TextRequest::sample();
    generate(provider, vec![req]).await.map(|_| ())
}
