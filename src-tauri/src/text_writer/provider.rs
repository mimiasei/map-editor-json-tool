//! The two supported text services. Both are asked for a JSON reply; what comes
//! back is returned as a raw string for `validate.rs` to check.
//!
//! One request per call: nothing here retries on its own. The only automatic
//! second request is after a 404 (the model was retired), which costs no quota
//! and goes to a different model found in the service's own model list.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use serde_json::{json, Value};

use super::error::WriterError;

/// Progress lines for the UI ("Asking gemini-3.5-flash-lite…").
pub type Status<'a> = &'a (dyn Fn(&str) + Sync);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gemini,
    Groq,
}

/// Gemini always uses this model while it exists; otherwise the newest
/// `gemini-N-flash-lite`, then the newest `gemini-N-flash`.
const GEMINI_MODEL: &str = "gemini-3.5-flash-lite";
const GROQ_MODEL: &str = "openai/gpt-oss-120b";
/// Groq models that are not text writers (speech, safety classifiers, ...).
const GROQ_SKIP: &[&str] = &["whisper", "guard", "tts", "playai", "orpheus", "compound", "embed", "safeguard"];
const MAX_OUTPUT_TOKENS: u32 = 4096;

fn chosen() -> &'static Mutex<HashMap<Provider, String>> {
    static CHOSEN: OnceLock<Mutex<HashMap<Provider, String>>> = OnceLock::new();
    CHOSEN.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The model picked for this provider in this run, if one has been looked up.
pub fn chosen_model(p: Provider) -> Option<String> {
    chosen().lock().ok()?.get(&p).cloned()
}

fn remember(p: Provider, model: &str) {
    if let Ok(mut m) = chosen().lock() {
        m.insert(p, model.to_owned());
    }
}

fn forget(p: Provider) {
    if let Ok(mut m) = chosen().lock() {
        m.remove(&p);
    }
}

impl Provider {
    pub fn id(self) -> &'static str {
        match self {
            Provider::Gemini => "gemini",
            Provider::Groq => "groq",
        }
    }

    fn default_model(self) -> &'static str {
        match self {
            Provider::Gemini => GEMINI_MODEL,
            Provider::Groq => GROQ_MODEL,
        }
    }

    /// Asks the service which models this key can use and remembers the best.
    /// `avoid` is a model that just answered 404.
    pub async fn refresh_model(
        self,
        client: &reqwest::Client,
        key: &str,
        avoid: Option<&str>,
    ) -> Result<String, WriterError> {
        let ids = match self {
            Provider::Gemini => list_gemini(client, key).await?,
            Provider::Groq => list_groq(client, key).await?,
        };
        let pick = match self {
            Provider::Gemini => pick_gemini(&ids, avoid),
            Provider::Groq => pick_groq(&ids, avoid),
        }
        .unwrap_or_else(|| self.default_model().to_owned());
        log::info!("text writer: using {} model {pick}", self.id());
        remember(self, &pick);
        Ok(pick)
    }

    async fn model(self, client: &reqwest::Client, key: &str, status: Status<'_>) -> String {
        if let Some(m) = chosen_model(self) {
            return m;
        }
        status("Looking up the available models…");
        self.refresh_model(client, key, None)
            .await
            .unwrap_or_else(|_| self.default_model().to_owned())
    }

    pub async fn complete(
        self,
        client: &reqwest::Client,
        key: &str,
        system: &str,
        user: &str,
        status: Status<'_>,
    ) -> Result<String, WriterError> {
        let model = self.model(client, key, status).await;
        status(&format!("Asking {model}…"));
        match self.call(client, key, &model, system, user).await {
            // The model is gone: look again and try one different model, once.
            Err(WriterError::BadResponse(m)) if m.starts_with("404") => {
                forget(self);
                status(&format!("{model} is not available, looking for another model…"));
                match self.refresh_model(client, key, Some(&model)).await {
                    Ok(next) if next != model => {
                        status(&format!("Asking {next}…"));
                        self.call(client, key, &next, system, user).await
                    }
                    _ => Err(WriterError::BadResponse(m)),
                }
            }
            other => other,
        }
    }

    async fn call(
        self,
        client: &reqwest::Client,
        key: &str,
        model: &str,
        system: &str,
        user: &str,
    ) -> Result<String, WriterError> {
        match self {
            Provider::Gemini => gemini(client, key, model, system, user).await,
            Provider::Groq => groq(client, key, model, system, user).await,
        }
    }
}

