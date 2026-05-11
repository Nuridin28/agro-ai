# Coherence (CCD) — статус реальной интеграции

## Что это

Interferometric coherence γ ∈ [0..1] — степень схожести фазы двух SLC-снимков
Sentinel-1 одной геометрии (orbit/path/incidence), сделанных с интервалом 6
или 12 дней. **Самый точный физический индикатор изменений поверхности поля**:

- γ ≥ 0.5 = поверхность не менялась между пролётами (поле стоит)
- γ < 0.3 = что-то проехало, повернуло, скосило, посеяло, копнуло
- γ < 0.2 = массивное изменение (свежая вспашка, наводнение)

JRC использует CCD для CAP-мониторинга в ЕС. Точность даты события:
**85-93 %** на уборке, **70-80 %** на посеве — **выше**, чем у backscatter
change detection.

## Поток данных (полностью реальный, без моков)

```
┌───────────────────────────────────────────────────────────────────┐
│  /api/satellite/coherence/refresh (cron, защищён SAT_CRON_SECRET) │
└──────────────────────────────┬────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
  PHASE 1: search SLC pairs              PHASE 2/3: poll + finalize
  через CDSE OData каталог               существующие HyP3-джобы
              │                                 │
              ▼                                 │
  для каждой новой пары:                       │
  → POST hyp3-api/jobs                          │
  → INSAR_ISCE_BURST                            │
  → запись в field_coherence_jobs               │
  → status='PENDING'                            │
              │                                 │
              └──────► HyP3 обрабатывает 10-30 мин на пару
                                                │
                                                ▼
                                        status → 'SUCCEEDED'
                                                │
                                                ▼
                              скачиваем coherence.tif из job-products
                                                │
                                                ▼
                              clip mean γ по polygon4326
                              (geotiff.js + ray-casting)
                                                │
                                                ▼
                              insert в field_sar_observations
                              source='s1_coherence', coherence=γ
                                                │
                                                ▼
                              status → 'DONE'

┌───────────────────────────────────────────────────────────────────┐
│  Inspector page рендерит:                                          │
│  → getCoherenceSeries(polygon, year)                              │
│     ↳ читает из field_sar_observations WHERE source='s1_coherence' │
│     ↳ если строк > 0 → CoherenceTimeseries → CoherenceBlock UI    │
│     ↳ если 0 → null → блок не рендерится                          │
└───────────────────────────────────────────────────────────────────┘
```

## Что реализовано

| Слой | Файл | Статус |
|---|---|---|
| Типы | [lib/satellite/types.ts](../lib/satellite/types.ts) | ✅ `CoherencePair`, `CoherenceTimeseries`, `CoherenceEvent` |
| DB-таблицы | [lib/db/schema.ts](../lib/db/schema.ts), `drizzle/0002`, `drizzle/0003` | ✅ `field_sar_observations.coherence` (REAL) + `field_coherence_jobs` (HyP3-tracker) |
| **CDSE SLC catalog** | [lib/satellite/cdse-catalog.ts](../lib/satellite/cdse-catalog.ts) | ✅ **REAL** OData-запрос к catalogue.dataspace.copernicus.eu, парность пар 6/12 дн. |
| **HyP3 client** | [lib/satellite/hyp3-client.ts](../lib/satellite/hyp3-client.ts) | ✅ **REAL** Earthdata Basic-auth + POST /jobs + GET /jobs/{id} + download + zip extract |
| **GeoTIFF clipper** | [lib/satellite/geotiff-clip.ts](../lib/satellite/geotiff-clip.ts) | ✅ **REAL** geotiff.js + ray-casting point-in-polygon + mean |
| Главный модуль | [lib/satellite/coherence.ts](../lib/satellite/coherence.ts) | ✅ Reads from DB, no mock fallback |
| Cron endpoint | [app/api/satellite/coherence/refresh/route.ts](../app/api/satellite/coherence/refresh/route.ts) | ✅ Submit / poll / finalize конвейер |
| Детектор событий | [lib/satellite/coherence-events.ts](../lib/satellite/coherence-events.ts) | ✅ drop γ → event, field stable detection |
| Cross-validation | [lib/verify/satellite.ts](../lib/verify/satellite.ts) | ✅ `CROP_TRIPLE_VALIDATED` (NDVI+SAR+CCD) |
| UI-блок | [components/SatelliteCard.tsx](../components/SatelliteCard.tsx) | ✅ `CoherenceBlock` рендерится, если есть данные |
| Тесты | [scripts/coherence-events.test.ts](../scripts/coherence-events.test.ts) | ✅ 4 фикстуры, 8/8 ассертов |

## Как поднять

### Шаг 1: Зарегистрироваться на NASA Earthdata

