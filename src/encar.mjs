import axios from 'axios';

const ENCAR_API = 'https://api.encar.com';
const ENCAR_CDN = 'https://ci.encar.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const BRAND_MAP = {
  '현대': 'Hyundai',
  '기아': 'Kia',
  '제네시스': 'Genesis',
  '쉐보레(GM대우)': 'Chevrolet',
  '쉐보레': 'Chevrolet',
  '르노코리아(삼성)': 'Renault Korea',
  '르노코리아': 'Renault Korea',
  '쌍용': 'KG Mobility',
  'KG모빌리티(쌍용)': 'KG Mobility',
  'KG모빌리티': 'KG Mobility',
  '벤츠': 'Mercedes-Benz',
  '아우디': 'Audi',
  '폭스바겐': 'Volkswagen',
  '포르쉐': 'Porsche',
  '볼보': 'Volvo',
  '토요타': 'Toyota',
  '도요타': 'Toyota',
  '렉서스': 'Lexus',
  '혼다': 'Honda',
  '닛산': 'Nissan',
  '포드': 'Ford',
  '링컨': 'Lincoln',
  '캐딜락': 'Cadillac',
  '지프': 'Jeep',
  '테슬라': 'Tesla',
  '폴스타': 'Polestar',
  '비엠더블유': 'BMW',
  'BMW': 'BMW',
  '랜드로버': 'Land Rover',
  '재규어': 'Jaguar',
  '미니': 'MINI',
  '푸조': 'Peugeot',
  '시트로엥': 'Citroen',
  '마세라티': 'Maserati',
  '벤틀리': 'Bentley',
  '롤스로이스': 'Rolls-Royce',
};

const MODEL_MAP = {
  '그랜드 체로키': 'Grand Cherokee',
  '레인지로버': 'Range Rover',
  '트레일블레이저': 'Trailblazer',
  '아반떼': 'Avante',
  '쏘나타': 'Sonata',
  '그랜저': 'Grandeur',
  '투싼': 'Tucson',
  '싼타페': 'Santa Fe',
  '팰리세이드': 'Palisade',
  '코나': 'Kona',
  '베뉴': 'Venue',
  '아이오닉': 'Ioniq',
  '스타리아': 'Staria',
  '캐스퍼': 'Casper',
  '포터': 'Porter',
  '카니발': 'Carnival',
  '쏘렌토': 'Sorento',
  '스포티지': 'Sportage',
  '셀토스': 'Seltos',
  '니로': 'Niro',
  '모하비': 'Mohave',
  '모닝': 'Morning',
  '레이': 'Ray',
  '스팅어': 'Stinger',
  '말리부': 'Malibu',
  '트랙스': 'Trax',
  '코란도': 'Korando',
  '티볼리': 'Tivoli',
  '렉스턴': 'Rexton',
  '토레스': 'Torres',
  '카이엔': 'Cayenne',
  '마칸': 'Macan',
  '파나메라': 'Panamera',
  '타이칸': 'Taycan',
  '티구안': 'Tiguan',
  '투아렉': 'Touareg',
  '골프': 'Golf',
  '제타': 'Jetta',
  '캠리': 'Camry',
  '라브4': 'RAV4',
  '프리우스': 'Prius',
  '시빅': 'Civic',
  '어코드': 'Accord',
  '익스플로러': 'Explorer',
  '디스커버리': 'Discovery',
  '디펜더': 'Defender',
  '폴스타4': '4',
  '폴스타3': '3',
  '폴스타2': '2',
};

const TERM_MAP = {
  '인스퍼레이션': 'Inspiration',
  '익스클루시브': 'Exclusive',
  '프레스티지': 'Prestige',
  '노블레스': 'Noblesse',
  '시그니처': 'Signature',
  '캘리그래피': 'Calligraphy',
  '프리미엄': 'Premium',
  '프리미어': 'Premier',
  '럭셔리': 'Luxury',
  '스포츠': 'Sport',
  '하이브리드': 'Hybrid',
  '터보': 'Turbo',
  '콰트로': 'Quattro',
  '스포트백': 'Sportback',
  '인스크립션': 'Inscription',
  '얼티메이트': 'Ultimate',
  '에디션': 'Edition',
  '라인': 'Line',
};

