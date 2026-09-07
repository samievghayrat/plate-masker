import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  translateKoreanBodyType,
  translateKoreanBrand,
  translateKoreanColor,
  translateKoreanFuel,
  translateKoreanOption,
  translateKoreanTransmission,
  translateKoreanVehicleName,
} from './encar.mjs';

const KB_ORIGIN = 'https://www.kbchachacha.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function numberFrom(value = '') {
  return Number(String(value).replace(/[^0-9]/g, '')) || 0;
}

function fullYear(twoOrFourDigits) {
  const year = Number(twoOrFourDigits) || 0;
  if (year >= 1000) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function detectDrivetrain(value = '') {
  if (/4WD|AWD|콰트로|quattro|xDrive|4MATIC|사륜|Dual Motor/i.test(value)) {
    return 'полный привод';
  }
  if (/2WD|전륜|후륜/i.test(value)) return '2WD';
  return '';
}

export function extractKbCarSeq(input) {
  try {
    const url = new URL(input);
    for (const [key, value] of url.searchParams) {
      if (/^(carseq|carid|id)$/i.test(key) && /^\d{6,}$/.test(value)) return value;
    }
    return url.pathname.match(/(?:detail|car)[^/]*\/(\d{6,})/i)?.[1]
      || url.pathname.match(/(\d{7,})/)?.[1]
      || '';
  } catch {
    return '';
  }
}

export function parseKbListingHtml(html, sourceUrl, carSeq = extractKbCarSeq(sourceUrl)) {
  const $ = cheerio.load(html);
  const titleElement = $('.car-buy-name').first();
  const titleText = titleElement.contents().map((_, node) => (
    node.type === 'tag' && node.tagName === 'br' ? ' ' : $(node).text()
  )).toArray().join('');
  const rawTitle = cleanText(titleText)
    .replace(/^\([^)]*\)\s*/, '')
    || cleanText($('meta[name="description"]').attr('content')).split('의 가격')[0];
  const [rawBrand = '', ...rawModelParts] = rawTitle.split(' ');
  const brand = translateKoreanBrand(rawBrand);
  const model = translateKoreanVehicleName(rawModelParts.join(' '));

  const details = {};
  $('.detail-info-table tr').each((_, row) => {
    const cells = $(row).children('th, td').toArray();
    for (let index = 0; index < cells.length - 1; index += 2) {
      const key = cleanText($(cells[index]).text());
      const value = cleanText($(cells[index + 1]).text());
      if (key && value) details[key] = value;
    }
  });

  const dateValue = details['연식'] || cleanText($('.car-buy-share .txt-info span').first().text());
  const registered = dateValue.match(/(\d{2,4})년\s*(\d{1,2})월/);
  const formYear = dateValue.match(/\((\d{2,4})년형\)/);
  const fuel = translateKoreanFuel(details['연료']);
  const displacement = fuel === 'электро' ? 0 : numberFrom(details['배기량']);

  const imageUrls = [...new Set(
    $('a.slide-img__link[href], img[src], script[type="application/ld+json"]')
      .map((_, element) => {
        if (element.tagName === 'script') {
          try {
            const data = JSON.parse($(element).html());
            return Array.isArray(data.image) ? data.image : [];
          } catch {
            return [];
          }
        }
        return $(element).attr('href') || $(element).attr('src') || '';
      })
      .toArray()
      .flat()
      .map((value) => cleanText(value).replace(/\?.*$/, ''))
      .filter((value) => /img\.kbchachacha\.com\/IMG\/carimg/i.test(value))
      .filter((value) => !carSeq || value.includes(`/${carSeq}_`)),
  )];

  const options = [...new Set(
    $('.car-option-list li:not(.option_more) .text')
      .map((_, element) => translateKoreanOption(cleanText($(element).text())))
      .toArray()
      .filter(Boolean),
  )];

  const priceText = cleanText($('.car-buy-price .c-title-28').first().text());
  const priceUnits = numberFrom(priceText);
  const priceKrw = /만원/.test(priceText) ? priceUnits * 10000 : priceUnits;

  if (!rawTitle) throw new Error('Данные автомобиля KB Chachacha не найдены. Возможно, объявление закрыто.');
  if (imageUrls.length === 0) throw new Error('KB Chachacha не вернул фотографии. Возможно, объявление закрыто.');

  return {
    id: carSeq,
    source: 'kbchachacha',
    sourceUrl,
    brand,
    model,
    generationCode: '',
    trim: '',
    year: registered ? fullYear(registered[1]) : 0,
    month: registered ? Number(registered[2]) : 0,
    modelYear: formYear ? fullYear(formYear[1]) : 0,
    mileage: numberFrom(details['주행거리']),
    fuel,
    displacement,
    engine: displacement ? `${(displacement / 1000).toFixed(1)}` : '',
    drivetrain: detectDrivetrain(rawTitle),
    transmission: translateKoreanTransmission(details['변속기']),
    color: translateKoreanColor(details['차량색상']),
    bodyType: translateKoreanBodyType(details['차종']),
    seatCount: 0,
    vin: '',
    priceKrw,
    options,
    diagnosisCar: cleanText($('.new-bedge-area').text()).includes('진단'),
    imageUrls,
    photoCount: imageUrls.length,
  };
}

export async function fetchKbListing(url) {
  const carSeq = extractKbCarSeq(url);
  if (!carSeq) throw new Error('В ссылке не найден номер автомобиля KB Chachacha.');
  console.log(`[kbchachacha] Loading structured listing data for car ${carSeq}...`);
  const canonicalUrl = `${KB_ORIGIN}/public/car/detail.kbc?carSeq=${encodeURIComponent(carSeq)}`;
  const response = await axios.get(canonicalUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      Referer: KB_ORIGIN,
    },
    timeout: 20000,
  });
  return parseKbListingHtml(response.data, url, carSeq);
}
