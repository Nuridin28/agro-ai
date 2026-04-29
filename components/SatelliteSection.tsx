// Server-компонент, который сам вытягивает спутниковые данные и рендерит
// SatelliteCard. Вынесен из инспекторской страницы, чтобы обернуть его в
// <Suspense fallback={<SatelliteCardSkeleton />}> и не блокировать остальной
// контент пока идут SH-вызовы.

import { polygonForFarmer } from "@/lib/mock/field-polygons";
import { seasonFor } from "@/lib/mock/crop";
import { verifySatellite, checkInactivity } from "@/lib/satellite";
import { SatelliteCard } from "@/components/SatelliteCard";

export async function SatelliteSection({ farmerId, className = "" }: { farmerId: string; className?: string }) {
  const polyRec = polygonForFarmer(farmerId);
  const season = seasonFor(farmerId);
  if (!polyRec || !season) return null;

  try {
    const [spatial, inactivity] = await Promise.all([
      verifySatellite({
        polygon: polyRec.polygon,
        startDate: `${season.year}-04-01`,
        endDate:   `${season.year}-09-30`,
        expectedSowingDate: season.declaredSowingDate,
        includeImages: true,
        includeYoY: true,
      }),
      checkInactivity({
        polygon: polyRec.polygon,
        baselineDate: season.declaredSowingDate,
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