const FUEL_MAP = {
  '가솔린': 'бензин',
  '디젤': 'дизель',
  '하이브리드': 'гибрид',
  '가솔린+전기': 'гибрид',
  '디젤+전기': 'гибрид',
  '전기': 'электро',
  'LPG': 'газ (LPG)',
};

const COLOR_MAP = {
  '흰색': 'белый',
  '검정색': 'чёрный',
  '은색': 'серебристый',
  '회색': 'серый',
  '쥐색': 'тёмно-серый',
  '빨간색': 'красный',
  '파란색': 'синий',
  '청색': 'синий',
  '갈색': 'коричневый',
  '녹색': 'зелёный',
  '노란색': 'жёлтый',
  '진주색': 'перламутровый',
  '하늘색': 'голубой',
  '기타': 'другой',
};

const TRANSMISSION_MAP = {
  '오토': 'автомат',
  '자동': 'автомат',
  '수동': 'механика',
  'CVT': 'вариатор (CVT)',
  'DCT': 'робот (DCT)',
  '세미오토': 'полуавтомат',
};

const BODY_MAP = {
  'SUV': 'кроссовер',
  'RV': 'минивэн',
  '세단': 'седан',
  '해치백': 'хэтчбек',
  '왜건': 'универсал',
  '쿠페': 'купе',
  '컨버터블': 'кабриолет',
  '미니밴': 'минивэн',
  '픽업': 'пикап',
};

const OPTION_MAP = {
  '선루프': 'Люк',
  '파노라마 선루프': 'Панорамная крыша',
  '헤드램프(HID)': 'HID-фары',
  '헤드램프(LED)': 'LED-фары',
  '내비게이션': 'Навигация',
  '전동시트': 'Электропривод сидений',
  '전동시트(운전석)': 'Электропривод водительского сиденья',
  '전동시트(동승석)': 'Электропривод пассажирского сиденья',
  '열선시트': 'Подогрев сидений',
  '열선시트(앞좌석)': 'Подогрев передних сидений',
  '열선시트(뒷좌석)': 'Подогрев задних сидений',
  '메모리 시트': 'Память сидений',
  '메모리 시트(운전석)': 'Память водительского сиденья',
  '통풍시트': 'Вентиляция сидений',
  '통풍시트(운전석)': 'Вентиляция водительского сиденья',
  '통풍시트(동승석)': 'Вентиляция пассажирского сиденья',
  '통풍시트(뒷좌석)': 'Вентиляция задних сидений',
  '가죽시트': 'Кожаный салон',
  '자동 에어컨': 'Климат-контроль',
  '스마트키': 'Бесключевой запуск',
  '후방 카메라': 'Камера заднего вида',
  '크루즈 컨트롤(일반)': 'Круиз-контроль',
  '크루즈 컨트롤(어댑티브)': 'Адаптивный круиз-контроль',
  '주차감지센서(후방)': 'Задний парктроник',
  '주차감지센서(전방)': 'Передний парктроник',
  '열선 스티어링 휠': 'Подогрев руля',
  '전자식 주차브레이크(EPB)': 'Электронный ручник',
  '파워 전동 트렁크': 'Электропривод багажника',
  '후측방 경보 시스템': 'Контроль слепых зон',
  '360도 어라운드 뷰': 'Камера 360° / Surround View',
  '헤드업 디스플레이(HUD)': 'Проекция на лобовое стекло (HUD)',
  '고스트 도어 클로징': 'Доводчики дверей',
  '마사지 시트': 'Массаж сидений',
  '레인센서': 'Датчик дождя',
  '차선이탈 경보 시스템(LDWS)': 'Контроль полосы движения',
  '크루즈 컨트롤(어댑티드)': 'Адаптивный круиз-контроль',
  '헤드업디스플레이': 'Проекция на лобовое стекло (HUD)',
  '어라운드뷰': 'Камера 360° / Surround View',
  '후측방 경고시스템': 'Контроль слепых зон',
  '차선이탈경보': 'Контроль полосы движения',
};

