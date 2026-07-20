/**
 * One-off generator: scripts/gen-player-cn-map.mjs → src/renderer/worldcup/player-cn-map.js
 * Run: node scripts/gen-player-cn-map.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const SQUAD_FILES = [
  'src/renderer/worldcup/squads-data.js',
  'src/renderer/worldcup/squads-data-g3g6.js',
  'src/renderer/worldcup/squads-data-g7g9.js',
  'src/renderer/worldcup/squads-data-g10g12.js',
];

/** @type {Record<string, string>} CCTV / 新华 / FIFA 常用译名 */
const KNOWN = JSON.parse(
  readFileSync(join(__dir, 'player-cn-known.json'), 'utf8'),
);

const KR_SUR = {
  Kim: '金', Lee: '李', Park: '朴', Choi: '崔', Jung: '郑', Kang: '姜', Cho: '赵',
  Yoon: '尹', Jang: '张', Han: '韩', Seo: '徐', Shin: '申', Kwon: '权', Hwang: '黄',
  Son: '孙', Oh: '吴', Jeong: '郑', Bae: '裴', Baek: '白', Yang: '梁', Eom: '严',
  Song: '宋', Jo: '赵', Paik: '白', Hwang2: '黄', Seol: '薛', Jens: '延斯',
};

const JP_SUR = {
  Endo: '远藤', Ito: '伊藤', Itakura: '板仓', Suzuki: '铃木', Tanaka: '田中',
  Yamamoto: '山本', Watanabe: '渡边', Nagatomo: '长友', Tomiyasu: '富安',
  Kamada: '镰田', Doan: '堂安', Kubo: '久保', Maeda: '前田', Ueda: '上田',
  Nakamura: '中村', Sano: '佐野', Taniguchi: '谷口', Sugawara: '菅原',
  Seko: '濑古', Hayakawa: '早川', Osako: '大迫', Goto: '后藤', Ogawa: '小川',
  Shiogai: '盐越',
};

