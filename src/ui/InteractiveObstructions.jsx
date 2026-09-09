/* eslint-disable react/no-unknown-property */
/**
 * The animated scene on the login page.
 *
 * Three sidewalk obstructions — a utility pole, a bench, a potted plant — with
 * faces that follow the cursor, while a virtual mouse draws a box around each
 * in turn. It demonstrates the annotation task, so someone who has never used
 * Imprint can see what contributing involves before signing up.
 *
 * Two things to know before editing:
 *
 *   - Every timing in this file is an absolute number of seconds on one shared
 *     clock. That is what keeps the cursor and the box animations in step (the
 *     cursor reaches the pole at 2.5s; the pole's box draws from 2.5s to 3.2s).
 *     Changing one means changing its partner.
 *   - The faces look away when the password is revealed, which is why
 *     `showPassword` is passed down from the login form.
 */
import { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import * as THREE from 'three';
import CrayonFilters from './CrayonFilters';

/**
 * Palette, drawn from SidewalkLoader so the two read as one world.
 *
 * There is no light in this scene — every material is flat. That means form has
 * to come from deliberate value assignment across neighbouring meshes, the way
 * the loader's tree is five circles in three greens, rather than from shading.
 */
const OUTLINE = '#4a3b28';    // loader prop outline — brown, never black
/*
 * Concrete. The loader has no true grey — its palette is warm throughout, and a
 * neutral #888888 would be the one cold thing on screen. These are desaturated
 * siblings of its road (#d9cfbb) and kerb (#ab9b83), grey enough to read as
 * concrete next to the bench without going cold.
 */
const CONCRETE = '#9c9891';
const CONCRETE_DARK = '#7a766f';
const WOOD = '#ad8f60';       // loader pole shaft
const WOOD_DARK = '#7c6238';  // loader crossarm
const DARK = '#3b3126';       // loader insulators — the darkest value in the set
const TRUNK = '#96693f';      // loader tree trunk
const TERRACOTTA = '#d2551a'; // loader cone base
const LEAF = '#4fae5c';       // loader canopy
const LEAF_LIGHT = '#6cc06b'; // loader canopy highlight
const LEAF_DARK = '#3f9a4f';  // loader canopy shadow
const PAPER = '#fffdf6';      // loader cone reflective band

/**
 * Annotation box colours — deliberately NOT from the loader.
 *
 * These match the real annotation tool (see annotation-tool/Shape.ts), so the
 * scene teaches the colour language a contributor actually meets. That is worth
 * more than matching the loader's ink blue.
 */
const BOX_PRIMARY = '#004aad';
const BOX_WARNING = '#d97706';
const BOX_SUCCESS = '#16a34a';

/** Outline recipe. `thickness` is in pixels — drei's `screenspace` flag is the
 *  inverse of what its name suggests, and the default gives constant pixel
 *  width, which is what matches the loader's fixed 2.2 strokeWidth. */
const OUTLINE_PROPS = { thickness: 2.2, color: OUTLINE, toneMapped: false };

/**
 * Whether the viewer asked for reduced motion.
 *
 * Initialised false rather than read during the first render, so the server and
 * the client agree at hydration; the effect corrects it immediately after.
 */
function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const onChange = (e) => setReduced(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

/**
 * The world-space box the scene occupies.
 *
 * Derived from each prop's position plus its bounding-box half-extents, with
 * the group's +0.6 x offset already folded in. `nearZ` is the closest the
 * geometry comes to the camera (the bench, which sits forward at z 0.8) — the
 * fit has to clear that plane, not z=0, or the nearest object still clips.
 *
 * If you move a prop or resize a box, update these.
 */
const SCENE_BOUNDS = {
    minX: -1.85, maxX: 2.8,
    minY: -1.6, maxY: 3.05,
    nearZ: 1.3,
};

/**
 * Sits the scene above the panel's midpoint, in world units.
 *
 * Centring it geometrically is what the fit does, and by that measure it already
 * lines up with the login card to within 20px. But roughly the top third of the
 * scene's extent is annotation boxes, which read as faint line rather than mass, so
 * the *solid* props landed about 90px below the card's top edge and the whole
 * thing looked low.
 *
 * This shifts the camera target down so everything rides higher. The fit is
 * deliberately not recomputed for it: at the current padding the scene already
 * clears the top of frame by ~0.77 units, so a lift below that costs nothing,
 * whereas folding it into the fit would pull the camera back and shrink the
 * scene by about a tenth — undoing half the point. Keep this under ~0.7, and if
 * PADDING or nearZ ever change, re-check that headroom.
 */
const FRAME_LIFT = 0.45;

/**
 * Keeps the whole scene in frame at any panel size.
 *
 * three.js measures field of view vertically, so how much fits horizontally
 * depends on the panel's shape. The objects sit at fixed positions, so without
 * this a narrow panel — a browser sidebar, a split window — crops the scene off
 * the right edge. This pulls the camera back far enough to satisfy whichever
 * axis is tighter, and centres it on the scene rather than the origin.
 */
function FitCamera({ padding = 1.1 }) {
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);

    useLayoutEffect(() => {
        const { minX, maxX, minY, maxY, nearZ } = SCENE_BOUNDS;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2 - FRAME_LIFT;
        const halfW = ((maxX - minX) / 2) * padding;
        const halfH = ((maxY - minY) / 2) * padding;

        const aspect = size.width / Math.max(size.height, 1);
        const halfFov = (camera.fov * Math.PI) / 360;

        // Distance at which each extent just fits, measured from the near plane
        // of the geometry. Whichever needs more distance wins.
        const distV = nearZ + halfH / Math.tan(halfFov);
        const distH = nearZ + halfW / (Math.tan(halfFov) * aspect);

        camera.position.set(cx, cy, Math.max(distV, distH));
        camera.lookAt(cx, cy, 0);
        camera.updateProjectionMatrix();
    }, [camera, size, padding]);

    return null;
}

/**
 * Turns a reaction signal into rotation and bob offsets.
 *
 * `reaction` carries an incrementing `id` rather than just a type, because the
 * same reaction often fires twice in a row — two failed logins, or tabbing
 * between the two fields — and comparing types alone would swallow the repeat.
 *
 * Returns a function rather than a value: the offsets depend on the r3f clock,
 * which is only available inside useFrame.
 *
 * `delay` staggers the three props so they react in a ripple instead of in
 * lockstep, the same reason the blink intervals are randomised per face.
 */
function useReactionOffsets(reaction, delay = 0) {
    const active = useRef({ id: 0, type: null, start: -1 });
    const NONE = { pitch: 0, yaw: 0, bob: 0 };

    return (t) => {
        const id = reaction?.id ?? 0;
        if (id !== active.current.id) {
            active.current = { id, type: reaction?.type ?? null, start: t + delay };
        }

        const { type, start } = active.current;
        if (!type || start < 0 || t < start) return NONE;
        const e = t - start;

        if (type === 'nod') {
            // Yes: a quick double dip that settles, plus a small hop so it reads
            // as pleased rather than merely agreeing.
            const DUR = 0.7;
            if (e > DUR) return NONE;
            const decay = 1 - e / DUR;
            return {
                pitch: Math.sin(e * Math.PI * 4) * 0.30 * decay,
                yaw: 0,
                bob: Math.abs(Math.sin(e * Math.PI * 4)) * 0.10 * decay,
            };
        }

        if (type === 'shake') {
            // No: faster and wider than the nod, and on the other axis.
            const DUR = 0.9;
            if (e > DUR) return NONE;
            const decay = 1 - e / DUR;
            return { pitch: 0, yaw: Math.sin(e * Math.PI * 6) * 0.38 * decay, bob: 0 };
        }

        return NONE;
    };
}

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

/**
 * Randomised blinking, shared by all three faces.
 *
 * Squashes the eyes on the y-axis rather than swapping geometry, and lerps
 * toward the target so the lid movement reads as motion instead of a snap.
 * Intervals are random per face so the three never blink in unison, which is
 * what would make them look mechanical.
 */
function useBlink(eyesRef, mouthRef, effectType = 'scale', reduced = false) {
    const blinkState = useRef({ nextBlink: Math.random() * 3, blinkEnd: -1 });

    useFrame(({ clock }) => {
        if (!eyesRef.current || reduced) return;
        const t = clock.getElapsedTime();
        if (t > blinkState.current.nextBlink && blinkState.current.blinkEnd < 0) {
            blinkState.current.blinkEnd = t + 0.1 + Math.random() * 0.15;
        }
        const isBlinking = blinkState.current.blinkEnd > 0 && t < blinkState.current.blinkEnd;
        if (blinkState.current.blinkEnd > 0 && t > blinkState.current.blinkEnd) {
            blinkState.current.nextBlink = t + 1 + Math.random() * 4;
            blinkState.current.blinkEnd = -1;
        }
        eyesRef.current.scale.y = THREE.MathUtils.lerp(eyesRef.current.scale.y, isBlinking ? 0.05 : 1, 0.4);
        if (mouthRef && mouthRef.current) {
            if (effectType === 'scale') {
                mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, isBlinking ? 1.6 : 1, 0.4);
                mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, isBlinking ? 1.6 : 1, 0.4);
            } else if (effectType === 'subtle') {
                mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, isBlinking ? 1.15 : 1, 0.4);
                mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, isBlinking ? 0.9 : 1, 0.4);
            }
        }
    });
}

