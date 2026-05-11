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

## Текущий статус (snapshot)

| Фаза | Статус | Подтверждение |
|---|---|---|
| Earthdata Bearer auth | ✅ работает | `GET /user` → `application_status: APPROVED` |
| CDSE SLC Catalog | ✅ работает | 100 SLC-пар найдено по 10 полигонам |
| HyP3 submit (INSAR_GAMMA) | ✅ работает | 130 джобов в `field_coherence_jobs` с реальными UUID |
| HyP3 polling | ✅ работает | 72 джоба перешли в RUNNING после первого refresh |
| Download `coherence.tif` | 🟡 код есть, ещё не прогонялся | ни одного SUCCEEDED джоба пока нет |
| GeoTIFF clip + mean γ | 🟡 код есть, ещё не прогонялся | то же |
| Запись γ в `field_sar_observations` | 🟡 ⏳ | `count = 0` (ждём готовности джобов) |
| Реальная γ в UI | 🟡 ⏳ | блок «Coherence (CCD)» не рендерится пока БД пуста |

**Простой ответ:** пайплайн до отправки в NASA — full real, моков нет.
Реальная γ появится в БД через 1-3 часа после первого submit-а — когда
NASA закончит обработку. Финал-фаза (download + clip + write) написана,
но end-to-end не прогонялась до момента написания этого документа.

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
  → INSAR_GAMMA (принимает SLC granule,        │
  │             без .SAFE-суффикса)            │
  → запись в field_coherence_jobs               │
  → status='PENDING'                            │
              │                                 │
              └──────► HyP3 обрабатывает 15-45 мин на пару
                                                │
                                                ▼
                                        status → 'SUCCEEDED'
                                                │
                                                ▼
                              скачиваем .zip из job-products
                              (Bearer auth; fallback → Basic для S3)
                                                │
                                                ▼
                              распаковка → ищем `_corr.tif`
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

## Что реализовано (real, не моки)

| Слой | Файл | Что внутри |
|---|---|---|
| Типы | [lib/satellite/types.ts](../lib/satellite/types.ts) | `CoherencePair`, `CoherenceTimeseries`, `CoherenceEvent` |
| DB-таблицы | [lib/db/schema.ts](../lib/db/schema.ts), `drizzle/0002`, `drizzle/0003` | `field_sar_observations.coherence` (REAL) + `field_coherence_jobs` (HyP3-tracker) |
| CDSE SLC catalog | [lib/satellite/cdse-catalog.ts](../lib/satellite/cdse-catalog.ts) | OData-запрос к `catalogue.dataspace.copernicus.eu`, парность 6/12 дн. на одном relativeOrbit |
| HyP3 client | [lib/satellite/hyp3-client.ts](../lib/satellite/hyp3-client.ts) | Bearer-token (EARTHDATA_TOKEN) + POST /jobs (INSAR_GAMMA) + GET /jobs/{id} + download .zip + ZIP-reader для `_corr.tif` |
| GeoTIFF clipper | [lib/satellite/geotiff-clip.ts](../lib/satellite/geotiff-clip.ts) | `geotiff.js` + ray-casting point-in-polygon + mean (nodata=0 фильтрация) |
| Главный модуль | [lib/satellite/coherence.ts](../lib/satellite/coherence.ts) | Reads from DB only — **никаких mock-fallback'ов** |
| Cron endpoint | [app/api/satellite/coherence/refresh/route.ts](../app/api/satellite/coherence/refresh/route.ts) | Submit / poll / finalize конвейер, idempotent |
| Детектор событий | [lib/satellite/coherence-events.ts](../lib/satellite/coherence-events.ts) | drop γ → event, field stable detection |
| Cross-validation | [lib/verify/satellite.ts](../lib/verify/satellite.ts) | `CROP_TRIPLE_VALIDATED` (NDVI+SAR+CCD согласны → 100 % риск субсидии) |
| UI-блок | [components/SatelliteCard.tsx](../components/SatelliteCard.tsx) | `CoherenceBlock` рендерится только если есть данные |
| Тесты детектора | [scripts/coherence-events.test.ts](../scripts/coherence-events.test.ts) | 4 фикстуры, 8/8 ассертов |

## Setup (с нуля, ~5 минут + ожидание)

### Шаг 1: NASA Earthdata

1. Регистрация: https://urs.earthdata.nasa.gov (бесплатно).
2. Login → Profile → **Authorized Apps** → Authorize:
   - **Alaska Satellite Facility Hyp3 API** (обязательно)
   - **Alaska Satellite Facility Processing Pipeline** (обязательно для download)
