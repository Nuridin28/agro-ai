# Архитектура

## Компоненты

```
                       ┌─────────────────────────────┐
                       │  Фермер (/farmer/*)         │
                       │  подаёт заявку с деклар.    │
                       └────────────┬────────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────────┐
                       │  Postgres                   │
                       │  - users (поля + Гипрозем)  │
                       │  - applications (декларация)│
                       │  - field_sar_observations   │
                       │    (кеш Sentinel-1 рядов)   │
                       └────────────┬────────────────┘
                                    │
        ┌───────────────────────────┴────────────────────────┐
        ▼                                                    ▼
┌──────────────────┐                                ┌──────────────────┐
│ Inspector page   │                                │ Cron / warmup    │
│ /inspector/      │                                │ /api/satellite/  │
│  farmers/[id]    │                                │  sar/refresh     │
└────────┬─────────┘                                └─────────┬────────┘
         │                                                    │
         ▼                                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│ verifyFarmerWithSatellite() / checkUserApplication()              │
│ — собирают findings из всех каналов                               │
└────────────────────────────────────────────────────────────────────┘
         │
         ├─────────► Гипрозем агрохимия (lib/giprozem*)
         ├─────────► Метео (lib/real-meteo, lib/mock/meteo)
         ├─────────► NDVI (lib/satellite/ndvi.ts via Sentinel Hub Cloud)
         ├─────────► SAR (lib/satellite/sar.ts via CDSE)
         ├─────────► Inactivity-check (lib/satellite/inactivity.ts)
         └─────────► Cross-validation (lib/verify/satellite.ts)
                                    │
                                    ▼
                          ┌──────────────────────┐
                          │ Finding[] + risk-score│
                          │ → UI карточки         │
                          └──────────────────────┘
```

## Модель данных полей

**Один `UserField` = одно хозяйство в одном районе** (например, «ТОО Шерубай-Су»
в `ah_08_118`). Внутри него **массив `parcels`** — реальные участки кадастра,
у каждого свой контур и (если Гипрозем отдал per-feature атрибуты) своя
агрохимия.

```typescript
interface Parcel {
  polygon4326: number[][];     // outer ring [lng, lat][], 30-300 точек кадастра
  sample?: GiprozemAttrs;      // per-parcel агрохимия (P, N, K, гумус...)
  cadastralNumber?: string;    // если attribute kadnomer/cadnumber присутствует
}

interface UserField {
  nazvxoz: string;
  layerId: number;
  layerName: string;
  oblastCode: string;
  parcels: Parcel[];           // все участки хозяйства в районе (1-50+)
  sample: GiprozemAttrs;       // агрегат-агрохимия для хозяйства
  polygon4326?: number[][];    // legacy: первый ring, для backward-compat
}
```

**Backward-compat:** старые записи в БД имеют форму `parcels: number` (счётчик)
+ `polygon4326` (один контур). `normalizeUserField()` в [lib/users-store.ts](../lib/users-store.ts)
конвертит их в новый формат на чтении — создаёт массив с 1 parcel'ом из legacy-полигона.

**Что хранит Гипрозем-ArcGIS:** `geometry.rings[][][]` где outer ring — массив
точек `[lng, lat]`. Реальные кадастровые контуры имеют **30–300 точек**
(не 4, как у идеального прямоугольника). `pickOuterRing()` в
[lookup-farm](../app/api/auth/lookup-farm/route.ts) прореживает до max 64
точек для Sentinel Hub Statistical API.

## Поток обработки заявки

1. **Фермер регистрируется** через `/register` → выбирает хозяйство в Гипрозем-каталоге →
   подтверждает участки → к юзеру привязываются **все** `parcels[]` хозяйства
   с их `polygon4326`. После регистрации [api/auth/register/route.ts](../app/api/auth/register/route.ts)
   запускает fire-and-forget warmup S1-кеша **для каждого parcel'а**.

2. **Фермер подаёт заявку** через `/farmer/applications` ([components/ApplicationForm.tsx](../components/ApplicationForm.tsx))
   с декларацией: культура, площадь, урожайность, дата посева, дата уборки.
   Server action [actions.ts](../app/farmer/applications/actions.ts) валидирует
   и пишет в `applications.cropDeclaration` (jsonb).

