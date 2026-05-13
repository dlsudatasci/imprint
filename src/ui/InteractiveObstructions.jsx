/* eslint-disable react/no-unknown-property */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

function easeOutElastic(x) {
    const c4 = (2 * Math.PI) / 3;
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

// Blinking logic hook
function useBlink(eyesRef, mouthRef, effectType = 'scale') {
    const blinkState = useRef({ nextBlink: Math.random() * 3, blinkEnd: -1 });

    useFrame(({ clock }) => {
        if (!eyesRef.current) return;
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

// Keyframe animator for the mouse path
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

    const cursorShape = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);          // Tip
        shape.lineTo(0.4, -1.0);     // Right corner
        shape.lineTo(0.15, -1.0);    // Inner right
        shape.lineTo(0.3, -1.6);     // Tail right
        shape.lineTo(0.05, -1.7);    // Tail bottom
        shape.lineTo(-0.1, -1.05);   // Inner left
        shape.lineTo(-0.35, -1.05);  // Left corner
        shape.lineTo(0, 0);          // Back to Tip
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
        // Point like a cursor towards top left
        mouseRef.current.rotation.z = Math.PI / 6;
    });

    return (
        <group ref={mouseRef} scale={0.25}>
            {/* 2D Flat Cursor Shape */}
            <mesh>
                <shapeGeometry args={[cursorShape]} />
                <meshBasicMaterial ref={mat1} color="#ffffff" side={THREE.DoubleSide} transparent />
            </mesh>
            {/* Subtle black shadow/border backdrop */}
            <mesh position={[0.02, -0.02, -0.01]} scale={1.1}>
                <shapeGeometry args={[cursorShape]} />
                <meshBasicMaterial ref={mat2} color="#000000" side={THREE.DoubleSide} transparent />
            </mesh>
        </group>
    );
}

