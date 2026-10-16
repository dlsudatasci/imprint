import React from "react";

/**
 * Sidewalk width card icons.
 *
 * Each card shows a person navigating past an obstruction (a bollard/post) on
 * a perspective-drawn sidewalk. The three width levels differ in how much clear
 * space surrounds the obstruction — narrow (squeeze past), moderate (comfortable
 * clearance), wide (plenty of room). This framing avoids literal person-counting
 * and instead captures the *effective clear width* concept from the manuscript
 * (Ch. 1 line 27, Ch. 2 line 53).
 *
 * The same obstruction appears at a fixed size across all three cards — what
 * changes is the sidewalk width around it.
 */
export function SidewalkWidthIcon({ type }: { type: string }) {
  /** Stick figure walking forward — head, body, arms, legs. */
  const walkingFigure = (cx: number) => (
    <g>
      <ellipse cx={cx} cy={22} rx={5} ry={6} fill="currentColor" />
      <line x1={cx} y1={28} x2={cx - 1} y2={46} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx - 1} y1={33} x2={cx - 10} y2={38} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={cx - 1} y1={33} x2={cx + 8} y2={40} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={cx - 1} y1={46} x2={cx - 8} y2={62} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx - 1} y1={46} x2={cx + 7} y2={61} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );

  /** Two converging perspective lines representing sidewalk edges. */
  const sidewalkEdges = (leftTop: number, leftBot: number, rightTop: number, rightBot: number) => (
    <g>
      <line x1={leftTop} y1={5} x2={leftBot} y2={75} stroke="currentColor" strokeWidth={2} opacity={0.35} />
      <line x1={rightTop} y1={5} x2={rightBot} y2={75} stroke="currentColor" strokeWidth={2} opacity={0.35} />
    </g>
  );

  /** A simple bollard/post obstruction — the obstacle the person navigates past. */
  const bollard = (cx: number) => (
    <g opacity={0.35}>
      {/* Post shaft */}
      <line x1={cx} y1={26} x2={cx} y2={56} stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" />
      {/* Cap / top */}
      <circle cx={cx} cy={24} r={4} fill="currentColor" />
    </g>
  );

  switch (type) {
    case "noSidewalk":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-muted" aria-label="None — person forced onto road, no sidewalk">
          {/* Dashed sidewalk edges — where a sidewalk would be */}
          <line x1={35} y1={5} x2={15} y2={75} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" opacity={0.25} />
          <line x1={45} y1={5} x2={65} y2={75} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" opacity={0.25} />
          {/* X mark over the sidewalk area */}
          <line x1={30} y1={25} x2={50} y2={50} stroke="currentColor" strokeWidth={2.5} opacity={0.35} />
          <line x1={50} y1={25} x2={30} y2={50} stroke="currentColor" strokeWidth={2.5} opacity={0.35} />
          {/* Walking figure outside the sidewalk on the left — forced onto the road */}
          <g opacity={0.7}>
            <ellipse cx={14} cy={24} rx={4.5} ry={5.5} fill="currentColor" />
            <line x1={14} y1={30} x2={15} y2={46} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={15} y1={35} x2={7} y2={39} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <line x1={15} y1={35} x2={23} y2={41} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <line x1={15} y1={46} x2={8} y2={60} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={15} y1={46} x2={22} y2={59} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          </g>
        </svg>
      );
    case "onePerson":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Narrow — tight clearance past obstruction">
          {sidewalkEdges(33, 18, 47, 62)}
          {walkingFigure(33)}
          {bollard(47)}
        </svg>
      );
    case "twoPeople":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Moderate — comfortable clearance past obstruction">
          {sidewalkEdges(28, 8, 52, 72)}
          {walkingFigure(33)}
          {bollard(52)}
        </svg>
      );
    case "threePlus":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Wide — plenty of room past obstruction">
          {sidewalkEdges(24, 2, 56, 78)}
          {walkingFigure(30)}
          {bollard(56)}
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Surface Condition Icon — ground cross-section profiles.
 *
 * Visual language: the ground itself, not a person. A flat line = easy,
 * a bumpy line = some difficulty, a jagged broken line = dangerous.
 * Uses a wheel/motion glyph for "easy" and a warning triangle for "dangerous"
 * to reinforce the functional meaning.
 */