const WORD = {
  al: '阿尔', el: '埃尔', ben: '本', ibn: '伊本', de: '德', da: '达', di: '迪',
  van: '范', von: '冯', del: '德尔', la: '拉', le: '勒', mc: '麦克', mac: '麦克',
  saint: '圣', st: '圣', o: "奥'", san: '圣',
  mohamed: '穆罕默德', mohammed: '穆罕默德', muhammad: '穆罕默德', ahmed: '艾哈迈德',
  ali: '阿里', abdul: '阿卜杜勒', abdullah: '阿卜杜拉', hassan: '哈桑', hussein: '侯赛因',
  ibrahim: '易卜拉欣', omar: '奥马尔', youssef: '优素福', karim: '卡里姆',
  james: '詹姆斯', john: '约翰', michael: '迈克尔', david: '大卫', robert: '罗伯特',
  william: '威廉', richard: '理查德', thomas: '托马斯', charles: '查尔斯',
  daniel: '丹尼尔', matthew: '马修', anthony: '安东尼', mark: '马克', paul: '保罗',
  andrew: '安德鲁', joshua: '约书亚', kevin: '凯文', brian: '布赖恩', george: '乔治',
  edward: '爱德华', ronald: '罗纳德', timothy: '蒂莫西', jason: '杰森', jeffrey: '杰弗里',
  ryan: '瑞安', jacob: '雅各布', gary: '加里', nicholas: '尼古拉斯', eric: '埃里克',
  jonathan: '乔纳森', stephen: '斯蒂芬', larry: '拉里', justin: '贾斯汀', scott: '斯科特',
  brandon: '布兰登', benjamin: '本杰明', samuel: '塞缪尔', raymond: '雷蒙德',
  gregory: '格雷戈里', frank: '弗兰克', alexander: '亚历山大', patrick: '帕特里克',
  jack: '杰克', dennis: '丹尼斯', jerry: '杰里', tyler: '泰勒', aaron: '阿隆',
  jose: '何塞', carlos: '卡洛斯', juan: '胡安', luis: '路易斯', jorge: '豪尔赫',
  miguel: '米格尔', francisco: '弗朗西斯科', pedro: '佩德罗', diego: '迭戈',
  fernando: '费尔南多', ricardo: '里卡多', eduardo: '爱德华多', sergio: '塞尔吉奥',
  marco: '马尔科', luca: '卢卡', lucas: '卢卡斯', mario: '马里奥', giovanni: '乔瓦尼',
  francesco: '弗朗切斯科', alessandro: '亚历桑德罗', andrea: '安德烈亚', matteo: '马泰奥',
  lorenzo: '洛伦佐', stefano: '斯特凡诺', nicola: '尼古拉', fabio: '法比奥',
  piero: '皮耶罗', marcello: '马切洛', giuseppe: '朱塞佩', antonio: '安东尼奥',
  manuel: '曼努埃尔', pablo: '巴勃罗', raul: '劳尔', julian: '胡利安', angel: '安赫尔',
  ivan: '伊万', nikola: '尼古拉', luka: '卢卡', marko: '马尔科', dusan: '杜尚',
  stefan: '斯特凡', milan: '米兰', tomislav: '托米斯拉夫', josip: '约西普', domagoj: '多米agol',
  mateo: '马特奥', dominik: '多米尼克', jan: '扬', tomas: '托马斯', pavel: '帕维尔',
  martin: '马丁', lukas: '卢卡斯', michal: '米哈尔', adam: '亚当', jakub: '雅库布',
  piotr: '彼得', krzysztof: '克日什托夫', wojciech: '沃伊切赫', marcin: '马尔钦',
  hans: '汉斯', klaus: '克劳斯', stefan2: '斯特凡', florian: '弗洛里安', maximilian: '马克西米利安',
  felix: '费利克斯', leon: '莱昂', timo: '蒂莫', jonas: '约纳斯', nico: '尼科',
  kai: '凯', leroy: '勒罗伊', joshua2: '约书亚', jamal: '贾马尔', leroy2: '勒罗伊',
  harry: '哈里', jordan: '乔丹', harry2: '哈里', kyle: '凯尔', liam: '利亚姆',
  mason: '梅森', noah: '诺亚', ethan: '伊桑', logan: '洛根', owen: '欧文',
  sebastian: '塞巴斯蒂安', henry: '亨利', oscar: '奥斯卡', arthur: '阿瑟', theo: '西奥',
  hugo: '雨果', louis: '路易', arthur2: '阿thur', gabriel: '加布里埃尔', raphael: '拉斐尔',
  julien: '朱利安', maxime: '马克西姆', clement: '克莱芒', remy: '雷米', yann: '扬',
  olivier: '奥利维耶', antoine: '安托万', nicolas: '尼古拉', alexis: '亚历克西斯',
  bruno: '布鲁诺', bernardo: '贝尔纳多', joao: '若昂', rui: '鲁伊', nuno: '努诺',
  goncalo: '贡萨洛', diogo: '迪奥戈', ruben: '鲁本', tiago: '蒂亚戈', andre: '安德烈',
  pedro2: '佩德罗', miguel2: '米格尔', rafael: '拉斐尔', marcos: '马科斯', rodrigo: '罗德里戈',
  enzo: '恩佐', lionel: '利昂内尔', angel2: '安赫尔', nicolas2: '尼古拉斯',
  cristian: '克里斯蒂安', gonzalo: '贡萨洛', lautaro: '劳塔罗', julian2: '胡利安',
  emiliano: '埃米利亚诺', facundo: '法昆多', nahuel: '纳韦尔', maxi: '马克西',
  erling: '埃尔林', martin2: '马丁', ole: 'Ole', kristian: '克里斯蒂安',
  sadio: '萨迪奥', kalidou: '卡利杜', edouard: '爱德华', idrissa: '伊德里萨',
  ismaila: '伊斯梅拉', nicolas3: '尼古拉斯', bamba: '班巴', cherif: '谢里夫',
  heung: '兴', min: '慜', kang: '刚', in: '仁', jae: '在', sung: '成', hyun: '贤',
  gu: '圭', gyu: '圭', woo: '宇', beom: '范', chan: '灿', hee: '熙', seung: '承',
  tae: '泰', hwan: '焕', moon: '文', jin: '珍', gi: '基', dong: '东', yeon: '延',
  messi: '梅西', neymar: '内马尔', mbappe: '姆巴佩', ronaldo: 'C罗',
  modric: '莫德里奇', kroos: '克罗斯', benzema: '本泽马', haaland: '哈兰德',
  salah: '萨拉赫', kane: '凯恩', debruyne: '德布劳内', vinicius: '维尼修斯',
  bellingham: '贝林厄姆', rodri: '罗德里', pedri: '佩德里', gavi: '加维',
  casemiro: '卡塞米罗', alisson: '阿利松', ederson: '埃德森', neuer: '诺伊尔',
  courtois: '库尔图瓦', hakimi: '阿什拉夫',
  son: '孙', kimmich: '基米希', musiala: '穆西亚拉', wirtz: '维尔茨',
  saka: '萨卡', rice: '赖斯', foden: '福登', grealish: '格拉利什',
  rashford: '拉什福德', sancho: '桑乔', mount: '芒特', sterling: '斯特林',
  pulisic: '普利西奇', reyna: '雷纳', mckennie: '麦肯尼', adams: '亚当斯',
  davies: '戴维斯', david2: '戴维', larin: '拉林', buchanan: '布坎南',
  chavez: '查韦斯', lozano: '洛萨诺', jimenez: '希门尼斯', ochoa: '奥乔亚',
  alvarez: '阿尔瓦雷斯', fernandez: '费尔南德斯', martinez: '马丁内斯',
  romero: '罗梅罗', otamendi: '奥塔门迪', maria: '马里亚',
  dybala: '迪巴拉', dybala2: '迪巴拉', acuna: '阿库尼亚', paredes: '帕雷德斯',
  depaul: '德保罗', macallister: '麦卡利斯特', alvarez2: '阿尔瓦雷斯',
  fernandez2: '恩佐', messi2: '梅西', dimaria: '迪马利亚',
};

