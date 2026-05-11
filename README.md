# Agro Subsidy Fraud Check

Инспекторская панель для проверки заявок на сельхоз-субсидии в Казахстане.
Каждая заявка с декларацией урожая прогоняется через автоматический
фрод-движок, который сверяет показатели фермера с независимыми спутниковыми
и государственными источниками.

## Что внутри

| Источник | Что даёт |
|---|---|
| **Гипрозем** | агрохимия почвы (P, N, K, гумус) + кадастровые контуры полей |
| **Open-Meteo / Казгидромет** | погода, фенология, исторические осадки (rain-фильтр) |
| **Sentinel-2** (Sentinel Hub Cloud) | оптические снимки и NDVI-ряды |
| **Sentinel-1 GRD** (Copernicus DataSpace) | радарный backscatter VV/VH |
| **Sentinel-1 SLC + ASF HyP3** | interferometric coherence γ (CCD) |
| **Plem.kz / VETIS / ИАС** | племенной учёт скота, вакцинации |
| **БНС / stat.gov.kz** | статистика урожайности |

Все четыре спутниковых канала работают **на реальных данных, без моков**.

## Самые сильные фрод-сигналы

| Finding-код | Severity | Условие | Риск ₸ |
|---|---|---|---|
| `CROP_TRIPLE_VALIDATED` | **critical** | NDVI + SAR + Coherence все три независимо показали «поле не работало» | **100%** |
| `CROP_COHERENCE_FIELD_STABLE` | critical | γ ≥ 0.5 в > 85% пар сезона — поверхность не менялась | 90% |
| `CROP_HARVEST_CROSS_VALIDATED` | critical | NDVI + SAR оба показывают расхождение даты уборки в одну сторону | 80% |
| `CROP_SAR_FIELD_INACTIVE` | high | σ VH за сезон < 1.0 дБ | 70% |
| `CROP_AREA_MISMATCH` | high | заявленная площадь > 1.3× геодезической из polygon4326 | до 100% |

Полный список — в [docs/architecture.md](./docs/architecture.md).

## Стек

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **TypeScript** strict
- **Drizzle ORM** + **PostgreSQL 16**
- **Redis** (rate-limit + кеш Гипрозема)
- **Tailwind v4**
- **geotiff.js** для парсинга HyP3-продуктов
- **Sentinel Hub** + **CDSE OData** + **ASF HyP3** API

## Быстрый старт

```bash
# 1. Postgres + Redis в docker
docker compose up -d postgres redis

# 2. Миграции
npm run db:migrate

# 3. Dev-сервер
npm run dev
```

Откроется на [http://localhost:3000](http://localhost:3000).

Для полной работы спутникового канала нужны:
- `SH_CLIENT_ID` / `SH_CLIENT_SECRET` (Sentinel Hub)
- `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` (Copernicus DataSpace)
- `EARTHDATA_TOKEN` (NASA Earthdata, для HyP3 coherence)

Подробнее — в [docs/operations.md](./docs/operations.md) и
[docs/coherence.md](./docs/coherence.md).

## Тесты

```bash
npm run test:sar          # 11 фикстур детектора SAR-событий
npm run test:coherence    # 8 фикстур coherence-детектора
```

Real-data backtest на казахстанских полях — см.
[scripts/sar-backtest.fixtures.example.json](./scripts/sar-backtest.fixtures.example.json) и
[docs/operations.md#backtest-на-реальных-полях](./docs/operations.md).

## Документация

| Файл | О чём |
|---|---|
| [docs/README.md](./docs/README.md) | Карта документации, быстрый старт |
| [docs/architecture.md](./docs/architecture.md) | Компоненты, поток данных, все finding-коды, модель `UserField.parcels` |
| [docs/operations.md](./docs/operations.md) | CDSE / Earthdata setup, refresh-конвейер, backtest, SQL-снэпшоты |
| [docs/coherence.md](./docs/coherence.md) | CCD-канал, HyP3 INSAR_GAMMA flow, edge-cases |
| [docs/roadmap.md](./docs/roadmap.md) | Что есть, что добавить дальше, приоритеты |

## Лицензия

Внутренний проект. Не публиковать без согласования.
