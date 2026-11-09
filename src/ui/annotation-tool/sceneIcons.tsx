import React from "react";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "@/hooks/useMediaQuery";

/**
 * Step 3 icons (S15). Sidewalk Width is drawn in 3D, looking along a stretch
 * of sidewalk, with people walking on it (SidewalkWidthIcon, animated). The
 * others are plans: a close plan of the paving for the surface, plans seen
 * from above for traffic and the route. currentColor only, so the chosen
 * answer turns primary like the rest of the option. Every svg is aria-hidden,
 * since the option's text names the answer. data-icon describes the drawing
 * for tests.
 */

// ---- Sidewalk Width ---------------------------------------------------------
// A stretch of sidewalk seen from one end and above: u runs along it (up and
// to the right on screen), v across it (towards the viewer), height is up.
const O = [3, 47];
const ALONG = [0.82, -0.415];
const ACROSS = [0.46, 0.62];
const LENGTH = 60;
const CURB = 2.6;
const ROAD = 5;
const WALL = 5;
const at = (u: number, v: number): [number, number] => [O[0] + ALONG[0] * u + ACROSS[0] * v, O[1] + ALONG[1] * u + ACROSS[1] * v];
const r2 = (n: number) => Math.round(n * 100) / 100;
const xy = ([x, y]: [number, number]) => `${r2(x)} ${r2(y)}`;

interface Walker {
  /** Lane across the sidewalk */
  v: number;
  /** Start and end along the sidewalk */
  from: number;
  to: number;
  /** Seconds per loop */
  dur: number;
  /** Fraction of the loop spent walking, then standing until holdEnd */
  moveEnd?: number;
  holdEnd?: number;
  /** Seconds into the loop at load, so walkers are spread out */
  begin?: number;
  /** Where the walker stands when motion is reduced */
  still: number;
}

interface WidthScene {
  label: string;
  /** Width of the sidewalk, across */
  width: number;
  walkers: Walker[];
  /** Narrow only: the mark that appears when the two walkers meet */
  clash?: { u: number; v: number; dur: number; from: number; to: number };
}

/**
 * Narrow: room for one direction at a time, so two people walking towards
 * each other meet and stop. Limited: two people pass each other with no
 * room to spare. Wide: people pass both ways with room for everyone.
 */
const WIDTH_SCENES: Record<string, WidthScene> = {
  one_person: {
    label: "Narrow: room for one direction of walkers, two people meeting cannot pass",
    width: 9,
    walkers: [
      { v: 4.5, from: 58, to: 34, dur: 3.6, moveEnd: 0.45, holdEnd: 0.88, still: 34 },
      { v: 4.5, from: 2, to: 26, dur: 3.6, moveEnd: 0.45, holdEnd: 0.88, still: 26 },
    ],
    clash: { u: 30, v: 4.5, dur: 3.6, from: 0.45, to: 0.86 },
  },
  two_people: {
    label: "Limited: two people can pass each other with no room to spare",
    width: 15,
    walkers: [
      { v: 4, from: 60, to: 0, dur: 3.6, still: 38 },
      { v: 11, from: 0, to: 60, dur: 3.6, still: 22 },
    ],
  },
  three_or_more: {
    label: "Wide: people pass both ways with room to spare",
    width: 30,
    walkers: [
      { v: 5, from: 60, to: 0, dur: 4.4, still: 46 },
      { v: 5, from: 60, to: 0, dur: 4.4, begin: -2.2, still: 16 },
      { v: 17, from: 0, to: 60, dur: 4.8, begin: -1, still: 24 },
      { v: 25, from: 0, to: 60, dur: 4.8, begin: -3.4, still: 50 },
    ],
  },
};

/** The sidewalk slab with its curb, the road in front and a low wall behind */
function Slab({ width, road = ROAD }: { width: number; road?: number }) {
  const a = at(0, 0), b = at(LENGTH, 0), c = at(LENGTH, width), d = at(0, width);
  const e = at(0, width + road), g = at(LENGTH, width + road);
  const l0 = at(0, width + road * 0.72), l1 = at(LENGTH, width + road * 0.72);
  return (
    <g>
      <path d={`M${xy(d)} L${xy(c)} L${r2(g[0])} ${r2(g[1] + CURB)} L${r2(e[0])} ${r2(e[1] + CURB)} Z`} fill="currentColor" fillOpacity={0.05} />
      {road >= 10 && <path d={`M${r2(l0[0])} ${r2(l0[1] + CURB)} L${r2(l1[0])} ${r2(l1[1] + CURB)}`} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="4 3" />}
      <path d={`M${xy(a)} L${xy(b)} L${r2(b[0])} ${r2(b[1] - WALL)} L${r2(a[0])} ${r2(a[1] - WALL)} Z`} fill="currentColor" fillOpacity={0.14} />
      <path d={`M${xy(a)} L${xy(b)} L${xy(c)} L${xy(d)} Z`} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
      <path d={`M${xy(d)} L${xy(c)} L${r2(c[0])} ${r2(c[1] + CURB)} L${r2(d[0])} ${r2(d[1] + CURB)} Z`} fill="currentColor" fillOpacity={0.32} />
    </g>
  );
}