3. **Инспектор открывает досье** на `/inspector/farmers/[id]`:
   - Для **F-* (мок)** идёт через `verifyFarmerWithSatellite()` ([lib/verify/index.ts:111](../lib/verify/index.ts))
     — sync-данные (агрохимия, метео из мока) + параллельный fetch NDVI / SAR / inactivity.
   - Для **U-* (реальный юзер)** базовая страница рендерится **без единого
     спутникового запроса** (lazy-режим):
     - Заголовок фермера + список всех `parcels` с площадью, габаритами,
       центроидом, агрохимией — мгновенно из БД.
     - Каждый parcel показывает бейджи статуса HyP3-джобов: «⏳ N в обработке»
       или «✓ N готов» (читается из `field_coherence_jobs`).
     - Кнопка **«▶ Посмотреть со спутника»** на каждой parcel-карточке.
     - Только при клике URL меняется на `?sat=fi:pi` → перерендер с
       `<SatelliteSection>` для этого конкретного parcel'а.
     - `checkUserApplication()` вызывается на каждой заявке; NDVI/SAR-сводки
       прокидываются только если инспектор уже открыл хотя бы один parcel
       через `?sat=...`.

4. **Findings** агрегируются в `runSatelliteChecks()` ([lib/verify/satellite.ts](../lib/verify/satellite.ts)),
   рисуются как `<FindingCard>` под заголовком, и формируют общий риск-скор.

## NDVI-канал (Sentinel-2)

**Провайдер:** Sentinel Hub Cloud (платный trial), endpoint `services.sentinel-hub.com`.
**Креды:** `SH_CLIENT_ID` / `SH_CLIENT_SECRET` в `.env.local`.

**Что считаем:** [lib/satellite/ndvi.ts](../lib/satellite/ndvi.ts)
- `ndviMean`, `ndviMax`, `ndviMin` — статистика по полигону за сезон
- `growthStartDate` — первая дата с устойчивым превышением порога (0.25)
- `peakDate` — дата максимума NDVI
- `harvestDate` — первая дата после пика, где NDVI упал ниже 0.20
- `harvestDetected` — был ли полный цикл рост → пик → падение
- `heterogeneityStdev` — пространственная σ NDVI внутри поля
- `growthRateNdviPerDay` — макс. наклон NDVI за фазу зелёной массы
- `daysToPeak`, `seasonLengthDays`

**Кеш:** дисковый, в `/tmp/agro-sat-cache/` ([lib/satellite/cache.ts](../lib/satellite/cache.ts)).
TTL 30 дней — снимки прошлого не меняются.

## Геометрия полигона

**Площадь** ([lib/satellite/geo.ts](../lib/satellite/geo.ts)):
- `polygonAreaM2()` / `polygonAreaHa()` — формула Бэвиса-Камбарелли на
  сфере WGS84 (R = 6371008.8 м). Точность ~0.1 % для полей до 100 га.
- `polygonBboxDims()` — габариты bounding box через haversine: ширина =
  расстояние по lng на средней широте, высота = по lat.
- `polygonPerimeterM()` — суммарная длина по haversine между соседями.

**Центроид** (для отображения координат на UI): простое среднее `[lng, lat]`
по точкам полигона. Не строгий центр масс (его считать дороже), но для
показа «53.224°N, 63.487°E» точности с лихвой.

**Что видит инспектор** для каждого parcel'а на досье:
```
Участок №1                              [▶ Посмотреть со спутника]
19.2 га · 487×395 м · центр 53.2241°N, 63.4870°E
per-parcel агрохимия: гумус 4.1 · P 38 · N 22 · K 410
```

## Coherence-канал (Sentinel-1 CCD)

**Самый сильный физический канал.** Interferometric coherence γ ∈ [0..1]
показывает, изменилась ли структура поверхности поля между двумя SLC-
снимками. γ < 0.3 = механическое вмешательство (вспашка, посев, уборка).

**Провайдер:** ASF HyP3 (NASA), endpoint `hyp3-api.asf.alaska.edu`.
**Auth:** Bearer token, генерируется на urs.earthdata.nasa.gov.
**Креды:** `EARTHDATA_TOKEN` в `.env.local`. Без токена канал отключается.

**Архитектура:** асинхронная. Cron `/api/satellite/coherence/refresh`:
1. Находит SLC-пары через CDSE OData ([lib/satellite/cdse-catalog.ts](../lib/satellite/cdse-catalog.ts)).
2. Submit-ит каждую пару в HyP3 как `INSAR_GAMMA` job.
3. При следующих вызовах cron — polling: PENDING → RUNNING → SUCCEEDED.
4. Для SUCCEEDED — скачивает `_corr.tif`, считает mean γ по polygon4326
   через `geotiff.js` + ray-casting, пишет в БД.