const OPTION_PRIORITY = [
  'Панорамная', 'Камера 360', 'Адаптивный', 'Контроль слепых', 'Вентиляция',
  'Память', 'Подогрев', 'Навигация', 'Электропривод багажника', 'LED', 'HID',
  'Кожаный', 'Люк', 'Камера заднего', 'Проекция', 'Электронный ручник',
];

let optionCatalogCache = null;

function translateWords(value = '') {
  let result = String(value)
    .replace(/^(디 올 뉴|더 뉴|올 뉴|더뉴|올뉴|뉴)\s+/, '')
    .trim();

  const entries = [...Object.entries(MODEL_MAP), ...Object.entries(TERM_MAP)]
    .sort((a, b) => b[0].length - a[0].length);
  for (const [korean, translated] of entries) {
    result = result.split(korean).join(translated);
  }
  return result.replace(/\s+/g, ' ').trim();
}

function extractGenerationCode(modelName = '', modelGroupName = '') {
  const match = modelName.match(/\(([A-Za-z0-9-]{2,})\)/);
  if (match) return match[1];
  const cleaned = modelName.replace(modelGroupName, '').trim();
  return /^[A-Za-z][A-Za-z0-9-]{1,8}$/.test(cleaned) ? cleaned : '';
}

function detectDrivetrain(...values) {
  const text = values.filter(Boolean).join(' ');
  if (/2WD|전륜|후륜/i.test(text)) return '2WD';
  if (/4WD|AWD|콰트로|quattro|xDrive|4MATIC|사륜/i.test(text)) return 'полный привод';
  return '';
}

export function translateKoreanBrand(value = '') {
  return BRAND_MAP[String(value).trim()] || String(value).trim();
}

export function translateKoreanVehicleName(value = '') {
  return translateWords(value);
}

export function translateKoreanFuel(value = '') {
  return FUEL_MAP[String(value).trim()] || String(value).trim();
}

export function translateKoreanColor(value = '') {
  return COLOR_MAP[String(value).trim()] || String(value).trim();
}

export function translateKoreanTransmission(value = '') {
  return TRANSMISSION_MAP[String(value).trim()] || String(value).trim();
}

export function translateKoreanBodyType(value = '') {
  return BODY_MAP[String(value).trim()] || String(value).trim();
}

export function translateKoreanOption(value = '') {
  const normalized = String(value)
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .trim();
  if (OPTION_MAP[normalized]) return OPTION_MAP[normalized];
  if (/파노라마.*선루프|선루프.*파노라마/.test(normalized)) return 'Панорамная крыша';
  if (/어댑티.*크루즈|크루즈.*어댑티/.test(normalized)) return 'Адаптивный круиз-контроль';
  if (/통풍시트/.test(normalized)) return 'Вентиляция сидений';
  if (/열선시트/.test(normalized)) return 'Подогрев сидений';
  if (/열선.*스티어링|스티어링.*열선/.test(normalized)) return 'Подогрев руля';
  if (/주차감지센서/.test(normalized)) return 'Парктроники';
  if (/후측방.*경고/.test(normalized)) return 'Контроль слепых зон';
  if (/내비게이션/.test(normalized)) return 'Навигация';
  if (/LED/.test(normalized) && /헤드램프/.test(normalized)) return 'LED-фары';
  return '';
}

function sortOptions(options) {
  return [...new Set(options)].sort((a, b) => {
    const rank = (value) => {
      const index = OPTION_PRIORITY.findIndex((needle) => value.includes(needle));
      return index === -1 ? 999 : index;
    };
    return rank(a) - rank(b);
  });
}