/** A person standing at the origin, with a shadow on the ground */
function Person() {
  return (
    <>
      <ellipse cx={0} cy={0} rx={3.4} ry={1.4} fill="currentColor" fillOpacity={0.18} />
      <rect x={-2.7} y={-13.5} width={5.4} height={13.5} rx={2.7} fill="currentColor" />
      <rect x={0.4} y={-13} width={1.9} height={12} rx={0.95} fill="#fff" fillOpacity={0.18} />
      <circle cx={0} cy={-16.6} r={2.75} fill="currentColor" />
    </>
  );
}

function WalkerFigure({ walker, still }: { walker: Walker; still: boolean }) {
  const { v, from, to, dur, moveEnd, holdEnd, begin = 0 } = walker;
  if (still) {
    return <g transform={`translate(${xy(at(walker.still, v))})`}><Person /></g>;
  }
  const a = xy(at(from, v)), b = xy(at(to, v));
  const holds = moveEnd !== undefined && holdEnd !== undefined;
  return (
    <g transform={`translate(${a})`}>
      <animateTransform
        attributeName="transform" type="translate" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite"
        values={holds ? `${a};${b};${b};${b}` : `${a};${b}`}
        keyTimes={holds ? `0;${moveEnd};${holdEnd};1` : "0;1"}
      />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.88;1" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
      <g>
        <Person />
        <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;0 -0.7;0 0" dur="0.5s" begin={`${begin}s`} repeatCount="indefinite" />
      </g>
    </g>
  );
}

function Clash({ clash, still }: { clash: NonNullable<WidthScene["clash"]>; still: boolean }) {
  const [cx, cy] = at(clash.u, clash.v);
  const y = cy - 21;
  const lines: [number, number, number, number][] = [[-3.2, -3.2, -1.2, -1.2], [3.2, -3.2, 1.2, -1.2], [0, -4.4, 0, -1.8]];
  return (
    <g stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" opacity={still ? 1 : 0}>
      {lines.map(([x1, y1, x2, y2], i) => <path key={i} d={`M${r2(cx + x1)} ${r2(y + y1)} L${r2(cx + x2)} ${r2(y + y2)}`} />)}
      {!still && (
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes={`0;${clash.from};${clash.from + 0.04};${clash.to};1`} dur={`${clash.dur}s`} repeatCount="indefinite" />
      )}
    </g>
  );
}

/**
 * Sidewalk Width, by stored value (one_person Narrow, two_people Limited,
 * three_or_more Wide). Animated with SVG's own animation (no CSS, no timers).
 * With reduced motion, a still frame that tells the same story.
 */
export function SidewalkWidthIcon({ value }: { value: string }) {
  // Still pictures when the visitor asked for less motion (null, animated, until known)
  const still = useMediaQuery(REDUCED_MOTION_QUERY) === true;
  const scene = WIDTH_SCENES[value];
  if (!scene) return null;
  // Lanes further back are drawn first
  const walkers = [...scene.walkers].sort((p, q) => p.v - q.v);
  return (
    <svg viewBox="0 0 70 74" className="w-full h-full" aria-hidden="true" data-icon={scene.label}>
      <Slab width={scene.width} />
      {walkers.map((w, i) => <WalkerFigure key={`${value}-${i}`} walker={w} still={still} />)}
      {scene.clash && <Clash clash={scene.clash} still={still} />}
    </svg>
  );
}

// ---- Ease of Navigation ------------------------------------------------------
// The same stretch of sidewalk as Sidewalk Width, with a wider road in front.
// One person walks along it and meets what is in the way.

