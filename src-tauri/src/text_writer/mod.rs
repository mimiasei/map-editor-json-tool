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
//! * Nothing is retried automatically: a failed call is reported and the user
//!   decides whether to try again (see `provider.rs`).

mod error;
mod import;
mod keystore;
mod prompt;
mod provider;
mod types;
mod validate;

pub use error::WriterError;
pub use import::StoryDraft;
pub use provider::{Provider, Status};
pub use types::{GeneratedText, TextRequest};

use std::time::Duration;

/// Requests per call to the service; keeps a long story from one huge prompt.
const BATCH_SIZE: usize = 10;
/// A tiny test request should answer in a few seconds.
const TEST_TIMEOUT: Duration = Duration::from_secs(15);
const WRITE_TIMEOUT: Duration = Duration::from_secs(40);

fn client(timeout: Duration) -> Result<reqwest::Client, WriterError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(timeout)
        .build()
        .map_err(|e| {
            log::warn!("text writer: could not set up the HTTP client: {e:?}");
            WriterError::Network(format!("Could not set up the connection: {e}"))
        })
}

/// One validated round trip: build the prompt, call the service once, validate
/// the reply. An unusable reply is reported, not silently asked for again.
async fn complete_validated<T>(
    provider: Provider,
    key: &str,
    system: &str,
    user: &str,
    timeout: Duration,
    status: Status<'_>,
    check: impl Fn(&str) -> Result<T, String>,
) -> Result<T, WriterError> {
    let client = client(timeout)?;
    let raw = provider.complete(&client, key, system, user, status).await?;
    check(&raw).map_err(|reason| {
        log::info!("text writer: reply rejected ({reason})");
        WriterError::invalid(format!("The text service's reply could not be used ({reason}). Try again."))
    })
}

async fn generate_with(
    provider: Provider,
    requests: Vec<TextRequest>,
    timeout: Duration,
    status: Status<'_>,
) -> Result<Vec<GeneratedText>, WriterError> {
    let key = keystore::get(provider)?;
    for r in &requests {
        r.check()?;
    }
    let mut out = Vec::with_capacity(requests.len());
    for batch in requests.chunks(BATCH_SIZE) {
        let system = prompt::system_for_texts();
        let user = prompt::user_for_texts(batch);
        let texts = complete_validated(provider, &key, &system, &user, timeout, status, |raw| {
            validate::validate_texts(batch, raw)
        })
        .await?;
        out.extend(texts);
    }
    Ok(out)
}

pub async fn generate(
    provider: Provider,
    requests: Vec<TextRequest>,
    status: Status<'_>,
) -> Result<Vec<GeneratedText>, WriterError> {
    generate_with(provider, requests, WRITE_TIMEOUT, status).await
}

pub async fn import_story(
    provider: Provider,
    text: &str,
    lang: &str,
    status: Status<'_>,
) -> Result<StoryDraft, WriterError> {
    let key = keystore::get(provider)?;
    let text = import::prepare_input(text)?;
    types::check_lang(lang)?;
    let system = prompt::system_for_import();
    let user = prompt::user_for_import(&text, lang);
    complete_validated(provider, &key, &system, &user, WRITE_TIMEOUT, status, |raw| {
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

/// Looks up which model will be used (a list call, no generation quota) and
/// returns its name. Run at startup and by the settings dialog.
pub async fn check(provider: Provider, status: Status<'_>) -> Result<String, WriterError> {
    let key = keystore::get(provider)?;
    let client = client(TEST_TIMEOUT)?;
    status("Looking up the available models…");
    provider.refresh_model(&client, &key, None).await
}

/// A tiny real request, to check the key and the connection work. Returns the
/// model that answered.
pub async fn test(provider: Provider, status: Status<'_>) -> Result<String, WriterError> {
    generate_with(provider, vec![TextRequest::sample()], TEST_TIMEOUT, status).await?;
    Ok(provider::chosen_model(provider).unwrap_or_default())
}
