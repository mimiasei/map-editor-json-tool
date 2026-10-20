// ─── Story text banks (offline fallback for every text the builder needs) ──────
// Slots: {place} {hero} {item} {n} {speaker} {sites}. Narrative kinds vary by
// tone; answer/outcome kinds vary by intent. A seeded RNG picks the variant,
// so the same seed always yields the same story text. The text writer (when
// enabled) replaces these; they are also the permanent fallback.

import type { AnswerIntent, TextKind } from '@/types/story'
import type { Tone } from '@/lib/script-templates/text-gen/phrases'

type NarrativeKind = Exclude<TextKind, 'answer' | 'outcome'>

export const NARRATIVE: Record<Tone, Record<NarrativeKind, string[]>> = {
  heroic: {
    quest_name: ['A Call to Arms', 'The Road to Glory', 'Banners in the Wind'],
    quest_desc: [
      'The realm needs a champion. Ride out and see this through.',
      'Great deeds await those who dare. Answer the call.',
      'Honor and glory lie ahead. Do not turn back.',
    ],
    intro: [
      'A shadow gathers over the land, and the people look to you. The road begins at {place}.',
      'Hear me, hero! Trouble stirs, and only you can meet it. Begin at {place}.',
      'The old songs speak of days like these. Let yours be the name they sing. Set out for {place}.',
    ],
    clue: [
      'You find a sign of what lies ahead at {place}. The road is clearer now.',
      'At {place}, the locals share what they know. Every word brings the truth closer.',
      'A trace left at {place} points the way. You are on the right path.',
    ],
    choice_prompt: [
      'The moment of decision has come, and no one can make it for you. What will you do?',
      'Your companions fall silent, waiting. The choice is yours alone.',
      'Two roads lie before you, and each leads far. Which will you take?',
    ],
    reward: [
      'Well done, hero! The realm is grateful. Take this token of thanks.',
      'Your deeds do not go unseen. Accept this reward with honor.',
      'Songs will be sung of this day. Here is your due.',
    ],
    finale: [
      'It is done. The land breathes again, and your name will be remembered.',
      'Victory! Whatever comes next, this day belongs to you.',
      'The banners are raised and the people cheer. You have won.',
    ],
  },
  grim: {
    quest_name: ['A Debt in Blood', 'No Easy Road', 'The Cost of It'],
    quest_desc: [
      'Nothing here comes free. Finish what you started, whatever it costs.',
      'The land is cold and the work is hard. There is no one else.',
      'Every step forward takes something with it. Keep going.',
    ],
    intro: [
      'The roads are empty and the wells are tainted. Whatever you came for, it starts at {place}.',
      'No one will thank you for this. Go to {place}, and do not expect a welcome.',
      'Ash on the wind, and worse ahead. Make for {place} before the dark does.',
    ],
    clue: [
      'At {place} you find what someone tried to bury. It was not buried deep enough.',
      'Cold hearths and closed doors at {place}, but a trail remains for those who look.',
      'What you learn at {place} is not comforting. But it is useful.',
    ],
    choice_prompt: [
      'Whatever you choose, someone pays. Choose.',
      'There is no clean answer here, only a lesser regret. Decide.',
      'The silence stretches. Everyone is watching what you will do.',
    ],
    reward: [
      'Take it. You earned it, and God knows what it cost.',
      'It is not much, but it is honest coin. Do not spend it all in one place.',
      'The dead cannot pay you. This will have to do.',
    ],
    finale: [
      'It is over. Whether you won or merely survived, only the dead can say.',
      'The last fire dies. What remains is yours, for whatever that is worth.',
      'Silence falls. You have what you came for, and what it left behind.',
    ],
  },
  humorous: {
    quest_name: ['Well, That Escalated', 'Someone Has To', 'A Totally Reasonable Plan'],
    quest_desc: [
      'It seemed like a simple errand. It always does. Off you go.',
      'Nobody else volunteered, so congratulations. It is you.',
      'What could possibly go wrong? Please do not answer that.',
    ],
    intro: [
      'Good news and bad news! The good news is you are needed. The bad news starts at {place}.',
      'Ah, a hero! Perfect. There is a small problem. Well, a large one. Head to {place}.',
      'Quick, someone find a hero! You will do. Please go to {place} and try not to make it worse.',
    ],
    clue: [
      'At {place} you find a clue, a muddy bootprint, and a note reading "not me". Progress.',
      'Someone at {place} says they saw nothing, very loudly. Suspicious. Useful.',
      'You poke around {place} and find exactly what you did not want to find. Well done.',
    ],
    choice_prompt: [
      'Time to make a decision! Remember, there are no wrong answers. There are, but never mind.',
      'Everyone is looking at you expectantly. No pressure. A little pressure.',
      'Two options, both questionable. Choose with confidence, even if you have none.',
    ],
    reward: [
      'Payment, at last! It is less than promised but more than nothing.',
      'Here you go, with the thanks of a grateful and slightly embarrassed kingdom.',
      'A reward! Spend it wisely, or on something shiny.',
    ],
    finale: [
      'Against all odds, it worked. Nobody is more surprised than you.',
      'And so the day is saved, mostly. Please do not look behind the barn.',
      'Roll credits! Somewhere a bard is already getting the details wrong.',
    ],
  },
  mysterious: {
    quest_name: ['Whispers in the Dark', 'What the Stars Hide', 'A Riddle Unfolding'],
    quest_desc: [
      'Something is wrong, and no one will say what. Follow the thread.',
      'The signs are there for those who can read them. Begin.',
      'Not everything is as it seems. Look closer.',
    ],
    intro: [
      'They say the answer lies at {place}, though no one agrees on the question. Go and see.',
      'A strange hush has fallen. The old ones point to {place} and will say no more.',
      'You were not meant to find this. Yet here you are, bound for {place}.',
    ],
    clue: [
      'At {place}, the pieces shift and almost fit. Something watches as you leave.',
      'A faint mark at {place} matches one you have seen before. Coincidence is wearing thin.',
      'The truth at {place} is a door, not an answer. It opens onto another question.',
    ],
    choice_prompt: [
      'The shape of it is clear at last, and so is the cost. What do you do?',
      'A voice, perhaps your own, asks what you are willing to believe.',
      'Everything turns on this. Choose, and the world chooses with you.',
    ],
    reward: [
      'The unseen is generous tonight. Accept what is offered.',
      'A gift, from whom you will not learn. Keep it close.',
      'What was owed has been paid. The rest is for you to wonder at.',
    ],
    finale: [
      'The last piece falls into place, and the pattern is both smaller and stranger than you hoped.',
      'It ends as it began: quietly, and with more questions than answers.',
      'The veil lifts. For a moment, you see everything. Then it is gone, and you remember.',
    ],
  },
}