/**
 * Position along a keyframed path at time `t`.
 *
 * Waypoints are (time, position) pairs; this finds the segment containing `t`
 * and eases between its ends. Repeating a position at two consecutive times
 * produces a pause — that's how the cursor holds still after finishing a box.
 */
function interpolatePath(t, waypoints) {
    if (t <= waypoints[0].t) return waypoints[0].p;
    if (t >= waypoints[waypoints.length - 1].t) return waypoints[waypoints.length - 1].p;

    for (let i = 0; i < waypoints.length - 1; i++) {
        if (t >= waypoints[i].t && t < waypoints[i + 1].t) {
            const start = waypoints[i];
            const end = waypoints[i + 1];
            const progress = (t - start.t) / (end.t - start.t);
            // Smooth ease in/out for mouse movement
            const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            return [
                THREE.MathUtils.lerp(start.p[0], end.p[0], ease),
                THREE.MathUtils.lerp(start.p[1], end.p[1], ease),
                THREE.MathUtils.lerp(start.p[2], end.p[2], ease),
            ];
        }
    }
    return waypoints[0].p;
}

// Virtual 3D Cursor
function VirtualMouse() {
    const mouseRef = useRef();
    const mat1 = useRef();
    const mat2 = useRef();

    // Choreography
    const waypoints = [
        { t: 0, p: [4, -4, 2] },             // Start offscreen
        { t: 2.0, p: [4, -4, 2] },           // Wait for entrance
        { t: 2.5, p: [-2.45, 2.2, 0.2] },    // Pole Top-Left
        { t: 3.2, p: [-0.95, -1.0, 0.2] },   // Pole Bottom-Right
        { t: 3.5, p: [-0.95, -1.0, 0.2] },   // Wait
        { t: 3.8, p: [-0.95, 0.2, 1.2] },    // Bench Top-Left
        { t: 4.5, p: [1.35, -1.6, 1.2] },    // Bench Bottom-Right
        { t: 4.8, p: [1.35, -1.6, 1.2] },    // Wait
        { t: 5.1, p: [0.6, 3.05, 0.5] },     // Plant Top-Left
        { t: 5.8, p: [2.2, 0.55, 0.5] },     // Plant Bottom-Right
        { t: 6.3, p: [2.2, 0.55, 0.5] }      // Hold position during fade
    ];

    /*
     * Arrow pointer, traced clockwise from the tip.
     *
     * Coordinates are normalised so the left edge is exactly 1 unit, then scaled
     * by CURSOR_H — that way the proportions are readable and the size is one
     * number. The wing sitting at x 0.72 is what makes it read as a cursor: the
     * previous shape had it at 0.43, which put the right edge at 58 degrees
     * instead of roughly 45 and made the whole thing look like a slanted sliver.
     */
    const cursorShape = useMemo(() => {
        const CURSOR_H = 1.4;
        const points = [
            [0, 0],        // tip
            [0, -1.00],    // bottom of the left edge
            [0.26, -0.76], // heel, tucked under the head
            [0.42, -1.14], // tail, bottom left
            [0.57, -1.07], // tail, bottom right
            [0.41, -0.70], // tail, top right
            [0.72, -0.70], // wing tip
        ];
        const shape = new THREE.Shape();
        shape.moveTo(points[0][0] * CURSOR_H, points[0][1] * CURSOR_H);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i][0] * CURSOR_H, points[i][1] * CURSOR_H);
        }
        shape.closePath();
        return shape;
    }, []);

    useFrame((state) => {
        if (!mouseRef.current || !mat1.current || !mat2.current) return;
        const t = state.clock.elapsedTime;

        // Smooth fade out after drawing the final box
        if (t > 5.8) {
            const fade = Math.max(0, 1 - (t - 5.8) * 2.5); // Fades from 1 to 0 over 0.4 seconds
            mat1.current.opacity = fade;
            mat2.current.opacity = fade * 0.6; // Black border scales relative to fade

            if (fade === 0) {
                mouseRef.current.visible = false;
                return;
            }
        } else {
            mouseRef.current.visible = true;
            mat1.current.opacity = 1;
            mat2.current.opacity = 0.6;
        }

        const pos = interpolatePath(t, waypoints);
        mouseRef.current.position.set(pos[0], pos[1], pos[2]);
        mouseRef.current.rotation.z = 0;
    });

    return (
        <group ref={mouseRef} scale={0.25}>
            {/* 2D Flat Cursor Shape */}
            <mesh>
                <shapeGeometry args={[cursorShape]} />
                <meshBasicMaterial ref={mat1} color={PAPER} side={THREE.DoubleSide} transparent />
            </mesh>
            {/* Outline: a slightly larger copy behind. The offset compensates for
                scaling about the group origin, which is the tip — without it the
                rim is zero-width at the tip and thickest at the tail. These
                numbers put the scale centre at the shape's own centroid instead. */}
            <mesh position={[-0.057, 0.129, -0.01]} scale={1.12}>
                <shapeGeometry args={[cursorShape]} />
                <meshBasicMaterial ref={mat2} color={OUTLINE} side={THREE.DoubleSide} transparent />
            </mesh>
        </group>
    );
}

