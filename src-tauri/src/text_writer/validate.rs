//! Checks what the service returned before any of it reaches the editor.

use serde::Deserialize;

use super::types::{GeneratedText, TextRequest};

#[derive(Deserialize)]
struct Reply {
    texts: Vec<ReplyItem>,
}

#[derive(Deserialize)]
struct ReplyItem {
    id: String,
    text: String,
}

fn max_chars(r: &TextRequest) -> usize {
    let by_kind = match (r.kind.as_str(), r.length.as_str()) {
        ("answer", _) => 110,
        ("quest_name", _) => 60,
        ("quest_desc", "short") => 260,
        ("quest_desc", _) => 420,
        (_, "short") => 300,
        _ => 560,
    };
    // A polished or translated text can legitimately be longer than the kind's cap.
    let from_source = r.source_text.as_deref().map_or(0, |s| s.chars().count() * 2);
    by_kind.max(from_source)
}

/// Collapses whitespace and removes a pair of quotes wrapping the whole text.
fn clean(text: &str) -> String {
    let t = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let t = t.trim();
    for (open, close) in [('"', '"'), ('\u{201c}', '\u{201d}'), ('\u{ab}', '\u{bb}')] {
        if t.len() > 2 && t.starts_with(open) && t.ends_with(close) && !t[1..t.len() - 1].contains(open) {
            return t[open.len_utf8()..t.len() - close.len_utf8()].trim().to_string();
        }
    }
    t.to_string()
}

fn forbidden(text: &str) -> Option<&'static str> {
    let lower = text.to_lowercase();
    if lower.contains("http://") || lower.contains("https://") || lower.contains("www.") {
        return Some("it contained a link");
    }
    if text.contains('<') || text.contains('>') || text.contains("```") || text.contains('{') || text.contains('}') {
        return Some("it contained markup");
    }
    None
}

pub fn validate_texts(requests: &[TextRequest], raw: &str) -> Result<Vec<GeneratedText>, String> {
    let reply: Reply = serde_json::from_str(raw.trim())
        .map_err(|_| "the reply was not the required JSON object".to_string())?;
    if reply.texts.len() != requests.len() {
        return Err(format!(
            "expected {} texts but got {}",
            requests.len(),
            reply.texts.len()
        ));
    }
    let mut out = Vec::with_capacity(requests.len());
    for req in requests {
        let item = reply
            .texts
            .iter()
            .find(|i| i.id == req.id)
            .ok_or_else(|| format!("no text for id \"{}\"", req.id))?;
        let text = clean(&item.text);
        if text.is_empty() {
            return Err(format!("the text for \"{}\" was empty", req.id));
        }
        if let Some(why) = forbidden(&text) {
            return Err(format!("the text for \"{}\" was rejected: {why}", req.id));
        }
        let cap = max_chars(req);
        if text.chars().count() > cap {
            return Err(format!(
                "the text for \"{}\" was too long ({} characters, at most {cap})",
                req.id,
                text.chars().count()
            ));
        }
        out.push(GeneratedText { id: req.id.clone(), text });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(id: &str, kind: &str) -> TextRequest {
        let mut r = TextRequest::sample();
        r.id = id.into();
        r.kind = kind.into();
        r
    }

    #[test]
    fn accepts_a_matching_reply() {
        let reqs = [req("a", "intro"), req("b", "answer")];
        let raw = r#"{"texts":[{"id":"a","text":"The road begins."},{"id":"b","text":"  \"Strike now.\"  "}]}"#;
        let out = validate_texts(&reqs, raw).unwrap();
        assert_eq!(out[0].text, "The road begins.");
        assert_eq!(out[1].text, "Strike now.");
    }

    #[test]
    fn rejects_wrong_count_missing_id_and_bad_json() {
        let reqs = [req("a", "intro")];
        assert!(validate_texts(&reqs, r#"{"texts":[]}"#).is_err());
        assert!(validate_texts(&reqs, r#"{"texts":[{"id":"zzz","text":"x"}]}"#).is_err());
        assert!(validate_texts(&reqs, "not json").is_err());
    }

    #[test]
    fn rejects_links_markup_empty_and_too_long() {
        let reqs = [req("a", "answer")];
        for bad in ["see https://x.test", "<b>hi</b>", "   ", &"a ".repeat(200)] {
            let raw = format!(r#"{{"texts":[{{"id":"a","text":{}}}]}}"#, serde_json::to_string(bad).unwrap());
            assert!(validate_texts(&reqs, &raw).is_err(), "should reject {bad:?}");
        }
    }
}