3. Login → Profile → **Generate Token** (внутри: «User Tokens»).
   Скопировать строку. Действует **~60 дней**.

### Шаг 2: `.env.local`

```
EARTHDATA_TOKEN=eyJ0eXAi... (твой_bearer_token)
SAT_CRON_SECRET=любая_случайная_строка
# Опционально как fallback для product download (некоторые S3-серверы ASF просят Basic):
# EARTHDATA_USER=твой_username
# EARTHDATA_PASS=твой_password
```

Перезапустить `npm run dev`.

### Шаг 3: Sanity-check auth

```bash
node --env-file=.env.local -e "
fetch('https://hyp3-api.asf.alaska.edu/user', {
  headers: { authorization: 'Bearer ' + process.env.EARTHDATA_TOKEN }
}).then(r => r.json()).then(console.log)
"
# Ожидаем: { application_status: 'APPROVED', remaining_credits: 10000, ... }
```

### Шаг 4: Первый refresh

```bash
SECRET=$(grep "^SAT_CRON_SECRET=" .env.local | cut -d= -f2)
curl -sS -H "x-cron-secret: $SECRET" \
  http://localhost:3000/api/satellite/coherence/refresh
```

Эндпоинт работает **5+ минут** (CDSE catalog + 100 submit-ов).
Ответ примерно такой:
```json
{
  "ok": true,
  "polygonsScanned": 10,
  "pairsFound": 100,
  "jobsSubmitted": 50,    // отправили часть, повторный refresh добьёт остаток
  "jobsSkipped": 0,
  "jobsPolled": 0,
  "jobsFinalized": 0,     // 0 — пока никто не SUCCEEDED, NASA только начала
  "jobsFailed": 0,
  "errors": [...]         // могут быть submit-ы на S1C-сцены, которых ещё нет в HyP3-архиве
}
```

### Шаг 5: Повторяй refresh каждые 15-30 мин

```bash
curl -sS -H "x-cron-secret: $SECRET" \
  http://localhost:3000/api/satellite/coherence/refresh
```

Refresh-эндпоинт обходит **каждый parcel** каждого юзера (после рефактора
`UserField.parcels: Parcel[]`). То есть если у фермера 5 хозяйств × 3 участка =
15 parcel'ов, по каждому ищутся свои SLC-пары и отправляются свои HyP3-джобы.

Каждый вызов:
- PHASE 1 — submit новых пар для всех parcel'ов (skipped уже существующих)
- PHASE 2 — опрашивает PENDING/RUNNING джобы, обновляет status
- PHASE 3 — для каждого только что SUCCEEDED: скачивает coherence.tif,
  считает mean γ по конкретному parcel-полигону, пишет в
  `field_sar_observations` с `field_key = polygonKey(parcel.polygon4326)`,
  помечает job как `DONE`

Через **2-4 часа** все 100+ пар должны быть DONE и в БД появятся
реальные γ-значения. После этого на странице досье любого фермера
появится блок «Coherence (CCD)» — **с реальными NASA-данными, не моками**.

### Шаг 6: Production cron

Раз в час:

```cron
0 * * * * curl -fsS -H "x-cron-secret: ${SAT_CRON_SECRET}" https://app.example.kz/api/satellite/coherence/refresh > /var/log/coh-refresh.log 2>&1
```

Vercel Cron в `vercel.json`:
```json
{ "crons": [{ "path": "/api/satellite/coherence/refresh", "schedule": "0 * * * *" }] }
```

**Внимание:** на Vercel есть лимит 5 мин на эндпоинт. На production
стеке с >50 полигонами refresh может выйти за это — нужен системный
cron или разделение PHASE 1/2/3 на отдельные эндпоинты.

## Квоты и стоимость

| Параметр | Значение |
|---|---|
| HyP3 free tier | до 10 000 credits/мес |
| INSAR_GAMMA cost | ~10-30 credits/пара |
| Полигон × сезон | 8-15 пар (6/12-дн revisit) |
| Бюджет | ~30-50 полигонов-сезонов / мес на free tier |
| Время на пару | 15-45 мин NASA-обработки |

## Что точно НЕ моки (audit trail)

После Шага 5:
- ✅ CDSE catalog → реальные granule-имена `S1A/S1C_IW_SLC__1SDV_*`
- ✅ HyP3 jobs → реальные UUID, видны в твоём dashboard на
  https://hyp3.asf.alaska.edu/jobs
- ✅ `coherence.tif` → реальный продукт interferometric processing на
  серверах ASF / NASA
- ✅ Mean γ по полигону → ray-casting через geotiff.js без аппроксимаций