/**
 * A wireframe box that draws itself out between `drawStart` and `drawEnd`,
 * mimicking someone dragging a bounding box.
 *
 * Grows from its top-left corner rather than its centre, which is what makes it
 * track the cursor: the position is offset by half the remaining size each
 * frame so that corner stays pinned where the drag began. Once drawn it settles
 * into a slow pulse.
 */
function BoundingBox({ args, color = BOX_SUCCESS, position = [0, 0, 0], drawStart = 0, drawEnd = 0, reduced = false }) {
    const boxRef = useRef();
    const w = args[0], h = args[1];

    useFrame((state) => {
        if (!boxRef.current) return;
        const t = state.clock.elapsedTime;

        // Reduced motion: skip the drag-out and the pulse, show the finished box.
        // The point of the box is what it encloses, not the gesture that made it.
        if (reduced) {
            boxRef.current.visible = true;
            boxRef.current.scale.set(1, 1, 1);
            boxRef.current.position.set(...position);
            return;
        }

        // Wait to show up
        if (t < drawStart) {
            boxRef.current.visible = false;
            return;
        }

        boxRef.current.visible = true;

        if (t >= drawStart && t <= drawEnd) {
            // Drag out from Top-Left corner exactly matching mouse
            const progress = (t - drawStart) / (drawEnd - drawStart);
            boxRef.current.scale.set(progress, progress, 1);

            boxRef.current.position.x = position[0] - (w / 2) + (w * progress) / 2;
            boxRef.current.position.y = position[1] + (h / 2) - (h * progress) / 2;
            boxRef.current.position.z = position[2];
        } else {
            // Fully drawn, subtle pulse
            const pulse = 1 + Math.sin(t * 3) * 0.015;
            boxRef.current.scale.set(pulse, pulse, 1);
            boxRef.current.position.set(...position);
        }
    });

    return (
        <mesh ref={boxRef} position={position}>
            <boxGeometry args={args} />
            <meshBasicMaterial color={color} wireframe={true} transparent opacity={0.6} />
        </mesh>
    );
}