const EASE_WIDTH = 14;
const EASE_ROAD = 12;
/** Offset on screen of a point u along and v across, from u 0 v 0 */
const off = (u: number, v: number): [number, number] => [ALONG[0] * u + ACROSS[0] * v, ALONG[1] * u + ACROSS[1] * v];
/** A point on the ground, lower by the curb's height when it is in the road */
const ground = (u: number, v: number, width = EASE_WIDTH): [number, number] => {
  const [x, y] = at(u, v);
  return [x, v > width ? y + CURB : y];
};

/** A box standing on the ground: the top, the side facing the road and the end facing the viewer */
function Block({ u0, u1, v0, v1, h, lift = 0, tone = 1 }: { u0: number; u1: number; v0: number; v1: number; h: number; lift?: number; tone?: number }) {
  const p = (u: number, v: number, z: number): string => {
    const [x, y] = off(u, v);
    return `${r2(x)} ${r2(y - z - lift)}`;
  };
  const face = (pts: string[], op: number) => <path d={`M${pts.join(" L")} Z`} fill="currentColor" fillOpacity={op * tone} stroke="currentColor" strokeOpacity={0.55} strokeWidth={0.6} strokeLinejoin="round" />;
  return (
    <g>
      {face([p(u0, v0, 0), p(u0, v1, 0), p(u0, v1, h), p(u0, v0, h)], 0.42)}
      {face([p(u0, v1, 0), p(u1, v1, 0), p(u1, v1, h), p(u0, v1, h)], 0.55)}
      {face([p(u0, v0, h), p(u1, v0, h), p(u1, v1, h), p(u0, v1, h)], 0.28)}
    </g>
  );
}

/** A car seen from the same angle, nose towards the viewer, drawn at u 0 v 0 */
function Car() {
  return (
    <g>
      <ellipse cx={off(6, 3)[0]} cy={off(6, 3)[1] + 0.6} rx={8} ry={2.6} fill="currentColor" fillOpacity={0.15} />
      <Block u0={0} u1={12} v0={0} v1={6} h={3.6} lift={1} tone={1.3} />
      <Block u0={2.5} u1={8.5} v0={0.6} v1={5.4} h={2.8} lift={4.6} tone={0.9} />
    </g>
  );
}

interface EaseStop { u: number; v: number; t: number }
interface EaseScene {
  label: string;
  /** Objects on the sidewalk */
  blocks: { u0: number; u1: number; v0: number; v1: number; h: number; front?: boolean }[];
  /** A railing along the curb, u0 to u1, so the road is no way round either */
  railing?: [number, number];
  /** The walker's route, t the fraction of the loop at each point */
  route: EaseStop[];
  dur: number;
  /** Where the walker stands when motion is reduced */
  still: [number, number];
  /** Cars in the road: lane, start along the loop and where one stands when still */
  cars?: { v: number; begin: number; still: number }[];
  /** Can't get through: the mark over the walker's head while stopped */
  stop?: { from: number; to: number };
}

const EASE_SCENES: Record<number, EaseScene> = {
  5: {
    label: "Unobstructed: walks straight along the sidewalk",
    blocks: [],
    route: [{ u: 2, v: 7, t: 0 }, { u: 58, v: 7, t: 1 }],
    dur: 4,
    still: [14, 7],
  },
  4: {
    label: "Slightly obstructed: a small object, a short step aside",
    blocks: [{ u0: 28, u1: 32, v0: 0.5, v1: 5, h: 8 }],
    route: [{ u: 2, v: 5, t: 0 }, { u: 21, v: 5, t: 0.34 }, { u: 26, v: 9.5, t: 0.45 }, { u: 34, v: 9.5, t: 0.59 }, { u: 40, v: 5, t: 0.7 }, { u: 58, v: 5, t: 1 }],
    dur: 4.4,
    still: [14, 5],
  },
  3: {
    label: "Moderately obstructed: zigzags between objects on both sides",
    blocks: [{ u0: 20, u1: 25, v0: 0, v1: 8.5, h: 9 }, { u0: 33, u1: 38, v0: 5.5, v1: 14, h: 9, front: true }],
    route: [{ u: 2, v: 11, t: 0 }, { u: 16, v: 11, t: 0.2 }, { u: 26, v: 11.2, t: 0.36 }, { u: 30, v: 3, t: 0.5 }, { u: 39, v: 3, t: 0.66 }, { u: 44, v: 7, t: 0.76 }, { u: 58, v: 7, t: 1 }],
    dur: 5.2,
    still: [9, 11],
  },
  2: {
    label: "Heavily obstructed: has to step into the road, where cars pass, to get around",
    blocks: [{ u0: 26, u1: 36, v0: 0, v1: 14, h: 10 }],
    route: [{ u: 2, v: 7, t: 0 }, { u: 18, v: 7, t: 0.2 }, { u: 23, v: 17.5, t: 0.32 }, { u: 39, v: 17.5, t: 0.62 }, { u: 45, v: 7, t: 0.74 }, { u: 58, v: 7, t: 1 }],
    dur: 5.4,
    still: [13, 7],
    cars: [{ v: 19.6, begin: 0.5, still: 46 }],
  },
  1: {
    label: "Fully obstructed: a wall fills the sidewalk and a railing closes off the road, the walker stops",
    blocks: [{ u0: 26, u1: 54, v0: 0, v1: 14, h: 15 }],
    railing: [22, 56],
    route: [{ u: 2, v: 7, t: 0 }, { u: 18, v: 7, t: 0.36 }, { u: 18, v: 7, t: 0.9 }, { u: 18, v: 7, t: 1 }],
    dur: 4.4,
    still: [18, 7],
    stop: { from: 0.36, to: 0.88 },
  },
};

