// ─── Quest text phrase banks ────────────────────────────────────────────────
// Slot syntax: {giver} {task} {reward} {target}. Each tone has several variants per
// line kind, picked with a seeded RNG so the same seed always yields the same text.

export const TONES = ['heroic', 'grim', 'humorous', 'mysterious'] as const
export type Tone = (typeof TONES)[number]

export const TONE_LABELS: Record<Tone, string> = {
  heroic: 'Heroic',
  grim: 'Grim',
  humorous: 'Humorous',
  mysterious: 'Mysterious',
}

export type LineKind = 'title' | 'desc' | 'intro' | 'success'

export type PhraseBank = Record<LineKind, string[]>

export const PHRASES: Record<Tone, PhraseBank> = {
  heroic: {
    title: ['A Call to Glory', 'The Hero’s Task', 'Honor Demands It', 'A Deed Worthy of Songs'],
    desc: [
      '{giver} seeks a champion: {task}. A fitting reward awaits: {reward}.',
      'Prove your valor. {task}, and {reward} will be yours.',
    ],
    intro: [
      'Hail, brave one! The realm needs a true hero. {task}, and you shall be rewarded with {reward}.',
      'Your name is already whispered in the halls of kings. Will you answer the call? {task}. {reward} is yours when it is done.',
    ],
    success: [
      'Magnificent! Songs will be sung of this day. Take {reward} with my thanks.',
      'You have done what none dared. {reward} is yours, well earned.',
    ],
  },
  grim: {
    title: ['A Debt in Blood', 'No Other Choice', 'The Price of Survival', 'Dark Errand'],
    desc: [
      '{giver} is out of options: {task}. Payment: {reward}.',
      'It will not be pleasant. {task}. In return, {reward}.',
    ],
    intro: [
      'Times are dark and I have nowhere else to turn. {task}. Do this and {reward} is yours.',
      'Not many return from jobs like this. {task}. If you live, {reward} is your pay.',
    ],
    success: [
      'So it is done. There was a cost, but here is {reward}. Take it and go.',
      'You survived. Few do. {reward}, as promised.',
    ],
  },
  humorous: {
    title: ['Easy Money (Probably)', 'Totally Safe, Honest', 'Fetch Quest Deluxe', 'A Small Favor'],
    desc: [
      '{giver} needs a favor and swears it is not dangerous: {task}. Pays: {reward}.',
      'What could possibly go wrong? {task}. Reward: {reward}.',
    ],
    intro: [
      'Ah, a hero! Perfect timing. Tiny favor, barely an inconvenience: {task}. I will even throw in {reward}!',
      'Do not ask where the last three heroes went. Anyway! {task}. {reward} for your trouble.',
    ],
    success: [
      'You did it! I owe you one. Actually, I owe you {reward}. Same thing.',
      'Splendid! I had a bet going that you would not. Here is {reward}, and my winnings.',
    ],
  },
  mysterious: {
    title: ['Whispers in the Dark', 'A Riddle of Fate', 'What the Stars Foretold', 'The Veiled Request'],
    desc: [
      '{giver} speaks in riddles, but the meaning is clear: {task}. The reward: {reward}.',
      'Fate has chosen you. {task}. What is promised: {reward}.',
    ],
    intro: [
      'I have seen you in a dream, traveler. {task}. And what is promised will be given: {reward}.',
      'The omens are clear, though few can read them. {task}. Then {reward} shall find its way to you.',
    ],
    success: [
      'It is as the stars foretold. Take {reward}, and ask no questions.',
      'The circle closes. {reward} was always meant for you.',
    ],
  },
}