// Scratch objects reused across every frame and every face. useFrame runs 60
// times a second per component, so allocating a Vector3 inside it would churn
// thousands of short-lived objects a second and hand the GC steady work.
// Safe to share because each use writes before reading, within one frame.
const globalDummy = new THREE.Object3D();
const globalTarget = new THREE.Vector3();

function FaceStandard({ position, showPassword = false, reduced = false }) {
    const group = useRef();
    const eyes = useRef();
    const mouth = useRef();

    useFrame((state) => {
        if (!group.current) return;
        // Pole: upper left
        const x = showPassword ? -12 : (reduced ? 0 : (state.pointer.x * state.viewport.width) / 6);
        const y = showPassword ? 12 : (reduced ? 0 : (state.pointer.y * state.viewport.height) / 6);
        globalTarget.set(x, y, 5);

        globalDummy.position.copy(group.current.position);
        globalDummy.lookAt(globalTarget);
        group.current.quaternion.slerp(globalDummy.quaternion, 0.05);
    });

    useBlink(eyes, mouth, "scale", reduced);

    return (
        <group ref={group} position={position}>
            <group ref={eyes}>
                {/* Left Eye */}
                <mesh position={[-0.2, 0.1, 0.51]}>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshBasicMaterial color={PAPER} />
                    <mesh position={[0, 0, 0.07]}>
                        <sphereGeometry args={[0.04, 16, 16]} />
                        <meshBasicMaterial color={DARK} />
                    </mesh>
                </mesh>
                {/* Right Eye */}
                <mesh position={[0.2, 0.1, 0.51]}>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshBasicMaterial color={PAPER} />
                    <mesh position={[0, 0, 0.07]}>
                        <sphereGeometry args={[0.04, 16, 16]} />
                        <meshBasicMaterial color={DARK} />
                    </mesh>
                </mesh>
            </group>
            {/* Mouth */}
            <mesh ref={mouth} position={[0, -0.12, 0.51]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.02, 0.08, 4, 16]} />
                <meshBasicMaterial color={DARK} />
            </mesh>
        </group>
    );
}

