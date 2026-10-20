//! The two supported text services. Both are asked for a JSON reply; what comes
//! back is returned as a raw string for `validate.rs` to check.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use super::error::WriterError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gemini,
    Groq,
}

/// Tried in order; the alias follows Google's current Flash model, the pinned
/// name is the fallback if the alias is ever unavailable.
const GEMINI_MODELS: &[&str] = &["gemini-flash-latest", "gemini-2.5-flash"];
const GROQ_MODEL: &str = "llama-3.3-70b-versatile";
const MAX_OUTPUT_TOKENS: u32 = 2400;

impl Provider {
    pub fn id(self) -> &'static str {
        match self {
            Provider::Gemini => "gemini",
            Provider::Groq => "groq",
        }
    }

    pub async fn complete(
        self,
        client: &reqwest::Client,
        key: &str,
        system: &str,
        user: &str,
    ) -> Result<String, WriterError> {
        match self {
            Provider::Gemini => {
                // A model that is missing (404) or overloaded (5xx, "high demand")
                // hands over to the next one; if every model is busy, wait a
                // moment and go round once more before giving up.
                let mut last = WriterError::BadResponse("No model answered.".into());
                for pass in 0..2 {
                    if pass > 0 {
                        log::info!("text writer: every model is busy, retrying in a few seconds");
                        tokio::time::sleep(Duration::from_secs(4)).await;
                    }
                    for model in GEMINI_MODELS {
                        match gemini(client, key, model, system, user).await {
                            Err(WriterError::BadResponse(m)) if is_try_next(&m) => {
                                last = WriterError::BadResponse(m);
                            }
                            other => return other,
                        }
                    }
                }
                Err(last)
            }
            Provider::Groq => groq(client, key, system, user).await,
        }
    }
}

/// Errors where another model, or the same one a moment later, may well work.
fn is_try_next(message: &str) -> bool {
    ["404", "500", "502", "503", "504"].iter().any(|s| message.starts_with(s))
}

fn map_status(status: reqwest::StatusCode, body: &str) -> WriterError {
    // Bodies can echo request details; log only the status.
    log::info!("text writer: service returned {status}");
    match status.as_u16() {
        401 | 403 => WriterError::Auth("The service rejected the key.".into()),
        429 => WriterError::RateLimited("The usage limit has been reached for now.".into()),
        400 if body.contains("API key") || body.contains("API_KEY") => {
            WriterError::Auth("The service rejected the key.".into())
        }
        503 => WriterError::BadResponse("503: the service is overloaded right now (high demand). Try again in a minute.".into()),
        s => WriterError::BadResponse(format!("{s}: the service could not complete the request.")),
    }
}

/// Why a request never got an answer, in words the user can act on. The URL
/// carries no key (it travels in a header), so the error text is safe to log.
fn network_error(e: &reqwest::Error) -> WriterError {
    log::warn!("text writer: request failed: {e:?}");
    let why = if e.is_timeout() {
        "the request timed out"
    } else if e.is_connect() {
        "no connection - check the internet, firewall, antivirus or proxy"
    } else if e.is_request() {
        "the request could not be sent (a TLS/certificate or proxy problem is likely)"
    } else if e.is_decode() || e.is_body() {
        "the reply was cut off"
    } else {
        "unknown network error"
    };
    WriterError::Network(format!("Could not reach the text service: {why}."))
}

/// Gemini/Groq put a readable reason in `error.message`; kept short, log only.
fn api_error_message(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    let m = v["error"]["message"].as_str()?;
    Some(m.chars().take(300).collect())
}

async fn send(req: reqwest::RequestBuilder) -> Result<Value, WriterError> {
    let resp = req.send().await.map_err(|e| network_error(&e))?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| network_error(&e))?;
    if !status.is_success() {
        if let Some(m) = api_error_message(&body) {
            log::warn!("text writer: service said: {m}");
        }
        return Err(map_status(status, &body));
    }
    serde_json::from_str(&body)
        .map_err(|_| WriterError::BadResponse("The service reply was not valid JSON.".into()))
}

async fn gemini(
    client: &reqwest::Client,
    key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, WriterError> {
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let body = json!({
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": user }] }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.9,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
        },
    });
    let v = send(client.post(url).header("x-goog-api-key", key).json(&body)).await?;
    v["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| {
            let reason = v["candidates"][0]["finishReason"]
                .as_str()
                .or_else(|| v["promptFeedback"]["blockReason"].as_str())
                .unwrap_or("unknown");
            log::warn!("text writer: {model} reply had no text (finish reason: {reason})");
            WriterError::BadResponse(format!("The service reply had no text (reason: {reason})."))
        })
}

async fn groq(
    client: &reqwest::Client,
    key: &str,
    system: &str,
    user: &str,
) -> Result<String, WriterError> {
    let body = json!({
        "model": GROQ_MODEL,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.9,
        "max_tokens": MAX_OUTPUT_TOKENS,
    });
    let v = send(
        client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(&body),
    )
    .await?;
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| WriterError::BadResponse("The service reply had no text.".into()))
}
