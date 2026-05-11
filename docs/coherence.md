# Coherence (CCD) — статус и план подключения

## Что это

Interferometric coherence γ ∈ [0..1] — степень схожести фазы двух SLC-снимков
Sentinel-1 одной геометрии (orbit/path/incidence), сделанных с интервалом 6
или 12 дней. Это **самый точный физический индикатор изменений поверхности
поля**:

- γ ≥ 0.5 = поверхность не менялась между пролётами (поле стоит)
- γ < 0.3 = что-то проехало, повернуло, скосило, посеяло, копнуло
- γ < 0.2 = массивное изменение (свежая вспашка, наводнение)

JRC использует CCD для CAP-мониторинга в ЕС. Точность даты события:
**85-93 %** на уборке, **70-80 %** на посеве. Это **выше**, чем у backscatter
change detection.

## Что реализовано сейчас

| Слой | Файл | Статус |
|---|---|---|
| Типы и DB-схема | [lib/satellite/types.ts](../lib/satellite/types.ts), [lib/db/schema.ts](../lib/db/schema.ts) | ✅ `CoherenceTimeseries`, `CoherencePair`, `field_sar_observations.coherence` |
| Главный модуль (оркестрация) | [lib/satellite/coherence.ts](../lib/satellite/coherence.ts) | ✅ getCoherenceSeries() с кешем в БД и fallback'ом |
| Детектор событий | [lib/satellite/coherence-events.ts](../lib/satellite/coherence-events.ts) | ✅ детектит «поле стабильно весь сезон» + drop-события |
| Cross-validation | [lib/verify/satellite.ts](../lib/verify/satellite.ts) | ✅ `CROP_TRIPLE_VALIDATED` когда NDVI + SAR + Coherence согласны |
| UI-блок | [components/SatelliteCard.tsx](../components/SatelliteCard.tsx) | ✅ `CoherenceBlock` со статистикой и таймлайном событий |
| Mock-генератор | [lib/satellite/mock-coherence.ts](../lib/satellite/mock-coherence.ts) | ✅ детерминированные сценарии для демо |
| CDSE SLC catalog | [lib/satellite/cdse-catalog.ts](../lib/satellite/cdse-catalog.ts) | ✅ поиск SLC-пар над полигоном |
| **HyP3 client** | [lib/satellite/hyp3-client.ts](../lib/satellite/hyp3-client.ts) | ⏸️ **SKELETON** — основные функции заглушены |
| Тесты детектора | [scripts/coherence-events.test.ts](../scripts/coherence-events.test.ts) | ✅ 4 фикстуры, `npm run test:coherence` |
| Finding codes | [lib/verify/types.ts](../lib/verify/types.ts) | ✅ `CROP_COHERENCE_FIELD_STABLE`, `CROP_COHERENCE_EVENT`, `CROP_TRIPLE_VALIDATED` |

**Что точно работает:** UI рендерится, детектор находит события, mock-режим
даёт реалистичные ряды, в фрод-чек попадают `CROP_TRIPLE_VALIDATED` (макс.
уверенность) и `CROP_COHERENCE_FIELD_STABLE` (риск 90% субсидии).

**Что не работает:** реальная γ из SLC-пар не считается. Нужен HyP3 или
локальный SNAP-воркер.

## Как подключить настоящие данные

### Вариант A (рекомендуемый) — ASF HyP3

