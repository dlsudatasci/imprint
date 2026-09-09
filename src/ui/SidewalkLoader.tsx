import React, { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import CrayonFilters from './CrayonFilters';

/**
 * Imprint's loading animation: a walk down an obstructed sidewalk.
 *
 * Puts the platform's own subject matter on screen while people wait — the
 * walker squeezes past a cone, hops some dumped trash, rounds a pole, skirts a
 * tree, then meets two friends up the block.
 *
 * The hand-drawn look is intentional: thick crayon lines, soft brown outlines,
 * and a turbulence filter that "boils" between three noise seeds so the strokes
 * never sit still. That accounts for the SVG filter definitions below and the
 * two keyframes in globals.scss.
 *
 * One loop runs `scroll → approach → greet → out → in`, then starts over.
 * `onLoopComplete` fires at the end of the greeting, which is the earliest the
 * loader can be dismissed without cutting the walk short. Left alone, it fades
 * out and restarts.
 *
 * Notes for anyone changing this:
 *
 *   - Animation happens through direct style writes on refs inside one
 *     requestAnimationFrame loop. React state holds only the two lines of text.
 *     Driving transforms through state would re-render 60 times a second.
 *   - `speed` is the only dial worth turning; course length and greeting
 *     duration are constants above.
 *   - Under prefers-reduced-motion it paints a single static frame and calls
 *     `onLoopComplete` straight away.
 */

export interface SidewalkLoaderProps {
  /** Walking speed in px/s. Default 118; the scene reads well from 40 to 220. */
  speed?: number;
  /**
   * Fires when the greeting ends and the loader can be dismissed. The caller
   * owns the exit transition from here.
   */
  onLoopComplete?: () => void;
  /** Layout classes only. */
  className?: string;
}

type ObstructionType = 'cone' | 'trash' | 'pole' | 'tree';
/** How the walker deals with it: sidestep near/far, jump it, or hold the line. */
type Act = 'near' | 'far' | 'jump' | 'center';

interface CourseItem {
  x: number;
  type: ObstructionType;
  /** Vertical offset of the art within the band. + is the near side. */
  lane: number;
  act: Act;
  /** Shouted at the moment of contact. */
  ex: string;
  line: string;
}

const COURSE: CourseItem[] = [
  { x: 480, type: 'cone', lane: 0, act: 'near', ex: 'Uy!', line: 'Squeezing past a traffic cone' },
  { x: 660, type: 'trash', lane: 18, act: 'jump', ex: 'Hup—', line: "Stepping over somebody's trash" },
  { x: 840, type: 'pole', lane: 0, act: 'near', ex: 'Oy!', line: 'Who put a pole in the middle here' },
  { x: 990, type: 'tree', lane: 22, act: 'center', ex: 'Whoa!', line: 'Woah, that tree almost got me' },
];

/** Two-way traffic: the kerbside lane runs with the walk, the far lane against it. */
interface Car {
  key: 'car1' | 'car2' | 'car3' | 'car4';
  x: number;
  v: number;
  w: number;
  dir: 1 | -1;
}
const CARS: Car[] = [
  { key: 'car1', x: 210, v: 188, w: 104, dir: 1 },
  { key: 'car2', x: -430, v: 152, w: 118, dir: 1 },
  { key: 'car3', x: 620, v: 224, w: 132, dir: -1 },
  { key: 'car4', x: 1420, v: 262, w: 86, dir: -1 },
];

const START_X = 74;   // walker's centre at the start of a loop
const SLOT_W = 72;
const END_DIST = 500; // scrolling stops here; the walker covers the rest on foot
const GREET_SECONDS = 2.4;

const IDLE_LINE = 'Walking the sidewalk, allegedly';
const SPOT_LINE = 'Oh hey, there they are';
const GREET_LINE = 'Made it. Barely';

/** Crayon blue. Deliberately not the brand token — it is ink on paper here. */
const INK = '#1f4fa8';
/** Outline on the props, a soft brown rather than black. */
const OUTLINE = '#4a3b28';
/**
 * The ground the scene sits on.
 *
 * The canvas drew this on warm paper (#fdf6e6), but the loader covers the
 * landing page and then lifts off it — so a cream ground meant the whole screen
 * changed colour on dismissal, and a full viewport of saturated yellow is tiring
 * to sit in front of. This tracks the app's own page background instead, so the
 * handoff is invisible. It shows as the sky above the skyline and as the strip
 * below the hedge.
 */
const GROUND = 'var(--c-ground, #f8f7f9)';

type Mode = 'scroll' | 'approach' | 'greet' | 'out' | 'in';

function Obstruction({ type }: { type: ObstructionType }) {
  const common = {
    width: 72, height: 96, viewBox: '0 0 72 96', fill: 'none',
    stroke: OUTLINE, strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round',
    style: { display: 'block' },
  } as const;

  if (type === 'cone') {
    return (
      <svg {...common}>
        <path d="M34 40h6l10 46H24z" fill="#f57d1f" />
        <path d="M28 64h18l2 10H26z" fill="#fffdf6" />
        <path d="M18 86h38c3 0 5 2 5 5s-2 5-5 5H18c-3 0-5-2-5-5s2-5 5-5z" fill="#d2551a" />
      </svg>
    );
  }
  if (type === 'trash') {
    return (
      <svg {...common}>
        <path d="M14 96c-3-8 2-14 9-15 3-6 12-7 15-1 7-1 11 5 9 16z" fill="#8f9b6f" />
        <path d="M40 96c-1-5 3-8 8-8h11c4 0 6 3 5 8z" fill="#d0c49c" />
        <path d="M44 88c-6 0-9-3-9-6s4-5 9-5h5c3 0 5 2 5 5s-2 6-5 6z" fill="#5f96c8" />
        <path d="M49 79h6v4h-6z" fill="#4680ad" />
      </svg>
    );
  }
  if (type === 'pole') {
    return (
      <svg {...common}>
        <path d="M31 96l2-92h7l2 92z" fill="#ad8f60" />
        <path d="M33 20h6v6h-6z" fill="#7c6238" />
        <rect x="16" y="12" width="40" height="5" rx="1.5" fill="#7c6238" />
        <rect x="20" y="6" width="5" height="7" rx="1.5" fill="#3b3126" />
        <rect x="47" y="6" width="5" height="7" rx="1.5" fill="#3b3126" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M30 96c2-16 3-32 2-54h9c-1 18 0 36 3 54z" fill="#96693f" />
      <path d="M35 62c-5-1-7-5-5-9" stroke="#7a5330" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="32" r="20" fill="#4fae5c" />
      <circle cx="20" cy="42" r="12" fill="#4fae5c" />
      <circle cx="52" cy="42" r="12" fill="#4fae5c" />
      <circle cx="44" cy="24" r="11" fill="#6cc06b" />
      <circle cx="26" cy="30" r="9" fill="#3f9a4f" />
    </svg>
  );
}

/** Repeating skyline, drawn twice so it can scroll seamlessly. */
function Skyline() {
  return (
    <svg width="2400" height="72" viewBox="0 0 2400 72" fill="none" preserveAspectRatio="none" style={{ display: 'block' }}>
      <g id="imp-sky">
        <path d="M0 72V34h70V16h56V44h84V8h64V30h104V50h72V22h96V60h88V12h60V38h118V26h78V54h68V18h100V42h42V36h100V72z" fill="#ffe8b0" />
        <path d="M0 72V52h88V38h66V58h120V20h54V46h96V64h136V30h82V56h108V44h92V62h128V34h72V50h58V54h100V72z" fill="#ffd684" />
        <g fill="#e9a13c">
          <rect x="18" y="58" width="7" height="5" /><rect x="34" y="58" width="7" height="5" /><rect x="50" y="58" width="7" height="5" />
          <rect x="18" y="66" width="7" height="5" /><rect x="50" y="66" width="7" height="5" />
          <rect x="100" y="44" width="7" height="5" /><rect x="116" y="44" width="7" height="5" /><rect x="132" y="44" width="7" height="5" />
          <rect x="100" y="54" width="7" height="5" /><rect x="132" y="54" width="7" height="5" /><rect x="116" y="64" width="7" height="5" />
          <rect x="288" y="26" width="7" height="5" /><rect x="304" y="26" width="7" height="5" /><rect x="320" y="26" width="7" height="5" />
          <rect x="288" y="38" width="7" height="5" /><rect x="320" y="38" width="7" height="5" /><rect x="304" y="50" width="7" height="5" />
          <rect x="288" y="62" width="7" height="5" /><rect x="320" y="62" width="7" height="5" />
          <rect x="392" y="52" width="7" height="5" /><rect x="410" y="52" width="7" height="5" /><rect x="428" y="52" width="7" height="5" />
          <rect x="392" y="62" width="7" height="5" /><rect x="428" y="62" width="7" height="5" />
          <rect x="590" y="36" width="7" height="5" /><rect x="608" y="36" width="7" height="5" /><rect x="626" y="36" width="7" height="5" />
          <rect x="590" y="48" width="7" height="5" /><rect x="626" y="48" width="7" height="5" /><rect x="608" y="60" width="7" height="5" />
          <rect x="700" y="52" width="7" height="5" /><rect x="718" y="52" width="7" height="5" /><rect x="736" y="52" width="7" height="5" />
          <rect x="700" y="62" width="7" height="5" /><rect x="736" y="62" width="7" height="5" />
          <rect x="820" y="50" width="7" height="5" /><rect x="838" y="50" width="7" height="5" /><rect x="856" y="50" width="7" height="5" />
          <rect x="820" y="62" width="7" height="5" /><rect x="856" y="62" width="7" height="5" />
          <rect x="960" y="40" width="7" height="5" /><rect x="978" y="40" width="7" height="5" /><rect x="996" y="40" width="7" height="5" />
          <rect x="960" y="52" width="7" height="5" /><rect x="996" y="52" width="7" height="5" /><rect x="978" y="64" width="7" height="5" />
          <rect x="1108" y="56" width="7" height="5" /><rect x="1126" y="56" width="7" height="5" /><rect x="1144" y="56" width="7" height="5" />
          <rect x="1108" y="66" width="7" height="5" /><rect x="1144" y="66" width="7" height="5" />
        </g>
      </g>
      <use href="#imp-sky" x="1200" />
    </svg>
  );
}

/** Street lamps, also doubled for a seamless scroll. */
function Lamps() {
  return (
    <svg width="3040" height="58" viewBox="0 0 3040 58" fill="none" style={{ display: 'block' }}>
      <g id="imp-lamps" fill="#c2ab84">
        <rect x="90" y="10" width="3" height="48" />
        <rect x="76" y="10" width="17" height="3" />
        <rect x="68" y="8" width="9" height="7" rx="2.5" fill="#ffcf4d" />
        <rect x="470" y="10" width="3" height="48" />
        <rect x="456" y="10" width="17" height="3" />
        <rect x="448" y="8" width="9" height="7" rx="2.5" fill="#ffcf4d" />
        <rect x="850" y="10" width="3" height="48" />
        <rect x="836" y="10" width="17" height="3" />
        <rect x="828" y="8" width="9" height="7" rx="2.5" fill="#ffcf4d" />
        <rect x="1230" y="10" width="3" height="48" />
        <rect x="1216" y="10" width="17" height="3" />
        <rect x="1208" y="8" width="9" height="7" rx="2.5" fill="#ffcf4d" />
      </g>
      <use href="#imp-lamps" x="1520" />
    </svg>
  );
}

const carStroke = {
  fill: 'none', stroke: OUTLINE, strokeWidth: 2.2,
  strokeLinejoin: 'round', strokeLinecap: 'round', style: { display: 'block' },
} as const;

function CarArt({ which }: { which: Car['key'] }) {
  if (which === 'car1') {
    return (
      <svg width="104" height="38" viewBox="0 0 104 38" {...carStroke}>
        <rect x="4" y="18" width="96" height="13" rx="6" fill="#48a06d" />
        <path d="M24 19V9c0-1.2 1-2.2 2.2-2.2h27c1.2 0 2.2.4 3 1.2l9 11z" fill="#48a06d" />
        <path d="M28 10h11v8H28z" fill="#e8faee" />
        <path d="M42 10h9l6.5 8H42z" fill="#e8faee" />
        <rect x="95" y="20" width="5" height="4" rx="2" fill="#fff8db" />
        <circle cx="29" cy="31" r="6.5" fill="#3b3126" />
        <circle cx="79" cy="31" r="6.5" fill="#3b3126" />
      </svg>
    );
  }
  if (which === 'car2') {
    return (
      <svg width="118" height="42" viewBox="0 0 118 42" {...carStroke}>
        <rect x="8" y="8" width="98" height="3" rx="1.5" fill="#bd4470" />
        <rect x="4" y="11" width="106" height="21" rx="5" fill="#dd6790" />
        <rect x="4" y="25" width="106" height="3" fill="#bd4470" />
        <rect x="12" y="14" width="13" height="9" rx="1.5" fill="#fff0f4" />
        <rect x="29" y="14" width="13" height="9" rx="1.5" fill="#fff0f4" />
        <rect x="46" y="14" width="13" height="9" rx="1.5" fill="#fff0f4" />
        <rect x="63" y="14" width="13" height="9" rx="1.5" fill="#fff0f4" />
        <path d="M92 14h9l7 8v3H92z" fill="#fff0f4" />
        <circle cx="27" cy="32" r="7" fill="#3b3126" />
        <circle cx="92" cy="32" r="7" fill="#3b3126" />
      </svg>
    );
  }
  if (which === 'car3') {
    return (
      <svg width="132" height="40" viewBox="0 0 132 40" {...carStroke}>
        <rect x="4" y="5" width="124" height="25" rx="4" fill="#f4b731" />
        <rect x="4" y="23" width="124" height="3" fill="#d89a1c" />
        <rect x="11" y="9" width="15" height="9" rx="1.5" fill="#fff8de" />
        <rect x="30" y="9" width="15" height="9" rx="1.5" fill="#fff8de" />
        <rect x="49" y="9" width="15" height="9" rx="1.5" fill="#fff8de" />
        <rect x="68" y="9" width="15" height="9" rx="1.5" fill="#fff8de" />
        <rect x="87" y="9" width="15" height="9" rx="1.5" fill="#fff8de" />
        <path d="M107 9h13c3 0 5 2 5 5v4h-18z" fill="#fffdf0" />
        <circle cx="32" cy="30" r="6.5" fill="#3b3126" />
        <circle cx="104" cy="30" r="6.5" fill="#3b3126" />
      </svg>
    );
  }
  return (
    <svg width="86" height="32" viewBox="0 0 86 32" {...carStroke}>
      <rect x="3" y="14" width="78" height="11" rx="5" fill="#e0574a" />
      <path d="M18 15V8c0-1.2 1-2 2.2-2h20c1 0 1.8.3 2.5 1l7 8z" fill="#e0574a" />
      <path d="M21 8h8v6h-8z" fill="#fff2e2" />
      <path d="M32 8h7l5 6H32z" fill="#fff2e2" />
      <rect x="78" y="16" width="4" height="3" rx="1.5" fill="#fff8db" />
      <circle cx="23" cy="25" r="5" fill="#3b3126" />
      <circle cx="65" cy="25" r="5" fill="#3b3126" />
    </svg>
  );
}

export default function SidewalkLoader({ speed = 118, onLoopComplete, className }: SidewalkLoaderProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const leanRef = useRef<HTMLDivElement>(null);
  const exRef = useRef<HTMLDivElement>(null);
  const armARef = useRef<SVGGElement>(null);
  const armBRef = useRef<SVGGElement>(null);
  const legARef = useRef<SVGGElement>(null);
  const legBRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const friendsRef = useRef<HTMLDivElement>(null);
  const f1ArmRef = useRef<SVGGElement>(null);
  const f2ArmRef = useRef<SVGGElement>(null);
  const skylineRef = useRef<HTMLDivElement>(null);
  const lampsRef = useRef<HTMLDivElement>(null);
  const hedgeBackRef = useRef<HTMLDivElement>(null);
  const hedgeMidRef = useRef<HTMLDivElement>(null);
  const hedgeFrontRef = useRef<HTMLDivElement>(null);
  const carRefs = {
    car1: useRef<HTMLDivElement>(null),
    car2: useRef<HTMLDivElement>(null),
    car3: useRef<HTMLDivElement>(null),
    car4: useRef<HTMLDivElement>(null),
  };

  const [caption, setCaption] = useState({ text: IDLE_LINE, key: 0 });
  const [shout, setShout] = useState({ text: '', key: 0 });

  // Per-frame state. A ref, not React state: it changes every frame and must
  // never trigger a render.
  const sim = useRef({
    dist: 0, wx: START_X, phase: 0, mode: 'scroll' as Mode,
    t: 0, wave: 0, dodge: 0, lift: 0, fade: 1, ex: 0, said: false, behind: false,
    keyN: 0, exN: 0, last: 0, W: 1200, friendsX: 1500, driftTo: 744,
    cars: CARS.map((c) => ({ ...c })),
  });

  // Read inside the rAF loop, which closes over them once. Mirroring into refs
  // lets a prop change take effect without tearing the loop down.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onLoopCompleteRef = useRef(onLoopComplete);
  onLoopCompleteRef.current = onLoopComplete;

  useEffect(() => {
    const s = sim.current;
    let raf = 0;

    const measure = () => {
      s.W = stageRef.current?.clientWidth || 1200;
      s.driftTo = Math.max(START_X + 60, s.W * 0.62);
      // They walk into frame while the second obstacle is still ahead.
      s.friendsX = (END_DIST - 200) + s.W;
    };

    const reset = () => {
      s.dist = 0; s.wx = START_X; s.phase = 0;
      s.mode = 'scroll'; s.t = 0; s.wave = 0;
      s.dodge = 0; s.lift = 0; s.fade = 1; s.ex = 0;
      s.said = false; s.behind = false;
    };

    const say = (line: string) => {
      setCaption((c) => (c.text === line ? c : { text: line, key: c.key + 1 }));
    };
    const exclaim = (text: string) => {
      setShout((c) => (c.text === text ? c : { text, key: c.key + 1 }));
    };

    const apply = (moving: boolean) => {
      const sw = moving ? Math.sin(s.phase) : 0;
      const d = s.dodge;
      const { lift, wave, t } = s;
      const damp = 1 - 0.5 * Math.max(Math.abs(d), lift);
      const flap = Math.sin(t * 9);
      const set = (el: Element | null, tr: string) => {
        if (el) (el as HTMLElement).style.transform = tr;
      };

      if (walkerRef.current) {
        walkerRef.current.style.transform = `translate3d(${s.wx - 30}px,0,0)`;
        walkerRef.current.style.zIndex = s.behind ? '1' : '3';
      }
      set(bodyRef.current, `translate3d(${-3 * d}px,${-30 * lift + 11 * d}px,0) scale(${1 + 0.05 * d})`);
      set(leanRef.current, `rotate(${8 * lift + 3 * d}deg)`);
      set(armARef.current, `rotate(${(-20 * sw * damp - 22 * lift) * (1 - wave) + wave * (-104 + 13 * flap)}deg)`);
      set(armBRef.current, `rotate(${(20 * sw * damp + 14 * lift) * (1 - wave) + wave * 6}deg)`);
      set(legARef.current, `rotate(${(26 * sw * damp + 34 * lift - 6 * d) * (1 - wave) + wave * -7}deg)`);
      set(legBRef.current, `rotate(${(-26 * sw * damp - 20 * lift + 8 * d) * (1 - wave) + wave * 6}deg)`);
      set(f1ArmRef.current, `rotate(${wave * (-122 - 16 * flap)}deg)`);
      set(f2ArmRef.current, `rotate(${wave * (-100 + 15 * flap)}deg)`);

      if (exRef.current) {
        exRef.current.style.opacity = String(Math.min(1, s.ex * 1.2));
        exRef.current.style.transform =
          `translate3d(${-3 * d}px,${-30 * lift + 11 * d - 6 * s.ex}px,0)`;
      }
      if (shadowRef.current) {
        shadowRef.current.style.transform = `scale(${1 - 0.45 * lift + 0.1 * d})`;
        shadowRef.current.style.opacity = String(1 - 0.55 * lift);
      }
    };

    const tick = (dt: number) => {
      const spd = speedRef.current;
      const target = Math.max(START_X + 120, s.W - 295);
      let moving = true;

      if (s.mode === 'scroll') {
        s.dist += spd * dt;
        // He gains ground down the sidewalk as he goes, so the last stretch is short.
        const p = Math.min(1, s.dist / END_DIST);
        s.wx = START_X + (s.driftTo - START_X) * p;
        if (s.dist >= END_DIST) { s.dist = END_DIST; s.mode = 'approach'; }
      } else if (s.mode === 'approach') {
        s.wx += spd * dt;
        if (s.wx >= target) { s.wx = target; s.mode = 'greet'; s.t = 0; }
      } else if (s.mode === 'greet') {
        moving = false;
        s.t += dt;
        if (s.t > GREET_SECONDS) {
          // The wave has landed, so the story is told. Hand over here rather
          // than after the fade — the caller runs its own exit.
          onLoopCompleteRef.current?.();
          s.mode = 'out';
          s.t = 0;
        }
      } else if (s.mode === 'out') {
        moving = false;
        s.t += dt;
        s.fade = Math.max(0, 1 - s.t / 0.55);
        if (s.t > 0.6) {
          // Nobody dismissed us, so go round again.
          const k = s.keyN;
          reset();
          s.keyN = k;
          s.mode = 'in';
          s.fade = 0;
        }
      } else if (s.mode === 'in') {
        moving = false;
        s.t += dt;
        s.fade = Math.min(1, s.t / 0.45);
        if (s.t > 0.5) { s.mode = 'scroll'; s.fade = 1; }
      }

      const waveTarget = s.mode === 'greet' ? 1 : 0;
      s.wave += (waveTarget - s.wave) * Math.min(1, dt * 6);

      if (trackRef.current) trackRef.current.style.transform = `translate3d(${-s.dist}px,0,0)`;
      if (friendsRef.current) friendsRef.current.style.transform = `translate3d(${s.friendsX - s.dist}px,0,0)`;
      if (sceneRef.current) sceneRef.current.style.opacity = String(s.fade);

      // Parallax: the far skyline crawls, lamp posts drift, the near hedge races.
      if (skylineRef.current) skylineRef.current.style.transform = `translate3d(${-((s.dist * 0.16) % 1200)}px,0,0)`;
      if (lampsRef.current) lampsRef.current.style.transform = `translate3d(${-((s.dist * 0.5) % 1520)}px,0,0)`;
      if (hedgeBackRef.current) hedgeBackRef.current.style.backgroundPositionX = `${-((s.dist * 1.25) % 96)}px`;
      if (hedgeMidRef.current) hedgeMidRef.current.style.backgroundPositionX = `${-((s.dist * 1.5) % 74)}px`;
      if (hedgeFrontRef.current) hedgeFrontRef.current.style.backgroundPositionX = `${-((s.dist * 1.85) % 58)}px`;

      for (const c of s.cars) {
        c.x += c.dir * c.v * dt;
        if (c.dir > 0 && c.x > s.W + 60) c.x = -c.w - 120 - Math.random() * 460;
        if (c.dir < 0 && c.x < -c.w - 60) c.x = s.W + 120 + Math.random() * 460;
        const el = carRefs[c.key].current;
        // Art is drawn facing right; oncoming traffic is mirrored to face its travel.
        if (el) el.style.transform = `translate3d(${c.x}px,0,0)${c.dir < 0 ? ' scaleX(-1)' : ''}`;
      }

      // Nearest obstacle to the walker, signed (+ is ahead).
      let nearest = Infinity;
      let near: CourseItem | null = null;
      if (s.mode === 'scroll') {
        for (const o of COURSE) {
          const d = o.x + SLOT_W / 2 - s.dist - s.wx;
          if (Math.abs(d) < Math.abs(nearest)) { nearest = d; near = o; }
        }
      }

      const R = 82;
      const sN = Math.max(-1, Math.min(1, nearest / R));
      const prox = near ? Math.max(0, 1 - sN * sN) : 0;

      let dodgeTarget = 0;
      let liftTarget = 0;
      if (near?.act === 'jump') liftTarget = Math.pow(prox, 0.7);
      else if (near?.act === 'far') dodgeTarget = -prox;
      else if (near?.act === 'center') dodgeTarget = 0;
      else if (near) dodgeTarget = prox;

      s.dodge += (dodgeTarget - s.dodge) * Math.min(1, dt * 9);
      s.lift += (liftTarget - s.lift) * Math.min(1, dt * 12);

      // Pass behind anything standing nearer to the viewer than he is.
      s.behind =
        s.dodge < -0.35 ||
        (!!near && near.lane > 8 && s.lift < 0.1 && s.dodge < 0.5 && Math.abs(nearest) < 120);

      // The exclamation fires just before contact and dies down after.
      let exTarget = 0;
      if (s.mode === 'scroll' && near && nearest < 62 && nearest > -70) {
        exclaim(near.ex);
        exTarget = 1;
      }
      s.ex += (exTarget - s.ex) * Math.min(1, dt * (exTarget ? 14 : 5));

      if (s.mode === 'greet') say(GREET_LINE);
      else if (s.mode === 'approach') say(SPOT_LINE);
      else if (near && Math.abs(nearest) < 170) { s.said = true; say(near.line); }
      // Before the first obstacle only — afterwards the last remark stays up.
      else if (s.mode === 'scroll' && !s.said) say(IDLE_LINE);

      const strideScale = 1.45 - 0.5 * Math.max(Math.abs(s.dodge), s.lift);
      if (moving) s.phase += dt * strideScale * Math.PI * 2;
      apply(moving);
    };

    measure();
    window.addEventListener('resize', measure);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      // One static frame, and hand over immediately — there is no walk to wait
      // for, so holding the screen would just be a delay.
      tick(0);
      onLoopCompleteRef.current?.();
      return () => window.removeEventListener('resize', measure);
    }

    s.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      tick(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const dot = (delay: string) => (
    <span
      className="font-sans text-sm"
      style={{ color: '#8a7a5c', animation: `imprint-dots 1.2s ease-in-out ${delay} infinite` }}
    >
      .
    </span>
  );

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-[22px]', className)}
      style={{ background: GROUND }}
      role="status"
      aria-live="polite"
    >
      {/* The scene is decoration and the caption is flavour text that changes
          several times a loop. Announcing either would be noise, so both are
          hidden and one stable message is exposed instead. */}
      <span className="sr-only">Loading</span>

      <CrayonFilters />

      <div ref={stageRef} aria-hidden="true" className="relative w-full overflow-hidden" style={{ height: 272 }}>
        {/* Everything that fades between loops, roughened as one piece */}
        <div ref={sceneRef} className="absolute inset-0" style={{ filter: 'url(#cr-rough)' }}>
          {/* Skyline, far background */}
          <div className="absolute left-0 right-0 overflow-hidden" style={{ bottom: 200, height: 72 }}>
            <div ref={skylineRef} className="absolute left-0 bottom-0" style={{ width: 2400, height: 72, willChange: 'transform' }}>
              <Skyline />
            </div>
          </div>

          {/* Street lamps */}
          <div className="absolute left-0 right-0 overflow-hidden" style={{ bottom: 200, height: 58 }}>
            <div ref={lampsRef} className="absolute left-0 bottom-0" style={{ width: 3040, height: 58, willChange: 'transform' }}>
              <Lamps />
            </div>
          </div>

          {/* Road, centre line and kerb */}
          <div className="absolute left-0 right-0" style={{ bottom: 132, height: 68, background: '#d9cfbb' }} />
          <div
            className="absolute left-0 right-0"
            style={{ bottom: 170, height: 2, background: 'repeating-linear-gradient(to right, #fffdf4 0 16px, transparent 16px 38px)' }}
          />
          <div className="absolute left-0 right-0" style={{ bottom: 132, height: 3, background: '#ab9b83' }} />

          {/* Traffic — far lane first so it sits behind the near lane */}
          <div ref={carRefs.car3} className="absolute left-0" style={{ bottom: 172, width: 132, height: 40, willChange: 'transform' }}>
            <CarArt which="car3" />
          </div>
          <div ref={carRefs.car4} className="absolute left-0" style={{ bottom: 172, width: 86, height: 32, willChange: 'transform' }}>
            <CarArt which="car4" />
          </div>
          <div ref={carRefs.car1} className="absolute left-0" style={{ bottom: 136, width: 104, height: 38, willChange: 'transform' }}>
            <CarArt which="car1" />
          </div>
          <div ref={carRefs.car2} className="absolute left-0" style={{ bottom: 136, width: 118, height: 42, willChange: 'transform' }}>
            <CarArt which="car2" />
          </div>

          {/* Pavement, with dashed edges */}
          <div className="absolute left-0 right-0" style={{ bottom: 36, height: 96, background: '#f2e7cf' }} />
          <div
            className="absolute left-0 right-0"
            style={{ bottom: 131, height: 2, background: 'repeating-linear-gradient(to right, #c9b48f 0 10px, transparent 10px 20px)' }}
          />
          <div
            className="absolute left-0 right-0"
            style={{ bottom: 36, height: 2, background: 'repeating-linear-gradient(to right, #c9b48f 0 10px, transparent 10px 20px)' }}
          />

          {/* The obstacle course, scrolling past */}
          <div ref={trackRef} className="absolute left-0" style={{ bottom: 70, height: 96, width: '100%', zIndex: 2, willChange: 'transform' }}>
            {COURSE.map((ob) => (
              <div
                key={ob.x}
                className="absolute bottom-0"
                style={{ width: 72, height: 96, left: ob.x, transform: `translateY(${ob.lane}px)` }}
              >
                <Obstruction type={ob.type} />
              </div>
            ))}
          </div>

          {/* The two friends waiting up the block */}
          <div ref={friendsRef} className="absolute left-0" style={{ bottom: 70, width: 110, height: 96, zIndex: 2, willChange: 'transform' }}>
            <svg
              width="110"
              height="96"
              viewBox="0 0 110 96"
              fill="none"
              style={{ display: 'block', overflow: 'visible', animation: 'crayon-boil .42s steps(1, end) -.14s infinite' }}
              stroke={INK}
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <g transform="translate(6,12)">
                <circle cx="27" cy="13" r="10" />
                <path d="M27 23v28M27 51l-9 27M27 51l10 27M27 34l-12 10" />
                <g ref={f1ArmRef} style={{ transformOrigin: '27px 32px' }}>
                  <path d="M27 32l14 12" />
                </g>
              </g>
              <g transform="translate(52,18) scale(.92)">
                <circle cx="27" cy="13" r="10" />
                <path d="M27 23v28M27 51l-10 26M27 51l11 26M27 33l-13 12" />
                <g ref={f2ArmRef} style={{ transformOrigin: '27px 32px' }}>
                  <path d="M27 32l13 12" />
                </g>
              </g>
            </svg>
          </div>

          {/* The walker */}
          <div ref={walkerRef} className="absolute left-0" style={{ bottom: 36, width: 60, height: 116, zIndex: 3, willChange: 'transform' }}>
            <div className="absolute left-0 flex justify-center" style={{ bottom: 26, width: 60 }}>
              <div ref={shadowRef} style={{ width: 34, height: 8, borderRadius: '50%', background: 'rgba(16,24,40,.16)' }} />
            </div>

            {/* What he shouts on contact */}
            <div
              ref={exRef}
              style={{ position: 'absolute', left: 40, bottom: 98, opacity: 0, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 4 }}
            >
              <span
                key={shout.key}
                style={{
                  display: 'inline-block',
                  padding: '2px 9px 3px',
                  borderRadius: 11,
                  background: GROUND,
                  border: `1.5px solid ${INK}`,
                  color: INK,
                  fontFamily: 'var(--font-ysabeau), serif',
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  animation: 'imprint-pop .3s cubic-bezier(.2,1.3,.4,1)',
                }}
              >
                {shout.text}
              </span>
            </div>

            <div ref={bodyRef} className="absolute left-0" style={{ bottom: 30, width: 60, height: 84 }}>
              <div ref={leanRef} style={{ width: 60, height: 84, transformOrigin: '27px 78px' }}>
                <svg
                  width="60"
                  height="84"
                  viewBox="0 0 60 84"
                  fill="none"
                  style={{ display: 'block', overflow: 'visible', animation: 'crayon-boil .42s steps(1, end) infinite' }}
                  stroke={INK}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="27" cy="13" r="10" />
                  <path d="M27 23v28" />
                  <g ref={armARef} style={{ transformOrigin: '27px 32px' }}>
                    <path d="M27 32l14 12" />
                  </g>
                  <g ref={armBRef} style={{ transformOrigin: '27px 32px' }}>
                    <path d="M27 32l-13 13" />
                  </g>
                  <g ref={legARef} style={{ transformOrigin: '27px 51px' }}>
                    <path d="M27 51l-9 27" />
                  </g>
                  <g ref={legBRef} style={{ transformOrigin: '27px 51px' }}>
                    <path d="M27 51l11 26" />
                  </g>
                </svg>
              </div>
            </div>
          </div>

          {/* Hedge in the foreground, three layers at increasing speed */}
          <div className="absolute left-0 right-0 bottom-0 overflow-hidden" style={{ height: 44, zIndex: 6 }}>
            <div
              ref={hedgeBackRef}
              className="absolute bottom-0"
              style={{
                left: -80, right: -80, height: 44,
                backgroundImage: 'radial-gradient(circle at 44px 42px, #bcd894 34px, transparent 35px)',
                backgroundSize: '96px 44px', backgroundRepeat: 'repeat-x', backgroundPosition: '0 bottom',
              }}
            />
            <div
              ref={hedgeMidRef}
              className="absolute bottom-0"
              style={{
                left: -80, right: -80, height: 44,
                backgroundImage: 'radial-gradient(circle at 30px 38px, #98c477 26px, transparent 27px)',
                backgroundSize: '74px 44px', backgroundRepeat: 'repeat-x', backgroundPosition: '0 bottom',
              }}
            />
            <div
              ref={hedgeFrontRef}
              className="absolute bottom-0"
              style={{
                left: -80, right: -80, height: 44,
                backgroundImage:
                  'radial-gradient(circle at 26px 44px, #74ad5c 24px, transparent 25px), radial-gradient(circle at 48px 46px, #5f9c4b 16px, transparent 17px)',
                backgroundSize: '58px 44px', backgroundRepeat: 'repeat-x', backgroundPosition: '0 bottom',
              }}
            />
          </div>
        </div>

        {/* Paper grain and vignette, over everything and outside the fade */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 9,
            backgroundImage:
              'repeating-linear-gradient(93deg, rgba(120,88,36,.055) 0 1px, transparent 1px 5px), radial-gradient(125% 95% at 50% 42%, transparent 52%, rgba(120,88,36,.16))',
          }}
        />
      </div>

      {/* Caption. The key change replays the fade-in on every new line. */}
      <div aria-hidden="true" className="flex items-baseline justify-center gap-[3px]" style={{ minHeight: 20 }}>
        <span
          key={caption.key}
          className="font-sans text-sm font-medium"
          style={{ color: '#8a7a5c', letterSpacing: '.01em', animation: 'imprint-linein .35s ease-out' }}
        >
          {caption.text}
        </span>
        {dot('0s')}
        {dot('.15s')}
        {dot('.3s')}
      </div>
    </div>
  );
}