const SUFFIX = [
  ['ovich', '奥维奇'], ['evic', '埃维奇'], ['ovic', '奥维奇'], ['ovic', '维奇'],
  ['ski', '斯基'], ['sky', '斯基'], ['cz', '奇'], ['ski', '斯基'],
  ['ez', '斯'], ['es', '斯'], ['as', '阿斯'], ['os', '奥斯'], ['is', '伊斯'],
  ['us', '乌斯'], ['ius', '乌斯'], ['ius', '尤斯'], ['ian', '安'], ['yan', '扬'],
  ['sen', '森'], ['sson', '松'], ['son', '松'], ['berg', '贝里'], ['strom', '斯特伦'],
  ['mann', '曼'], ['stein', '施泰因'], ['feld', '费尔德'], ['bach', '巴赫'],
  ['heim', '海姆'], ['hausen', '豪森'], ['ovic', '维奇'], ['ic', '奇'], ['ich', '奇'],
  ['ak', '阿克'], ['ek', '切克'], ['ik', '克'], ['uk', '乌克'], ['cz', '茨'],
  ['ski', '斯基'], ['wicz', '维奇'], ['czyk', '奇克'], ['ny', '尼'], ['ty', '蒂'],
  ['ky', '基'], ['ay', '伊'], ['ey', '伊'], ['oy', '奥伊'], ['uy', '乌伊'],
  ['ez', '斯'], ['az', '斯'], ['iz', '斯'], ['oz', '斯'], ['uz', '斯'],
  ['ino', '诺'], ['ano', '诺'], ['eno', '诺'], ['inho', '尼奥'], ['ao', '昂'],
  ['ao', '奥'], ['ia', '亚'], ['io', '奥'], ['eo', '欧'], ['eu', '厄'],
  ['el', '埃尔'], ['al', '阿尔'], ['il', '伊尔'], ['ol', '奥尔'], ['ul', '乌尔'],
  ['er', '尔'], ['ar', '阿尔'], ['or', '奥尔'], ['ir', '伊尔'], ['ur', '乌尔'],
  ['en', '恩'], ['an', '安'], ['on', '翁'], ['in', '因'], ['un', '温'],
  ['ez', '斯'], ['es', '斯'], ['as', '斯'], ['os', '斯'], ['is', '斯'],
];