**Время:** 15-45 мин на пару (NASA-обработка). На UI данные появляются
с задержкой относительно snapshot-даты.

**Что считаем:** [lib/satellite/coherence-events.ts](../lib/satellite/coherence-events.ts)
- γ ≥ 0.5 stable_pairs / pairs_total ≥ 85 % → поле не работало весь сезон
- drop γ < 0.3 (с относительным падением ≥ 0.15 от предыдущей пары) → событие
- mean γ + min γ за сезон — для UI и сравнения с пороговыми

**Кеш:** Postgres `field_sar_observations` с `source='s1_coherence'`.
Trackеr async-джобов: `field_coherence_jobs` (id = HyP3 UUID).

**Подробнее:** [coherence.md](./coherence.md).

## SAR-канал (Sentinel-1 backscatter)

**Провайдер:** Copernicus Data Space Ecosystem (бесплатно), endpoint `sh.dataspace.copernicus.eu`.
**Креды:** `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` в `.env.local`. Если кредов нет —
канал отключается целиком, без ошибок.

**Архив:** ~12 месяцев на бесплатном тире (поэтому мок-сезоны переведены на 2025).

**Что считаем:** [lib/satellite/sar-events.ts](../lib/satellite/sar-events.ts)
- VV (co-pol) — шероховатость поверхности → вспашка/культивация
- VH (cross-pol) — биомасса → посев/рост/уборка
- σ VH за сезон — индикатор «спящего» поля

**События** (`SAREvent.kind`):
- `harvest` — резкое падение VH > 3.5 дБ, июль–октябрь, post-event ниже сезонной медианы
- `tillage` — всплеск VV > 2 дБ за ≤ 18 дней, март–октябрь
- `sowing` — стабильный подъём VH над `min(VH) + 2 дБ` в апреле–июне
- `inactivity` — σ VH за сезон < 1.0 дБ (поле не работало)

**Доп.фильтры:**
- **Rain filter:** если в окне ±3 дня от детектированной уборки выпало > 8 мм
  осадков (Open-Meteo) — confidence режется ×0.3, событие помечается «возможный
  дождевой дип»
- **Small-field warning:** средний `sampleCount` < 50 пикселей → `summary.smallField = true`,
  выдаёт `CROP_SAR_SMALL_FIELD` (info)

**Кеш:** Postgres-таблица `field_sar_observations` (см. [schema.ts](../lib/db/schema.ts)).
Уникальный ключ `(field_key, observation_date, source)`. TTL: для прошлых лет —
`Infinity` (не refetch-аем), для текущего — 7 дней.

**Прогрев:**
- Автоматически при регистрации юзера (fire-and-forget)
- Вручную через `GET /api/satellite/sar/refresh` (см. [operations.md](./operations.md))
- При первом открытии страницы досье — синхронно (5–15 сек, потом в кеше)

## Cross-validation NDVI ↔ SAR

[lib/verify/satellite.ts](../lib/verify/satellite.ts) — если оба канала независимо
показывают расхождение даты уборки в одну сторону (> 30 дн.) и в пределах 14 дн.
друг от друга — выдаём один **critical**-finding `CROP_HARVEST_CROSS_VALIDATED`
с риском 80 % от субсидии. Дубликат `CROP_HARVEST_DATE_MISMATCH` удаляется,
чтобы не считать риск дважды.

Это самый сильный сигнал движка: два независимых физических канала (оптика +
радар) согласны.

## Финдинг-коды (полный список)

### Земледелие — общие правила (sync, без спутника)

| Код | Severity | Триггер | Риск ₸ |
|---|---|---|---|
| `CROP_BIOLOGICAL_CEILING` | critical | заявленный сбор > 1.5× биологического потолка культуры | 100 % |
| `CROP_REGIONAL_OUTLIER` | warn | сбор на 30 %+ выше соседей при общем падении | 30 % |
| `CROP_MOISTURE_INCONSISTENCY` | warn | высокий заявленный урожай при `swEqMm < 100` мм | 20 % |
| `CROP_AGROCHEM_DEFICIT` | high | дефицит P/Cu при заявленном высоком сборе | 40 % |
| `CROP_FERTILIZER_GAP` | warn | закуп удобрений < 50 % от расчётной нормы для урожая | 25 % |
| `CROP_FAKE_SOWING` | high | заявленная дата посева раньше прогрева почвы +5 дн. | 50 % |

