// Server-компонент, который сам вытягивает спутниковые данные и рендерит
// SatelliteCard. Поддерживает два режима:
//
//  1) farmerId="F-xxx" → берёт мок-полигон + season из demo-данных
//  2) polygon + season-meta → используется для реальных пользователей
//     (полигон сохранён при регистрации Гипрозема)
//
// Оборачивается в <Suspense fallback={<SatelliteCardSkeleton />}> в parent.

import { polygonForFarmer } from "@/lib/mock/field-polygons";
import { seasonFor } from "@/lib/mock/crop";
import { verifySatellite, checkInactivity } from "@/lib/satellite";
import { SatelliteCard } from "@/components/SatelliteCard";
import type { FieldPolygon } from "@/lib/satellite/types";

interface MockProps {
  farmerId: string;
  className?: string;
}

interface PolygonProps {
  polygon: FieldPolygon;
  baselineDate: string;     // дата для inactivity-проверки (сезонная, не декларация фермера)
  year: number;             // сезон, за который смотрим
  // true: сравнивать NDVI с заявленной датой посева (для late_growth-флага).
  // false: показать NDVI чисто информационно — у фермера нет декларации в этом сезоне.
  checkAgainstDeclaration?: boolean;
  className?: string;
}

type Props = MockProps | PolygonProps;

export async function SatelliteSection(props: Props) {
  const className = props.className ?? "";

  // Режим polygon-prop (real user)
  if ("polygon" in props) {
    return renderForPolygon(
      props.polygon, props.baselineDate, props.year, className,
      props.checkAgainstDeclaration ?? true,
    );
  }

  // Режим farmerId (demo) — у мок-фермера всегда есть season с декларацией
  const polyRec = polygonForFarmer(props.farmerId);
  const season = seasonFor(props.farmerId);
  if (!polyRec || !season) return null;
  return renderForPolygon(polyRec.polygon, season.declaredSowingDate, season.year, className, true);
}

async function renderForPolygon(
  polygon: FieldPolygon,
  baselineDate: string,
  year: number,
  className: string,
  checkAgainstDeclaration: boolean,
) {
  const startDate = `${year}-04-01`;
  const endDate = `${year}-09-30`;
  try {
    const [spatial, inactivity] = await Promise.all([
      verifySatellite({
        polygon, startDate, endDate,
        // expectedSowingDate триггерит late_growth-проверку. Только если у нас
        // действительно есть декларация фермера за этот сезон.
        expectedSowingDate: checkAgainstDeclaration ? baselineDate : undefined,
        includeImages: true,
        includeYoY: true,
      }),
      checkInactivity({
        polygon, baselineDate,
        windowDays: 45,
      }),
    ]);
    return <SatelliteCard spatial={spatial} inactivity={inactivity} className={className} />;
  } catch (e) {
    return (
      <div className={`bg-rose-50 border border-rose-200 rounded-2xl p-5 text-sm text-rose-900 ${className}`}>
        Спутниковая проверка временно недоступна: {String(e)}
      </div>
    );
  }
}