/** A railing along the curb from u0 to u1, a post every few steps and a rail on top */
function Railing({ u0, u1, v, h = 6.5 }: { u0: number; u1: number; v: number; h?: number }) {
  const posts: number[] = [];
  for (let u = u0; u <= u1 + 0.01; u += 4.5) posts.push(u);
  const top = (u: number) => { const [x, y] = at(u, v); return `${r2(x)} ${r2(y - h)}`; };
  return (
    <g stroke="currentColor" strokeLinecap="round">
      {posts.map((u) => { const [x, y] = at(u, v); return <path key={u} d={`M${r2(x)} ${r2(y)} L${r2(x)} ${r2(y - h)}`} strokeWidth={0.9} />; })}
      <path d={`M${top(u0)} L${top(posts[posts.length - 1])}`} strokeWidth={1.3} />
      <path d={`M${(() => { const [x, y] = at(u0, v); return `${r2(x)} ${r2(y - h * 0.5)}`; })()} L${(() => { const [x, y] = at(posts[posts.length - 1], v); return `${r2(x)} ${r2(y - h * 0.5)}`; })()}`} strokeWidth={0.7} strokeOpacity={0.7} />
    </g>
  );
}

function EaseWalker({ scene, still }: { scene: EaseScene; still: boolean }) {
  if (still) return <g transform={`translate(${xy(ground(...scene.still))})`}><Person /></g>;
  const pts = scene.route.map((s) => xy(ground(s.u, s.v)));
  const times = scene.route.map((s) => r2(s.t)).join(";");
  return (
    <g transform={`translate(${pts[0]})`}>
      <animateTransform attributeName="transform" type="translate" dur={`${scene.dur}s`} repeatCount="indefinite" values={pts.join(";")} keyTimes={times} />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur={`${scene.dur}s`} repeatCount="indefinite" />
      <g>
        <Person />
        <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;0 -0.7;0 0" dur="0.5s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

/** A car driving along the road towards the viewer, once per loop */
function EaseCar({ car, dur, still }: { car: { v: number; begin: number; still: number }; dur: number; still: boolean }) {
  if (still) return <g transform={`translate(${xy(ground(car.still, car.v))})`}><Car /></g>;
  const a = xy(ground(62, car.v)), b = xy(ground(-12, car.v));
  const begin = `${r2(-car.begin * dur)}s`;
  return (
    <g transform={`translate(${a})`}>
      <animateTransform attributeName="transform" type="translate" dur={`${dur}s`} begin={begin} repeatCount="indefinite" values={`${a};${b}`} keyTimes="0;1" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.86;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
      <Car />
    </g>
  );
}

/** The way the walker goes, dashed on the ground, ending in an arrow (or at the stop) */
function Route({ scene }: { scene: EaseScene }) {
  const pts = scene.route.filter((p, i, all) => i === 0 || p.u !== all[i - 1].u || p.v !== all[i - 1].v).map((p) => ground(p.u, p.v));
  const d = "M" + pts.map(xy).join(" L");
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [dx, dy] = [(x2 - x1) / len, (y2 - y1) / len];
  const head = scene.stop ? "" : `M${r2(x2 - dx * 3 - dy * 2)} ${r2(y2 - dy * 3 + dx * 2)} L${r2(x2)} ${r2(y2)} L${r2(x2 - dx * 3 + dy * 2)} ${r2(y2 - dy * 3 - dx * 2)}`;
  return (
    <g fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} strokeDasharray="2 1.6" />
      {head && <path d={head} />}
    </g>
  );
}

function StopMark({ scene, still }: { scene: EaseScene; still: boolean }) {
  if (!scene.stop) return null;
  const [cx, cy] = ground(...scene.still);
  const y = cy - 23.5;
  return (
    <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={still ? 1 : 0}>
      <path d={`M${r2(cx - 2.6)} ${r2(y - 2.6)} L${r2(cx + 2.6)} ${r2(y + 2.6)} M${r2(cx + 2.6)} ${r2(y - 2.6)} L${r2(cx - 2.6)} ${r2(y + 2.6)}`} />
      {!still && <animate attributeName="opacity" values="0;0;1;1;0" keyTimes={`0;${scene.stop.from};${scene.stop.from + 0.04};${scene.stop.to};1`} dur={`${scene.dur}s`} repeatCount="indefinite" />}
    </g>
  );
}

/**
 * Ease of Navigation, by stored value 1 to 5 (overallAccessibility). One person
 * walks along the sidewalk and meets what is in the way: nothing, a small
 * object to step round, objects on both sides to zigzag between, an object
 * that sends them into the road among the cars, and a wall across the whole
 * sidewalk with a railing along the curb, so there is no way past at all.
 */
export function EaseOfNavigationIcon({ value }: { value: number }) {
  const still = useMediaQuery(REDUCED_MOTION_QUERY) === true;
  const scene = EASE_SCENES[value];
  if (!scene) return null;
  return (
    // Closer in than Sidewalk Width, on the stretch where the objects stand
    <svg viewBox="8 6 54 58" className="w-full h-full" aria-hidden="true" data-icon={scene.label}>
      <Slab width={EASE_WIDTH} road={EASE_ROAD} />
      <Route scene={scene} />
      <g transform={`translate(${O[0]} ${O[1]})`}>
        {scene.blocks.filter((b) => !b.front).map((b, i) => <Block key={i} {...b} />)}
      </g>
      <EaseWalker scene={scene} still={still} />
      <g transform={`translate(${O[0]} ${O[1]})`}>
        {scene.blocks.filter((b) => b.front).map((b, i) => <Block key={i} {...b} />)}
      </g>
      {scene.railing && <Railing u0={scene.railing[0]} u1={scene.railing[1]} v={EASE_WIDTH - 0.6} />}
      {scene.cars?.map((c, i) => <EaseCar key={i} car={c} dur={scene.dur} still={still} />)}
      <StopMark scene={scene} still={still} />
    </svg>
  );
}

// ---- Road Barrier ------------------------------------------------------------
// Seen from above, as the old Traffic icons were: the building line at the top,
// the sidewalk with a person on it, the curb, and the road with a car. Still
// pictures, so they stand apart from the animated questions.

function BarrierPlan({ barrier }: { barrier: boolean }) {
  return (
    <svg viewBox="2 1 60 60" className="w-full h-full" aria-hidden="true"
      data-icon={barrier ? "Barrier: a railing between the sidewalk and the road" : "No barrier: only the curb between the sidewalk and the road"}
      fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* Building line and its hatching */}
      <path d="M4 7H60" strokeWidth={3} />
      {[6, 14, 22, 30, 38, 46, 54].map((x) => <path key={x} d={`M${x} 3L${x + 3} 6`} strokeWidth={1} opacity={0.35} />)}
      {/* Sidewalk */}
      <rect x={4} y={7} width={56} height={25} fill="currentColor" fillOpacity={0.1} stroke="none" />
      {/* Person seen from above, walking along */}
      <ellipse cx={17} cy={17} rx={3.4} ry={5.6} fill="currentColor" stroke="none" />
      <circle cx={20.6} cy={17} r={2.7} fill="currentColor" stroke="none" opacity={0.5} />
      {/* Curb */}
      <path d="M4 32H60" strokeWidth={2.4} />
      {barrier && (
        <g>
          {/* A railing along the curb: the rail and its posts */}
          <path d="M4 27H60" strokeWidth={2.2} />
          {[7, 19, 31, 43, 55].map((x) => <rect key={x} x={x - 1.7} y={25.3} width={3.4} height={3.4} rx={0.6} fill="currentColor" stroke="none" />)}
        </g>
      )}
      {/* Road, a car close to the curb, and the lane line */}
      <path d="M6 57H58" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.45} />
      <rect x={26} y={36} width={24} height={12} rx={3.5} fill="currentColor" fillOpacity={0.2} strokeWidth={1.8} />
      <path d="M44 38.5V45.5" strokeWidth={1.5} />
      {/* It is moving: lines behind it */}
      <path d="M53 39H59M54.5 42H60M53 45H59" strokeWidth={1.3} opacity={0.5} />
    </svg>
  );
}