### Земледелие — NDVI (Sentinel-2)

| Код | Severity | Триггер | Риск ₸ |
|---|---|---|---|
| `CROP_NO_VEGETATION` | critical | NDVI max < 0.30 — посева не было | 100 % |
| `CROP_WEAK_VEGETATION` | warn | NDVI max < 0.40 — слабый рост | 30 % |
| `CROP_LATE_GROWTH` | high | старт вегетации > 30 дн. после заявленного посева | 40 % |
| `CROP_HETEROGENEOUS_FIELD` | info / warn | σ NDVI ≥ 0.16 — мозаичная пашня | 20 % при warn |
| `CROP_SLOW_GROWTH` | warn | скорость прироста NDVI < 0.008/день при субсидии на удобрения | 25 % |
| `CROP_YOY_DECLINE` | warn | пик NDVI ниже прошлогоднего на 0.20+ | 20 % |
| `CROP_HARVEST_DATE_MISMATCH` | high | `\|declaredHarvest − ndviHarvest\| > 30` дн. | 50 % |
| `CROP_HARVEST_DATE_DRIFT` | warn | расхождение 15–30 дн. | 0 |
| `CROP_NO_HARVEST_DETECTED` | warn | пик NDVI был, падения не было | 30 % при declared |
| `CROP_POST_SUBSIDY_INACTIVE` | high / warn | NDVI не вырос после baseline-даты выдачи субсидии | 60 % / 20 % |

### Земледелие — SAR (Sentinel-1)

| Код | Severity | Триггер | Риск ₸ |
|---|---|---|---|
| `CROP_SAR_HARVEST_MISMATCH` | high | расхождение SAR-даты уборки и заявленной > 30 дн. | 50 % |
| `CROP_SAR_FIELD_INACTIVE` | high | σ VH за сезон < 1.0 дБ — поле не работало | 70 % |
| `CROP_SAR_NO_TILLAGE` | warn | нет всплеска VV в окне март–октябрь | 0 |
| `CROP_SAR_MULTIPLE_HARVESTS` | info | > 1 события уборки (многоукос) | 0 |
| `CROP_SAR_SMALL_FIELD` | info | < 50 пикселей — SAR ненадёжен | 0 |
| `CROP_HARVEST_CROSS_VALIDATED` | **critical** | NDVI + SAR оба показывают расхождение даты уборки в одну сторону | **80 %** |

### Земледелие — Coherence / CCD (Sentinel-1 InSAR)

| Код | Severity | Триггер | Риск ₸ |
|---|---|---|---|
| `CROP_COHERENCE_FIELD_STABLE` | **critical** | γ ≥ 0.5 в > 85 % пар сезона — поверхность не менялась | **90 %** |
| `CROP_COHERENCE_EVENT` | info | drop γ < 0.3 — зафиксировано изменение поверхности | 0 |
| `CROP_TRIPLE_VALIDATED` | **critical** | NDVI + SAR + Coherence все три показывают inactive — максимальная уверенность | **100 %** |

### Скотоводство

| Код | Severity | Триггер |
|---|---|---|
| `LIV_BULL_REPRO_GAP` | high | быки куплены — приплода нет |
| `LIV_GENETIC_NO_GAIN` | warn | нет роста привеса от племенных |
| `LIV_ADG_OVER_CEILING` | high | заявленный привес > биологического |
| `LIV_FEED_TO_GROWTH` | warn | кормов мало, привес высокий |
| `LIV_PASTURE_OVERLOAD` | warn | нагрузка на пастбище > нормы Гипрозема |
| `LIV_WINTER_FEED_GAP` | warn | суровая зима — нулевой падёж и мало кормов |
| `LIV_VET_GAP` | warn | нет вакцинации, есть субсидии на корм |
| `LIV_SALE_WEIGHT_FRAUD` | high | субсидия по большему весу, чем реализовано |

## Где что лежит

