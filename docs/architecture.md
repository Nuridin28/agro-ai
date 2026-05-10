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

## Поток обработки заявки

1. **Фермер регистрируется** через `/register` → выбирает хозяйство в Гипрозем-каталоге →
   подтверждает участки → к юзеру привязываются `polygon4326` (контуры полей).
   После регистрации [api/auth/register/route.ts](../app/api/auth/register/route.ts)
   запускает fire-and-forget warmup S1-кеша для каждого полигона.

2. **Фермер подаёт заявку** через `/farmer/applications` ([components/ApplicationForm.tsx](../components/ApplicationForm.tsx))
   с декларацией: культура, площадь, урожайность, дата посева, дата уборки.
   Server action [actions.ts](../app/farmer/applications/actions.ts) валидирует
   и пишет в `applications.cropDeclaration` (jsonb).

3. **Инспектор открывает досье** на `/inspector/farmers/[id]`:
   - Для **F-* (мок)** идёт через `verifyFarmerWithSatellite()` ([lib/verify/index.ts:111](../lib/verify/index.ts))
     — sync-данные (агрохимия, метео из мока) + параллельный fetch NDVI / SAR / inactivity.
   - Для **U-* (реальный юзер)** — `checkUserApplication()` вызывается на каждой
     заявке отдельно; параллельно тянет NDVI и SAR-сводки и пробрасывает в проверку.
   - Карточка спутника `<SatelliteSection>` стримится через `<Suspense>`.

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

## SAR-канал (Sentinel-1)

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
| Спутниковые провайдеры | [lib/satellite/sentinel-hub-provider.ts](../lib/satellite/sentinel-hub-provider.ts), [lib/satellite/cdse-provider.ts](../lib/satellite/cdse-provider.ts), [lib/satellite/mock-provider.ts](../lib/satellite/mock-provider.ts), [lib/satellite/mock-sar.ts](../lib/satellite/mock-sar.ts) |
| NDVI features | [lib/satellite/ndvi.ts](../lib/satellite/ndvi.ts) |
| SAR-сетап и кеш | [lib/satellite/sar.ts](../lib/satellite/sar.ts) |
| SAR-детектор | [lib/satellite/sar-events.ts](../lib/satellite/sar-events.ts) |
| Inactivity-check | [lib/satellite/inactivity.ts](../lib/satellite/inactivity.ts) |
| Verify-движок | [lib/verify/index.ts](../lib/verify/index.ts), [lib/verify/satellite.ts](../lib/verify/satellite.ts), [lib/verify/crop.ts](../lib/verify/crop.ts), [lib/verify/livestock.ts](../lib/verify/livestock.ts) |
| Проверка пользовательских заявок | [lib/applications-check.ts](../lib/applications-check.ts) |
| API-роуты | [app/api/satellite/sar/refresh/route.ts](../app/api/satellite/sar/refresh/route.ts), [app/api/satellite/cron/route.ts](../app/api/satellite/cron/route.ts), [app/api/satellite/verify/route.ts](../app/api/satellite/verify/route.ts), [app/api/satellite/image/route.ts](../app/api/satellite/image/route.ts) |
| UI карточки спутника | [components/SatelliteSection.tsx](../components/SatelliteSection.tsx), [components/SatelliteCard.tsx](../components/SatelliteCard.tsx), [components/RealMeteoCard.tsx](../components/RealMeteoCard.tsx) |
| Метео | [lib/real-meteo.ts](../lib/real-meteo.ts), [lib/mock/meteo.ts](../lib/mock/meteo.ts) |
| Тесты детектора | [scripts/sar-events.test.ts](../scripts/sar-events.test.ts) |
| Backtest на полевых данных | [scripts/sar-backtest.ts](../scripts/sar-backtest.ts) |
| Postgres-схема | [lib/db/schema.ts](../lib/db/schema.ts), [drizzle/](../drizzle/) |

## Гарантии «всё graceful»

Цепочка падений и поведение:
- **Postgres лежит** → страница падает (это блокер). Fix: поднять docker.
- **Sentinel Hub лежит** → NDVI блок не рисуется, остальные каналы работают.
- **CDSE не настроен или лежит** → SAR-блок не рисуется, NDVI работает.
- **Open-Meteo лежит** → Rain filter отключён (детектор работает без фильтра),
  а блок «реальное метео» показывает мок.
- **Полигон у юзера не сохранён при регистрации** → используется квадрат 3×3 км
  вокруг центра района Гипрозема (с предупреждением «приблизительный контур»).
