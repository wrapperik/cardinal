const DEFAULT_ZONE_COUNT = 3;
const DEFAULT_ZONE_GAP = 14;
const DEFAULT_ZONE_HEIGHT = 84;

export function getMatchZoneHeight(
  availableHeight: number,
  zoneCount = DEFAULT_ZONE_COUNT,
  gap = DEFAULT_ZONE_GAP,
  maximum = DEFAULT_ZONE_HEIGHT,
): number {
  const heightThatFits = Math.floor(
    (availableHeight - gap * (zoneCount - 1)) / zoneCount,
  );
  return Math.max(0, Math.min(maximum, heightThatFits));
}