| Тема | Файлы |
|---|---|
| Спутниковые провайдеры | [lib/satellite/sentinel-hub-provider.ts](../lib/satellite/sentinel-hub-provider.ts) (S2 NDVI), [lib/satellite/cdse-provider.ts](../lib/satellite/cdse-provider.ts) (S1 GRD), [lib/satellite/cdse-catalog.ts](../lib/satellite/cdse-catalog.ts) (SLC catalog), [lib/satellite/hyp3-client.ts](../lib/satellite/hyp3-client.ts) (HyP3 jobs), [lib/satellite/geotiff-clip.ts](../lib/satellite/geotiff-clip.ts) (GeoTIFF clip) |
| NDVI features | [lib/satellite/ndvi.ts](../lib/satellite/ndvi.ts) |
| SAR-сетап и кеш | [lib/satellite/sar.ts](../lib/satellite/sar.ts) |
| SAR-детектор | [lib/satellite/sar-events.ts](../lib/satellite/sar-events.ts) |
| Coherence-оркестратор | [lib/satellite/coherence.ts](../lib/satellite/coherence.ts) |
| Coherence-детектор | [lib/satellite/coherence-events.ts](../lib/satellite/coherence-events.ts) |
| Coherence cron | [app/api/satellite/coherence/refresh/route.ts](../app/api/satellite/coherence/refresh/route.ts) |
| Inactivity-check | [lib/satellite/inactivity.ts](../lib/satellite/inactivity.ts) |
| Verify-движок | [lib/verify/index.ts](../lib/verify/index.ts), [lib/verify/satellite.ts](../lib/verify/satellite.ts), [lib/verify/crop.ts](../lib/verify/crop.ts), [lib/verify/livestock.ts](../lib/verify/livestock.ts) |
| Проверка пользовательских заявок | [lib/applications-check.ts](../lib/applications-check.ts) |
| API-роуты | [app/api/satellite/sar/refresh/route.ts](../app/api/satellite/sar/refresh/route.ts), [app/api/satellite/cron/route.ts](../app/api/satellite/cron/route.ts), [app/api/satellite/verify/route.ts](../app/api/satellite/verify/route.ts), [app/api/satellite/image/route.ts](../app/api/satellite/image/route.ts) |
| UI карточки спутника | [components/SatelliteSection.tsx](../components/SatelliteSection.tsx), [components/SatelliteCard.tsx](../components/SatelliteCard.tsx), [components/RealMeteoCard.tsx](../components/RealMeteoCard.tsx), [components/SatelliteDatePicker.tsx](../components/SatelliteDatePicker.tsx) |
| Геодезия (площадь, габариты, центроид) | [lib/satellite/geo.ts](../lib/satellite/geo.ts) |
| GeoTIFF clip (для coherence) | [lib/satellite/geotiff-clip.ts](../lib/satellite/geotiff-clip.ts) |
| Метео | [lib/real-meteo.ts](../lib/real-meteo.ts), [lib/mock/meteo.ts](../lib/mock/meteo.ts) |
| Тесты детектора | [scripts/sar-events.test.ts](../scripts/sar-events.test.ts) |
| Backtest на полевых данных | [scripts/sar-backtest.ts](../scripts/sar-backtest.ts) |
| Postgres-схема | [lib/db/schema.ts](../lib/db/schema.ts), [drizzle/](../drizzle/) |

## Гарантии «всё graceful»

Цепочка падений и поведение:
- **Postgres лежит** → страница падает (это блокер). Fix: поднять docker.
- **Sentinel Hub лежит** → NDVI блок не рисуется, остальные каналы работают.
- **CDSE не настроен или лежит** → SAR-блок не рисуется, NDVI работает.
- **Earthdata Token не задан или истёк** → Coherence-блок не рисуется, остальные каналы работают; cron `/api/satellite/coherence/refresh` отвечает 503.
- **HyP3 ещё не закончил обработку** → Coherence-блок не рисуется, пока в БД нет ни одной γ-точки (PHASE 3 запишет данные при следующем cron-вызове).
- **Open-Meteo лежит** → Rain filter отключён (детектор работает без фильтра),
  а блок «реальное метео» показывает мок.
- **Юзер зарегистрировался по старой схеме (parcels = number, один polygon)** →
  normalizer создаёт `parcels: [{ polygon4326 }]` из legacy-поля. Спутник
  работает по этому одному контуру; новые parcels-сигналы (per-participant
  агрохимия, multiple participants) недоступны — рекомендуется перерегистрация.
- **Юзер вообще без polygon4326** (regression в старых данных) → блок
  «Контуры участков не сохранились» в UI, спутник не доступен. Fix:
  перерегистрировать хозяйство — текущий регистрационный поток сохраняет
  все rings.
