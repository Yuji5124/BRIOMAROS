/**
 * ドット絵はすべて文字列で定義（1文字 = 1ピクセル、'.' は透明）。
 * 文字はパレットのキー（palette.ts）。媒体ごとにパレットを差し替えるだけで同一人物に見える。
 */
const HERO_TOP = [
  '...hhHHHh...',
  '..hHHHHHHHh.',
  '.yYYYYYYYGG.',
  '.hHSSSSSSGG.',
  'hHHSSSSESS..',
  '.hSSSSSESSs.',
  '..sSSSSSSs..',
  '...WWWWWW...',
];
const BODY_IDLE = ['..TTWCCTTK..', '.KTTTCCTTK..', '.KtDDDDDDt..'];
const BODY_PUNCH = ['..TTWCCTTTKK', '..TTTCCTTTKK', '..tDDDDDDt..'];
const BODY_JUMP = ['.KTTWCCTTKK.', '..TTTCCTT...', '..tDDDDDDt..'];
const LEGS_IDLE = ['..PPPPPPPP..', '..PPP..PPP..', '..bbb..bbb..', '.BBBB..BBBB.', '.BBBB..BBBB.'];
const LEGS_RUN_A = ['..PPPPPPP...', '.PPP...PPP..', 'bbb.....bbb.', 'BBB....BBBB.', 'BB.....BBBB.'];
const LEGS_RUN_B = ['..PPPPPPP...', '...PPPPP....', '...bbbbb....', '..BBBBBBB...', '..BBBBBB....'];
const LEGS_RUN_C = ['...PPPPPPP..', '..PPP...PPP.', '.bbb.....bbb', '.BBBB....BBB', '.BBBB.....BB'];
const LEGS_JUMP = ['..PPPPPPPP..', '..PPP.PPP...', '.bbb...bbb..', 'BBBB..BBBB..', 'BBB....BBB..'];

export const HERO = {
  idle: [...HERO_TOP, ...BODY_IDLE, ...LEGS_IDLE],
  runA: [...HERO_TOP, ...BODY_IDLE, ...LEGS_RUN_A],
  runB: [...HERO_TOP, ...BODY_IDLE, ...LEGS_RUN_B],
  runC: [...HERO_TOP, ...BODY_IDLE, ...LEGS_RUN_C],
  jump: [...HERO_TOP, ...BODY_JUMP, ...LEGS_JUMP],
  punch: [...HERO_TOP, ...BODY_PUNCH, ...LEGS_IDLE],
  punchAir: [...HERO_TOP, ...BODY_PUNCH, ...LEGS_JUMP],
};

export const KURIBOT = {
  walkA: [
    '......A.......',
    '......a.......',
    '....RRRRRR....',
    '..RRRRRRRRRR..',
    '.RRrRRRRRRrRR.',
    '.RwweRRRRwweR.',
    'RRwweRRRRwweRR',
    'RRRRRRRRRRRRRR',
    '.rrrrrrrrrrrr.',
    '..gggggggggg..',
    '...KK....KK...',
    '..KKK....KKK..',
  ],
  walkB: [
    '.......A......',
    '......a.......',
    '....RRRRRR....',
    '..RRRRRRRRRR..',
    '.RRrRRRRRRrRR.',
    '.RwweRRRRwweR.',
    'RRwweRRRRwweRR',
    'RRRRRRRRRRRRRR',
    '.rrrrrrrrrrrr.',
    '..gggggggggg..',
    '....KK..KK....',
    '...KKK..KKK...',
  ],
  squash: ['..............', '.RRRRRRRRRRRR.', 'RRwweRRRRwweRR', 'rrrrrrrrrrrrrr', 'gggggggggggggg', 'KKK........KKK'],
};

export const COIN = [
  ['..cccc..', '.cCCCCc.', 'cCCLCCCc', 'cCCLCCCc', 'cCCLCCCc', 'cCCLCCCc', 'cCCLCCCc', 'cCCCCCCc', '.cCCCCc.', '..cccc..'],
  ['...cc...', '..cCCc..', '..cLCc..', '..cLCc..', '..cLCc..', '..cLCc..', '..cLCc..', '..cCCc..', '..cCCc..', '...cc...'],
  ['...cc...', '...cc...', '...Lc...', '...Lc...', '...Lc...', '...Lc...', '...Lc...', '...cc...', '...cc...', '...cc...'],
];
/** COIN 用のキー読み替え */
export const COIN_KEYS: Record<string, string> = { c: 'coinDark', C: 'coin', L: 'coinLight' };

export const CARTRIDGE = [
  '.xxxxxxxxxx.',
  'xXXXXXXXXXXx',
  'xXllllllllXx',
  'xXlLLLLLLlXx',
  'xXlLLLLLLlXx',
  'xXlLLLLLLlXx',
  'xXllllllllXx',
  'xXXXXXXXXXXx',
  'xXXoXXXXoXXx',
  'xXXXXXXXXXXx',
  '.xGGGGGGGGx.',
  '.xG.G.G.Gx..',
];
export const CART_KEYS: Record<string, string> = { x: 'black', X: 'stoneLight', l: 'stoneDark', L: 'sky', o: 'red', G: 'coin' };
