// Rule-based classification (keywords, CPV codes, NUTS/ITL region codes and postcodes).
// No AI: every decision here can be read and adjusted by editing these lists.

const LONDON_BOROUGHS = [
  'London', 'City of London', 'Westminster', 'Camden', 'Islington', 'Hackney', 'Tower Hamlets', 'Southwark', 'Lambeth',
  'Wandsworth', 'Hammersmith', 'Fulham', 'Kensington', 'Chelsea', 'Brent', 'Ealing', 'Hounslow', 'Richmond upon Thames',
  'Kingston upon Thames', 'Merton', 'Sutton', 'Croydon', 'Bromley', 'Lewisham', 'Greenwich', 'Bexley', 'Havering',
  'Barking', 'Dagenham', 'Redbridge', 'Newham', 'Waltham Forest', 'Haringey', 'Enfield', 'Barnet', 'Harrow', 'Hillingdon',
  'Spitalfields', 'Shoreditch', 'Stratford', 'Canary Wharf', 'Wood Green', 'Battersea', 'Nine Elms', 'Old Oak', 'Park Royal',
  'Royal Docks', 'Olympic Park', 'Elephant and Castle', 'Kings Cross', "King's Cross", 'Paddington', 'Euston', 'Whitechapel',
  'Brixton', 'Peckham', 'Deptford', 'Woolwich', 'Thamesmead', 'Wembley', 'Tottenham', 'Walthamstow', 'Holborn', 'Mayfair',
  'Soho', 'Bloomsbury', 'Clerkenwell', 'Southbank', 'South Bank', 'Bankside', 'TfL', 'GLA', 'Greater London',
];
const SOUTH_EAST = [
  'South East', 'Kent', 'Surrey', 'Sussex', 'Hampshire', 'Oxfordshire', 'Berkshire', 'Buckinghamshire', 'Isle of Wight',
  'Brighton', 'Hove', 'Oxford', 'Reading', 'Slough', 'Guildford', 'Woking', 'Crawley', 'Canterbury', 'Maidstone', 'Dover',
  'Folkestone', 'Ashford', 'Medway', 'Chatham', 'Rochester', 'Southampton', 'Portsmouth', 'Winchester', 'Basingstoke',
  'Milton Keynes', 'Aylesbury', 'High Wycombe', 'Bracknell', 'Windsor', 'Maidenhead', 'Wokingham', 'Newbury', 'Eastbourne',
  'Hastings', 'Worthing', 'Chichester', 'Horsham', 'Tunbridge Wells', 'Sevenoaks', 'Margate', 'Ramsgate', 'Thanet',
  'Epsom', 'Reigate', 'Redhill', 'Farnham', 'New Forest', 'South Downs', 'Gatwick',
];
const word = (list) => new RegExp(`\\b(${list.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
const LONDON_RE = word(LONDON_BOROUGHS);
const SE_RE = word(SOUTH_EAST);
// Inner + outer London postcode areas (Greater London)
const LONDON_POSTCODE = /^(EC|WC|E|N|NW|SE|SW|W|BR|CR|EN|HA|IG|RM|SM|TW|UB)\d/i;
const SE_POSTCODE = /^(BN|CT|GU|ME|MK|OX|PO|RG|RH|SL|SO|TN|HP)\d/i;

// region codes: NUTS (UKI London, UKJ South East) and the newer ITL (TLI, TLJ) used by Procurement Act notices.
export function regionFromCodes(codes = []) {
  for (const c of codes) {
    const s = String(c || '').toUpperCase().replace(/\s/g, '');
    if (/^(UKI|TLI)/.test(s)) return 'London';
    if (/^(UKJ|TLJ)/.test(s)) return 'South East';
  }
  return '';
}

export function regionFromPostcode(pc = '') {
  const s = String(pc).trim();
  if (LONDON_POSTCODE.test(s)) return 'London';
  if (SE_POSTCODE.test(s)) return 'South East';
  return '';
}

export function regionFromText(text = '') {
  if (LONDON_RE.test(text)) return 'London';
  if (SE_RE.test(text)) return 'South East';
  return '';
}

// Notices that obviously cover the whole UK (frameworks etc.) are kept as "National".
export function isNationalScope(codes = [], text = '') {
  return codes.some((c) => /^(UK|TL)$/i.test(String(c).trim())) || /\b(national|nationwide|UK-wide|across the UK|England-wide)\b/i.test(text);
}

const STUDENT_RE = /(student[- ]only|student competition|students? (design )?(contest|competition|award|prize)|student charrette|undergraduate competition|scholarship|year[ -]out design|for students\b)/i;
export const isStudent = (text = '') => STUDENT_RE.test(text);

export function groupFor(text = '') {
  if (/\b(heritage|listed( building)?|conservation|grade (i|ii|ii\*)|historic|restoration|church|synagogue|cathedral|museum|almshouse)\b/i.test(text)) return 'Heritage';
  if (/\b(public realm|landscape|streetscape|placemaking|place-making|park|square|high street|garden|pavilion|playground|wayfinding|active travel)\b/i.test(text)) return 'Public realm';
  if (/\b(competition|contest|open call|ideas call|design challenge|expressions? of interest from (architects|designers))\b/i.test(text)) return 'Competition';
  if (/\b(feasibility|options? (appraisal|study)|masterplan|master plan|study|strategy|pre-market|market engagement|prior information|estate plan|design guide|toolkit|capacity study|vision)\b/i.test(text)) return 'Feasibility';
  return 'Delivery';
}

// CPV 71 sub-divisions that are architecture-led vs engineering/inspection-led.
const ARCH_CPV = /^(712|714|7124|7125)/;
const ENGINEERING_CPV = /^(713|715|716|717|718|719)/;

const HIGH_WORDS = /\b(architect(ural|s)?|lead designer|design team|multi-?disciplinary|retrofit|refurbishment|workplace|office|mixed[- ]use|regeneration|masterplan|feasibility|heritage|listed|conservation|public realm|interior design|RIBA stage)\b/i;
const LOW_WORDS = /\b(survey(ing|s)? only|asbestos|fire risk assessment|CCTV|drainage|highway maintenance|electrical testing|lift maintenance|legionella|soil|geotechnical|traffic count|quantity surveying only|structural inspection|bridge inspection)\b/i;

// Returns one of High | Medium | Conditional | Adjacent
export function fitFor({ text = '', cpvs = [], kind = 'tender' }) {
  const arch = cpvs.some((c) => ARCH_CPV.test(c));
  const eng = cpvs.length > 0 && cpvs.every((c) => ENGINEERING_CPV.test(c));
  const words = HIGH_WORDS.test(text);
  if (LOW_WORDS.test(text) && !words) return 'Adjacent';
  if (kind === 'press') {
    if (/\b(artist|art commission|public art|graphic)\b/i.test(text) && !/architect/i.test(text)) return 'Adjacent';
    return words ? 'Medium' : 'Conditional';
  }
  if (arch && words) return 'High';
  if (arch || words) return 'Medium';
  if (eng) return 'Adjacent';
  return 'Conditional';
}

export function tagsFor(text = '') {
  const t = [];
  const add = (re, label) => { if (re.test(text) && !t.includes(label)) t.push(label); };
  add(/framework/i, 'Framework');
  add(/retrofit|refurb/i, 'Retrofit');
  add(/workplace|office/i, 'Workplace');
  add(/mixed[- ]use/i, 'Mixed-use');
  add(/housing|residential|homes/i, 'Housing');
  add(/school|education|universit|college/i, 'Education');
  add(/health|hospital|NHS|clinic/i, 'Healthcare');
  add(/heritage|listed|conservation/i, 'Heritage');
  add(/public realm|landscape|park|street/i, 'Public realm');
  add(/masterplan/i, 'Masterplanning');
  add(/feasibility|study/i, 'Feasibility');
  add(/competition|contest|open call/i, 'Competition');
  add(/interior/i, 'Interiors');
  add(/sustainab|net zero|carbon/i, 'Net zero');
  return t.slice(0, 5);
}

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const DEADLINE_RE = new RegExp(
  `(?:deadline|closes?|closing date|close on|submissions? (?:due|by)|entries (?:due|by)|apply by|register by|due)[^0-9]{0,25}?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\.?(?:,?\\s+(20\\d\\d))?`,
  'i'
);

// Pull a deadline like "closes on 30 April" out of press text. Returns YYYY-MM-DD or ''.
export function deadlineFromText(text = '', referenceDate = new Date()) {
  const m = String(text).match(DEADLINE_RE);
  if (!m) return '';
  const monthIndex = MONTHS.split('|').findIndex((x) => x === m[2].toLowerCase());
  const month = (monthIndex < 12 ? monthIndex : [0, 1, 2, 3, 5, 6, 7, 8, 8, 9, 10, 11][monthIndex - 12]);
  let year = m[3] ? Number(m[3]) : referenceDate.getUTCFullYear();
  let d = new Date(Date.UTC(year, month, Number(m[1]), 12));
  // A date without a year that is well in the past most likely refers to next year.
  if (!m[3] && d.getTime() < referenceDate.getTime() - 60 * 86400000) d = new Date(Date.UTC(year + 1, month, Number(m[1]), 12));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function formatMoney(amount, currency = 'GBP') {
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(Number(amount))) return '';
  const n = Number(amount);
  if (!n) return '';
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency + ' ';
  if (n >= 1e6) return `${sym}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/\.?0+$/, '')}m`;
  if (n >= 1e3) return `${sym}${Math.round(n / 1e3)}k`;
  return `${sym}${Math.round(n)}`;
}
