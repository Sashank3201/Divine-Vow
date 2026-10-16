/** App copy: short and direct. */

export const LINES: string[] = [
  'Urges peak and pass. Wait it out.',
  'You have beaten every urge so far.',
  'One day at a time. Just today.',
  'The urge is temporary. Your progress is not.',
  'Feel it. Don’t act on it.',
  'Ten minutes. You can do ten minutes.',
  'Every no makes the next one easier.',
  'You decided. Now keep deciding.',
  'Bored, tired or lonely? Fix that instead.',
  'Get up and change the room you’re in.',
  'A slip is not a restart of who you are.',
  'Protect the streak. It’s yours.',
];

export const MOVES: string[] = [
  '20 push-ups. Or as many as you can.',
  'Cold water on your face. Twice.',
  'Walk outside for 5 minutes. Leave the phone.',
  'Drink a full glass of water.',
  'Text someone you trust.',
  '30 jumping jacks.',
  'Write down 3 things you’re grateful for.',
  'Take a cold shower. Even 30 seconds counts.',
  'Tidy one small space.',
  'Play a song you love, loud.',
  'Stretch for 2 minutes.',
  'Hold a plank for 45 seconds.',
  'Make tea. Drink it slowly.',
  'Leave the room you’re in.',
  '15 slow squats.',
  'Read one page of a book.',
];

export const SURF_PROMPTS: string[] = [
  'Notice the urge. Don’t fight it. Just watch it.',
  'Where do you feel it? Chest, hands, stomach?',
  'Breathe into that spot. Let it be there.',
  'Rate it 1 to 10. Notice it can change.',
  'It may get stronger first. That means it’s close to the peak.',
  'This is the peak. It feels permanent. It isn’t.',
  'You don’t have to do anything. Just breathe.',
  'You’re still here. It hasn’t won.',
  'Notice it starting to soften.',
  'Every minute it gets weaker.',
  'It’s fading. Let it go.',
  'Done. You rode it out.',
];

export const JOURNAL_PROMPTS: string[] = [
  'What triggered you today?',
  'When did you feel strongest?',
  'What helped?',
  'What will you do differently tomorrow?',
  'What are you getting back?',
  'What do you need more of this week?',
];

export const TRIGGERS = ['Stress', 'Boredom', 'Lonely', 'Late night', 'Tired', 'Anxious', 'Argument', 'Social media', 'Alone at home', 'Sad', 'Angry'];

export const MOODS = [
  { value: 1, label: 'Awful' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
] as const;

export function dailyPick<T>(items: readonly T[], salt = 0): T {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate() + salt;
  return items[n % items.length]!;
}