/** Road Barrier, by answer: false, the curb only. true, a railing along the curb. */
export function RoadBarrierIcon({ value }: { value: boolean }) {
  return <BarrierPlan barrier={value} />;
}

// ---- Evenness ----------------------------------------------------------------
// The same stretch of sidewalk as Sidewalk Width, standing still: the whole
// sidewalk rolls up and down, tilts, or lies flat, beside a flat road. Paving
// joints across it show its shape. Stored 1 to 3, worst to best: Uneven,
// Sloped, Flat.

const EVEN_WIDTH = 13;
const EVEN_ROAD = 6;
const EVEN_SHAPES: Record<number, { label: string; rise: (u: number) => number; person: number }> = {
  1: { label: "Uneven: the whole sidewalk rises and dips along its length", rise: (u) => 3 + 3 * Math.sin((u / 32) * 2 * Math.PI - Math.PI / 2), person: 16 },
  2: { label: "Sloped: the whole sidewalk tilts along its length", rise: (u) => 1 + u * 0.16, person: 22 },
  3: { label: "Flat: the sidewalk stays level along its length", rise: () => 2, person: 22 },
};

/** Evenness, by stored value 1 to 3 */
export function EvennessIcon({ value }: { value: number }) {
  const shape = EVEN_SHAPES[value];
  if (!shape) return null;
  const W = EVEN_WIDTH;
  const us: number[] = [];
  for (let u = 0; u <= LENGTH + 0.01; u += 1.5) us.push(u);
  // A point on the sidewalk's surface, raised by the shape
  const top = (u: number, v: number): [number, number] => { const [x, y] = at(u, v); return [x, y - shape.rise(u)]; };
  const back = us.map((u) => top(u, 0));
  const front = us.map((u) => top(u, W));
  const line = (pts: [number, number][]) => pts.map(xy).join(" L");
  // The road and the foot of the curb stay flat
  const foot = us.map((u) => { const [x, y] = at(u, W); return [x, y + CURB] as [number, number]; });
  const e = at(0, W + EVEN_ROAD), g = at(LENGTH, W + EVEN_ROAD);
  const joints: number[] = [];
  for (let u = 6; u < LENGTH; u += 6) joints.push(u);
  const [px, py] = top(shape.person, W * 0.45);
  return (
    // Cropped to the sidewalk and the person, so it reads in a small box
    <svg viewBox="2 12 60 52" className="w-full h-full" aria-hidden="true" data-icon={shape.label}>
      {/* Road */}
      <path d={`M${xy(foot[0])} L${xy(foot[foot.length - 1])} L${r2(g[0])} ${r2(g[1] + CURB)} L${r2(e[0])} ${r2(e[1] + CURB)} Z`} fill="currentColor" fillOpacity={0.05} />
      {/* The side of the sidewalk facing the road, from its surface down to the flat road */}
      <path d={`M${line(front)} L${line([...foot].reverse())} Z`} fill="currentColor" fillOpacity={0.3} />
      {/* The walking surface */}
      <path d={`M${line(back)} L${line([...front].reverse())} Z`} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
      {/* Paving joints across it, which follow its shape */}
      <g stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.6}>
        {joints.map((u) => <path key={u} d={`M${xy(top(u, 0))} L${xy(top(u, W))}`} />)}
      </g>
      <g transform={`translate(${r2(px)} ${r2(py)})`}><Person /></g>
    </svg>
  );
}