// ─── Model choice ────────────────────────────────────────────────────────────

/// `gemini-3.5-flash-lite` -> (3, 5) when the id is exactly `gemini-N[.M]-<tail>`.
fn gemini_version(id: &str, tail: &str) -> Option<(u32, u32)> {
    let rest = id.strip_prefix("gemini-")?;
    let (ver, t) = rest.split_once('-')?;
    if t != tail {
        return None;
    }
    let (major, minor) = ver.split_once('.').unwrap_or((ver, "0"));
    Some((major.parse().ok()?, minor.parse().ok()?))
}

fn pick_gemini(ids: &[String], avoid: Option<&str>) -> Option<String> {
    let ok = |id: &&String| Some(id.as_str()) != avoid;
    if let Some(id) = ids.iter().filter(ok).find(|id| id.as_str() == GEMINI_MODEL) {
        return Some(id.clone());
    }
    for tail in ["flash-lite", "flash"] {
        let best = ids
            .iter()
            .filter(ok)
            .filter_map(|id| gemini_version(id, tail).map(|v| (v, id)))
            .max_by_key(|(v, _)| *v);
        if let Some((_, id)) = best {
            return Some(id.clone());
        }
    }
    ids.iter().filter(ok).find(|id| id.as_str() == "gemini-flash-lite-latest").cloned()
}

