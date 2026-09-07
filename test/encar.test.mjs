import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEncarCarId, generateCarPost } from '../src/encar.mjs';
import { extractKbCarSeq, parseKbListingHtml } from '../src/kbcar.mjs';

const sampleCar = {
  brand: 'Kia',
  model: 'Sportage',
  generationCode: 'NQ5',
  trim: 'Prestige',
  year: 2024,
  month: 3,
  modelYear: 2024,
  mileage: 12521,
  engine: '2.0',
  fuel: 'дизель',
  transmission: 'автомат',
  drivetrain: '2WD',
  color: 'белый',
  vin: 'KNATESTVIN1234567',
  priceKrw: 12730000,
  options: ['Навигация', 'Камера заднего вида', 'Вентиляция сидений'],
};

test('extracts an Encar ID from modern and legacy links', () => {
  assert.equal(extractEncarCarId('https://fem.encar.com/cars/detail/41043280'), '41043280');
  assert.equal(
    extractEncarCarId('https://www.encar.com/dc/dc_cardetailview.do?carid=39999999'),
    '39999999',
  );
});

test('generates the saved Russian format with privacy defaults', () => {
  const post = generateCarPost(sampleCar);
  assert.match(post, /Kia Sportage NQ5 Prestige/);
  assert.match(post, /12,521 км/);
  assert.match(post, /12,730,000 вон/);
  assert.doesNotMatch(post, /KNATESTVIN1234567/);
  assert.doesNotMatch(post, /Проверен Encar Diagnosis\+/);
  assert.doesNotMatch(post, /Хорошая комплектация/);
  assert.doesNotMatch(post, /Цвет:/);
  assert.doesNotMatch(post, /\*\*/);
  assert.match(post, /🚙 \*Kia Sportage NQ5 Prestige\* 🔥/);
});

test('supports the turnkey price format and optional VIN', () => {
  const post = generateCarPost(sampleCar, {
    includeVin: true,
    priceMode: 'turnkey',
    turnkeyPrice: '3500000',
  });
  assert.match(post, /KNATESTVIN1234567/);
  assert.match(post, /3,500,000 ₽/);
  assert.match(post, /Больше ни за что платить не нужно/);
  assert.doesNotMatch(post, /Цена в Корее/);
});

test('parses a KB Chachacha listing without exposing the plate number', () => {
  const url = 'https://m.kbchachacha.com/public/web/car/detail.kbc?carSeq=28729495';
  const html = `
    <strong class="car-buy-name">(57거2560)폴스타 폴스타4<br>Long Range Dual Motor</strong>
    <div class="car-buy-price"><strong class="c-title-28">7,090만원</strong></div>
    <div class="new-bedge-area">인증 진단</div>
    <table class="detail-info-table"><tbody>
      <tr><th>차량정보</th><td>57거2560</td><th>연식</th><td>25년09월(26년형)</td></tr>
      <tr><th>주행거리</th><td>23,144km</td><th>연료</th><td>전기</td></tr>
      <tr><th>변속기</th><td>오토</td><th>차종</th><td>SUV</td></tr>
      <tr><th>차량색상</th><td>회색</td><th>배기량</th><td>0cc</td></tr>
    </tbody></table>
    <ul class="car-option-list">
      <li><span class="text">선루프 (파노라마)</span></li>
      <li><span class="text">어라운드뷰</span></li>
    </ul>
    <a class="slide-img__link" href="https://img.kbchachacha.com/IMG/carimg/l/img02/img2872/28729495_one.jpeg"></a>
    <a class="slide-img__link" href="https://img.kbchachacha.com/IMG/carimg/l/img02/img2872/28729495_two.jpeg?width=720"></a>
  `;
  const car = parseKbListingHtml(html, url);
  assert.equal(extractKbCarSeq(url), '28729495');
  assert.equal(car.source, 'kbchachacha');
  assert.equal(car.brand, 'Polestar');
  assert.equal(car.model, '4 Long Range Dual Motor');
  assert.equal(car.year, 2025);
  assert.equal(car.modelYear, 2026);
  assert.equal(car.mileage, 23144);
  assert.equal(car.priceKrw, 70900000);
  assert.deepEqual(car.options, ['Панорамная крыша', 'Камера 360° / Surround View']);
  assert.equal(car.imageUrls.length, 2);
  assert.doesNotMatch(JSON.stringify(car), /57거2560/);
  assert.doesNotMatch(generateCarPost(car), /57거2560/);
});
