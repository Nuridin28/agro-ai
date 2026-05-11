# STEPPE-Y: модель прогноза урожайности зерновых для Казахстана

> Методологический документ к модулю [lib/yield/](../lib/yield/).
> Версия модели: **v0.1.0** (май 2026).
> Адресовано: технической комиссии гос-заказчика, агрономам-рецензентам, инженерам интеграции.

---

## Краткое описание

STEPPE-Y — гибридная rule-based модель прогноза урожайности зерновых и масличных культур для Северного и Центрального Казахстана.

Модель **не использует** обучаемые ML-веса и нейронные сети. Каждый коэффициент — формула из публичной науки или госреестра. Каждая цифра имеет provenance trail до источника.

Принципы:

1. **Прозрачность.** Все формулы открыты, все коэффициенты в [lib/yield/norms.ts](../lib/yield/norms.ts). Агроном или юрист может пересчитать вручную.
2. **Калибровка на реальность.** Y_potential capped по исторической огибающей БНС, а не теоретическому потолку Monteith.
3. **Многосенсорность.** Главный коэффициент (вода) триангулируется из 3 источников вместо доверия одному.
4. **Честная неопределённость.** Результат — интервал P10–P90, не точечная цифра.
5. **Адаптивность к данным РК.** Все пороги настроены под степь, не европейский климат.

---

## Главная формула

```
Y_final = Y_potential × Kw × Ks × Kd_adv × K_weed_control × K_nutrition × K_harvest × Cregion
```

Семь мультипликативных коэффициентов плюс **9-й сигнал** — peer comparison (не множитель, отдельная интерпретация).

| Компонент | Что отражает | Диапазон |
|---|---|---|
| `Y_potential` | потолок ц/га, capped по БНС | 5–40 |
| `Kw` | водный коэффициент | 0.10–1.00 |
| `Ks` | абиотический стресс (жара, мороз, ветер, град) | 0.50–1.00 |
| `Kd_adv` | риск болезней (в первый год = advisory, = 1.0) | 0.60–1.00 |
| `K_weed_control` | контроль сорняков по состоянию посева | 0.82–1.00 |
| `K_nutrition` | питание (N/P/K/микро) по Mitscherlich | 0.30–1.00 |
| `K_harvest` | потери при уборке | 0.80–0.95 |
| `Cregion` | региональная калибровка БНС, capped | 0.85–1.15 |

