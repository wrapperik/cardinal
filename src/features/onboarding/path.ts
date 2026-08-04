/**
 * Arc-length parameterised path for the onboarding pipe.
 *
 * The ball's position is a single scalar — distance travelled along the
 * centreline — and everything else (screen position, tangent direction, camera
 * offset, milestone progress) derives from it. That keeps the gesture maths
 * one-dimensional even though the pipe turns corners.
 *
 * Geometry note: the mockup annotates a 20px inner corner radius and a 100px
 * outer one. Those are not independent values — they are the two edges of a
 * single stroked centreline, so centreline radius = (20 + 100) / 2 = 60 and
 * bore = 100 - 20 = 80. Stroking one path twice reproduces both exactly.
 */

export const PIPE = {
  /**
   * Centreline corner radius — the one dial controlling how the pipe turns.
   * Inner wall radius is this minus half the bore, outer is this plus half.
   *
   * The mockup annotated 20px inner / 100px outer, i.e. a 60px centreline. That
   * reads pinched on device: a 20px inner radius is a quarter of the bore, so the
   * inner wall whips round the corner while the outer wall sweeps. At 120 the two
   * walls (80 inner, 160 outer) turn at comparable rates and the bend reads as one
   * continuous tube.
   */
  cornerRadius: 120,
  /** Inner width of the tube. */
  bore: 80,
  /** Thickness of each drawn wall. */
  wall: 3,
  /** Ball diameter — a little clearance inside the bore. */
  ballSize: 72,
} as const;

/**
 * Corners of the pipe in path space (not screen space). Arcs are inserted at
 * each interior point. Runs bottom-left → right → up → right, matching the
 * three mockup panels read left to right.
 */
export const WAYPOINTS = [
  { x: 80, y: 1420 },
  { x: 560, y: 1420 },
  { x: 560, y: 300 },
  { x: 1000, y: 300 },
] as const;

const LINE = 0;
const ARC = 1;

export interface LineSegment {
  kind: typeof LINE;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  length: number;
}

export interface ArcSegment {
  kind: typeof ARC;
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  length: number;
}

export type Segment = LineSegment | ArcSegment;

export interface PathData {
  segments: Segment[];
  /** Total centreline length. The ball's scalar position runs 0 → length. */
  length: number;
  /** SVG `d` attribute for the centreline. */
  d: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PathPoint {
  x: number;
  y: number;
  /** Unit tangent, pointing in the direction of increasing distance. */
  tx: number;
  ty: number;
}

interface Vec {
  x: number;
  y: number;
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

function norm(v: Vec): Vec {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}

function lineSegment(a: Vec, b: Vec): LineSegment {
  return {
    kind: LINE,
    x0: a.x,
    y0: a.y,
    x1: b.x,
    y1: b.y,
    length: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

/**
 * Builds the segment list and the SVG path string from a polyline, rounding
 * every interior corner to `radius`. Runs once on the JS thread; the result is
 * a plain object safe to read from a worklet.
 */
export function buildPath(points: readonly Vec[], radius: number): PathData {
  const segments: Segment[] = [];
  let d = `M ${points[0].x} ${points[0].y}`;
  let cursor: Vec = points[0];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];

    // Unit vectors pointing away from the corner along each leg.
    const u = norm(sub(prev, corner));
    const v = norm(sub(next, corner));

    const theta = Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
    // Degenerate corner (straight through or doubled back) — skip the arc.
    if (!Number.isFinite(theta) || theta < 1e-6 || Math.abs(theta - Math.PI) < 1e-6) {
      continue;
    }

    const tangentDist = radius / Math.tan(theta / 2);
    const arcStart = add(corner, mul(u, tangentDist));
    const arcEnd = add(corner, mul(v, tangentDist));

    const straight = lineSegment(cursor, arcStart);
    if (straight.length > 1e-6) {
      segments.push(straight);
      d += ` L ${arcStart.x} ${arcStart.y}`;
    }

    const centre = add(corner, mul(norm(add(u, v)), radius / Math.sin(theta / 2)));
    const a0 = Math.atan2(arcStart.y - centre.y, arcStart.x - centre.x);
    const a1raw = Math.atan2(arcEnd.y - centre.y, arcEnd.x - centre.x);

    // Take the short way round.
    let delta = a1raw - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    segments.push({
      kind: ARC,
      cx: centre.x,
      cy: centre.y,
      r: radius,
      a0,
      a1: a0 + delta,
      length: radius * Math.abs(delta),
    });

    d += ` A ${radius} ${radius} 0 0 ${delta > 0 ? 1 : 0} ${arcEnd.x} ${arcEnd.y}`;
    cursor = arcEnd;
  }

  const end = points[points.length - 1];
  const tail = lineSegment(cursor, end);
  if (tail.length > 1e-6) {
    segments.push(tail);
    d += ` L ${end.x} ${end.y}`;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  return {
    segments,
    length: segments.reduce((sum, s) => sum + s.length, 0),
    d,
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * Position and tangent at `distance` along the path. Worklet-safe — this is
 * called on the UI thread every frame while the ball is moving.
 */
export function pointAtDistance(path: PathData, distance: number): PathPoint {
  'worklet';
  const segments = path.segments;
  let remaining = Math.min(Math.max(distance, 0), path.length);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const last = i === segments.length - 1;

    if (remaining <= s.length || last) {
      const t = s.length > 1e-6 ? Math.min(remaining / s.length, 1) : 0;

      if (s.kind === LINE) {
        const dx = s.x1 - s.x0;
        const dy = s.y1 - s.y0;
        const len = s.length > 1e-6 ? s.length : 1;
        return {
          x: s.x0 + dx * t,
          y: s.y0 + dy * t,
          tx: dx / len,
          ty: dy / len,
        };
      }

      const angle = s.a0 + (s.a1 - s.a0) * t;
      // Tangent is perpendicular to the radius, flipped when sweeping backwards.
      const sign = s.a1 >= s.a0 ? 1 : -1;
      return {
        x: s.cx + s.r * Math.cos(angle),
        y: s.cy + s.r * Math.sin(angle),
        tx: -Math.sin(angle) * sign,
        ty: Math.cos(angle) * sign,
      };
    }

    remaining -= s.length;
  }

  // Unreachable for a non-empty path; keeps the return type honest.
  return { x: 0, y: 0, tx: 1, ty: 0 };
}

/** The prebuilt onboarding pipe. */
export const ONBOARDING_PATH = buildPath(WAYPOINTS, PIPE.cornerRadius);

/**
 * Distance along the path at which each onboarding stage begins. Releasing the
 * ball settles it back to the highest milestone it has passed, so every stage
 * is one clean drag.
 */
export const MILESTONES = [
  0,
  ONBOARDING_PATH.length * 0.42,
  ONBOARDING_PATH.length * 0.78,
];

/** Index of the stage that `distance` falls in. Worklet-safe. */
export function stageAtDistance(distance: number): number {
  'worklet';
  let stage = 0;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (distance >= MILESTONES[i]) stage = i;
  }
  return stage;
}
