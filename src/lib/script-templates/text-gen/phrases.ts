import i18n from '@/lib/i18n'
// ─── Quest text phrase banks ────────────────────────────────────────────────
// Slot syntax: {giver} {task} {reward}. Each tone has several variants per
// line kind, picked with a seeded RNG so the same seed always yields the same text.

export const TONES = ['heroic', 'grim', 'humorous', 'mysterious'] as const
export type Tone = (typeof TONES)[number]

/** Display name of a tone in the UI language. The tone ids themselves are what is stored and sent. */
export function toneLabel(tone: Tone): string {
  return i18n.t(`story.tones.${tone}`)
}

export type LineKind = 'title' | 'desc' | 'intro' | 'success'

export type PhraseBank = Record<LineKind, string[]>

export const PHRASES: Record<Tone, PhraseBank> = {
  heroic: {
    title: [
      'A Call to Glory',
      'The Hero’s Task',
      'Honor Demands It',
      'A Deed Worthy of Songs',
      'For the Realm',
      'Banners Raised',
      'The Champion’s Oath',
      'Light Against the Dark',
      'A Legend in the Making',
    ],
    desc: [
      '{giver} seeks a champion: {task}. A fitting reward awaits: {reward}.',
      'Prove your valor. {task}, and {reward} will be yours.',
      'The kingdom looks to you. {task}. {reward} is the least it can offer.',
      'Glory favors the bold. {task}, and {giver} will see you rewarded with {reward}.',
      'A worthy challenge for a worthy hero. {task}. {reward} is your due.',
      'Ride out and make history. {task}. {reward} awaits at journey’s end.',
    ],
    intro: [
      'Hail, brave one! The realm needs a true hero. {task}, and you shall be rewarded with {reward}.',
      'Your name is already whispered in the halls of kings. Will you answer the call? {task}. {reward} is yours when it is done.',
      'Stand tall, champion! Dark days gather, but not while heroes like you ride. {task}. {reward} awaits your return.',
      'Well met, hero! Few have your courage, and fewer your skill. {task}. Do this, and {reward} is yours.',
      'The bards will make a song of this if you succeed. {task}. And {reward} shall be your thanks.',
      'Steel your heart, friend, for the road is long and the cause is just. {task}. {reward} awaits the victor.',
    ],
    success: [
      'Magnificent! Songs will be sung of this day. Take {reward} with my thanks.',
      'You have done what none dared. {reward} is yours, well earned.',
      'The realm is in your debt, hero. Accept {reward}, and know that your name will not be forgotten.',
      'Victory! I never doubted you, not for a moment. Here is {reward}, as promised.',
      'A triumph worthy of legend! Take {reward}, and wear it with pride.',
      'The people cheer your name, champion. Let {reward} be a token of their gratitude.',
    ],
  },
  grim: {
    title: [
      'A Debt in Blood',
      'No Other Choice',
      'The Price of Survival',
      'Dark Errand',
      'Ashes and Iron',
      'The Last Resort',
      'Bitter Work',
      'Cold Comfort',
      'What the Night Demands',
    ],
    desc: [
      '{giver} is out of options: {task}. Payment: {reward}.',
      'It will not be pleasant. {task}. In return, {reward}.',
      'Nobody else will take this. {task}. The pay is {reward}, and no promises beyond that.',
      'There is no glory in this, only necessity. {task}. {reward} for those who return.',
      'The living need this done. {task}. {giver} offers {reward}.',
      'Hard work for hard coin. {task}. {reward}, if you come back.',
    ],
    intro: [
      'Times are dark and I have nowhere else to turn. {task}. Do this and {reward} is yours.',
      'Not many return from jobs like this. {task}. If you live, {reward} is your pay.',
      'The wells are poisoned and the fields are burned. {task}. I can offer {reward}, and little else.',
      'I have buried too many already. {task}. Take {reward} when you finish, and do not look back.',
      'Do not mistake this for kindness. {task}. {reward} is the price of my desperation.',
      'The winter will take us all unless this is done. {task}. {reward} is all we have left to give.',
    ],
    success: [
      'So it is done. There was a cost, but here is {reward}. Take it and go.',
      'You survived. Few do. {reward}, as promised.',
      'It is over, for now. Take {reward} and do not ask what it cost the rest of us.',
      'The dead can rest a little easier. {reward} is yours. May it be worth the blood.',
      'I did not think you would return. Here is {reward}. It is not much against what you saw.',
      'Done, then. Take {reward} and leave this place before it takes more from us.',
    ],
  },
  humorous: {
    title: [
      'Easy Money (Probably)',
      'Totally Safe, Honest',
      'Fetch Quest Deluxe',
      'A Small Favor',
      'Hero Wanted, Apply Within',
      'Mildly Cursed',
      'No Refunds',
      'Read the Fine Print',
      'It Seemed Like a Good Idea',
    ],
    desc: [
      '{giver} needs a favor and swears it is not dangerous: {task}. Pays: {reward}.',
      'What could possibly go wrong? {task}. Reward: {reward}.',
      '{giver} promises it is a quick job. {task}. Payment: {reward}, less a small handling fee. Just kidding. Mostly.',
      'An exciting opportunity with only minor risk of death. {task}. Rewards include {reward}.',
      '{giver} would do it personally, but has a prior engagement. {task}. You get {reward}.',
      'Qualifications: pulse, optionally a sword. {task}. Compensation: {reward}.',
    ],
    intro: [
      'Ah, a hero! Perfect timing. Tiny favor, barely an inconvenience: {task}. I will even throw in {reward}!',
      'Do not ask where the last three heroes went. Anyway! {task}. {reward} for your trouble.',
      'Here is the plan, and I use the word loosely: {task}. Afterwards, {reward} for you, and a nice lie-down for me.',
      'You look capable! Or at least not currently on fire. {task}. I will pay you {reward}.',
      'I would go myself, but my knees have opinions. {task}. {reward} is yours if you do.',
      'Quick question: are you afraid of anything? No? Wonderful. {task}. {reward} for your bravery.',
    ],
    success: [
      'You did it! I owe you one. Actually, I owe you {reward}. Same thing.',
      'Splendid! I had a bet going that you would not. Here is {reward}, and my winnings.',
      'Wonderful! I was already drafting your memorial. Here is {reward}, and I will tear up the speech.',
      'Marvelous! I told everyone you would succeed. I told them in writing, and I owe them money. Here is {reward} anyway.',
      'Done and dusted! Take {reward}. The dust is complimentary.',
      'You came back with all your limbs! Excellent. Here is {reward}, and please do not mention the incident to anyone.',
    ],
  },
  mysterious: {
    title: [
      'Whispers in the Dark',
      'A Riddle of Fate',
      'What the Stars Foretold',
      'The Veiled Request',
      'Beyond the Mist',
      'The Third Sign',
      'An Unspoken Promise',
      'Where the Shadows Gather',
      'The Door That Was Not There',
    ],
    desc: [
      '{giver} speaks in riddles, but the meaning is clear: {task}. The reward: {reward}.',
      'Fate has chosen you. {task}. What is promised: {reward}.',
      'Something stirs behind the veil. {task}. Those who answer are given {reward}.',
      'The signs point to you and no other. {task}. {reward} is what the stars allow.',
      '{giver} knows more than is said. {task}. In return: {reward}.',
      'An old debt comes due. {task}. Settle it, and {reward} is yours.',
    ],
    intro: [
      'I have seen you in a dream, traveler. {task}. And what is promised will be given: {reward}.',
      'The omens are clear, though few can read them. {task}. Then {reward} shall find its way to you.',
      'Do not ask how I know your name. {task}. When it is finished, {reward} will be waiting, as it always has.',
      'Come closer, and listen. Some things are better left unsaid, but this must be done: {task}. {reward} will follow.',
      'The moon was red last night, and I knew you would come. {task}. {reward} is the gift of those who watch.',
      'You were not meant to find me, and yet here you are. {task}. Do so, and {reward} is yours.',
    ],
    success: [
      'It is as the stars foretold. Take {reward}, and ask no questions.',
      'The circle closes. {reward} was always meant for you.',
      'So the third sign is fulfilled. Take {reward}, traveler, and walk carefully from here.',
      'I knew you would return. The mist told me. Take {reward}, and forget what you have seen.',
      'The debt is paid, the thread is cut. {reward} is yours, and so is the silence.',
      'You have done more than you know. Take {reward}; the rest will be revealed in time.',
    ],
  },
}