// ---- Surface Type and Surface Condition -------------------------------------
// A close view of a patch of sidewalk from the same angle as the other
// pictures, so its thickness shows. Still pictures. Surface Type shows the
// material, Surface Condition shows concrete panels whole, cracked, or broken
// (a raised panel, a hole and a chipped corner: something missing or out of
// level, where a crack is only a line).

const PU = [1.5, -0.62];
const PV = [0.9, 0.95];
const PO = [3, 36];
const PATCH_U = 30;
const PATCH_V = 22;
const THICK = 4;
const pp = (u: number, v: number, z = 0): [number, number] => [PO[0] + PU[0] * u + PV[0] * v, PO[1] + PU[1] * u + PV[1] * v - z];
const poly = (pts: [number, number][]) => "M" + pts.map(xy).join(" L") + " Z";

/** The patch: its top, the edge facing the viewer and the end on the left */
function Patch({ fill = 0.12 }: { fill?: number }) {
  return (
    <g>
      <path d={poly([pp(0, PATCH_V), pp(PATCH_U, PATCH_V), [pp(PATCH_U, PATCH_V)[0], pp(PATCH_U, PATCH_V)[1] + THICK], [pp(0, PATCH_V)[0], pp(0, PATCH_V)[1] + THICK]])} fill="currentColor" fillOpacity={0.32} />
      <path d={poly([pp(0, 0), pp(0, PATCH_V), [pp(0, PATCH_V)[0], pp(0, PATCH_V)[1] + THICK], [pp(0, 0)[0], pp(0, 0)[1] + THICK]])} fill="currentColor" fillOpacity={0.22} />
      <path d={poly([pp(0, 0), pp(PATCH_U, 0), pp(PATCH_U, PATCH_V), pp(0, PATCH_V)])} fill="currentColor" fillOpacity={fill} stroke="currentColor" strokeOpacity={0.6} strokeWidth={0.9} strokeLinejoin="round" />
    </g>
  );
}