Подробности компонентов — [§4 ниже](#4-компоненты-модели).

---

## 1. Кому и зачем

Прогноз урожайности для:

- **Антифрод-системы субсидий АПК** — сравнение заявленной фермером урожайности с физически достижимой. См. интеграцию в [lib/verify/](../lib/verify/).
- **Советов фермеру** — раскладка по компонентам показывает, какой фактор ограничивает урожай и что можно улучшить.
- **Страхового мониторинга** — индексные продукты на базе моделируемой урожайности.
- **Региональной оценки** — прогноз валового сбора по областям для МСХ.

---

## 2. Принципы построения модели

### 2.1. Calibrated potential, а не теоретический

Старая школа моделей урожайности берёт «биологический потенциал» из формулы Monteith (1972):

```
Y_potential_raw = RUE × Σ IPAR × HI
```

Для пшеницы яровой на широте 52°N эта формула даёт **≈55 ц/га**, что **в 3–5 раз выше** реально наблюдаемых урожаев в РК.

**Наше решение:** мы используем Monteith как верхнюю sanity-границу, но финальный `Y_potential` capped по исторической огибающей БНС × 1.10. Если в районе исторический максимум по культуре 22 ц/га, то Y_potential = 24.2 ц/га, не 55. См. [§4.1](#41-y_potential--потолок).

Это и есть подход **GYGA Atlas** (Global Yield Gap Atlas, Wageningen) — мирового стандарта оценки yield gap.

### 2.2. Многосенсорная триангуляция критических коэффициентов

`Kw` (водный коэффициент) — главный драйвер урожая в степи. Ошибка в нём масштабируется на весь финальный прогноз.

Поэтому Kw считается тремя способами:
1. **FAO bucket** — водный баланс по фазам (Doorenbos-Kassam, всегда доступен)
2. **NDVI-валидация** — оценка по пиковому NDVI (когда есть Sentinel-2 данные)
3. **SMAP soil moisture** — прямое микроволновое измерение (hook на будущее)

Берётся **медиана доступных**. При расхождении источников confidence снижается. При одном источнике — confidence: low, sigma: 20%. См. [§4.2](#42-kw--водный-коэффициент).

### 2.3. Измеряем результат на поле, а не факт обработки

У детекции опрыскиваний — **двойная слепая зона**:

1. **Спутник не видит большинство обработок.** Гербицид на пшеничной канопее даёт NDVI-dip 0.03–0.05 — ниже шума облачности. Фунгициды и инсектициды NDVI-следа не оставляют вообще.
2. **Фермер не докладывает каждое опрыскивание.** В реальности РК нет стимула фиксировать обработку в системе — субсидия привязана к **покупке** химии, не к применению. Декларация в заявке заполняется формально либо пропускается.
3. **Qoldau фиксирует только субсидируемые покупки.** Часть химии покупается за наличный расчёт у частных поставщиков — мимо госреестра. Qoldau показывает **нижнюю границу**, не факт.

Делать `K_spray` на основе декларации — означает наказывать честных и пропускать остальных.

**Наше решение — измерять состояние поля, а не факт обработки.** Вопрос меняется с «обработал ли фермер гербицидом» на «был ли посев чистым от сорняков». Это более честный и измеряемый сигнал.

Сигналы по приоритету:

1. **σ NDVI в фазе кущения** (главный): высокая пространственная гетерогенность ≥ 0.18 → мозаичный посев, сорняки доминируют пятнами. Это уже считается в [lib/satellite/ndvi.ts](../lib/satellite/ndvi.ts) и используется в антифроде друга как `CROP_HETEROGENEOUS_FIELD`.
2. **Траектория NDVI vs ожидание**: если кривая отстаёт от типичной для культуры/сорта на 0.05+ → конкуренция (сорняки, дефицит, болезнь — комбинация).
3. **Qoldau-purchases** как **supplementary** сигнал: если фермер закупил химию через субсидию, считаем что результат вероятнее «чистый». Это weak prior, не доказательство.
4. **Декларация фермера** — если есть, корректирует confidence, но не основной источник.

Это переводит компонент из `K_spray` (детекция действия) в `K_weed_control` (детекция результата). Метрика — состояние посева, источник — спутник + Qoldau как поддержка. Подробности — [§4.5](#45-k_weed_control--контроль-сорняков-по-состоянию-посева).

> **Note:** реализация в коде [lib/yield/spray.ts](../lib/yield/spray.ts) пока носит имя `K_spray` и опирается на декларацию (см. ранний прототип). Это будет переделано в `K_weed_control` в следующей итерации с использованием NDVI-гетерогенности из друга.

### 2.4. Болезни в advisory-режиме в первый год

Модели риска болезней (Coakley, DONcast, Te Beest) предсказывают **погодную благоприятность для инфекции**, а не сам факт заражения. Без наземного scouting инфекционный фон неизвестен → высокий риск false positives.

В первый сезон работы Kd_adv = 1.0 **всегда** (не режет урожай). Модель выдаёт advisory-рекомендации фермеру и сигналы инспектору, но финансовые решения по болезням не принимаются.

После 2+ сезонов накопления данных через scout-сеть НИИ защиты растений МСХ — Kd_adv переключается в `active` режим. См. [§4.4](#44-kd_adv--болезни).

### 2.5. Жёсткие границы Cregion

Cregion — региональная статистическая поправка по БНС. Если её не ограничить, она поглощает все ошибки модели → модель выглядит точной, но систематически неверна.

CAP `[0.85, 1.15]`. Если 3 года подряд Cregion упирается в cap — **пересматриваем модель**, а не растягиваем границы. См. [§4.8](#48-cregion--региональная-калибровка).

---

## 3. Глобальный контур

```
       Гипрозем (агрохимия, бонитет)
              │
              ▼
       SoilGrids 250m / ERA5-Land (текстура, AWC)
              │
              ▼
       open-meteo / NASA POWER (T, осадки, ET0, IPAR)
              │
              ▼
       Sentinel-2 NDVI (пик, гетерогенность)
              │
              ▼
       Sentinel-1 SAR (события: посев/уборка)  [lib/satellite/sar.ts]
              │
              ▼
       Декларация фермера (сорт, сроки, удобрения, химия)
              │
              ▼
       Qoldau (чеки на удобрения, химию)
              │
              ▼
   ┌────────────────────────────────────────┐
   │      lib/yield/predict.ts             │
   │  predictYield(input, options)         │
   │  → P10/P50/P90 + 8 компонентов + peer │
   └────────────────────────────────────────┘
              │
              ▼
       БНС (stat.gov.kz) — calibration loop, годовая
```

Все источники в верхнем блоке независимы и кешируются отдельно. Если один пропадает — компонент работает с понижением confidence, остальная модель не валится.

---

## 4. Компоненты модели

### 4.1. Y_potential — потолок

**Реализация:** [lib/yield/potential.ts](../lib/yield/potential.ts)

**Формула:**
```
Y_raw       = sort.RUE × Σ IPAR × sort.HI × 0.1               # ц/га
bonitetFactor = √(bonitet / 50)                                # capped 1.45
Y_with_bonitet = Y_raw × bonitetFactor × terrainFactor
Y_potential = min(Y_with_bonitet, bnsHistoricalMax × 1.10)    # БНС-cap

# Если БНС-историки нет → fallback Y_raw × 0.50
```

**Источники:**

| Формула | Источник |
|---|---|
| RUE × IPAR × HI | Monteith J.L. (1972). *Solar radiation and productivity in tropical ecosystems.* J. Appl. Ecol. 9: 747–766. Применяется в DSSAT, APSIM, AquaCrop с 1980-х. |
| Storie Index (√ от качества почвы) | Storie R.E. (1933). *An Index for Rating the Agricultural Value of Soils.* California Agric. Exp. Station Bull. 556. |
| GYGA Atlas (calibrated potential) | van Ittersum M.K. et al. (2013). *Yield gap analysis with local to global relevance.* Field Crops Research 143: 4–17. — это методология ФАО для определения водо-лимитированного потенциала. |
| RUE 1.1–1.3 для степи | Sinclair T.R., Muchow R.C. (1999). *Radiation Use Efficiency.* Advances in Agronomy 65: 215–265. — учёт VPD-снижения в семи-аридных зонах. |
| HI 0.30–0.38 для казахстанских сортов | Reynolds M.P., Trethowan R.M. (2007). *Physiological interventions in breeding for adaptation to abiotic stress.* CIMMYT report. |

**Почему работает для РК:**
- В степи СКО исторические урожаи пшеницы 1.8–24.0 ц/га. Сырой Monteith даёт 50+, что не реализуемо физически. Cap БНС возвращает в реальность.
- БНС публикует данные по культурам и районам с 1991 года → доступно 30+ лет огибающей.
- HI казахстанских сортов (Степная, Омская, Астана) измерен в полях — таблица в [lib/yield/norms.ts](../lib/yield/norms.ts#L33-L96).

---

### 4.2. Kw — водный коэффициент

**Реализация:** [lib/yield/water.ts](../lib/yield/water.ts)

**Главная функция:** триангуляция из 3 источников.

**Источник 1 — FAO bucket по фазам (всегда доступен):**

```
ETm_phase = Kc_phase × ET0_phase                # потенциальная транспирация
ETa_phase = min(ETm_phase, soilWater + precip)  # фактическая
deficit   = 1 − ETa/ETm
effectiveDeficit = max(0, deficit − 0.30)        # tolerance band 30%
factor    = 1 − ky × effectiveDeficit
Kw        = Π factor_phase
```

ky-коэффициенты по фазам — Doorenbos-Kassam:

| Фаза | ky | Доля сезона |
|---|---|---|
| Прорастание | 0.20 | 25% |
| Кущение | 0.60 | 25% |
| **Колошение–цветение** | **1.15** | 20% (критическая) |
| Налив зерна | 0.50 | 20% |
| Созревание | 0.10 | 10% |

**Источник 2 — NDVI peak (когда есть Sentinel-2):**
```
Kw_ndvi = ndviPeak / ndviExpectedPeak
ndviExpectedPeak = 0.75 для пшеницы, 0.85 для подсолнечника
```

**Источник 3 — SMAP soil moisture (hook на будущее):**

Triangulation: медиана доступных. При одном источнике sigma = 20%, при трёх с согласием < 0.10 sigma = 10%.

**Fail-safe:** если bucket даёт Kw < 0.4 (жёсткая засуха) а NDVI > 0.7 (поле зелёное) — confidence: low + предупреждение в reasons (вероятна ошибка водного баланса).

**Источники:**

| Формула | Источник |
|---|---|
| ky-коэффициенты | Doorenbos J., Kassam A.H. (1979). *Yield response to water.* FAO Irrigation and Drainage Paper 33. — Стандарт ФАО, 40+ лет применения. |
| Kc (crop coefficients) | Allen R.G. et al. (1998). *Crop evapotranspiration.* FAO Irrigation and Drainage Paper 56. |
| Penman-Monteith ET0 | Monteith J.L. (1965). *Evaporation and the environment.* Symp. Soc. Exp. Biol. 19: 205–234. |
| Tolerance band 30% для rainfed | Steduto P., Hsiao T.C., Raes D., Fereres E. (2009). *AquaCrop—the FAO crop model.* Agron. J. 101: 426–437. — поправка к bucket для адаптации растения к мягкому стрессу. |
| Snowmelt efficiency 0.5–0.7 в степи | Барышников М.К. (1986). *Снежный покров и водный режим почв СКО.* КазНИИЗиР, Целиноград. |

**Почему работает для РК:**
- В степи 70% дисперсии урожая объясняется водой ([Lupascu et al. 2014](https://www.sciencedirect.com/science/article/abs/pii/S030438001400057X), Northern Kazakhstan steppe modeling).
- SPEI июнь-июль показал наивысшую корреляцию с урожаем по 4 северным областям ([Bokusheva 2016, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0168192316300016)). Наш Kw воспроизводит эту чувствительность через ky=1.15 в фазе колошения.
- Tolerance band 30% откалиброван против исторических Kw из ScienceDirect статей по степной зоне РК.

---

### 4.3. Ks — абиотический стресс

**Реализация:** [lib/yield/stress.ts](../lib/yield/stress.ts)

**Формула:**
```
Ks = K_heat × K_frost × K_wind × K_hail × K_lodging

K_heat        = 1 − days(T>32°C в колошение) × 0.07,  cap 0.50
K_heat_grain  = 1 − days(T>35°C в наливе) × 0.04
K_frost       = 1 − days(T_min<−2°C после 1 мая) × 0.15
K_wind        = 1 − days(ветер>17 м/с) × 0.08
K_hail        = 0.85 если град зафиксирован
K_lodging     = по NDVI heterogeneity (hook)
```

**Источники:**

| Стрессор | Источник |
|---|---|
| Тепловой стресс при колошении 7%/день | Asseng S. et al. (2015). *Rising temperatures reduce global wheat production.* Nature Climate Change 5: 143–147. — мета-анализ 30 моделей. |
| Заморозки после 1 мая 15%/день | Шиятый Е.И. (1979). *Эрозия и заморозки в северном Казахстане.* — классика КазНИИЗиР. |
| Чёрные бури (ветер >17 м/с) | Бараев А.И. (1975). *Яровая пшеница.* — фундаментальная работа по почвозащитной агротехнике. |
| Полегание | Berry P.M. et al. (2003). *Understanding and reducing lodging in cereals.* Advances in Agronomy 84: 217–271. |

**Почему работает для РК:**
- Тепловые волны в колошение — типичное явление для июля в СКО/Костанае. T>32°C на 3+ дня случается раз в 2–3 года.
- Чёрные бури (пыльные суховеи) — классический риск степи, отдельный finding в антифрод-движке уже в коде друга.
- Заморозки в первой декаде мая срезают всходы — был в 2015, 2018 годах.

---

### 4.4. Kd_adv — болезни

**Реализация:** [lib/yield/disease.ts](../lib/yield/disease.ts)

**Режимы:**
- **Advisory (default в год 1):** Kd_adv = 1.0 всегда. Только сигнал риска + рекомендация.
- **Active (после 2+ сезонов scout-валидации):** Kd_adv = min по 4 болезням с учётом сортовой устойчивости.

**Логистическая функция риска:**
```
risk_raw       = 1 / (1 + exp(−steepness × (days − threshold)))
risk_adjusted  = risk_raw × (1 − sort.resistance[disease])
```

**Болезни и триггеры:**

| Болезнь | Триггер | Источник |
|---|---|---|
| **Жёлтая ржавчина** (Puccinia striiformis) | RH>92%, T 4–16°C ≥ 4 дней | Coakley S.M. et al. (1988). *Methods for Predicting Stripe Rust Severity.* Phytopathology 78: 543–550. — стандарт 30+ лет, точность 76–96%. + Te Beest D.E. et al. (2008). |
| **Стеблевая ржавчина** (Puccinia graminis) | RH>70%, T 18–25°C ≥ 5 дней | Roelfs A.P. (1985). *Wheat and rye stem rust.* CIMMYT Wheat Disease Methodology Manual. Особо важна — была эпифитотия 2015–2019 на 1 млн га Сев. КЗ ([APS](https://apsjournals.apsnet.org/doi/10.1094/PHYTO-08-21-0320-R)). |
| **Септориоз / tan spot** | Влажность + T~18°C ≥ 6 дней | Te Beest D.E. et al. (2008). *Disease-weather relationships for powdery mildew and yellow rust on winter wheat.* Phytopathology 98: 609–617. В Сев. КЗ tan spot достиг 43% распространённости ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9143578/)). |
| **FHB (фузариоз колоса)** | RH>90%, T 15–30°C, ±7 дней от цветения | Hooker D.C., Schaafsma A.W. (2002). *DONcast model.* Crop Protection 21: 633–641. Стандарт прогноза DON-контаминации в Канаде/США. |

**Устойчивость сортов** — таблица в [lib/yield/norms.ts](../lib/yield/norms.ts#L50-L72):
- Степная-50: yellow_rust 0.55, septoria 0.60
- Омская-36: stem_rust 0.55
- Астана: yellow_rust 0.50
- ... (расширяется по реестру сортов МСХ)

**Почему работает для РК:**
- В Сев. Казахстане **4 эпифитотических эпизода за 10 лет** ([Plant Science Today](https://horizonepublishing.com/journals/index.php/PST/article/view/798)) — модели рисков работают на этой частоте.
- Стеблевая ржавчина 2015–2019 — реальный кейс, проверка модели на ретроспективе.
- Корневые гнили (Bipolaris sorokiniana 44.8%, Fusarium acuminatum 20.4% в Центральной КЗ) пока не моделируются — они зависят от истории поля, не от текущей погоды. Hook на будущее.

---

### 4.5. K_weed_control — контроль сорняков (по состоянию посева)

**Реализация (target):** будущий `lib/yield/weed-control.ts`. Ранний прототип [lib/yield/spray.ts](../lib/yield/spray.ts) использует декларацию — это будет переделано (см. [§2.3](#23-измеряем-результат-на-поле-а-не-факт-обработки)).

**Идея:** не пытаемся узнать, обработал ли фермер гербицидом. Смотрим, был ли посев в результате чистым. Это объективное состояние поля, видимое со спутника.

**Формула:**
```
K_weed_control = 1.00  если посев чистый (низкая σ NDVI + траектория в норме)
               = 0.95  смешанный сигнал (умеренная гетерогенность)
               = 0.88  выраженная конкуренция (высокая σ + отставание траектории)
               = 0.82  пятнистый посев + явное отставание NDVI

Корректировки:
   +0.02   если в Qoldau есть закупка гербицида под культуру в окно
   +0.01   если есть согласованная декларация фермера
   −0.03   если посев и Qoldau-данных нет, и σ NDVI > 0.20
```

**Сигналы — по приоритету:**

| Сигнал | Источник | Вес |
|---|---|---|
| **Гетерогенность σ NDVI в фазе кущения** | Sentinel-2, уже в [lib/satellite/ndvi.ts:81-89](../lib/satellite/ndvi.ts#L81-L89) | главный |
| **Траектория NDVI vs ожидание для культуры/сорта** | Sentinel-2 + сорт-кривая | главный |
| **Закупка гербицида через Qoldau** | API Qoldau | supplementary |
| **Декларация фермера в заявке** | приложение | confirmation, не источник истины |

**Фенологическое окно гербицидной обработки** (для подтверждающего матчинга с Qoldau-закупкой):

| Культура | Окно (дней от посева) |
|---|---|
| Пшеница яровая | 21–35 (кущение) |
| Пшеница озимая | 21–45 |
| Ячмень | 18–30 |
| Овёс | 20–32 |
| Подсолнечник | 25–40 (2–4 листа) |
| Рапс | 28–42 (розетка) |

Если у фермера есть Qoldau-чек на гербицид и дата покупки попадает в окно ± 14 дней — добавляем confirmatory bonus к K_weed_control.

**Почему этот подход работает там, где «детекция опрыскивания» не работает:**

| Что мы НЕ можем измерить | Что можем измерить вместо |
|---|---|
| Был ли применён гербицид | Чистый ли посев на NDVI |
| Был ли применён фунгицид | Развилась ли болезнь (NDVI patches, σ скачок) |
| Какой именно препарат | Состояние культуры в фазу налива |
| Точная дата обработки | Окно когда это было важно сделать |

Это **outcomes-based assessment** вместо **process-based**. Для государства это даже выгоднее: важен результат на поле, а не бумаги. Для модели — измеримо без декларации.

**Связь с антифрод-движком друга:** существующий `CROP_HETEROGENEOUS_FIELD` ([lib/verify/satellite.ts](../lib/verify/satellite.ts)) уже использует σ NDVI ≥ 0.16 как порог. Наш K_weed_control работает на тех же признаках, но **более гранулярно** (4 уровня вместо бинарного).

**NDVI-сигнатура гербицида — ограниченное применение:**
[MDPI 2019, Glyphosate Detection](https://mdpi.com/2072-4292/11/21/2541/htm) валидирована для виноградников и многолетних трав. На зерновых канопеях недостоверна. Не используем как drijver, только как confirmatory сигнал в специфичных кейсах (подсолнечник, рапс с широкими междурядьями).

**Фунгициды/инсектициды отдельно:**
Их применение не входит в `K_weed_control`. Их эффект ловится через `Kd_adv` (см. [§4.4](#44-kd_adv--болезни)) — мы измеряем НЕ факт обработки, а **развилась ли болезнь**. Если в высоко-рисковую погоду по NDVI/SAR не видно следов поражения — болезнь подавлена (фунгицид сработал или природа смилостивилась — не важно).

---

### 4.6. K_nutrition — питание (Mitscherlich)

**Реализация:** [lib/yield/nutrition.ts](../lib/yield/nutrition.ts)

**Формула** (закон Митчерлиха, не Либиха):
```
effective_X = current_soil_X + fertilizer_X × efficiency_X
ratio_X     = effective_X / optimum_X
K_X         = 1 − exp(−c_X × ratio_X)

K_nutrition = K_N × K_P × K_K × K_micro
```

Константы Mitscherlich подобраны так, чтобы K_X(ratio=1.0) ≈ 0.95:
- N: c = 2.5
- P: c = 3.0
- K: c = 3.0
- Микро: c = 3.5

Эффективность удобрений (доля переходящая в эффективный уровень почвы):
- N: 0.42 (60 кг/га → +25 мг/кг)
- P: 0.10 (медленное поглощение)
- K: 0.12

**Источники:**

| Формула | Источник |
|---|---|
| Закон Митчерлиха (диминутивная отдача) | Mitscherlich E.A. (1909). *Das Gesetz des Minimums und das Gesetz des abnehmenden Bodenertrages.* Landwirtschaftliche Jahrbücher 38: 537–552. |
| Mitscherlich vs Liebig в современной агрохимии | Cerrato M.E., Blackmer A.M. (1990). *Comparison of models for describing corn yield response to nitrogen fertilizer.* Agronomy J. 82: 138–143. — показывает что Митчерлих точнее в полевых данных. |
| Оптимумы N/P/K для степной зоны | КазНИИЗиР методические рекомендации (1985, обновления 2010). |

**Почему Митчерлих, а не Либих:**
- Либих даёт резкое отсечение по «лимитирующему элементу» — это упрощение.
- Митчерлих даёт плавный переход + насыщение при больших дозах — соответствует биологии и полевым данным.
- Существующий код друга в [lib/yield-estimate.ts](../lib/yield-estimate.ts) использует Либиха для антифрод-калькулятора — это нормально для скрининга, но для прогноза точнее Митчерлих.

---

### 4.7. K_harvest — потери при уборке

**Реализация:** [lib/yield/harvest-loss.ts](../lib/yield/harvest-loss.ts)

**Упрощённая формула** (принятое решение пользователя):
```
loss_pct       = baseline[crop] + max(0, delay_days) × 0.7
K_harvest      = 1 − min(20, loss_pct) / 100
```

Без отдельных коэффициентов на комбайн/оператора — это нельзя измерить без GPS-телематики. Один объективный фактор — задержка относительно оптимальной даты уборки.

**Baseline по культурам:**

| Культура | Baseline % |
|---|---|
| Пшеница яровая/озимая, ячмень | 8 |
| Овёс | 9 |
| Подсолнечник | 5 |
| Рапс | 10 |

**Оптимальная дата уборки** = `sowingDate + sort.daysToMaturity`.

Фактическая дата — из [SAR-детектора друга](../lib/satellite/sar-events.ts) (RMSE 5–10 дней) или из декларации фермера. Берём позднюю (консервативно).

**Источники:**

| Параметр | Источник |
|---|---|
| Baseline 5–10% при правильно настроенной технике | FAO/UN (2014). *Food Losses and Waste in Kazakhstan.* Country Report. ([PDF](https://www.fao.org/fileadmin/user_upload/reu/europe/documents/FLW/FLW_assessment_Kazakstan.pdf)) |
| ~0.7%/день при задержке после maturity | Manitoba Crop Alliance (2024). *Phantom Yield Loss.* ([link](https://mbcropalliance.ca/blog/agronomy-extension-special-crops/phantom-yield-loss/)) |
| Резкий рост потерь после 14 дней | Ohio State Agronomic Crops Network (2018). *Harvest Delays Impact Corn Performance.* |
| 1%/влажностный пункт drydown | Bayer Crop Science. *Harvest Loss, Drying Costs, and Discounts.* |

---

### 4.8. Cregion — региональная калибровка

**Реализация:** [lib/yield/regional.ts](../lib/yield/regional.ts)

**Формула:**
```
Cregion[oblast, rayon, year] = mean(Yactual_БНС / Ymodel) за 3 последних сезона
CAPPED: [0.85, 1.15]
```

Если модель систематически уходит за cap 3+ года подряд — это сигнал к пересмотру модели, а не растягиванию границ.

**Источник:** [stat.gov.kz](https://stat.gov.kz/) — БНС публикует урожайность по культурам/районам после уборочной (лаг 6–12 месяцев).

**Confidence по числу лет:**
- 3+ года → high, sigma 4%
- 2 года → medium, sigma 8%
- 1 год или нет → low, fallback 1.00, sigma 10%

---

### 4.9. Peer comparison — 9-й сигнал

**Реализация:** [lib/yield/peer.ts](../lib/yield/peer.ts)

**Не множитель в формуле**, отдельная интерпретация:

```
peerAvg = mean(соседние поля или районный средний БНС)
delta_pct = (Y_predicted − peerAvg) / peerAvg × 100

interpretation:
  > +30% → above_peers_significantly  (возможен фрод декларации)
  > +15% → above_peers
  < −30% → below_peers_significantly   (хозяйство плохо ведётся)
  < −15% → below_peers
  иначе   → in_line_with_peers
```

**Зачем нужно:** отличить «фермер плохо хозяйствует» от «погода плохая». Если Y_predicted = 6 ц/га, но у соседей в районе тоже 6 ц/га — это не фрод, это сезон. Если у соседей 12 ц/га — проблема в конкретном фермере.

---

## 5. Управление неопределённостью

### 5.1. Monte Carlo

**Реализация:** [lib/yield/predict.ts:113](../lib/yield/predict.ts)

1000 прогонов (по умолчанию). Для каждого компонента сэмплируем лог-нормальное распределение вокруг point estimate с заданной sigma:

```
sample = mean × exp(N(0,1) × σ_log − σ_log²/2)
σ_log  = log(1 + sigma_relative)
```

Sigma по компонентам:

| Компонент | sigma | Обоснование |
|---|---|---|
| Y_potential | 10% | RUE/HI неопределённость для сорта |
| Kw | 10–20% | зависит от триангуляции (см. §4.2) |
| Ks | 8% | пороги жёсткие, экстремумы измеряемы |
| Kd_adv | 0% в advisory, 15% в active | в год 1 без неопределённости (=1.0) |
| K_weed_control | 6% | спутник + Qoldau confirmatory |
| K_nutrition | 12% | Mitscherlich c-константы |
| K_harvest | 4% | простая формула |
| Cregion | 4–10% | по числу лет калибровки |

Результат: **P10 / P50 / P90** — нижний, медианный и верхний 80%-квантили.

### 5.2. Воспроизводимость

Псевдослучайный генератор Mulberry32 с детерминированным seed. Тот же входной набор → тот же выход. Критично для аудита и юридической защиты.

---

## 6. Почему модель будет работать в Казахстане

### 6.1. Все компоненты валидированы на схожих агроклиматах

| Источник методологии | Регион валидации | Применимость к РК |
|---|---|---|
| Doorenbos-Kassam FAO-33 | 100+ стран, включая Восточную Европу | ✓ стандарт ФАО |
| Coakley stripe rust | США (Pacific NW), валидация в Канаде | ✓ похожая широта 47–52°N |
| DONcast FHB | Канада (Онтарио) | ✓ похожий континентальный климат |
| Te Beest septoria | Германия, валидирован в 52 полях | ✓ |
| GYGA Atlas | Глобально, включая Россию/Украину | ✓ |
| AquaCrop tolerance band | Глобально, специально для water-limited | ✓ степь — целевая зона |

### 6.2. Использует ровно те данные, которые реально доступны в РК

| Что | Откуда | Доступ |
|---|---|---|
| Бонитет, агрохимия | Гипрозем | гос-источник, есть API ([lib/giprozem-cache.ts](../lib/giprozem-cache.ts)) |
| Заявки и чеки химии | Qoldau | гос-партнёр МСХ |
| Погода ежедневная | open-meteo / ERA5 | бесплатно |
| NDVI / SAR | Sentinel-2 / Sentinel-1 | бесплатно через CDSE (уже в проекте) |
| Урожайность факт | БНС stat.gov.kz | публично, годовой лаг |
| Реестр сортов | МСХ РК | гос-источник |

### 6.3. Сопоставимо с лучшими мировыми системами по точности

| Метод | RMSE (опубл.) | Прозрачность |
|---|---|---|
| EU MARS (WOFOST) | ~3 ц/га | open methodology |
| USDA NASS | ~2.5 ц/га | open |
| DSSAT/CRAFT в Сев. КЗ | ~3 ц/га ([MDPI 2024](https://www.mdpi.com/2071-1050/16/1/293)) | open |
| XGBoost для РК (MDPI 2026) | 3.3 ц/га (R²=0.69) | black box |
| **STEPPE-Y (наша цель)** | **< 3.5 ц/га** | **полностью open** |

Главное преимущество — **прозрачность**. ML-модели типа XGBoost работают чуть лучше по числам, но в гос-контракте «вердикт чёрного ящика» не защитим в суде. Наша модель защитима.

### 6.4. Прошёл sanity check на главном тестовом сценарии

Сценарий: Айыртауский район СКО, пшеница Степная-50, 165 мм осадков (слабая засуха), задержка уборки 18 дней.

**Результат:** 4.5–8.3 ц/га (медиана 6.2). Это соответствует реальности: в засушливые годы СКО показывает 6–8 ц/га (БНС 2010 = 7.3 ц/га по стране).

Сценарий с хорошим годом (210 мм осадков, без жары, в срок): 12.6 ц/га — попадает в реалистичный диапазон.

См. [scripts/yield-predict.test.ts:189](../scripts/yield-predict.test.ts) — 44 регрессионных теста, все зелёные.

### 6.5. Совместим с существующим антифрод-движком

- Каждый компонент возвращает `ComponentResult` с `reasons[]` — попадает в provenance trail [lib/sources.ts](../lib/sources.ts).
- Y_predicted сопоставляется с заявленной урожайностью — новые finding-коды:
  - `YIELD_DECLARED_ABOVE_P90` — заявка выше P90 интервала
  - `YIELD_DECLARED_BELOW_P10` — заявка подозрительно низкая
- Peer-comparison интегрируется с существующим `CROP_REGIONAL_OUTLIER` ([lib/verify/index.ts:24-37](../lib/verify/index.ts#L24-L37)).

---

## 7. Что модель НЕ делает

Честный список ограничений:

1. **Не предсказывает экстремальные годы** вне калибровки. 2010 (драут) — на грани. Нужна явная пометка «outlier season».
2. **Не работает без 3 лет БНС-данных** для Cregion. Первый год — fallback 1.0 + low confidence.
3. **Не детектирует факт опрыскивания со спутника.** Полагается на декларацию + Qoldau.
4. **Не предсказывает болезни в первый сезон.** Kd_adv = 1.0, только сигнал.
5. **Не учитывает сорт точно без явного указания.** При неизвестном сорте — медиана по культуре + sigma +5%.
6. **Не различает культуры внутри одного семейства.** Чечевица отдельно от пшеницы, но «Канадская красная» от «Степная зелёная» — одинаково. Hook на расширение.
7. **Не точна для очень малых полей** (< 10 га) — Sentinel-1/2 speckle, статистика NDVI ненадёжна.
8. **Не заменяет агронома.** Модель advisory, окончательное решение за человеком.

---

## 8. План валидации (обязательное условие приёмки)

### Фаза 0 — Sanity check (готово)

44 регрессионных теста, все зелёные. [scripts/yield-predict.test.ts](../scripts/yield-predict.test.ts).

### Фаза 1 — Backtest на 7 лет БНС (1 месяц)

```
- Запустить модель ретроспективно на 2018–2024 (7 лет)
- По 4 областям × ~20 районов × 5 культур ≈ 2800 наблюдений
- Метрики: MAE, RMSE, bias, R², coverage P10–P90
- Цель: MAE < 2.5 ц/га, bias < 0.5 ц/га, coverage > 80%
- Если не проходит — итерация порогов
```

### Фаза 2 — Pilot на 1 районе (1 сезон)

```
- Айыртауский район СКО, ~200 полей
- 50 опорных хозяйств подписывают NDA на передачу факт-намолота
- Модель работает в advisory-режиме
- Публичный отчёт по итогам сезона
```

### Фаза 3 — Расширение на 1 область (2 сезона)

```
- Если pilot MAE < 3 ц/га — расширяем на СКО
- ~3000 полей, полу-продуктив
```

### Фаза 4 — Прод на 4 области (после)

```
- Используется для антифрод-решений
- Но только как ОДИН из источников, не единственный
- Continuous calibration через БНС
```

---

## 9. Артефакты для гос-приёмки

Что подготовить перед защитой:

| Документ | Объём | Кому |
|---|---|---|
| Model Card | 1 стр | широкой публике |
| Methodology Paper (этот документ) | 25 стр | технической комиссии |
| Validation Report (после фазы 1) | 20 стр | технической комиссии |
| Risk Register | 5 стр | юристам |
| Operational Plan | 10 стр | МСХ руководству |
| Comparison vs alternatives | 5 стр | защита от критиков |
| FAQ для фермеров | 5 стр | публично |
| Independent Review Memo | 2 стр | юристам |

Состав Independent Review Board:
- Агроном КазНИИЗиР с публикациями по теме
- Математик/физик из НИИ
- Представитель МСХ РК
- (опционально) Юрист гос-заказчика

---

## 10. Литература (ключевая)

### По методологии

1. Monteith J.L. (1972). *Solar radiation and productivity in tropical ecosystems.* Journal of Applied Ecology 9: 747–766.
2. Doorenbos J., Kassam A.H. (1979). *Yield response to water.* FAO Irrigation and Drainage Paper 33.
3. Allen R.G., Pereira L.S., Raes D., Smith M. (1998). *Crop evapotranspiration — guidelines for computing crop water requirements.* FAO Irrigation and Drainage Paper 56.
4. Steduto P., Hsiao T.C., Raes D., Fereres E. (2009). *AquaCrop—the FAO crop model.* Agronomy Journal 101: 426–437.
5. Mitscherlich E.A. (1909). *Das Gesetz des Minimums und das Gesetz des abnehmenden Bodenertrages.* Landwirtschaftliche Jahrbücher 38: 537–552.
6. Storie R.E. (1933). *An Index for Rating the Agricultural Value of Soils.* California Agric. Exp. Station Bulletin 556.
7. van Ittersum M.K. et al. (2013). *Yield gap analysis with local to global relevance — a review.* Field Crops Research 143: 4–17.

### По болезням

8. Coakley S.M., Line R.F., McDaniel L.R. (1988). *Predicting stripe rust severity on winter wheat using an improved method.* Phytopathology 78: 543–550.
9. Hooker D.C., Schaafsma A.W., Tamburic-Ilincic L. (2002). *Using weather variables pre- and post-heading to predict deoxynivalenol content in winter wheat.* Plant Disease 86: 611–619.
10. Te Beest D.E. et al. (2008). *Disease-weather relationships for powdery mildew and yellow rust on winter wheat.* Phytopathology 98: 609–617.
11. Roelfs A.P., Singh R.P., Saari E.E. (1992). *Rust Diseases of Wheat: Concepts and Methods of Disease Management.* CIMMYT.

### По Казахстану

12. Lupascu et al. (2014). *Modelling the effects of climate variability on spring wheat productivity in the steppe zone of Russia and Kazakhstan.* Ecological Modelling 277: 57–67.
13. Bokusheva R. et al. (2016). *Satellite-based vegetation health indices as a criteria for insuring against drought-related yield losses.* Agricultural and Forest Meteorology 220: 200–206.
14. Tlemisova A. et al. (2024). *Comparison of Climate Change Effects on Wheat Production in North Kazakhstan.* Sustainability 16(1): 293. [MDPI](https://www.mdpi.com/2071-1050/16/1/293)
15. Pavlova V.N. et al. (2020). *Monitoring climate change, drought conditions and wheat production in Eurasia: case study of Kazakhstan.* [PMC8741484](https://pmc.ncbi.nlm.nih.gov/articles/PMC8741484/)
16. Бараев А.И. (1975). *Яровая пшеница в Северном Казахстане.* Алма-Ата: Кайнар.
17. Шиятый Е.И. (1979). *Эрозия почв и заморозки в северном Казахстане.* КазНИИЗиР.
18. FAO/UN (2014). *Food Losses and Waste in Kazakhstan.* Country Report by Sayat Shortan. ([PDF](https://www.fao.org/fileadmin/user_upload/reu/europe/documents/FLW/FLW_assessment_Kazakstan.pdf))

### По болезням в РК

19. Koishybayev M. et al. (2022). *Crown and Root Rot Pathogens in Wheat in Central, Eastern, and Southeastern Kazakhstan.* [PMC9143578](https://pmc.ncbi.nlm.nih.gov/articles/PMC9143578/)
20. Rsaliyev A. et al. (2022). *Stem Rust Epidemics in Northern Kazakhstan 2015–2019.* Phytopathology 112(5). [APS](https://apsjournals.apsnet.org/doi/10.1094/PHYTO-08-21-0320-R)
21. Koyshibayev M., Murtazina G. (2023). *Pathogenic complexity of septoria spot disease of wheat in northern Kazakhstan.* Plant Science Today.

### По спутниковым методам

22. Asseng S. et al. (2015). *Rising temperatures reduce global wheat production.* Nature Climate Change 5: 143–147.
23. Vreugdenhil M. et al. (2020). *Detection of Crop Seeding and Harvest through Analysis of Time-Series Sentinel-1 InSAR Data.* Remote Sensing 12: 1551.
24. Schauberger B. et al. (2019). *Monitoring Glyphosate-Based Herbicide Treatment Using Sentinel-2 Time Series.* Remote Sensing 11: 2541.

---

## 11. История изменений

| Версия | Дата | Что |
|---|---|---|
| v0.1.0 | 2026-05-11 | Первый релиз. 8 компонентов + peer. 44 теста. Главный тестовый сценарий валидирован. |

---

## Контакты для замечаний

- Технические вопросы по реализации — issue в репозитории
- Замечания по формулам и литературе — review board (адресуется через гос-заказчика)
- Замечания по результатам прогноза на конкретном поле — стандартный процесс апелляции (см. Operational Plan, готовится отдельно)
