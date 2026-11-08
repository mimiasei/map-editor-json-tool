---
name: release-notes
description: Write the notes for a release and put them in the `notes` field of that release's latest.json on GitHub (what the in-app update dialog shows). Use when the user says "release notes", "update latest.json", "add the changes from vX to vY to the notes", or after shipping a Tauri build.
---

# Release notes in latest.json

The update dialog shows `notes` from the release's `latest.json`. The GitHub release body is separate and is not shown in the app.
Usage: `/release-notes [from-version] [to-version]`. Default: the newest release and the one before it (`gh release list --limit 4`).

## Steps

1. **Find the range.** `gh release view vTO --json assets,isDraft,tagName` (check `latest.json` is among the assets), then
   `git log vFROM..vTO --oneline --no-merges`. If the tag does not exist yet, use `vFROM..HEAD`. Merge commits and `chore: bump version` are not notes.
2. **Write the notes** in the style of the previous release (`gh release download vFROM -p latest.json -O -`):
   - First line `Desktop release for macOS (Apple Silicon), Windows, and Linux.` (the app strips it), then `### What's new since X.Y.Z`.
   - One bullet per user-visible change, bold feature name first, plain words, game vocabulary (see CLAUDE.md). Group fixes and tooltips into the feature they belong to. Skip refactors, docs, style commits.
   - Honesty line at the end for anything not played in the game, and "new texts in <langs> need native review" when locales were added.
   - Last line: `See [CHANGELOG](https://github.com/mimiasei/map-editor-json-tool/compare/vFROM...vTO) for what changed.`
3. **Edit only the `notes` field.** Download the release's `latest.json` to the scratchpad (`gh release download vTO -p latest.json -D <dir> --clobber`), set `notes` with a small node script (`JSON.parse`, assign, `JSON.stringify(j, null, 2)`). Never hand-edit the JSON text: `version`, `pub_date` and the platform signatures must stay as they are.
4. **Upload over the old asset:** `gh release upload vTO <dir>/latest.json --clobber`, then download it again and check `version`, the notes length and that all platforms still have a `signature`.
5. **Do not publish a draft** and do not touch the release body unless the user says so.

## Tell the user

- The update dialog only reads `releases/latest/download/latest.json`, so the notes reach users once the release is published (not while it is a draft). No rebuild is needed for this.
- The in-app **What's new** window reads the bundled `src/data/release-notes.md`; changing that needs a new build. Offer to update it for the next release.
- `npm run release-history` skips drafts. After publishing: run it (`GITHUB_TOKEN` optional), then commit `src/data/release-history.json` (it ships with the next build).