fn pick_groq(ids: &[String], avoid: Option<&str>) -> Option<String> {
    let usable: Vec<&String> = ids
        .iter()
        .filter(|id| Some(id.as_str()) != avoid && !GROQ_SKIP.iter().any(|s| id.contains(s)))
        .collect();
    ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b", "llama-4", "llama-3.1-8b-instant"]
        .iter()
        .find_map(|p| usable.iter().find(|id| id.contains(p)))
        .map(|s| s.to_string())
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

fn map_status(status: reqwest::StatusCode, body: &str) -> WriterError {
    // Bodies can echo request details; log only the status.
    log::info!("text writer: service returned {status}");
    match status.as_u16() {
        401 | 403 => WriterError::Auth("The service rejected the key.".into()),
        429 => WriterError::RateLimited(rate_limit_text(body)),
        400 if body.contains("API key") || body.contains("API_KEY") => {
            WriterError::Auth("The service rejected the key.".into())
        }
        503 => WriterError::BadResponse("503: the service is overloaded right now (high demand). Try again in a minute.".into()),
        s => WriterError::BadResponse(format!("{s}: the service could not complete the request.")),
    }
}

/// Which limit was hit, from the error body: Gemini lists the quota id and a
/// retry delay in `error.details`, Groq puts "try again in …" in the message.
fn rate_limit_text(body: &str) -> String {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let mut quota_id = String::new();
    let mut delay = String::new();
    for d in v["error"]["details"].as_array().into_iter().flatten() {
        if let Some(q) = d["violations"][0]["quotaId"].as_str() {
            quota_id = q.to_owned();
        }
        if let Some(r) = d["retryDelay"].as_str() {
            delay = r.to_owned();
        }
    }
    if !quota_id.is_empty() || !delay.is_empty() {
        log::warn!("text writer: quota {quota_id}, retry delay {delay}");
        let which = if quota_id.contains("PerDay") {
            "The daily limit for this model was reached; it resets once a day."
        } else if quota_id.contains("PerMinute") {
            "The per-minute limit for this model was reached."
        } else {
            "A usage limit for this model was reached."
        };
        return if delay.is_empty() || quota_id.contains("PerDay") {
            which.to_owned()
        } else {
            format!("{which} Try again in {delay}.")
        };
    }
    match api_error_message(body) {
        Some(m) => m.chars().take(200).collect(),
        None => "The usage limit has been reached for now.".into(),
    }
}

/// Why a request never got an answer, in words the user can act on. The URL
/// carries no key (it travels in a header), so the error text is safe to log.
fn network_error(e: &reqwest::Error) -> WriterError {
    log::warn!("text writer: request failed: {e:?}");
    let why = if e.is_timeout() && e.is_connect() {
        "the connection could not be opened in time - check the firewall, antivirus or proxy"
    } else if e.is_timeout() {
        "the service did not answer in time (it may be overloaded)"
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

/// Gemini/Groq put a readable reason in `error.message`; kept short.
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

// ─── Gemini ──────────────────────────────────────────────────────────────────

/// Ids of the models that can generate text. A list call, not a generation, so
/// it does not use up generation quota.
async fn list_gemini(client: &reqwest::Client, key: &str) -> Result<Vec<String>, WriterError> {
    let v = send(
        client
            .get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000")
            .header("x-goog-api-key", key),
    )
    .await?;
    Ok(v["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|m| {
            m["supportedGenerationMethods"]
                .as_array()
                .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("generateContent")))
        })
        .filter_map(|m| m["name"].as_str())
        .map(|n| n.strip_prefix("models/").unwrap_or(n).to_owned())
        .collect())
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

// ─── Groq ────────────────────────────────────────────────────────────────────

async fn list_groq(client: &reqwest::Client, key: &str) -> Result<Vec<String>, WriterError> {
    let v = send(client.get("https://api.groq.com/openai/v1/models").bearer_auth(key)).await?;
    Ok(v["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| m["id"].as_str().map(str::to_owned))
        .collect())
}

async fn groq(
    client: &reqwest::Client,
    key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, WriterError> {
    let mut body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.9,
        "max_tokens": MAX_OUTPUT_TOKENS,
    });
    // gpt-oss models think before answering; keep that short so the reply fits.
    if model.contains("gpt-oss") {
        body["reasoning_effort"] = json!("low");
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn gemini_prefers_the_fixed_model_then_newest_lite_then_flash() {
        assert_eq!(pick_gemini(&ids(&["gemini-3.5-flash-lite", "gemini-3.8-flash-lite"]), None).unwrap(), "gemini-3.5-flash-lite");
        assert_eq!(pick_gemini(&ids(&["gemini-3.1-flash-lite", "gemini-3.8-flash-lite", "gemini-4-flash"]), None).unwrap(), "gemini-3.8-flash-lite");
        assert_eq!(pick_gemini(&ids(&["gemini-3.5-pro", "gemini-3.8-flash", "gemini-2.5-flash"]), None).unwrap(), "gemini-3.8-flash");
        assert_eq!(pick_gemini(&ids(&["gemini-3.5-flash-lite", "gemini-3.8-flash-lite"]), Some("gemini-3.5-flash-lite")).unwrap(), "gemini-3.8-flash-lite");
        assert!(pick_gemini(&ids(&["gemini-3.5-pro"]), None).is_none());
    }

    #[test]
    fn groq_never_picks_a_guard_model() {
        let list = ids(&["meta-llama/llama-prompt-guard-2-86m", "llama-3.1-8b-instant", "openai/gpt-oss-120b"]);
        assert_eq!(pick_groq(&list, None).unwrap(), "openai/gpt-oss-120b");
        assert_eq!(pick_groq(&list, Some("openai/gpt-oss-120b")).unwrap(), "llama-3.1-8b-instant");
        assert!(pick_groq(&ids(&["meta-llama/llama-prompt-guard-2-86m"]), None).is_none());
    }

    #[test]
    fn rate_limit_names_the_limit() {
        let body = r#"{"error":{"message":"x","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"34s"}]}}"#;
        assert!(rate_limit_text(body).contains("daily limit"));
        let body = body.replace("PerDay", "PerMinute");
        assert!(rate_limit_text(&body).contains("34s"));
    }
}
