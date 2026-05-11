# Операции

Эта страница — runbook. Поднять стек, прогреть кеш, запустить тесты,
сделать backtest, переключиться в мок-режим.

## Поднять локально с нуля

```bash
# 1. Postgres + Redis в docker (без app — его запустим локально)
docker compose up -d postgres redis

# 2. Проверить, что healthy
docker compose ps
# postgres   Up X (healthy)
# redis      Up X (healthy)

# 3. Применить миграции
npm run db:migrate
# Должно: [migrate] running migrations... [migrate] done

# 4. Запустить dev (Turbopack)
npm run dev
# Откроется на http://localhost:3000
```

### Если Postgres локальный занят на 5432

В `.env.local` стоит `POSTGRES_PORT=5433`, и docker compose читает эту
переменную. Если на хосте уже стоит свой Postgres на 5432 — проблем нет,
наш контейнер слушает 5433.

⚠️ Compose **не читает `.env.local`** автоматически (читает `.env`).
Поэтому:

```bash
# Передать порт явно:
POSTGRES_PORT=5433 docker compose up -d postgres
```

## Настроить CDSE для SAR

1. Регистрация на [dataspace.copernicus.eu](https://dataspace.copernicus.eu)
   (бесплатно).
2. Зайти в Dashboard → User settings → OAuth clients.
3. Создать клиента, скопировать `Client ID` и `Client Secret`
   (secret показывается **один раз**).
4. В `.env.local`:
   ```
   CDSE_CLIENT_ID=...
   CDSE_CLIENT_SECRET=...
   ```
5. Перезапустить `npm run dev`.

⚠️ Бесплатный тир CDSE держит **~12 месяцев** архива S1. Поэтому мок-сезоны
переведены на 2025 — без свежих данных SAR-канал на демо-фермерах не отработает.

## Настроить ASF HyP3 для Coherence (CCD)

Coherence — третий и **самый сильный** спутниковый канал. NASA-облако
обсчитывает SLC-пары и отдаёт interferometric γ. См.
[docs/coherence.md](./coherence.md) для подробной архитектуры.

### Регистрация (один раз)

1. https://urs.earthdata.nasa.gov → Register (бесплатно).
2. Profile → Applications → Authorized Apps → Authorize:
   - **Alaska Satellite Facility Hyp3 API**
   - **Alaska Satellite Facility Processing Pipeline**
3. Profile → **Generate Token** (или «User Tokens»). Скопировать строку
   (≈ 600 символов). Действует ~60 дней — потом обновлять.

### `.env.local`

```
EARTHDATA_TOKEN=eyJ0eXAi... (Bearer JWT)
SAT_CRON_SECRET=любая_случайная_строка
# Опциональный fallback для скачивания product-файлов:
# EARTHDATA_USER=...
# EARTHDATA_PASS=...
```

Перезапустить `npm run dev`.

### Sanity-check (1 секунда)

```bash
node --env-file=.env.local -e "
fetch('https://hyp3-api.asf.alaska.edu/user', {
  headers: { authorization: 'Bearer ' + process.env.EARTHDATA_TOKEN }
}).then(r => r.json()).then(j => console.log(j.application_status, 'credits:', j.remaining_credits))
"
# Ожидаем: APPROVED credits: 10000
```

### Первый refresh — submit джобов в NASA

```bash
SECRET=$(grep "^SAT_CRON_SECRET=" .env.local | cut -d= -f2)
curl -sS -H "x-cron-secret: $SECRET" \
  http://localhost:3000/api/satellite/coherence/refresh
```

⚠️ **Эндпоинт работает 3-5 минут** на первом прогоне (CDSE catalog scan
по 10+ полигонам + 100 submit-ов в HyP3). Curl может отвалиться по
таймауту — это нормально, submit-ы идут в БД.

### Проверять прогресс

```bash
# Сколько джобов в каком статусе:
PGPASSWORD=agro psql -h localhost -p 5433 -U agro -d agro -tAc \
  "SELECT status, count(*) FROM field_coherence_jobs GROUP BY status"

# Реальные γ-значения, записанные после finalize:
PGPASSWORD=agro psql -h localhost -p 5433 -U agro -d agro -tAc \
  "SELECT count(*) FROM field_sar_observations WHERE source='s1_coherence'"

# Видеть свои джобы на NASA dashboard:
# https://hyp3.asf.alaska.edu/jobs
```

### Производственный cron — раз в час

```cron
0 * * * * curl -fsS -H "x-cron-secret: ${SAT_CRON_SECRET}" https://app.example.kz/api/satellite/coherence/refresh > /var/log/coh-refresh.log 2>&1
```

Каждый вызов:
- **PHASE 1** — submit новых пар (skipped те что уже в БД)
- **PHASE 2** — polling всех PENDING/RUNNING → обновление статуса
- **PHASE 3** — для SUCCEEDED: download `.zip` → ZIP-reader для `_corr.tif`
  → `geotiff.js` + ray-casting clip mean γ по polygon4326 → запись
  в `field_sar_observations` с `source='s1_coherence'` → `status='DONE'`

## Прогрев SAR-кеша

При первом открытии страницы досье SAR-фетч идёт синхронно (5–15 сек).
Чтобы было быстрее — прогревайте заранее.

### Автоматический прогрев

При регистрации юзера через `/register` — fire-and-forget вызов `getS1Series()`
для каждого `polygon4326` (см. [api/auth/register/route.ts](../app/api/auth/register/route.ts)).
Не блокирует ответ, к моменту первого визита кеш уже есть.

### Ручной прогрев (всех полей)

```bash
# По умолчанию — текущий сезон
curl http://localhost:3000/api/satellite/sar/refresh

# Конкретный год (только для CDSE-доступного диапазона):
curl "http://localhost:3000/api/satellite/sar/refresh?year=2025"

# С защитой (если задан SAT_CRON_SECRET):
curl -H "x-cron-secret: $SAT_CRON_SECRET" \
     http://localhost:3000/api/satellite/sar/refresh
```

Ответ:
```json
{
  "ok": true,
  "year": 2025,
  "totalMs": 20673,
  "totalFields": 8,
  "refreshedFields": 8,
  "failedFields": 0,
  "results": [
    { "owner": "F-001", "points": 27, "ms": 4237, "ok": true },
    ...
  ]
}
```

### Системный cron

Эндпоинт защищён `SAT_CRON_SECRET`. Простейший crontab:

```cron
# Раз в неделю, воскресенье 03:00 — обновлять S1-кеш
0 3 * * 0 curl -fsS -H "x-cron-secret: ${SAT_CRON_SECRET}" \
  https://app.example.kz/api/satellite/sar/refresh > /var/log/sar-refresh.log 2>&1
```

На Vercel — `vercel.json`:
```json
{ "crons": [{ "path": "/api/satellite/sar/refresh", "schedule": "0 3 * * 0" }] }
```

## Тесты SAR-детектора

5 фикстур, 11 ассертов: harvest на падении VH, dormant поле, rain-фильтр,
small field, multi-harvest. Без jest/vitest — простой tsx-runner.

```bash
npm run test:sar
npm run test:coherence
```

```
Test 1: harvest event (VH drop -5dB in late August)
  ✓ ряд распознан
  ✓ harvest event found
  ...
========================
passed: 11, failed: 0
```

Если падает — детектор поломали. Файл: [scripts/sar-events.test.ts](../scripts/sar-events.test.ts).
Меняешь пороги в `SAR_THRESHOLDS` ([lib/satellite/sar-events.ts](../lib/satellite/sar-events.ts)) —
прогоняй обязательно.

## Backtest на реальных полях

Для подтверждения, что детектор ловит реальные события на казахстанских полях
(а не только синтетику), нужны размеченные глазами полигоны.

### Шаги

1. **Открыть [EO Browser](https://browser.dataspace.copernicus.eu)** — по слою
   Sentinel-2 NDVI визуально найти 5–10 полей с явным циклом
   рост → пик → падение.
2. **Скопировать координаты** — нарисовать прямоугольник вокруг поля,
   взять GeoJSON через «Export → Polygon». Координаты в `[lng, lat]`.
3. **Глазами разметить даты** — sowing (когда NDVI начал расти),
   harvest (когда упал ниже 0.20), inactivity (если поле было неактивно).
4. **Скопировать** [scripts/sar-backtest.fixtures.example.json](../scripts/sar-backtest.fixtures.example.json)
   в `scripts/sar-backtest.fixtures.json` и заполнить:
   ```json
   [
     {
       "label": "Поле X в Костанае",
       "polygon": [[63.5, 53.2], [63.55, 53.2], ...],
       "year": 2025,
       "groundTruth": {
         "sowingDate": "2025-05-15",
         "harvestDate": "2025-08-25",
         "expectedInactivity": false
       }
     }
   ]
   ```
5. **Прогнать:**
   ```bash
   npm run sar:backtest
   ```
   Вывод:
   ```
   · Поле X (27 точек): harvest pred=2025-08-29 truth=2025-08-25 (Δ=4д) HIT
   ...
   ========================
   harvest: 7/8 (precision @±14д = 88%) · RMSE = 6.2д
   sowing:  5/8 (precision @±14д = 62%) · RMSE = 11.8д
   inactivity: 2/2 (accuracy = 100%)
   ```
6. **Тюнить пороги** в `SAR_THRESHOLDS` пока цифры не устроят, прогонять снова.

⚠️ Backtest зависит от CDSE-кредов. Без них — `npm run sar:backtest` упадёт
с понятной ошибкой.

## Мок-режим (демо без интернета)

Если нет ни SH, ни CDSE — провайдер мок генерирует и NDVI, и SAR.

В `.env.local`:
```
SAT_PROVIDER=mock
```

Что произойдёт:
- NDVI: детерминированная кривая по сценарию полигона
  (см. [lib/satellite/mock-provider.ts](../lib/satellite/mock-provider.ts))
- SAR: детерминированный VV/VH ряд с теми же сценариями
  (см. [lib/satellite/mock-sar.ts](../lib/satellite/mock-sar.ts))
- Карточка спутника, события, finding-коды — всё рисуется
- Backtest и `/api/satellite/sar/refresh` тоже работают на моке

Сценарии (по centroid полигона):
- `medium` — норма (F-001, F-006, F-014)
- `weak` — слабая вегетация (F-002, F-005)
- `late_growth` — поздний рост (F-003, F-004)
- `no_sowing` — поле спит (можно подкрутить для F-008)
- `post_subsidy_inactive` — посев был, потом тишина

## Проверка работоспособности

Минимальный smoke-тест после деплоя:

```bash
# Frontend жив
curl -fsS http://localhost:3000/ -o /dev/null && echo "OK: /"

# Inspector dashboard
curl -fsS http://localhost:3000/inspector -o /dev/null && echo "OK: /inspector"

# Demo-фермер с спутником
curl -fsS http://localhost:3000/inspector/farmers/F-003 -o /dev/null && echo "OK: F-003"

# SAR refresh (если CDSE настроен)
curl -fsS http://localhost:3000/api/satellite/sar/refresh | head -c 200

# Сколько SAR-наблюдений в БД
PGPASSWORD=agro psql -h localhost -p 5433 -U agro -d agro -tAc \
  "SELECT count(*), count(DISTINCT field_key) FROM field_sar_observations"
```

## Сборка прод-образа

```bash
npm run build
npm run start
```

Build — Turbopack, с пререндером статики. Все `*` — `ƒ` (server-rendered) или
`●` (SSG with generateStaticParams). Спутниковые карточки рендерятся через
`<Suspense>` — стримятся после основного HTML.

Docker:
```bash
# Полный стек (postgres + redis + app)
docker compose up -d
```

⚠️ Контейнер `app` запускает миграции на старте через
[docker-entrypoint.sh](../docker-entrypoint.sh). Если миграция упадёт — контейнер
не стартует.

## Полезные SQL-снэпшоты

```sql
-- Сколько наблюдений S1 в кеше, по годам и типу (backscatter / coherence)
SELECT EXTRACT(year FROM observation_date)::int AS year, source, count(*)
FROM field_sar_observations GROUP BY 1, 2 ORDER BY 1, 2;

-- Состояние HyP3-джобов (PENDING/RUNNING/SUCCEEDED/FAILED/DONE)
SELECT status, count(*), min(submitted_at), max(completed_at)
FROM field_coherence_jobs GROUP BY 1 ORDER BY 1;

-- Coherence-значения по полям (после того как джобы дойдут до DONE)
SELECT field_key, observation_date, round(coherence::numeric, 2) as gamma,
       sample_count
FROM field_sar_observations
WHERE source = 's1_coherence'
ORDER BY field_key, observation_date LIMIT 20;

-- Топ-5 полей с наибольшим количеством событий
SELECT field_key, count(*), min(observation_date), max(observation_date)
FROM field_sar_observations
GROUP BY 1 ORDER BY 2 DESC LIMIT 5;

-- Все юзеры с привязанными полигонами
SELECT id, email, farm_name, jsonb_array_length(fields) as fields_count
FROM users
WHERE jsonb_array_length(fields) > 0;

-- Заявки с декларацией урожая (для фрод-чека)
SELECT id, farmer_id, type, status, date,
       crop_declaration->>'crop' as crop,
       crop_declaration->>'declaredYieldCha' as yield_cha,
       crop_declaration->>'declaredHarvestDate' as harvest_date
FROM applications
WHERE crop_declaration IS NOT NULL
ORDER BY submitted_at DESC LIMIT 20;
```

## Сброс данных

```bash
# Удалить только SAR + Coherence наблюдения (для force-refresh)
PGPASSWORD=agro psql -h localhost -p 5433 -U agro -d agro -c \
  "TRUNCATE field_sar_observations"

# Удалить HyP3 jobs-трекер (повторит submit всех пар при следующем refresh)
PGPASSWORD=agro psql -h localhost -p 5433 -U agro -d agro -c \
  "TRUNCATE field_coherence_jobs"

# Удалить дисковый NDVI-кеш
rm -rf /tmp/agro-sat-cache

# Полный wipe (потеряешь юзеров и заявки!)
docker compose down -v
docker compose up -d postgres redis
npm run db:migrate
```