function FaceHalfMoons({ position, showPassword = false, reduced = false }) {
    const group = useRef();
    const eyes = useRef();
    const mouth = useRef();

    useFrame((state) => {
        if (!group.current) return;
        // Potted Plant: lower left
        const x = showPassword ? -12 : (reduced ? 0 : (state.pointer.x * state.viewport.width) / 6);
        const y = showPassword ? -12 : (reduced ? 0 : (state.pointer.y * state.viewport.height) / 6);
        globalTarget.set(x, y, 5);

        globalDummy.position.copy(group.current.position);
        globalDummy.lookAt(globalTarget);
        group.current.quaternion.slerp(globalDummy.quaternion, 0.05);
    });

    useBlink(eyes, mouth, "subtle", reduced);

    return (
        <group ref={group} position={position}>
            <group ref={eyes}>
                {/* Left Happy Eye (Torus segment) */}
                <mesh position={[-0.2, 0.1, 0.51]} rotation={[0, 0, 0]}>
                    <torusGeometry args={[0.06, 0.02, 8, 24, Math.PI]} />
                    <meshBasicMaterial color={DARK} />
                </mesh>
                {/* Right Happy Eye */}
                <mesh position={[0.2, 0.1, 0.51]} rotation={[0, 0, 0]}>
                    <torusGeometry args={[0.06, 0.02, 8, 24, Math.PI]} />
                    <meshBasicMaterial color={DARK} />
                </mesh>
            </group>
            {/* Wide Mouth */}
            <mesh ref={mouth} position={[0, -0.1, 0.51]} rotation={[0, 0, Math.PI]}>
                <circleGeometry args={[0.08, 32, 0, Math.PI]} />
                <meshBasicMaterial color={DARK} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

function FaceDots({ position, showPassword = false, reduced = false }) {
    const group = useRef();
    const eyes = useRef();
    const mouth = useRef();

    useFrame((state) => {
        if (!group.current) return;
        // Bench: just left
        const x = showPassword ? -12 : (reduced ? 0 : (state.pointer.x * state.viewport.width) / 6);
        const y = showPassword ? 0 : (reduced ? 0 : (state.pointer.y * state.viewport.height) / 6);
        globalTarget.set(x, y, 5);

        globalDummy.position.copy(group.current.position);
        globalDummy.lookAt(globalTarget);
        group.current.quaternion.slerp(globalDummy.quaternion, 0.05);
    });

    useBlink(eyes, mouth, "scale", reduced);

    return (
        <group ref={group} position={position}>
            <group ref={eyes}>
                {/* Left Dot Eye */}
                <mesh position={[-0.15, 0.1, 0.51]}>
                    <sphereGeometry args={[0.04, 16, 16]} />
                    <meshBasicMaterial color={DARK} />
                </mesh>
                {/* Right Dot Eye */}
                <mesh position={[0.15, 0.1, 0.51]}>
                    <sphereGeometry args={[0.04, 16, 16]} />
                    <meshBasicMaterial color={DARK} />
                </mesh>
            </group>
            {/* Circle Mouth */}
            <mesh ref={mouth} position={[0, -0.05, 0.51]}>
                <torusGeometry args={[0.025, 0.015, 8, 24]} />
                <meshBasicMaterial color={DARK} />
            </mesh>
        </group>
    );
}

function UtilityPole({ position, delay = 0, showPassword = false, reduced = false, reaction }) {
    const group = useRef();
    const react = useReactionOffsets(reaction, 0);

    useFrame((state) => {
        if (!group.current) return;

        // Reduced motion: final scale, no entrance, no idle oscillation, no
        // pointer parallax. The scene still shows what it is for — three props,
        // each with its box drawn — it just holds still while doing it.
        if (reduced) {
            group.current.scale.setScalar(1);
            group.current.position.set(...position);
            group.current.rotation.set(0, 0, 0);
            return;
        }

        if (state.clock.elapsedTime <= delay) {
            group.current.scale.set(0.01, 0.01, 0.01);
            group.current.position.set(...position);
            return;
        }

        const progress = Math.min((state.clock.elapsedTime - delay) * 1.0, 1);
        const ease = easeOutCubic(progress);

        const sway = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
        group.current.scale.setScalar(ease);

        const targetX = position[0] + state.pointer.x * 0.2;
        const targetY = position[1] + state.pointer.y * 0.2;

        group.current.position.x = THREE.MathUtils.lerp(position[0], targetX, ease);
        group.current.position.y = THREE.MathUtils.lerp(position[1], targetY, ease);
        group.current.position.z = position[2];

        // Gentle idle sway, plus any nod/shake reacting to the form
        const r = react(state.clock.elapsedTime);
        group.current.position.y += r.bob;
        group.current.rotation.z = sway * ease;
        group.current.rotation.y = state.pointer.x * 0.15 * ease + r.yaw;
        group.current.rotation.x = -state.pointer.y * 0.15 * ease + r.pitch;
    });

    return (
        <group ref={group} position={position} scale={reduced ? 1 : [0.01, 0.01, 0.01]}>
            {/* Main Pole */}
            <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.25, 0.25, 3, 16]} />
                <meshBasicMaterial color={CONCRETE} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Crossbeam */}
            <mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.08, 0.08, 1.5, 16]} />
                <meshBasicMaterial color={CONCRETE_DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>

            {/* Power Line Details */}
            <mesh position={[-0.6, 1.3, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
                <meshBasicMaterial color={DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            <mesh position={[0.6, 1.3, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
                <meshBasicMaterial color={DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>

            {/* Pole Face */}
            <FaceStandard position={[0, 0.5, 0.25]} showPassword={showPassword} reduced={reduced} />

            {/* Annotation Box drags out: 2.5s -> 3.2s */}
            <BoundingBox args={[1.5, 3.2, 0.8]} position={[0, 0.1, 0]} drawStart={2.5} drawEnd={3.2} color={BOX_PRIMARY} reduced={reduced} />
        </group>
    );
}

function Bench({ position, delay = 0, showPassword = false, reduced = false, reaction }) {
    const group = useRef();
    const react = useReactionOffsets(reaction, 0.07);

    useFrame((state) => {
        if (!group.current) return;

        // Reduced motion: final scale, no entrance, no idle oscillation, no
        // pointer parallax. The scene still shows what it is for — three props,
        // each with its box drawn — it just holds still while doing it.
        if (reduced) {
            group.current.scale.setScalar(1);
            group.current.position.set(...position);
            group.current.rotation.set(0, 0, 0);
            return;
        }

        if (state.clock.elapsedTime <= delay) {
            group.current.scale.set(0.01, 0.01, 0.01);
            group.current.position.set(...position);
            return;
        }

        const progress = Math.min((state.clock.elapsedTime - delay) * 1.0, 1);
        const ease = easeOutCubic(progress);

        const breatheY = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
        const breatheXZ = 1 - Math.sin(state.clock.elapsedTime * 2) * 0.015;
        group.current.scale.set(ease * breatheXZ, ease * breatheY, ease * breatheXZ);

        const targetX = position[0] + state.pointer.x * 0.15;
        const targetY = position[1] + state.pointer.y * 0.15;

        group.current.position.x = THREE.MathUtils.lerp(position[0], targetX, ease);
        group.current.position.y = THREE.MathUtils.lerp(position[1], targetY, ease);
        group.current.position.z = position[2];

        // Gentle idle rocking, plus any nod/shake reacting to the form
        const rock = Math.sin(state.clock.elapsedTime * 1.2) * 0.02;
        const r = react(state.clock.elapsedTime);
        group.current.position.y += r.bob;
        group.current.rotation.x = -state.pointer.y * 0.1 * ease + r.pitch;
        group.current.rotation.y = state.pointer.x * 0.1 * ease + r.yaw;
        group.current.rotation.z = rock * ease;
    });

    return (
        <group ref={group} position={position} scale={reduced ? 1 : [0.01, 0.01, 0.01]}>
            {/* Seat */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[2, 0.15, 0.8]} />
                <meshBasicMaterial color={WOOD} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Backrest */}
            <mesh position={[0, 0.5, -0.35]} rotation={[-0.1, 0, 0]}>
                <boxGeometry args={[2, 0.6, 0.1]} />
                <meshBasicMaterial color={WOOD_DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Legs */}
            <mesh position={[-0.8, -0.4, 0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshBasicMaterial color={DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            <mesh position={[0.8, -0.4, 0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshBasicMaterial color={DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            <mesh position={[-0.8, -0.4, -0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshBasicMaterial color={DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            <mesh position={[0.8, -0.4, -0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshBasicMaterial color={DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>

            {/* Bench Face */}
            <FaceDots position={[0, 0.5, -0.25]} showPassword={showPassword} reduced={reduced} />

            {/* Annotation Box drags out: 3.8s -> 4.5s */}
            <BoundingBox args={[2.3, 1.8, 1.2]} position={[0, 0.1, -0.1]} drawStart={3.8} drawEnd={4.5} color={BOX_WARNING} reduced={reduced} />
        </group>
    );
}

function PottedPlant({ position, delay = 0, showPassword = false, reduced = false, reaction }) {
    const group = useRef();
    const react = useReactionOffsets(reaction, 0.14);

    useFrame((state) => {
        if (!group.current) return;

        // Reduced motion: final scale, no entrance, no idle oscillation, no
        // pointer parallax. The scene still shows what it is for — three props,
        // each with its box drawn — it just holds still while doing it.
        if (reduced) {
            group.current.scale.setScalar(1);
            group.current.position.set(...position);
            group.current.rotation.set(0, 0, 0);
            return;
        }

        if (state.clock.elapsedTime <= delay) {
            group.current.scale.set(0.01, 0.01, 0.01);
            group.current.position.set(...position);
            return;
        }

        const progress = Math.min((state.clock.elapsedTime - delay) * 1.0, 1);
        const ease = easeOutCubic(progress);

        group.current.scale.setScalar(ease);

        const hop = Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.05;
        const targetX = position[0] + state.pointer.x * 0.1;
        const targetY = position[1] + state.pointer.y * 0.1 + hop;

        group.current.position.x = THREE.MathUtils.lerp(position[0], targetX, ease);
        group.current.position.y = THREE.MathUtils.lerp(position[1], targetY, ease);
        group.current.position.z = position[2];

        // Gentle idle wiggle, plus any nod/shake reacting to the form
        const wiggle = Math.cos(state.clock.elapsedTime * 6) * 0.03;
        const r = react(state.clock.elapsedTime);
        group.current.position.y += r.bob;
        group.current.rotation.z = wiggle * ease;
        group.current.rotation.y = state.pointer.x * 0.05 * ease + r.yaw;
        group.current.rotation.x = -state.pointer.y * 0.05 * ease + r.pitch;
    });

    return (
        <group ref={group} position={position} scale={reduced ? 1 : [0.01, 0.01, 0.01]}>
            {/* Terra Cotta Pot Base */}
            <mesh position={[0, -0.2, 0]}>
                <cylinderGeometry args={[0.35, 0.25, 0.6, 16]} />
                <meshBasicMaterial color={TERRACOTTA} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 0.1, 16]} />
                <meshBasicMaterial color={TRUNK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>

            {/* Canopy. All six were one seagreen when a light was doing the
                shading; with flat materials the values have to be assigned by
                hand. Highlight upper-right, shadow left — the same arrangement
                as the loader's tree. */}
            {/* Central core */}
            <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.55, 32, 32]} />
                <meshBasicMaterial color={LEAF} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Left lump — shadow side */}
            <mesh position={[-0.4, 0.5, 0.2]}>
                <sphereGeometry args={[0.35, 32, 32]} />
                <meshBasicMaterial color={LEAF_DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Right lump — lit side */}
            <mesh position={[0.4, 0.6, 0.2]}>
                <sphereGeometry args={[0.4, 32, 32]} />
                <meshBasicMaterial color={LEAF_LIGHT} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Top lump — lit side */}
            <mesh position={[-0.1, 1.0, 0]}>
                <sphereGeometry args={[0.4, 32, 32]} />
                <meshBasicMaterial color={LEAF_LIGHT} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Back lump — shadow side */}
            <mesh position={[0.2, 0.5, -0.3]}>
                <sphereGeometry args={[0.35, 32, 32]} />
                <meshBasicMaterial color={LEAF_DARK} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>
            {/* Additional front-right filler */}
            <mesh position={[0.2, 0.4, 0.4]}>
                <sphereGeometry args={[0.25, 32, 32]} />
                <meshBasicMaterial color={LEAF} />
                <Outlines {...OUTLINE_PROPS} />
            </mesh>

            {/* Plant Face perfectly pushed out to prevent clipping */}
            <FaceHalfMoons position={[-0.2, 0.5, 0.65]} showPassword={showPassword} reduced={reduced} />

            {/* Annotation Box drags out: 5.1s -> 5.8s */}
            <BoundingBox args={[1.6, 2.5, 1.4]} position={[0, 0.8, 0.1]} drawStart={5.1} drawEnd={5.8} color={BOX_SUCCESS} reduced={reduced} />
        </group>
    );
}

export default function InteractiveObstructions({ showPassword = false, reaction }) {
    const reduced = useReducedMotion();

    /*
     * The panel paints no background and no grain of its own. The <Canvas> is
     * alpha:true and transparent, so the page's ground and paper grain show
     * straight through and there is no visible edge where the panel ends.
     *
     * Don't give it a background or grain of its own. Doing so reads as a
     * separate surface pasted onto the page, for three reasons: a vignette
     * darkens the panel's edges where the page has none, a second grain layer
     * sits at a different strength from the body's, and the body's grain is
     * background-attachment:fixed while the panel's was anchored to the element
     * — so the 93-degree stripes could never line up across the seam however the
     * alphas were matched. Painting nothing is continuous by construction rather
     * than by coincidence.
     */
    return (
        <div className="w-full h-full min-h-[500px] lg:min-h-full overflow-hidden relative">
            <CrayonFilters />

            {/* The same displacement filter the loader runs its whole scene
                through. A CSS filter applies to a <canvas> like any other
                element, which is what lets the WebGL scene share the
                illustration's hand and not just its palette.

                Dropped under reduced motion: a permanently trembling edge is
                exactly what that setting exists to prevent. */}
            <div
                className="absolute inset-0"
                style={reduced ? undefined : { filter: 'url(#cr-rough)' }}
            >
                <Canvas
                    camera={{ position: [0, 0, 8], fov: 45 }}
                    gl={{ alpha: true }}
                    style={{ background: 'transparent' }}
                >
                    {/* No lights, on purpose. Every material here is flat, and
                        shape comes from the colour value chosen per object, the
                        way the loading animation's artwork does it. Lighting the
                        scene gives it a plastic shine that doesn't match, and
                        costs an asset download on the login page. */}
                    <FitCamera />

                    <group position={[0.6, 0.0, 0]}>
                        {/* 3 Interactive Environment Obstructions */}
                        <UtilityPole reaction={reaction} position={[-1.7, 0.5, -1.0]} delay={0.2} showPassword={showPassword} reduced={reduced} />
                        <Bench reaction={reaction} position={[0.2, -0.8, 0.8]} delay={0.4} showPassword={showPassword} reduced={reduced} />
                        <PottedPlant reaction={reaction} position={[1.4, 1.0, -0.7]} delay={0.6} showPassword={showPassword} reduced={reduced} />

                        {/* The cursor demonstrates where the boxes come from. Under
                            reduced motion the boxes are already drawn, so it has
                            nothing left to demonstrate. */}
                        {!reduced && <VirtualMouse />}
                    </group>
                </Canvas>
            </div>
        </div>
    );
}