async function getOptionCatalog() {
  if (optionCatalogCache) return optionCatalogCache;
  try {
    const response = await axios.get(`${ENCAR_API}/v1/readside/vehicles/car/options/standard`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    const catalog = {};
    for (const option of response.data?.options || []) {
      catalog[option.optionCd] = option.optionName;
      for (const sub of option.subOptions || []) {
        catalog[sub.optionCd] = sub.optionName;
      }
    }
    optionCatalogCache = catalog;
    return catalog;
  } catch (error) {
    console.warn(`[encar] Could not load option catalog: ${error.message}`);
    return {};
  }
}

function extractOptionCodes(rawOptions) {
  if (!rawOptions || typeof rawOptions !== 'object') return [];
  return ['standard', 'choice', 'etc', 'tuning']
    .flatMap((key) => Array.isArray(rawOptions[key]) ? rawOptions[key] : [])
    .filter((code) => typeof code === 'string');
}

export function extractEncarCarId(input) {
  try {
    const url = new URL(input);
    for (const [key, value] of url.searchParams) {
      if (/^(carid|vehicleid|id)$/i.test(key) && /^\d{6,}$/.test(value)) return value;
    }
    const detailMatch = url.pathname.match(/\/(?:cars\/detail|vehicle|detail)\/(\d{6,})/i);
    if (detailMatch) return detailMatch[1];
    const anyId = url.pathname.match(/(\d{7,})/);
    return anyId?.[1] || '';
  } catch {
    return '';
  }
}

export async function fetchEncarListing(url) {
  const carId = extractEncarCarId(url);
  if (!carId) {
    console.warn('[encar] No car ID found in URL; using page scraping fallback');
    return null;
  }

  console.log(`[encar] Loading structured listing data for car ${carId}...`);
  const response = await axios.get(`${ENCAR_API}/v1/readside/vehicle/${carId}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    timeout: 15000,
  });
  const data = response.data || {};
  const category = data.category || {};
  const spec = data.spec || {};
  const advertisement = data.advertisement || {};

  const optionCodes = extractOptionCodes(data.options);
  const catalog = await getOptionCatalog();
  const options = sortOptions(optionCodes
    .map((code) => catalog[code])
    .filter(Boolean)
    .map((name) => OPTION_MAP[name])
    .filter(Boolean));

  const typeOrder = { OUTER: 0, INNER: 1, OPTION: 2 };
  const imageUrls = (data.photos || [])
    .filter((photo) => photo?.path && ['OUTER', 'INNER', 'OPTION'].includes(photo.type))
    .sort((a, b) => {
      const typeDiff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
      if (typeDiff) return typeDiff;
      return Number(a.code || 0) - Number(b.code || 0);
    })
    .map((photo) => `${ENCAR_CDN}${photo.path}`);

  const yearMonth = String(category.yearMonth || '');
  const rawModel = category.modelGroupName || category.modelName || '';
  const brand = category.manufacturerEnglishName
    || BRAND_MAP[category.manufacturerName]
    || category.manufacturerName
    || '';
  const model = category.modelGroupEnglishName
    || MODEL_MAP[rawModel]
    || translateWords(rawModel);
  const generationCode = extractGenerationCode(category.modelName || '', category.modelGroupName || '');
  const trim = category.gradeEnglishName || translateWords(category.gradeName || '');
  const fuel = FUEL_MAP[spec.fuelName] || spec.fuelName || '';
  const displacement = Number(spec.displacement) || 0;
  const drivetrain = detectDrivetrain(category.gradeName, category.gradeEnglishName, category.gradeDetailName);
  const priceKrw = (Number(advertisement.price) || 0) * 10000;

  if (imageUrls.length === 0) {
    throw new Error('Encar не вернул фотографии. Возможно, объявление удалено.');
  }

  return {
    id: carId,
    source: 'encar',
    sourceUrl: url,
    brand,
    model,
    generationCode,
    trim,
    year: Number(yearMonth.slice(0, 4)) || Number(category.formYear) || 0,
    month: Number(yearMonth.slice(4, 6)) || 0,
    modelYear: Number(category.formYear) || 0,
    mileage: Number(spec.mileage) || 0,
    fuel,
    displacement,
    engine: displacement ? `${(displacement / 1000).toFixed(1)}` : '',
    drivetrain,
    transmission: TRANSMISSION_MAP[spec.transmissionName] || spec.transmissionName || '',
    color: COLOR_MAP[spec.customColor || spec.colorName] || spec.customColor || spec.colorName || '',
    bodyType: BODY_MAP[spec.bodyName] || spec.bodyName || '',
    seatCount: Number(spec.seatCount) || 0,
    vin: data.vin || '',
    priceKrw,
    options,
    diagnosisCar: Boolean(advertisement.diagnosisCar),
    imageUrls,
    photoCount: imageUrls.length,
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function buildHighlights(car) {
  const highlights = [];
  const usedGroups = new Set();
  const optionGroup = (value) => {
    if (/Память/.test(value)) return 'memory';
    if (/Подогрев/.test(value)) return 'heating';
    if (/Вентиляция/.test(value)) return 'ventilation';
    if (/Электропривод.*сидень/.test(value)) return 'power-seats';
    if (/Камера 360/.test(value)) return 'camera-360';
    if (/Камера заднего/.test(value)) return 'camera-rear';
    if (/парктроник/.test(value)) return 'parking';
    return value;
  };
  for (const option of car.options || []) {
    const group = optionGroup(option);
    if (usedGroups.has(group)) continue;
    usedGroups.add(group);
    highlights.push(option);
    if (highlights.length >= 7) break;
  }
  if (car.mileage > 0 && car.mileage < 30000) highlights.unshift('Маленький пробег');
  if (highlights.length < 5 && car.fuel === 'дизель') highlights.push('Экономичный дизельный двигатель');
  if (highlights.length < 5 && car.bodyType === 'кроссовер') highlights.push('Практичный и удобный кроссовер');
  return [...new Set(highlights)].slice(0, 7);
}

export function generateCarPost(car, options = {}) {
  if (!car) return '';
  const includeVin = options.includeVin === true;
  const priceMode = options.priceMode === 'turnkey' ? 'turnkey' : 'korea';
  const turnkeyPrice = String(options.turnkeyPrice || '').replace(/[^0-9]/g, '');
  const titleParts = [car.brand, car.model, car.generationCode, car.trim]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const lines = [`🚙 **${titleParts.join(' ')}** 🔥`, ''];

  const date = car.year
    ? `${car.year}${car.month ? `/${String(car.month).padStart(2, '0')}` : ''}`
    : '';
  if (date) {
    const modelYear = car.modelYear && car.modelYear !== car.year
      ? ` (${car.modelYear} модельный год)`
      : '';
    lines.push(`📆 **Год выпуска:** ${date}${modelYear}  `);
  }
  if (car.mileage) lines.push(`🛣️ **Пробег:** ${formatNumber(car.mileage)} км  `);
  if (car.engine || car.fuel) lines.push(`⛽️ **Объём:** ${[car.engine, car.fuel].filter(Boolean).join(' ')}  `);
  if (car.transmission) lines.push(`⚙️ **Коробка:** ${car.transmission}  `);
  if (car.drivetrain) lines.push(`🛞 **Привод:** ${car.drivetrain}  `);
  if (car.trim) lines.push(`💎 **Комплектация:** ${car.trim}`);

  const highlights = buildHighlights(car);
  if (highlights.length) {
    lines.push('');
    for (const highlight of highlights) lines.push(`✅ ${highlight}  `);
  }

  if (includeVin && car.vin) lines.push('');
  if (includeVin && car.vin) lines.push(`📄 **VIN:** ${car.vin}`);

  lines.push('');
  if (priceMode === 'turnkey') {
    lines.push(`💰 **Цена под ключ до Владивостока: ${turnkeyPrice ? formatNumber(turnkeyPrice) : '______'} ₽** 🇷🇺  `);
    lines.push('✅ Со всеми платежами и расходами до Владивостока  ');
    lines.push('✅ Больше ни за что платить не нужно');
  } else if (car.priceKrw) {
    lines.push(`💲 **Цена в Корее:** **${formatNumber(car.priceKrw)} вон**`);
  }

  return lines.join('\n').trim();
}