const seg = (a: [number, number], b: [number, number]) => `M${xy(a)} L${xy(b)}`;

/** Joints of concrete panels, 3 along by 2 across */
function Panels() {
  return (
    <path d={[seg(pp(10, 0), pp(10, PATCH_V)), seg(pp(20, 0), pp(20, PATCH_V)), seg(pp(0, 11), pp(PATCH_U, 11))].join(" ")} stroke="currentColor" strokeOpacity={0.55} strokeWidth={0.8} />
  );
}

const TYPE_LABELS: Record<string, string> = {
  concrete: "Concrete or asphalt: one poured surface, panels at most",
  tiles: "Tiles: small glazed squares, shiny",
  pavers: "Paver blocks or bricks: small blocks laid in rows",
  unpaved: "Unpaved: soil, gravel or grass",
};

/** Surface Type, by stored value */
export function SurfaceTypeIcon({ value }: { value: string }) {
  let inner: React.ReactNode = null;
  if (value === "concrete") {
    // Two wide panels, a few specks in the mix
    inner = (
      <g>
        <path d={seg(pp(15, 0), pp(15, PATCH_V))} stroke="currentColor" strokeOpacity={0.55} strokeWidth={0.8} />
        {[[5, 5], [9, 15], [21, 7], [25, 17], [12, 9], [27, 4]].map(([u, v], i) => <circle key={i} cx={r2(pp(u, v)[0])} cy={r2(pp(u, v)[1])} r={0.55} fill="currentColor" fillOpacity={0.45} />)}
      </g>
    );
  } else if (value === "tiles") {
    // A tight grid of tiles, with a shine across them
    const lines: string[] = [];
    for (let u = 5; u < PATCH_U; u += 5) lines.push(seg(pp(u, 0), pp(u, PATCH_V)));
    for (let v = 5.5; v < PATCH_V; v += 5.5) lines.push(seg(pp(0, v), pp(PATCH_U, v)));
    inner = (
      <g>
        <path d={lines.join(" ")} stroke="currentColor" strokeOpacity={0.5} strokeWidth={0.7} />
        <path d={`${seg(pp(6, 18), pp(13, 4))} ${seg(pp(9, 19), pp(16, 5))} ${seg(pp(19, 18), pp(24, 8))}`} stroke="#fff" strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" />
      </g>
    );
  } else if (value === "pavers") {
    // Bricks in rows across, every other row shifted by half a brick
    const lines: string[] = [];
    const rows = 5, bw = 6;
    for (let r = 1; r < rows; r++) lines.push(seg(pp(0, (r * PATCH_V) / rows), pp(PATCH_U, (r * PATCH_V) / rows)));
    for (let r = 0; r < rows; r++) {
      const v0 = (r * PATCH_V) / rows, v1 = ((r + 1) * PATCH_V) / rows;
      for (let u = r % 2 ? bw / 2 : bw; u < PATCH_U; u += bw) lines.push(seg(pp(u, v0), pp(u, v1)));
    }
    inner = <path d={lines.join(" ")} stroke="currentColor" strokeOpacity={0.55} strokeWidth={0.7} />;
  } else if (value === "unpaved") {
    // Bare ground: pebbles and tufts of grass, no edges laid
    const pebbles: [number, number, number][] = [[4, 6, 1], [8, 16, 1.3], [13, 9, 0.9], [17, 18, 1.1], [21, 5, 1.2], [26, 13, 0.9], [11, 3, 0.8], [24, 20, 1]];
    const tufts: [number, number][] = [[6, 12], [19, 11], [28, 6], [14, 20]];
    return (
      <svg viewBox="0 14 72 56" className="w-full h-full" aria-hidden="true" data-icon={TYPE_LABELS[value]}>
        <path d={poly([pp(0, 0), pp(PATCH_U, 0), pp(PATCH_U, PATCH_V), pp(0, PATCH_V)])} fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="2 1.5" />
        {pebbles.map(([u, v, rr], i) => <ellipse key={i} cx={r2(pp(u, v)[0])} cy={r2(pp(u, v)[1])} rx={rr * 1.4} ry={rr * 0.9} fill="currentColor" fillOpacity={0.55} />)}
        <g stroke="currentColor" strokeWidth={0.9} strokeLinecap="round">
          {tufts.map(([u, v], i) => { const [x, y] = pp(u, v); return <path key={i} d={`M${r2(x - 1.6)} ${r2(y - 2.6)} L${r2(x)} ${r2(y)} L${r2(x)} ${r2(y - 3.4)} M${r2(x)} ${r2(y)} L${r2(x + 1.6)} ${r2(y - 2.6)}`} />; })}
        </g>
      </svg>
    );
  }
  if (!inner) return null;
  return (
    <svg viewBox="0 14 72 56" className="w-full h-full" aria-hidden="true" data-icon={TYPE_LABELS[value]}>
      <Patch fill={value === "tiles" ? 0.08 : 0.12} />
      {inner}
    </svg>
  );
}

