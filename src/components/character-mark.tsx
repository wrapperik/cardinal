import Svg, { Circle, Rect } from "react-native-svg";

import { Colors } from "@/constants/theme";
import { characterById } from "@/features/character/roster";

/**
 * A character's silhouette, drawn to fill whatever box it is given.
 *
 * Built from crossed capsules rather than a star polygon: a capsule already
 * has the rounded cap the reference's arms end in, and one capsule spans the
 * full diameter to make two opposite arms. So `arms / 2` rects rotated evenly
 * through a half-turn produce the whole shape, and the rounded joins where
 * they overlap the core come free instead of needing curve maths.
 */
export function CharacterMark({
  characterId,
  size,
  color = Colors.bone,
  opacity = 1,
}: {
  characterId: string;
  size: number;
  color?: string;
  opacity?: number;
}) {
  const { arms, reach } = characterById(characterId);

  // Drawn in a fixed 100-unit box and scaled by the viewBox, so every call
  // site gets identical proportions whatever size it asks for.
  const C = 50;
  const coreR = 50 / (1 + reach);
  const armW = coreR * 0.86;
  const armLen = 100;

  const capsules = arms / 2;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={opacity}>
      {Array.from({ length: capsules }, (_, i) => (
        <Rect
          key={i}
          x={C - armW / 2}
          y={C - armLen / 2}
          width={armW}
          height={armLen}
          rx={armW / 2}
          fill={color}
          // Half a turn spread across the capsules: a full turn would draw
          // every arm twice, since each capsule already makes an opposing pair.
          transform={`rotate(${(180 / capsules) * i} ${C} ${C})`}
        />
      ))}
      <Circle cx={C} cy={C} r={coreR} fill={color} />
    </Svg>
  );
}