[ASF HyP3](https://hyp3-docs.asf.alaska.edu) — NASA-облако, которое
принимает SLC-пары и возвращает coherence GeoTIFF. **Бесплатно для
академического использования.**

#### Шаг 1: Получить NASA Earthdata аккаунт

1. Зарегистрироваться на [urs.earthdata.nasa.gov](https://urs.earthdata.nasa.gov).
2. Авторизовать приложение «Alaska Satellite Facility» в профиле
   (Applications → Authorize).
3. Прописать в `.env.local`:
   ```
   EARTHDATA_USER=...
   EARTHDATA_PASS=...
   ```

#### Шаг 2: Реализовать клиент

В [lib/satellite/hyp3-client.ts](../lib/satellite/hyp3-client.ts) сейчас
скелет с заглушкой. Заменить `fetchCoherenceFromHyP3()` на 4-шаговый flow:

```typescript
// 1) Найти SLC-пары через CDSE catalog (уже реализовано в cdse-catalog.ts)
const scenes = await searchS1SLC(polygon, { startDate, endDate });
const pairs = buildCoherencePairs(scenes);

// 2) Для каждой пары — submit INSAR job в HyP3
for (const { a, b } of pairs) {
  // POST https://hyp3-api.asf.alaska.edu/jobs (Earthdata auth)
  // job_type: "INSAR_GAMMA"
  // job_parameters: { granules: [a.name, b.name] }
  const jobId = await submitInsarJob(a.name, b.name);
  await pollUntilDone(jobId);  // 10-30 мин
  
  // 3) Скачать coherence GeoTIFF из результата
  const tifBuffer = await downloadCoherenceTif(jobUrls.coherence);
  
  // 4) Усреднить γ по полигону (geotiff.js + точки полигона)
  const { mean, count } = await clipCoherenceMean(tifBuffer, polygon);
  
  // 5) Записать в БД
  await db.insert(fieldSarObservations).values({
    fieldKey: polygonKey(polygon),
    observationDate: b.startDate,
    source: "s1_coherence",
    coherence: mean,
    sampleCount: count,
  });
}
```

**Сложность:** ~2-3 сессии работы. Главное:
- Earthdata OAuth handshake (это HTTP Basic с особенностями)
- geotiff.js (npm) — парсинг и clip-stats
- Background-cron для submit/poll, т.к. job 10-30 мин

#### Шаг 3: Воркер

HyP3-джобы асинхронные. Two patterns:

**Pattern 1: Lazy on-demand.** При открытии страницы инспектора:
- если в БД нет coherence для полигона → submit jobs
- показать «считаем γ, придите через 15 мин» с прогресс-баром

**Pattern 2: Pre-compute via cron.** Раз в неделю обходить всех зарегистрированных юзеров,
для каждого полигона:
- найти новые SLC-пары через CDSE
- submit jobs в HyP3
- по завершении записать в БД

Pattern 2 лучше: UI всегда быстрый, нет ожидания. Реализуется через расширение
существующего endpoint [api/satellite/sar/refresh](../app/api/satellite/sar/refresh/route.ts):
добавить отдельный `/api/satellite/coherence/refresh`.

#### Стоимость

- HyP3: бесплатно для академического использования (NASA SAR Distributed Active Archive Center).
- Квоты: ~1000 jobs/month для academic. Один полигон-сезон ≈ 10-15 пар → 70-100
  юзеров в год без проблем.
- Если бизнес: ~$0.10-0.30 за job у коммерческих сервисов (например, Capella Space).

### Вариант B — Локальный SNAP/pyroSAR воркер

**Когда:** полная независимость от внешних сервисов, есть Linux-сервер с
≥16 ГБ RAM.

**Что нужно:**
1. Docker-образ с SNAP (`mundialis/esa-snap`) или `geomatys/pyrosar`.
2. Python воркер, который:
   - Скачивает SLC через CDSE OData
   - Прогоняет через GPT (Graph Processing Tool) — `BackGeocoding → Interferogram → Coherence Estimation → TerrainCorrection`
   - Subset по полигону, mean γ
   - PUT результат в наш Postgres через REST
3. Очередь (RabbitMQ / Redis Streams).

**Сложность:** недели. Каждый SLC-снимок ~5 ГБ, full chain ~30-60 мин CPU.

### Вариант C — Sentinel Hub BYOC

Кто-то уже посчитал coherence для всего мира и выложил как BYOC-датасет
на Sentinel Hub. Earth Big Data, например.

**Плюсы:** интеграция = 1 evalscript в существующем
[lib/satellite/cdse-provider.ts](../lib/satellite/cdse-provider.ts).
**Минусы:** платно, $50-200/мес.

## Что считается «coherence работает»

После подключения HyP3:
1. `GET /api/satellite/coherence/refresh` обходит юзеров, запускает джобы.
2. Через 10-30 мин в `field_sar_observations` появляются строки с
   `source='s1_coherence'` и реальной γ.
3. На странице инспектора `CoherenceBlock` показывает реальные пары вместо
   моковых.
4. Появляются `CROP_TRIPLE_VALIDATED` findings в реальных кейсах.

## Backtest

Тот же подход, что и для backscatter ([sar-backtest](../scripts/sar-backtest.ts)),
плюс отдельный фикстурный файл с ожидаемыми датами событий по полю.
Точность HyP3-coherence по литературе:
- Harvest: RMSE 5-8 дней
- Sowing: RMSE 7-10 дней
- Tillage: RMSE 3-6 дней

Backtest на ваших полях покажет реальные цифры.