const CONDITION_LABELS: Record<number, string> = {
  1: "Broken: a raised panel, a hole and a chipped corner, pieces missing or out of level",
  2: "Cracked: cracks across the panels, every piece still in place and level",
  3: "Intact: whole panels, no cracks",
};

/** Surface Condition, by stored value 1 to 3: Broken, Cracked, Intact */
export function SurfaceConditionIcon({ value }: { value: number }) {
  if (!CONDITION_LABELS[value]) return null;
  let marks: React.ReactNode = null;
  if (value === 2) {
    marks = (
      <path d={`M${xy(pp(2, 3))} L${xy(pp(5, 6))} L${xy(pp(4, 8))} L${xy(pp(8, 10))} M${xy(pp(13, 13))} L${xy(pp(15, 16))} L${xy(pp(14, 18))} L${xy(pp(18, 21))} M${xy(pp(22, 2))} L${xy(pp(24, 5))} L${xy(pp(23, 7))} L${xy(pp(27, 9))}`}
        fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round" />
    );
  } else if (value === 1) {
    // A hole in the middle panel of the near row, with its walls
    const h = [pp(12, 14), pp(17, 13), pp(18, 18), pp(13, 19.5)];
    const deep = 3.2;
    // The far panel on the right lifted, so its edge stands up
    const lift = 2.6;
    const L = (u: number, v: number) => pp(u, v, lift);
    marks = (
      <g>
        <path d={poly(h)} fill="currentColor" fillOpacity={0.85} />
        <path d={poly([h[0], h[1], [h[1][0], h[1][1] + deep], [h[0][0], h[0][1] + deep]])} fill="currentColor" fillOpacity={0.35} />
        {/* Raised panel: its side, then its top */}
        <path d={poly([pp(20, 11), pp(30, 11), L(30, 11), L(20, 11)])} fill="currentColor" fillOpacity={0.55} />
        <path d={poly([pp(20, 0), pp(20, 11), L(20, 11), L(20, 0)])} fill="currentColor" fillOpacity={0.45} />
        <path d={poly([L(20, 0), L(30, 0), L(30, 11), L(20, 11)])} fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeOpacity={0.7} strokeWidth={0.8} />
        {/* A chipped corner, missing from the near left panel */}
        <path d={poly([pp(0, 17), pp(4, 22), pp(0, 22)])} fill="#fff" />
        <path d={`M${xy(pp(0, 17))} L${xy(pp(2.5, 18.5))} L${xy(pp(4, 22))}`} fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      </g>
    );
  }
  return (
    <svg viewBox="0 14 72 56" className="w-full h-full" aria-hidden="true" data-icon={CONDITION_LABELS[value]}>
      <Patch />
      <Panels />
      {marks}
    </svg>
  );
}