function extractNames() {
  const names = new Set();
  for (const rel of SQUAD_FILES) {
    const content = readFileSync(join(root, rel), 'utf8');
    const re = /name:\s*'((?:\\'|[^'])*)'|name:\s*"((?:\\"|[^"])*)"/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      names.add((m[1] || m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
    }
  }
  return [...names].sort();
}

function isTbd(name) {
  return /^TBD-\d+$/.test(name);
}

function isKorean(name) {
  return /^(Kim|Lee|Park|Cho|Hwang|Son|Oh|Paik|Bae|Yang|Eom|Seol|Song|Jo)\s/.test(name)
    || /-[A-Z]/.test(name) && /(Kim|Lee|Park|Cho|Hwang|Son|Oh|Paik|Bae|Yang|Eom|Seol|Song|Jo)/.test(name);
}

function transliterateToken(token) {
  const lower = token.toLowerCase().replace(/[^a-z']/g, '');
  if (!lower) return token;
  if (WORD[lower]) return WORD[lower];
  if (lower.length <= 2) {
    return [...lower].map((c) => ({
      a: '阿', b: '布', c: '克', d: '德', e: '埃', f: '夫', g: '格', h: '赫',
      i: '伊', j: '杰', k: '克', l: '尔', m: '姆', n: '恩', o: '奥', p: '普',
      q: '克', r: '尔', s: '斯', t: '特', u: '乌', v: '夫', w: '韦', x: '克斯',
      y: '伊', z: '兹',
    }[c] || c)).join('');
  }
  for (const [suf, zh] of SUFFIX) {
    if (lower.endsWith(suf) && lower.length > suf.length + 1) {
      const stem = lower.slice(0, -suf.length);
      const stemZh = transliterateToken(stem);
      if (stemZh !== stem) return stemZh + zh;
    }
  }
  const chunks = lower.match(/[bcdfghjklmnpqrstvwxyz]*[aeiouy]+/gi) || [lower];
  return chunks.map((sy) => {
    const s = sy.toLowerCase();
    if (WORD[s]) return WORD[s];
    const map = {
      sch: '施', ch: '奇', sh: '什', th: '思', ph: '夫', gh: '格', ck: '克',
      qu: '奎', wh: '惠', ng: '恩', nk: '恩克', tch: '奇', dge: '奇',
      ai: '艾', ay: '伊', ea: '伊', ee: '伊', ei: '艾', ie: '伊', oa: '奥',
      oo: '乌', ou: '乌', ow: '奥', ue: '乌', ui: '威', au: '奥', aw: '奥',
      ar: '阿尔', er: '尔', ir: '伊尔', or: '奥尔', ur: '乌尔',
      an: '安', en: '恩', in: '因', on: '翁', un: '温',
      al: '阿尔', el: '埃尔', il: '伊尔', ol: '奥尔', ul: '乌尔',
      ba: '巴', be: '贝', bi: '比', bo: '博', bu: '布', ca: '卡', ce: '塞',
      ci: '奇', co: '科', cu: '库', da: '达', de: '德', di: '迪', do: '多',
      du: '杜', fa: '法', fe: '费', fi: '菲', fo: '福', fu: '富', ga: '加',
      ge: '格', gi: '吉', go: '戈', gu: '古', ha: '哈', he: '赫', hi: '希',
      ho: '霍', hu: '胡', ja: '贾', je: '耶', ji: '吉', jo: '乔', ju: '朱',
      ka: '卡', ke: '凯', ki: '基', ko: '科', ku: '库', la: '拉', le: '勒',
      li: '利', lo: '洛', lu: '卢', ma: '马', me: '梅', mi: '米', mo: '莫',
      mu: '穆', na: '纳', ne: '内', ni: '尼', no: '诺', nu: '努', pa: '帕',
      pe: '佩', pi: '皮', po: '波', pu: '普', ra: '拉', re: '雷', ri: '里',
      ro: '罗', ru: '鲁', sa: '萨', se: '塞', si: '西', so: '索', su: '苏',
      ta: '塔', te: '特', ti: '蒂', to: '托', tu: '图', va: '瓦', ve: '韦',
      vi: '维', vo: '沃', vu: '武', wa: '瓦', we: '韦', wi: '维', wo: '沃',
      ya: '亚', ye: '耶', yi: '伊', yo: '约', yu: '尤', za: '扎', ze: '泽',
      zi: '齐', zo: '佐', zu: '祖',
    };
    for (const [k, v] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) {
      if (s.startsWith(k)) return v + transliterateToken(s.slice(k.length));
    }
    return s.split('').map((c) => ({
      a: '阿', b: '布', c: '克', d: '德', e: '埃', f: '夫', g: '格', h: '赫',
      i: '伊', j: '杰', k: '克', l: '尔', m: '姆', n: '恩', o: '奥', p: '普',
      q: '克', r: '尔', s: '斯', t: '特', u: '乌', v: '夫', w: '韦', x: '克斯',
      y: '伊', z: '兹',
    }[c] || '')).join('');
  }).join('');
}

function transliterateWestern(name) {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  const zhParts = parts.map((p) => {
    if (p.includes("'")) {
      return p.split("'").map(transliterateToken).join('');
    }
    return transliterateToken(p);
  });
  if (zhParts.length === 1) return zhParts[0];
  if (zhParts.length === 2) return `${zhParts[0]}·${zhParts[1]}`;
  return zhParts.join('·');
}

function transliterateKorean(name) {
  if (KNOWN[name]) return KNOWN[name];
  const parts = name.split(/[\s-]+/);
  const sur = KR_SUR[parts[0]] || transliterateToken(parts[0]);
  const given = parts.slice(1).map((p) => transliterateToken(p)).join('');
  return sur + given;
}

function toChinese(name) {
  if (isTbd(name)) return name;
  if (KNOWN[name]) return KNOWN[name];
  if (isKorean(name)) return transliterateKorean(name);
  const jp = name.split(/\s+/);
  if (jp.length === 2 && JP_SUR[jp[0]]) {
    return JP_SUR[jp[0]] + transliterateToken(jp[1]);
  }
  if (/^Al[-\s]|^Mohamed|^Ahmed|^Abdul|^Ali\s|^Karim\s|^Hassan\s|^Hussein\s|^Ibrahim\s|^Omar\s|^Youssef\s|^Mahmoud\s|^Mustafa\s|^Osman\s|^Salem\s|^Nasser\s|^Abdullah\s|^Firas\s|^Musab\s|^Ziyad\s|^Jehad\s|^Abdulelah\s|^Moteb\s|^Nawaf\s|^Khalid\s|^Ayman\s|^Assim\s|^Akram\s|^Almoez\s|^Boualem\s|^Homam\s|^Jassim\s|^Edmilson\s|^Tahseen\s|^Ayoub\s|^Achraf\s|^Nayef\s|^Youssef\s|^Soufiane\s|^Abdessamad\s|^Yassine\s|^Munir\s|^Sofyan\s|^Azzedine\s|^Ismael\s|^Bilal\s|^Neil\s|^Ayyoub\s|^Redouane\s|^Anass\s|^Chadi\s|^Zakaria\s|^Noussair\s|^Issa\s|^Amir\s|^Aria\s|^Alireza\s|^Seyed\s|^Payam\s|^Danial\s|^Ehsan\s|^Saleh\s|^Hossein\s|^Shoja\s|^Milad\s|^Ramin\s|^Rouzbeh\s|^Saeid\s|^Mehdi\s|^Saman\s|^Mohammad\s|^Amirhossein\s|^Dennis Eckert/i.test(name)) {
    return transliterateWestern(name.replace(/Al-/g, 'Al ').replace(/-/g, ' '));
  }
  return transliterateWestern(name);
}

function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function main() {
  const names = extractNames();
  const map = {};
  for (const name of names) {
    map[name] = toChinese(name);
  }
  const lines = [
    '/**',
    ' * src/renderer/worldcup/player-cn-map.js',
    ' *',
    ' * 球员英文名 → 简体中文译名',
    ' * 知名球员: CCTV / 新华体育 / FIFA 中文常用译',
    ' * 其余: 按姓名来源音译 (斯拉夫 / 德语 / 西语 / 阿语等)',
    ' *',
    ' * 生成: node scripts/gen-player-cn-map.mjs',
    ' */',
    '',
    'export const PLAYER_CN = {',
  ];
  for (const name of names) {
    lines.push(`  '${escapeJs(name)}': '${escapeJs(map[name])}',`);
  }
  lines.push('};', '');
  const out = join(root, 'src/renderer/worldcup/player-cn-map.js');
  writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`Wrote ${names.length} entries → ${out}`);
}

main();
