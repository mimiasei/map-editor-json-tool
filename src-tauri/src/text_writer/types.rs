use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::error::WriterError;

pub const KINDS: &[&str] = &[
    "quest_name",
    "quest_desc",
    "intro",
    "clue",
    "choice_prompt",
    "answer",
    "outcome",
    "reward",
    "finale",
];
pub const TONES: &[&str] = &["heroic", "grim", "humorous", "mysterious"];
pub const LENGTHS: &[&str] = &["short", "medium"];
pub const INTENTS: &[&str] = &["bold", "cautious", "diplomatic", "greedy", "merciful", "cunning"];
pub const MODES: &[&str] = &["write", "translate", "polish"];

/// The game's language folder names (src/lib/languages.ts), with the English
/// name the prompt uses.
pub const LANGUAGES: &[(&str, &str)] = &[
    ("english", "English"),
    ("BRportugese", "Brazilian Portuguese"),
    ("czech", "Czech"),
    ("french", "French"),
    ("german", "German"),
    ("hungarian", "Hungarian"),
    ("italian", "Italian"),
    ("japanese", "Japanese"),
    ("korean", "Korean"),
    ("polish", "Polish"),
    ("russian", "Russian"),
    ("spanish", "Spanish"),
    ("turkish", "Turkish"),
    ("ukrainian", "Ukrainian"),
    ("zhCN", "Simplified Chinese"),
    ("zhTW", "Traditional Chinese"),
];

pub fn language_name(id: &str) -> Option<&'static str> {
    LANGUAGES.iter().find(|(k, _)| *k == id).map(|(_, v)| *v)
}

pub fn check_lang(id: &str) -> Result<(), WriterError> {
    language_name(id)
        .map(|_| ())
        .ok_or_else(|| WriterError::invalid(format!("Unknown language \"{id}\".")))
}

/// One piece of text to produce. Mirrors the frontend's `TextSpec`, plus the
/// output language and, for translate/polish, the text to work from.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextRequest {
    /// Localization token the text will be stored under; echoed back.
    pub id: String,
    pub kind: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    pub tone: String,
    pub length: String,
    #[serde(default)]
    pub speaker: Option<String>,
    #[serde(default)]
    pub intent: Option<String>,
    #[serde(default)]
    pub context: BTreeMap<String, String>,
    /// Output language (game language id).
    pub lang: String,
    /// Language of `source_text` (translate only).
    #[serde(default)]
    pub source_lang: Option<String>,
    /// Text to translate or polish.
    #[serde(default)]
    pub source_text: Option<String>,
}

fn default_mode() -> String {
    "write".into()
}

impl TextRequest {
    /// Rejects anything that is not one of the fixed vocabularies, so the prompt
    /// never carries free-form instructions from the caller.
    pub fn check(&self) -> Result<(), WriterError> {
        let bad = |what: &str| Err(WriterError::invalid(format!("Unknown {what}.")));
        if self.id.is_empty() || self.id.len() > 200 {
            return bad("text id");
        }
        if !KINDS.contains(&self.kind.as_str()) {
            return bad("text kind");
        }
        if !MODES.contains(&self.mode.as_str()) {
            return bad("mode");
        }
        if !TONES.contains(&self.tone.as_str()) {
            return bad("tone");
        }
        if !LENGTHS.contains(&self.length.as_str()) {
            return bad("length");
        }
        if let Some(i) = &self.intent {
            if !INTENTS.contains(&i.as_str()) {
                return bad("intent");
            }
        }
        check_lang(&self.lang)?;
        if let Some(l) = &self.source_lang {
            check_lang(l)?;
        }
        if self.context.len() > 12 {
            return Err(WriterError::invalid("Too much context.".into()));
        }
        if self.mode != "write" {
            match &self.source_text {
                Some(t) if !t.trim().is_empty() && t.chars().count() <= 1200 => {}
                _ => return Err(WriterError::invalid("Missing or too long source text.".into())),
            }
        }
        if self.mode == "translate" && self.source_lang.is_none() {
            return Err(WriterError::invalid("Translate needs a source language.".into()));
        }
        Ok(())
    }

    pub fn sample() -> Self {
        TextRequest {
            id: "test".into(),
            kind: "intro".into(),
            mode: "write".into(),
            tone: "heroic".into(),
            length: "short".into(),
            speaker: None,
            intent: None,
            context: BTreeMap::from([("place".to_string(), "Ravenhold".to_string())]),
            lang: "english".into(),
            source_lang: None,
            source_text: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GeneratedText {
    pub id: String,
    pub text: String,
}