export function SurfaceConditionIcon({ type }: { type: "easy" | "some" | "difficult" }) {
  switch (type) {
    case "easy":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Easy to traverse — smooth surface">
          {/* Smooth ground line */}
          <line x1={8} y1={44} x2={56} y2={44} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
          {/* Surface texture marks */}
          <line x1={14} y1={44} x2={14} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={26} y1={44} x2={26} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={38} y1={44} x2={38} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={50} y1={44} x2={50} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          {/* Smooth rolling wheel above */}
          <circle cx={32} cy={30} r={9} stroke="currentColor" strokeWidth={2} fill="none" opacity={0.5} />
          <circle cx={32} cy={30} r={2} fill="currentColor" opacity={0.5} />
          {/* Motion lines */}
          <line x1={18} y1={26} x2={14} y2={26} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
          <line x1={18} y1={30} x2={12} y2={30} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
          <line x1={18} y1={34} x2={14} y2={34} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
        </svg>
      );
    case "some":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Some difficulty — uneven surface">
          {/* Bumpy ground line */}
          <polyline points="8,44 16,44 20,41 24,44 30,43 34,45 38,42 42,44 48,43 52,44 56,44" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.7} />
          {/* Depth lines */}
          <line x1={14} y1={46} x2={14} y2={49} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={32} y1={47} x2={32} y2={50} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={50} y1={46} x2={50} y2={49} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          {/* Wobbling wheel */}
          <circle cx={32} cy={28} r={9} stroke="currentColor" strokeWidth={2} fill="none" opacity={0.5} />
          <circle cx={32} cy={28} r={2} fill="currentColor" opacity={0.5} />
          {/* Wobble marks */}
          <line x1={26} y1={17} x2={24} y2={15} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.35} />
          <line x1={38} y1={17} x2={40} y2={15} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.35} />
        </svg>
      );
    case "difficult":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Difficult or dangerous — broken surface">
          {/* Jagged broken ground */}
          <polyline points="8,44 14,44 17,40 19,46 22,42 26,44 28,48 30,41 34,44 36,39 40,46 42,43 46,44 48,40 50,45 54,42 56,44" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.7} />
          {/* Crack lines */}
          <line x1={22} y1={44} x2={20} y2={52} stroke="currentColor" strokeWidth={1.8} opacity={0.4} />
          <line x1={36} y1={44} x2={38} y2={54} stroke="currentColor" strokeWidth={1.8} opacity={0.4} />
          <line x1={48} y1={44} x2={46} y2={51} stroke="currentColor" strokeWidth={1.8} opacity={0.4} />
          {/* Warning triangle */}
          <polygon points="32,14 22,32 42,32" stroke="currentColor" strokeWidth={2} fill="none" opacity={0.55} />
          <line x1={32} y1={20} x2={32} y2={26} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
          <circle cx={32} cy={29} r={1.2} fill="currentColor" opacity={0.55} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Walking Comfort Icon — face expressions.
 *
 * Visual language: how the scene *feels*. Face-based scales (Wong-Baker FACES)
 * are the most validated visual approach for subjective self-reports.
 * Simple hand-drawn line faces — calm smile, uncertain flat, tense frown.
 */
export function WalkingComfortIcon({ type }: { type: "comfortable" | "somewhat" | "uncomfortable" }) {
  switch (type) {
    case "comfortable":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Comfortable">
          <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.6} />
          {/* Relaxed eyes */}
          <ellipse cx={24} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          <ellipse cx={40} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          {/* Gentle smile */}
          <path d="M23 37 Q28 43 32 43 Q36 43 41 37" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </svg>
      );
    case "somewhat":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Somewhat uncomfortable">
          <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.6} />
          {/* Slightly concerned eyes */}
          <ellipse cx={24} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          <ellipse cx={40} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          {/* Slight raised brow */}
          <line x1={36} y1={20} x2={44} y2={21} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.4} />
          {/* Flat wavy mouth */}
          <path d="M24 39 Q28 37 32 38 Q36 39 40 37" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </svg>
      );
    case "uncomfortable":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Uncomfortable">
          <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.6} />
          {/* Tense eyes */}
          <ellipse cx={24} cy={27} rx={2.5} ry={2.5} fill="currentColor" opacity={0.6} />
          <ellipse cx={40} cy={27} rx={2.5} ry={2.5} fill="currentColor" opacity={0.6} />
          {/* Furrowed brows */}
          <line x1={20} y1={21} x2={27} y2={22} stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          <line x1={44} y1={21} x2={37} y2={22} stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          {/* Frown */}
          <path d="M24 41 Q28 36 32 36 Q36 36 40 41" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Accessible to Me Icon — gateway/path metaphor with 5-level colour gradient.
 *
 * Visual language: "can I get through?" The gateway progressively narrows from
 * wide-open (green) to fully blocked (red), matching a 1–5 person-dependent
 * accessibility scale (Preston & Colman 2000; Project Sidewalk 1–5 precedent).
 */
export function AccessibleToMeIcon({ type }: { type: "easy" | "mostly" | "somewhat" | "very" | "not" }) {
  switch (type) {
    case "easy":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Easily accessible" style={{ color: "#16a34a" }}>
          {/* Wide-open gateway */}
          <line x1={16} y1={12} x2={16} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={48} y1={12} x2={48} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={16} y1={12} x2={48} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Double checkmark */}
          <polyline points="20,32 26,38 36,24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
          <polyline points="30,32 36,38 46,24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
        </svg>
      );
    case "mostly":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Mostly accessible" style={{ color: "#22c55e" }}>
          {/* Open gateway — walls slightly inward */}
          <line x1={17} y1={12} x2={19} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={47} y1={12} x2={45} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={17} y1={12} x2={47} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Single checkmark */}
          <polyline points="24,32 30,38 40,24" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
        </svg>
      );
    case "somewhat":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Somewhat difficult" style={{ color: "#d97706" }}>
          {/* Narrowing gateway */}
          <line x1={18} y1={12} x2={24} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={46} y1={12} x2={40} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={18} y1={12} x2={46} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Tilde / wavy line — uncertain */}
          <path d="M25,31 Q29,26 32,31 Q35,36 39,31" stroke="currentColor" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
        </svg>
      );
    case "very":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Very difficult" style={{ color: "#ea580c" }}>
          {/* More narrowing gateway */}
          <line x1={14} y1={12} x2={26} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={50} y1={12} x2={38} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={14} y1={12} x2={50} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Exclamation */}
          <line x1={32} y1={22} x2={32} y2={34} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
          <circle cx={32} cy={40} r={2} fill="currentColor" opacity={0.7} />
        </svg>
      );
    case "not":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Not accessible to me" style={{ color: "#dc2626" }}>
          {/* Blocked gateway — walls converge */}
          <line x1={12} y1={12} x2={28} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={52} y1={12} x2={36} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={12} y1={12} x2={52} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* X mark */}
          <line x1={25} y1={24} x2={39} y2={38} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
          <line x1={39} y1={24} x2={25} y2={38} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
        </svg>
      );
    default:
      return null;
  }
}