export const ANSWERS: Record<AnswerIntent, string[]> = {
  bold: ['Strike now, and strike hard.', 'We take it by force.', 'No hesitation. Forward!'],
  cautious: ['Wait and watch first.', 'Slowly. Let us not rush into this.', 'Gather more before we act.'],
  diplomatic: ['Let us talk first.', 'Offer terms. There may be another way.', 'Open a parley.'],
  greedy: ['What is in it for me?', 'Name your price.', 'There is profit in this.'],
  merciful: ['Spare them.', 'Show mercy. We are not monsters.', 'Let them go in peace.'],
  cunning: ['I have a better plan.', 'Let them think they are winning.', 'A trick may serve us better.'],
}

export const OUTCOMES: Record<AnswerIntent, string[]> = {
  bold: ['You act without delay. It costs something, but it works.', 'The charge breaks them. Few stand against such resolve.'],
  cautious: ['Patience pays. You learn what you needed before moving.', 'You hold back, and are glad of it.'],
  diplomatic: ['Words do what swords could not. An uneasy peace holds.', 'They listen, then agree. For now.'],
  greedy: ['A tidy bargain is struck. Everyone leaves with something.', 'Coin changes hands, and questions go unasked.'],
  merciful: ['They remember your kindness. It may matter later.', 'You let them go. Some call it weakness. Others will not forget it.'],
  cunning: ['The trick works better than expected.', 'They never see it coming.'],
}

/** Name of an object used when the map gives no display name. */
export function humanizeEntity(sid: string): string {
  return sid
    .replace(/^(E_|entity_|obj_)/i, '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
