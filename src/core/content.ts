/** Words to hold on to. Original lines unless attributed (public domain). */

export const AFFIRMATIONS: string[] = [
  'The pull is strongest when you are changing orbit.',
  'You are not your urges. You are the one who notices them.',
  'Every wave that rises also falls. Stay on your board.',
  'A craving is a visitor, not a resident.',
  'You have survived every single urge so far. Every one.',
  'Discipline is remembering what you want most, not what you want now.',
  'Small vows, kept daily, build a universe.',
  'The person you are becoming is watching how you handle this moment.',
  'You do not have to win the whole war tonight. Just this minute.',
  'Stars are made under pressure. So are you.',
  'Falling once does not erase the distance you have travelled.',
  'Your future self is already grateful.',
  'Urges come and go like weather. Your vow stays.',
  'Choose the hard thing that sets you free over the easy thing that keeps you small.',
  'Rest is allowed. Retreat is allowed. Giving up on yourself is not.',
  'Light travels for millions of years to reach you. You can wait fifteen minutes.',
  'What you resist with kindness loses its power.',
  'Every “no” to the old pattern is a “yes” to the new you.',
  'Progress is not a straight line. It is an orbit — and you keep coming back.',
  'Momentum is built in the moments nobody sees.',
  'One kept promise makes the next one easier.',
  'You are writing a story you will be proud to tell.',
  'Gravity is patient. So is growth.',
  'Galaxies take billions of years. Give yourself today.',
];

export const QUOTES: Array<{ text: string; by: string }> = [
  { text: 'We suffer more often in imagination than in reality.', by: 'Seneca' },
  { text: 'No man is free who is not master of himself.', by: 'Epictetus' },
  { text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
];

export const MOVES: string[] = [
  'Drop and do 20 push-ups — or as many as you can.',
  'Splash cold water on your face. Twice.',
  'Step outside and find five things you have never noticed.',
  'Drink a full glass of water, slowly.',
  'Text someone you love. Anything at all.',
  'Do 30 jumping jacks.',
  'Write down three things you are grateful for.',
  'Walk around the block. Leave your phone behind.',
  'Take a cold shower — even for 30 seconds.',
  'Tidy one small space: a desk, a shelf, a drawer.',
  'Put on the song that makes you feel unstoppable. Sing along.',
  'Stretch for two minutes: neck, shoulders, back, legs.',
  'Hold a plank for 45 seconds.',
  'Make a cup of tea and drink it with both hands.',
  'Leave the room you are in. Change your scenery.',
  'Do 15 slow squats, breathing out on every rise.',
  'Read one page of a book.',
  'Write a letter to your future self. Three lines is enough.',
  'Clench every muscle for five seconds, then let go. Repeat three times.',
  'Look out of a window and watch the sky for one minute.',
];

export const SURF_PROMPTS: string[] = [
  'Notice the urge. Do not push it away. Just watch it, like a wave rolling in.',
  'Where do you feel it in your body? Your chest, your hands, your stomach?',
  'Breathe into that place. Let it be there without obeying it.',
  'Give it a number from one to ten. Notice that the number can change.',
  'It may be getting stronger. That means it is close to its crest.',
  'This is the peak. It feels permanent. It is not.',
  'Stay on your board. You do not have to do anything except breathe.',
  'Notice: you are still here. The wave has not taken you.',
  'Feel it beginning to soften, even a little.',
  'Every second you ride it, it loses strength.',
  'The wave is falling now. Let it go back to the sea.',
  'You surfed it. Remember this feeling — you can do it again.',
];

export const JOURNAL_PROMPTS: string[] = [
  'What did the pull want you to believe today?',
  'When did you feel strongest today?',
  'What was happening right before the urge arrived?',
  'What would you tell a friend fighting the same battle?',
  'What are you starting to get back?',
  'Describe the person you are becoming in three words.',
  'What is one small thing you are proud of today?',
  'What do you need more of this week?',
];

export const TRIGGERS = ['Stress', 'Boredom', 'Loneliness', 'Late night', 'Tired', 'Anxious', 'After an argument', 'Social media', 'Celebration', 'Alone at home', 'Sad', 'Angry'];

export const MOODS = [
  { value: 1, label: 'Heavy', color: 'radial-gradient(circle at 35% 30%, #a3a8c9, #3c3f62)' },
  { value: 2, label: 'Low', color: 'radial-gradient(circle at 35% 30%, #b6c7ff, #4458a8)' },
  { value: 3, label: 'Steady', color: 'radial-gradient(circle at 35% 30%, #c9fff2, #2f9e8c)' },
  { value: 4, label: 'Good', color: 'radial-gradient(circle at 35% 30%, #fff1cc, #d9a24f)' },
  { value: 5, label: 'Radiant', color: 'radial-gradient(circle at 35% 30%, #ffffff, #ffcf7a 40%, #ff7fb4)' },
] as const;

export function dailyPick<T>(items: readonly T[], salt = 0): T {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate() + salt;
  return items[n % items.length]!;
}