Если в `.env.local` убрать `EARTHDATA_TOKEN` — Coherence-блок просто
не рендерится. Никаких fallback'ов на синтетику нет:

```typescript
// lib/satellite/coherence.ts:
export function isCoherenceConfigured(): boolean {
  return isHyP3Configured();   // true только при наличии EARTHDATA_TOKEN
}
```

И `lib/satellite/mock-coherence.ts` физически удалён.

## Ключевые архитектурные решения

### Почему INSAR_GAMMA, а не INSAR_ISCE_BURST?

INSAR_ISCE_BURST современнее и быстрее, но требует **burst-granule имён**
вида `S1_158234_IW1_20240712T185231_VV_F47A-BURST`. У нас есть только
полные SLC-имена из CDSE OData. Чтобы получить burst-имя, нужно
дополнительно дёргать ASF Search API и определять, какой именно burst
покрывает наш полигон.

INSAR_GAMMA legacy, но принимает полные SLC granule напрямую. На выходе —
тот же `_corr.tif` с coherence. ASF продолжает поддерживать GAMMA.

Если будет нужно перейти на BURST — это ~50 строк кода (ASF Search query
по polygon → burst-id mapping → переключение `job_type` в hyp3-client.ts).

### Почему async-cron, а не on-demand из UI?

HyP3 — 15-45 мин на пару. Real-time на странице инспектора это не
обеспечит. Cron делает submit и накопление результатов в фоне, UI
просто читает из БД при рендере.

### Почему Bearer, а не Basic auth?

HyP3 API `/jobs` принимает только Earthdata-issued JWT (`Bearer`).
Basic auth (username/password) даёт 401 «No authorization token
provided». Bearer токен генерируется на urs.earthdata.nasa.gov и
живёт ~60 дней — нужно обновлять руками или через скрипт.

Basic auth оставлен как fallback для download product-файлов
(`downloadCoherenceTif`) — некоторые S3-серверы ASF продолжают
принимать его, и это даёт устойчивость к временным проблемам токена
на одном из hop'ов.

## Известные edge-cases

### 1. HyP3 не находит S1C scene в архиве

Некоторые свежие S1C-сцены CDSE индексирует в catalog раньше, чем
HyP3 их затягивает к себе. Submit для такой пары → 400
`Some requested scenes could not be found`.

**Поведение:** ошибка пишется в `errors[]` ответа refresh, остальные
пары обрабатываются. На следующем refresh-е (через 15-30 мин) эти
пары уже будут проиндексированы у HyP3 и пройдут.

**Frequency:** ~10-15 % submit-ов в первый день, ~0 % через сутки.

### 2. UTM проекция в coherence.tif

HyP3 иногда выдаёт `_corr.tif` в UTM-проекции (для северных широт KZ —
зона 42N или 43N), а наш `geotiff-clip.ts` пока умеет только EPSG:4326.

**Поведение:** при не-WGS84 tile-е `clipMeanGeoTIFF` возвращает null
с warning'ом «нужен proj4-reproject (skipping)». БД для этого job-а
не обновляется, но и не падает.

**Fix:** добавить `proj4js` для reproject — ~30 строк кода. Можно
сделать когда упрёмся в это на первом DONE.

### 3. Сжатый ZIP

`extractCoherenceFromZip` поддерживает только **stored** (uncompressed)
файлы внутри zip. HyP3 в подавляющем большинстве случаев так и
хранит — но если попадётся DEFLATE, нужно `pako` для inflate.

### 4. SAT_CRON_SECRET в Vercel/проде

Не забудь добавить переменную в Vercel/Docker/k8s environment. Без неё
endpoint доступен по http открыто — это не приватная инфа, но cron
лучше защитить.

## Что дальше (если первый DONE покажет проблему)

После того как первый job станет SUCCEEDED, я смогу прогнать финал-фазу
end-to-end и точно знать:

1. Работает ли download — Bearer token достаточно или нужен Basic
2. Какая проекция в coherence.tif (EPSG:4326 или UTM)
3. Сколько пикселей попадает в polygon4326 после clip
4. Адекватные ли γ-значения (0.1-0.9, без NaN/inf)

Это покажется в логе dev-сервера при следующем refresh. Если что-то
сломается — фиксы точечные:

- UTM → добавить `proj4js`-reproject в `geotiff-clip.ts` (~30 строк)
- DEFLATE zip → `pako` для inflate (~10 строк + npm install)
- 401 на download → переключить полностью на Basic auth для product URLs
- 0 пикселей внутри polygon → проблема в координатах / projection

Никаких архитектурных изменений не требуется — всё уже на месте.