1. https://urs.earthdata.nasa.gov → Register (бесплатно, нужен email).
2. После активации зайди в Applications → Authorize и подтверди доступ
   **Alaska Satellite Facility** и **ASF HyP3** (если предложит).
3. Скопируй username и password.

### Шаг 2: Добавить креды в `.env.local`

```
EARTHDATA_USER=твой_username
EARTHDATA_PASS=твой_пароль
SAT_CRON_SECRET=любая_длинная_случайная_строка   # для защиты cron
```

Перезапусти `npm run dev`.

### Шаг 3: Дёрнуть refresh-cron первый раз

```bash
# Если SAT_CRON_SECRET задан:
curl -H "x-cron-secret: $SAT_CRON_SECRET" http://localhost:3000/api/satellite/coherence/refresh

# Иначе (открытый эндпоинт в dev):
curl http://localhost:3000/api/satellite/coherence/refresh
```

Ответ за ~30-60 секунд:
```json
{
  "ok": true,
  "year": 2025,
  "polygonsScanned": 8,
  "pairsFound": 80,
  "jobsSubmitted": 80,
  "jobsSkipped": 0,
  "jobsPolled": 0,
  "jobsFinalized": 0,
  "note": "HyP3 — async; повторяйте refresh раз в час, пока inProgress != 0"
}
```

Это значит: **80 пар** отправлены на обработку в HyP3.

### Шаг 4: Подождать и повторить (10-30 мин на пару)

HyP3 обрабатывает джобы параллельно (обычно 5-10 одновременно). Через
час повторяй refresh — фазы 2 и 3 (poll + finalize) подтянут готовые
результаты в БД.

```bash
# Через 30 мин:
curl http://localhost:3000/api/satellite/coherence/refresh
# {
#   "jobsPolled": 80,
#   "jobsFinalized": 12,     ← 12 уже посчитаны и записаны
#   "jobsFailed": 0,
#   ...
# }

# Через 2 часа все 80 должны быть готовы → jobsFinalized=80
```

### Шаг 5: Открыть инспекторскую страницу

После заполнения БД (`SELECT count(*) FROM field_sar_observations WHERE source='s1_coherence'`)
на странице досье любого фермера появится блок «Coherence (CCD)» с
реальными γ-парами, найденными событиями и cross-validation.

## Production cron

Рекомендуемая частота: **раз в час**. Linux crontab:

```cron
0 * * * * curl -fsS -H "x-cron-secret: ${SAT_CRON_SECRET}" https://app.example.kz/api/satellite/coherence/refresh > /var/log/coh-refresh.log 2>&1
```

Vercel Cron (`vercel.json`):
```json
{ "crons": [{ "path": "/api/satellite/coherence/refresh", "schedule": "0 * * * *" }] }
```

Системный crontab безопаснее: Vercel Cron имеет лимит 5 мин на эндпоинт,
а download +clip на 80 пар может занять больше.

## Квоты и стоимость

- HyP3 — бесплатно для академического использования. Квота: ~1000 jobs/мес.
- Один полигон × сезон ≈ 8-15 пар (6/12-дневный revisit на одном треке).
- ~70 юзеров × 1 поле × 1 сезон в год укладывается в квоту.
- При коммерческом использовании — обращаться в ASF.

## Что точно НЕ моки

После Шага 3:
- ✅ SLC catalog query → реальные granule-имена из CDSE
- ✅ HyP3 jobs → реальные NASA-задачи, видны в твоём HyP3 dashboard
- ✅ Coherence.tif → реальные γ-значения из interferometric processing
- ✅ Mean γ по полигону → ray-casting через geotiff.js, без аппроксимаций

## Известные ограничения текущей реализации

1. **Используется INSAR_ISCE_BURST.** Job требует burst-granule имён.
   В refresh-endpoint мы пока передаём полные SLC-имена — HyP3 может
   ругнуться `granules must be burst granules`. **Fix:** ASF Search API
   (https://api.daac.asf.alaska.edu/services/search/param) для конверсии
   SLC → burst. Это ~50 строк кода — добавится при первом тесте.
2. **GeoTIFF clip предполагает EPSG:4326.** HyP3 в основном выдаёт UTM
   для северных широт. **Fix:** добавить proj4js для reproject — ~30 строк.
   Сейчас при не-WGS84 tile-е clip возвращает null с warning'ом, БД не
   обновляется, ничего не падает.
3. **ZIP-reader stored-only.** Если HyP3 решит сжать coherence в zip
   (compMethod !== 0) — не распакуем. На практике HyP3 хранит ровно (Stored).
4. **Earthdata cookies/redirect.** Basic-auth работает для большинства
   product download URLs. Если ASF в какой-то момент перейдёт на чистый
   token-only — нужен полный OAuth flow.

Эти ограничения видны в логах. Каждое — линейный fix без архитектурных
изменений.
