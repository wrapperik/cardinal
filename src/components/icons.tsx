import Svg, { Path } from "react-native-svg";

/** Small hand-drawn icon set: 2px stroke, round caps and joins, no fill, 20x20 grid. */
const PATHS = {
  arrowRight: "M3 10 H16 M11 5 L16 10 L11 15",
  check: "M4 10.5 L8 14.5 L16 5.5",
  close: "M5 5 L15 15 M15 5 L5 15",
  plus: "M10 4 V16 M4 10 H16",
  file: "M5 2.5 H11.5 L15 6 V17.5 H5 Z M11.5 2.5 V6 H15",
  sparkle: "M10 2.5 L11.8 8.2 L17.5 10 L11.8 11.8 L10 17.5 L8.2 11.8 L2.5 10 L8.2 8.2 Z",
  trash: "M3.5 5.5 H16.5 M8 5.5 V3.5 H12 V5.5 M5 5.5 L5.8 17 H14.2 L15 5.5 M8.5 9 V13.5 M11.5 9 V13.5",
  signOut: "M8 3 H4 V17 H8 M8 10 H17 M13.5 6.5 L17 10 L13.5 13.5",
  refresh: "M16 10 A6 6 0 1 1 13.5 5.1 M16.5 3 V6.5 H13",
  play: "M6 3.5 L16 10 L6 16.5 Z",
  pencil: "M13.5 3.5 L16.5 6.5 L7 16 L3.5 16.5 L4 13 Z M12 5 L15 8",
  lock: "M5 9 H15 V17 H5 Z M7 9 V6.5 A3 3 0 0 1 13 6.5 V9",
  chart: "M3.5 3.5 V16.5 H16.5 M7 13 V10 M10.5 13 V6.5 M14 13 V8.5",
  swap: "M3.5 7 H16 M12.5 3.5 L16 7 L12.5 10.5 M16.5 13 H4 M7.5 9.5 L4 13 L7.5 16.5",
  pause: "M7 4 V16 M13 4 V16",
  upload: "M10 13.5 V3.5 M5.5 8 L10 3.5 L14.5 8 M3.5 13.5 V16.5 H16.5 V13.5",
  list: "M7.5 5 H16.5 M7.5 10 H16.5 M7.5 15 H16.5 M3.5 5 H4 M3.5 10 H4 M3.5 15 H4",
  sliders: "M3.5 6 H16.5 M3.5 14 H16.5 M7 3.5 V8.5 M13 11.5 V16.5",
  person: "M10 9.5 A3 3 0 1 0 10 3.5 A3 3 0 1 0 10 9.5 Z M4 16.5 C4.6 13.5 7 12 10 12 C13 12 15.4 13.5 16 16.5",
  mail: "M3 5 H17 V15 H3 Z M3.5 5.5 L10 11 L16.5 5.5",
  cloud: "M6 15.5 H14.5 A3 3 0 0 0 14.5 9.5 A4.5 4.5 0 0 0 5.8 9 A3.3 3.3 0 0 0 6 15.5 Z",
  vibrate: "M7 3.5 H13 V16.5 H7 Z M4 7 V13 M16 7 V13",
  info: "M10 17 A7 7 0 1 0 10 3 A7 7 0 1 0 10 17 Z M10 9.5 V13.5 M10 6.5 V6.6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d={PATHS[name]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
