//! "I have my own idea": the player's text goes in, a structured outline comes
//! out. The outline is parsed into fixed types (unknown beats, fields or values
//! are rejected) and checked for consistency, so nothing free-form can pass
//! through. The shape mirrors `StoryDef` in src/types/story.ts.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::error::WriterError;
use super::prompt::sanitize;
use super::types::{INTENTS, TONES};

const MAX_IDEA_CHARS: usize = 3000;
const RESOURCES: &[&str] = &["gold", "dust", "wood", "ore", "crystals", "mercury", "gemstones"];
const OPS: &[&str] = &["=", ">", "<", ">=", "<="];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoryDraft {
    pub title: String,
    pub tone: String,
    pub slots: Vec<Slot>,
    pub variables: Vec<Variable>,
    pub beats: Vec<DraftBeat>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Slot {
    pub id: String,
    pub label: String,
    pub cardinality: String,
    pub min: u32,
    pub entity_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Variable {
    pub key: String,
    pub label: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DraftBeat {
    #[serde(flatten)]
    pub beat: Beat,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Beat {
    Intro,
    Visit { slot: String, variable: String },
    Capture { slot: String },
    Defeat { slot: String },
    Resources { resource: String, amount: u32 },
    Timer { days: u32 },
    Reward { resource: String, amount: u32 },
    Choice {
        variable: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        slot: Option<String>,
        answers: Vec<Answer>,
    },
    Finale { endings: Vec<Ending>, victory: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Answer {
    pub intent: String,
    #[serde(default)]
    pub consequences: Vec<Consequence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires_gold: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Consequence {
    Score { variable: String, amount: i32 },
    Resource { resource: String, amount: i32 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Ending {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<Condition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Condition {
    pub variable: String,
    pub op: String,
    pub value: i32,
}

/// Cleans the player's idea and enforces the size limit. Newlines are kept as
/// spaces; markup characters are removed (they could close the data block).
pub fn prepare_input(text: &str) -> Result<String, WriterError> {
    let cleaned = sanitize(text, MAX_IDEA_CHARS + 1);
    if cleaned.chars().count() > MAX_IDEA_CHARS {
        return Err(WriterError::invalid(format!(
            "The idea is too long (at most {MAX_IDEA_CHARS} characters)."
        )));
    }
    if cleaned.chars().count() < 20 {
        return Err(WriterError::invalid("Write a little more about the idea.".into()));
    }
    Ok(cleaned)
}

fn key_ok(k: &str) -> bool {
    let mut chars = k.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase())
        && k.len() <= 24
        && k.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

pub fn parse_and_validate(raw: &str) -> Result<StoryDraft, String> {
    let mut draft: StoryDraft = serde_json::from_str(raw.trim())
        .map_err(|e| format!("the outline did not match the required shape ({e})"))?;
    validate(&mut draft)?;
    Ok(draft)
}

fn validate(d: &mut StoryDraft) -> Result<(), String> {
    d.title = sanitize(&d.title, 40);
    if d.title.is_empty() {
        d.title = "My story".into();
    }
    if !TONES.contains(&d.tone.as_str()) {
        return Err("unknown tone".into());
    }
    if d.slots.len() > 6 {
        return Err("too many slots".into());
    }
    if d.variables.len() > 8 {
        return Err("too many variables".into());
    }
    if d.beats.is_empty() || d.beats.len() > 10 {
        return Err("the outline needs 1 to 10 beats".into());
    }

    let mut slot_kinds = std::collections::HashMap::new();
    for s in &mut d.slots {
        if !key_ok(&s.id) {
            return Err(format!("bad slot id \"{}\"", s.id));
        }
        if !matches!(s.cardinality.as_str(), "one" | "many") || !matches!(s.entity_kind.as_str(), "town" | "object" | "squad") {
            return Err(format!("bad slot \"{}\"", s.id));
        }
        if s.min > 6 || (s.cardinality == "one" && s.min > 1) {
            return Err(format!("bad minimum for slot \"{}\"", s.id));
        }
        s.label = sanitize(&s.label, 40);
        if s.label.is_empty() || slot_kinds.insert(s.id.clone(), (s.cardinality.clone(), s.entity_kind.clone())).is_some() {
            return Err(format!("bad or duplicate slot \"{}\"", s.id));
        }
    }

    let mut var_kinds = std::collections::HashMap::new();
    for v in &mut d.variables {
        if !key_ok(&v.key) || !matches!(v.kind.as_str(), "choice" | "score" | "progress" | "timer" | "random") {
            return Err(format!("bad variable \"{}\"", v.key));
        }
        v.label = sanitize(&v.label, 40);
        if v.label.is_empty() || var_kinds.insert(v.key.clone(), v.kind.clone()).is_some() {
            return Err(format!("bad or duplicate variable \"{}\"", v.key));
        }
        if matches!((v.min, v.max), (Some(a), Some(b)) if a > b) {
            return Err(format!("bad range for variable \"{}\"", v.key));
        }
    }

    let slot_is = |id: &str, card: Option<&str>, kind: Option<&str>| -> bool {
        slot_kinds
            .get(id)
            .is_some_and(|(c, k)| card.is_none_or(|x| x == c) && kind.is_none_or(|x| x == k))
    };
    let var_is = |key: &str, kind: &str| var_kinds.get(key).is_some_and(|k| k == kind);

    let last = d.beats.len() - 1;
    let mut used_vars: HashSet<String> = HashSet::new();
    for (i, b) in d.beats.iter_mut().enumerate() {
        if let Some(n) = &b.note {
            let n = sanitize(n, 180);
            b.note = if n.is_empty() { None } else { Some(n) };
        }
        match &b.beat {
            Beat::Intro => {}
            Beat::Visit { slot, variable } => {
                if !slot_is(slot, Some("many"), Some("object")) || !var_is(variable, "progress") {
                    return Err(format!("beat {}: visit needs a many/object slot and a progress variable", i + 1));
                }
            }
            Beat::Capture { slot } => {
                if !slot_is(slot, Some("one"), Some("town")) {
                    return Err(format!("beat {}: capture needs a single town slot", i + 1));
                }
            }
            Beat::Defeat { slot } => {
                if !slot_is(slot, Some("one"), Some("squad")) {
                    return Err(format!("beat {}: defeat needs a single squad slot", i + 1));
                }
            }
            Beat::Resources { resource, amount } | Beat::Reward { resource, amount } => {
                if !RESOURCES.contains(&resource.as_str()) || !(1..=50_000).contains(amount) {
                    return Err(format!("beat {}: bad resource amount", i + 1));
                }
            }
            Beat::Timer { days } => {
                if !(1..=120).contains(days) {
                    return Err(format!("beat {}: bad number of days", i + 1));
                }
            }
            Beat::Choice { variable, slot, answers } => {
                if !var_is(variable, "choice") {
                    return Err(format!("beat {}: choice needs a choice variable", i + 1));
                }
                if let Some(s) = slot {
                    if !slot_is(s, Some("one"), Some("object")) {
                        return Err(format!("beat {}: choice slot must be a single object", i + 1));
                    }
                }
                if !(2..=4).contains(&answers.len()) {
                    return Err(format!("beat {}: a choice needs 2 to 4 answers", i + 1));
                }
                for a in answers {
                    if !INTENTS.contains(&a.intent.as_str()) || a.requires_gold.is_some_and(|g| g > 5000) {
                        return Err(format!("beat {}: bad answer", i + 1));
                    }
                    for c in &a.consequences {
                        match c {
                            Consequence::Score { variable, amount } => {
                                if !var_is(variable, "score") || !(-5..=5).contains(amount) {
                                    return Err(format!("beat {}: bad score change", i + 1));
                                }
                                used_vars.insert(variable.clone());
                            }
                            Consequence::Resource { resource, amount } => {
                                if !RESOURCES.contains(&resource.as_str()) || !(-5000..=5000).contains(amount) {
                                    return Err(format!("beat {}: bad resource change", i + 1));
                                }
                            }
                        }
                    }
                }
            }
            Beat::Finale { endings, .. } => {
                if i != last {
                    return Err("the finale must be the last beat".into());
                }
                if endings.is_empty() || endings.len() > 5 {
                    return Err("a finale needs 1 to 5 endings".into());
                }
                if endings.last().is_some_and(|e| e.when.is_some()) {
                    return Err("the last ending must have no condition".into());
                }
                for e in endings {
                    if let Some(c) = &e.when {
                        if !var_is(&c.variable, "score") || !OPS.contains(&c.op.as_str()) || !(-50..=50).contains(&c.value) {
                            return Err("bad ending condition".into());
                        }
                    }
                }
            }
        }
    }
    if !matches!(d.beats[last].beat, Beat::Finale { .. }) {
        return Err("the last beat must be a finale".into());
    }
    if d.beats.iter().filter(|b| matches!(b.beat, Beat::Finale { .. })).count() != 1 {
        return Err("there must be exactly one finale".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOOD: &str = r#"{
      "title": "The Lost Heir", "tone": "mysterious",
      "slots": [{"id":"sites","label":"Clue sites","cardinality":"many","min":2,"entityKind":"object"}],
      "variables": [
        {"key":"clues","label":"Clues","kind":"progress","min":0},
        {"key":"verdict","label":"Verdict","kind":"choice","min":0,"max":4},
        {"key":"trust","label":"Trust","kind":"score","min":0,"max":5}
      ],
      "beats": [
        {"kind":"intro","note":"An heir has vanished."},
        {"kind":"visit","slot":"sites","variable":"clues"},
        {"kind":"choice","variable":"verdict","answers":[
          {"intent":"merciful","consequences":[{"kind":"score","variable":"trust","amount":1}]},
          {"intent":"bold","consequences":[{"kind":"resource","resource":"gold","amount":200}]}]},
        {"kind":"finale","victory":true,"endings":[{"when":{"variable":"trust","op":">=","value":1}},{}]}
      ]}"#;

    #[test]
    fn accepts_a_valid_outline() {
        let d = parse_and_validate(GOOD).unwrap();
        assert_eq!(d.beats.len(), 4);
        assert_eq!(d.beats[0].note.as_deref(), Some("An heir has vanished."));
    }

    #[test]
    fn rejects_unknown_beats_fields_and_references() {
        assert!(parse_and_validate(&GOOD.replace("\"visit\"", "\"teleport\"")).is_err());
        assert!(parse_and_validate(&GOOD.replace("\"title\"", "\"extra\":1,\"title\"")).is_err());
        assert!(parse_and_validate(&GOOD.replace("\"slot\":\"sites\"", "\"slot\":\"nope\"")).is_err());
        assert!(parse_and_validate(&GOOD.replace("{\"when\":{\"variable\":\"trust\",\"op\":\">=\",\"value\":1}},{}", "{}, {}")).is_ok());
        assert!(parse_and_validate(&GOOD.replace(",{}]}", "]}")).is_err());
    }

    #[test]
    fn rejects_out_of_range_values() {
        assert!(parse_and_validate(&GOOD.replace("\"amount\":200", "\"amount\":900000")).is_err());
        assert!(parse_and_validate(&GOOD.replace("\"amount\":1}]", "\"amount\":99}]")).is_err());
    }

    #[test]
    fn prepare_input_limits() {
        assert!(prepare_input("short").is_err());
        assert!(prepare_input(&"x".repeat(3500)).is_err());
        assert!(prepare_input("An heir vanished from a haunted moor and nobody will say why.").is_ok());
    }
}