// Bounding Box to symbolize annotation
function BoundingBox({ args, color = "#22c55e", position = [0, 0, 0], drawStart = 0, drawEnd = 0 }) {
    const boxRef = useRef();
    const w = args[0], h = args[1];

    useFrame((state) => {
        if (!boxRef.current) return;
        const t = state.clock.elapsedTime;

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

// Global Singletons to prevent 60FPS Garbage Collection inside useFrame
const globalDummy = new THREE.Object3D();
const globalTarget = new THREE.Vector3();

function FaceStandard({ position, showPassword = false }) {
    const group = useRef();
    const eyes = useRef();
    const mouth = useRef();

    useFrame((state) => {
        if (!group.current) return;
        // Pole: upper left
        const x = showPassword ? -12 : (state.pointer.x * state.viewport.width) / 6;
        const y = showPassword ? 12 : (state.pointer.y * state.viewport.height) / 6;
        globalTarget.set(x, y, 5);

        globalDummy.position.copy(group.current.position);
        globalDummy.lookAt(globalTarget);
        group.current.quaternion.slerp(globalDummy.quaternion, 0.05);
    });

    useBlink(eyes, mouth);

    return (
        <group ref={group} position={position}>
            <group ref={eyes}>
                {/* Left Eye */}
                <mesh position={[-0.2, 0.1, 0.51]}>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color="white" />
                    <mesh position={[0, 0, 0.07]}>
                        <sphereGeometry args={[0.04, 16, 16]} />
                        <meshStandardMaterial color="#111" />
                    </mesh>
                </mesh>
                {/* Right Eye */}
                <mesh position={[0.2, 0.1, 0.51]}>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color="white" />
                    <mesh position={[0, 0, 0.07]}>
                        <sphereGeometry args={[0.04, 16, 16]} />
                        <meshStandardMaterial color="#111" />
                    </mesh>
                </mesh>
            </group>
            {/* Mouth */}
            <mesh ref={mouth} position={[0, -0.12, 0.51]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.02, 0.08, 4, 16]} />
                <meshStandardMaterial color="#111" />
            </mesh>
        </group>
    );
}

function FaceHalfMoons({ position, showPassword = false }) {
    const group = useRef();
    const eyes = useRef();
    const mouth = useRef();

    useFrame((state) => {
        if (!group.current) return;
        // Potted Plant: lower left
        const x = showPassword ? -12 : (state.pointer.x * state.viewport.width) / 6;
        const y = showPassword ? -12 : (state.pointer.y * state.viewport.height) / 6;
        globalTarget.set(x, y, 5);

        globalDummy.position.copy(group.current.position);
        globalDummy.lookAt(globalTarget);
        group.current.quaternion.slerp(globalDummy.quaternion, 0.05);
    });

    useBlink(eyes, mouth, 'subtle');

    return (
        <group ref={group} position={position}>
            <group ref={eyes}>
                {/* Left Happy Eye (Torus segment) */}
                <mesh position={[-0.2, 0.1, 0.51]} rotation={[0, 0, 0]}>
                    <torusGeometry args={[0.06, 0.02, 8, 24, Math.PI]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                {/* Right Happy Eye */}
                <mesh position={[0.2, 0.1, 0.51]} rotation={[0, 0, 0]}>
                    <torusGeometry args={[0.06, 0.02, 8, 24, Math.PI]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
            </group>
            {/* Wide Mouth */}
            <mesh ref={mouth} position={[0, -0.1, 0.51]} rotation={[0, 0, Math.PI]}>
                <circleGeometry args={[0.08, 32, 0, Math.PI]} />
                <meshStandardMaterial color="#111" side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

function FaceDots({ position, showPassword = false }) {
    const group = useRef();
    const eyes = useRef();
    const mouth = useRef();

    useFrame((state) => {
        if (!group.current) return;
        // Bench: just left
        const x = showPassword ? -12 : (state.pointer.x * state.viewport.width) / 6;
        const y = showPassword ? 0 : (state.pointer.y * state.viewport.height) / 6;
        globalTarget.set(x, y, 5);

        globalDummy.position.copy(group.current.position);
        globalDummy.lookAt(globalTarget);
        group.current.quaternion.slerp(globalDummy.quaternion, 0.05);
    });

    useBlink(eyes, mouth);

    return (
        <group ref={group} position={position}>
            <group ref={eyes}>
                {/* Left Dot Eye */}
                <mesh position={[-0.15, 0.1, 0.51]}>
                    <sphereGeometry args={[0.04, 16, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                {/* Right Dot Eye */}
                <mesh position={[0.15, 0.1, 0.51]}>
                    <sphereGeometry args={[0.04, 16, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
            </group>
            {/* Circle Mouth */}
            <mesh ref={mouth} position={[0, -0.05, 0.51]}>
                <torusGeometry args={[0.025, 0.015, 8, 24]} />
                <meshStandardMaterial color="#111" />
            </mesh>
        </group>
    );
}

function UtilityPole({ position, delay = 0, showPassword = false }) {
    const group = useRef();

    useFrame((state) => {
        if (!group.current) return;

        const initialPos = [-8, position[1], position[2] - 2];
        if (state.clock.elapsedTime <= delay) {
            group.current.position.set(...initialPos);
            group.current.scale.set(0.01, 0.01, 0.01);
            return;
        }

        const progress = Math.min((state.clock.elapsedTime - delay) * 1.2, 1);
        const bounce = easeOutElastic(progress);

        const sway = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
        group.current.scale.setScalar(bounce);

        const targetX = position[0] + state.pointer.x * 0.2;
        const targetY = position[1] + state.pointer.y * 0.2;

        group.current.position.x = THREE.MathUtils.lerp(initialPos[0], targetX, bounce);
        group.current.position.y = THREE.MathUtils.lerp(initialPos[1], targetY, bounce);
        group.current.position.z = THREE.MathUtils.lerp(initialPos[2], position[2], bounce);

        // Swinging entrance rotation + Idle Sway
        group.current.rotation.z = THREE.MathUtils.lerp(-Math.PI / 4, sway, bounce);
        group.current.rotation.y = THREE.MathUtils.lerp(0, state.pointer.x * 0.15, bounce);
        group.current.rotation.x = THREE.MathUtils.lerp(0, -state.pointer.y * 0.15, bounce);
    });

    return (
        <group ref={group} position={position} scale={[0.01, 0.01, 0.01]}>
            {/* Main Pole */}
            <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.25, 0.25, 3, 16]} />
                <meshStandardMaterial color="#888888" roughness={0.8} />
            </mesh>
            {/* Crossbeam */}
            <mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.08, 0.08, 1.5, 16]} />
                <meshStandardMaterial color="#666666" roughness={0.8} />
            </mesh>

            {/* Power Line Details */}
            <mesh position={[-0.6, 1.3, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
                <meshStandardMaterial color="#444" />
            </mesh>
            <mesh position={[0.6, 1.3, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
                <meshStandardMaterial color="#444" />
            </mesh>

            {/* Pole Face */}
            <FaceStandard position={[0, 0.5, 0.25]} showPassword={showPassword} />

            {/* Annotation Box drags out: 2.5s -> 3.2s */}
            <BoundingBox args={[1.5, 3.2, 0.8]} position={[0, 0.1, 0]} drawStart={2.5} drawEnd={3.2} color="#3b82f6" />
        </group>
    );
}

function Bench({ position, delay = 0, showPassword = false }) {
    const group = useRef();

    useFrame((state) => {
        if (!group.current) return;

        const initialPos = [position[0], -8, position[2] - 2];
        if (state.clock.elapsedTime <= delay) {
            group.current.position.set(...initialPos);
            group.current.scale.set(0.01, 0.01, 0.01);
            return;
        }

        const progress = Math.min((state.clock.elapsedTime - delay) * 1.2, 1);
        const bounce = easeOutElastic(progress);

        const breatheY = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
        const breatheXZ = 1 - Math.sin(state.clock.elapsedTime * 2) * 0.015;
        group.current.scale.set(bounce * breatheXZ, bounce * breatheY, bounce * breatheXZ);

        const targetX = position[0] + state.pointer.x * 0.15;
        const targetY = position[1] + state.pointer.y * 0.15;

        group.current.position.x = THREE.MathUtils.lerp(initialPos[0], targetX, bounce);
        group.current.position.y = THREE.MathUtils.lerp(initialPos[1], targetY, bounce);
        group.current.position.z = THREE.MathUtils.lerp(initialPos[2], position[2], bounce);

        // Swinging entrance rotation + Idle Rocking
        const rock = Math.sin(state.clock.elapsedTime * 1.2) * 0.02;
        group.current.rotation.x = THREE.MathUtils.lerp(Math.PI / 4, -state.pointer.y * 0.1, bounce);
        group.current.rotation.y = THREE.MathUtils.lerp(0, state.pointer.x * 0.1, bounce);
        group.current.rotation.z = rock * bounce;
    });

    return (
        <group ref={group} position={position} scale={[0.01, 0.01, 0.01]}>
            {/* Seat */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[2, 0.15, 0.8]} />
                <meshStandardMaterial color="#A0522D" roughness={0.7} />
            </mesh>
            {/* Backrest */}
            <mesh position={[0, 0.5, -0.35]} rotation={[-0.1, 0, 0]}>
                <boxGeometry args={[2, 0.6, 0.1]} />
                <meshStandardMaterial color="#A0522D" roughness={0.7} />
            </mesh>
            {/* Legs */}
            <mesh position={[-0.8, -0.4, 0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshStandardMaterial color="#444" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0.8, -0.4, 0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshStandardMaterial color="#444" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[-0.8, -0.4, -0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshStandardMaterial color="#444" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0.8, -0.4, -0.2]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshStandardMaterial color="#444" roughness={0.5} metalness={0.5} />
            </mesh>

            {/* Bench Face */}
            <FaceDots position={[0, 0.5, -0.25]} showPassword={showPassword} />

            {/* Annotation Box drags out: 3.8s -> 4.5s */}
            <BoundingBox args={[2.3, 1.8, 1.2]} position={[0, 0.1, -0.1]} drawStart={3.8} drawEnd={4.5} color="#eab308" />
        </group>
    );
}

function PottedPlant({ position, delay = 0, showPassword = false }) {
    const group = useRef();

    useFrame((state) => {
        if (!group.current) return;

        const initialPos = [8, position[1], position[2] - 2];
        if (state.clock.elapsedTime <= delay) {
            group.current.position.set(...initialPos);
            group.current.scale.set(0.01, 0.01, 0.01);
            return;
        }

        const progress = Math.min((state.clock.elapsedTime - delay) * 1.2, 1);
        const bounce = easeOutElastic(progress);

        group.current.scale.setScalar(bounce);

        const hop = Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.05;
        const targetX = position[0] + state.pointer.x * 0.1;
        const targetY = position[1] + state.pointer.y * 0.1 + hop;

        group.current.position.x = THREE.MathUtils.lerp(initialPos[0], targetX, bounce);
        group.current.position.y = THREE.MathUtils.lerp(initialPos[1], targetY, bounce);
        group.current.position.z = THREE.MathUtils.lerp(initialPos[2], position[2], bounce);

        // Swinging entrance rotation + Idle Wiggle
        const wiggle = Math.cos(state.clock.elapsedTime * 6) * 0.03;
        group.current.rotation.z = THREE.MathUtils.lerp(Math.PI / 4, wiggle, bounce);
        group.current.rotation.y = THREE.MathUtils.lerp(0, state.pointer.x * 0.05, bounce);
        group.current.rotation.x = THREE.MathUtils.lerp(0, -state.pointer.y * 0.05, bounce);
    });

    return (
        <group ref={group} position={position} scale={[0.01, 0.01, 0.01]}>
            {/* Terra Cotta Pot Base */}
            <mesh position={[0, -0.2, 0]}>
                <cylinderGeometry args={[0.35, 0.25, 0.6, 16]} />
                <meshStandardMaterial color="#c15c3d" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 0.1, 16]} />
                <meshStandardMaterial color="#a04a29" roughness={0.9} />
            </mesh>

            {/* Natural Organic Plant Canopy */}
            {/* Central core */}
            <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.55, 32, 32]} />
                <meshStandardMaterial color="#2E8B57" roughness={0.9} />
            </mesh>
            {/* Left lump */}
            <mesh position={[-0.4, 0.5, 0.2]}>
                <sphereGeometry args={[0.35, 32, 32]} />
                <meshStandardMaterial color="#2E8B57" roughness={0.9} />
            </mesh>
            {/* Right lump */}
            <mesh position={[0.4, 0.6, 0.2]}>
                <sphereGeometry args={[0.4, 32, 32]} />
                <meshStandardMaterial color="#2E8B57" roughness={0.9} />
            </mesh>
            {/* Top lump */}
            <mesh position={[-0.1, 1.0, 0]}>
                <sphereGeometry args={[0.4, 32, 32]} />
                <meshStandardMaterial color="#2E8B57" roughness={0.9} />
            </mesh>
            {/* Back lump */}
            <mesh position={[0.2, 0.5, -0.3]}>
                <sphereGeometry args={[0.35, 32, 32]} />
                <meshStandardMaterial color="#2E8B57" roughness={0.9} />
            </mesh>
            {/* Additional front-right filler */}
            <mesh position={[0.2, 0.4, 0.4]}>
                <sphereGeometry args={[0.25, 32, 32]} />
                <meshStandardMaterial color="#2E8B57" roughness={0.9} />
            </mesh>

            {/* Plant Face perfectly pushed out to prevent clipping */}
            <FaceHalfMoons position={[-0.2, 0.5, 0.65]} showPassword={showPassword} />

            {/* Annotation Box drags out: 5.1s -> 5.8s */}
            <BoundingBox args={[1.6, 2.5, 1.4]} position={[0, 0.8, 0.1]} drawStart={5.1} drawEnd={5.8} color="#22c55e" />
        </group>
    );
}

export default function InteractiveObstructions({ showPassword = false }) {
    return (
        <div className="w-full h-full min-h-[500px] lg:min-h-full overflow-hidden relative">
            <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
                <directionalLight position={[-5, 5, -5]} intensity={0.5} />

                {/* Environment map for realistic lighting reflections */}
                <Environment preset="city" />

                <group position={[0, -0.2, 0]}>
                    {/* 3 Interactive Environment Obstructions */}
                    <UtilityPole position={[-1.7, 0.5, -1.0]} delay={0.2} showPassword={showPassword} />
                    <Bench position={[0.2, -0.8, 0.8]} delay={0.4} showPassword={showPassword} />
                    <PottedPlant position={[1.4, 1.0, -0.7]} delay={0.6} showPassword={showPassword} />

                    {/* The Mouse Annotation Cursor moving through relative space */}
                    <VirtualMouse />
                </group>

                {/* Subtle soft shadow ground plane */}
            </Canvas>
        </div>
    );
}
