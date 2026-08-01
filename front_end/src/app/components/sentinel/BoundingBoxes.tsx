"use client";
import { Detection } from "./types";

interface Props {
  detections: Detection[];
  bodies?: [number, number, number, number, number][];
  videoWidth: number;
  videoHeight: number;
}

// Corner bracket arm length as % of box dimension
const CORNER_LEN_RATIO = 0.18;
const CORNER_MIN = 14;
const CORNER_MAX = 32;

function cornerLen(w: number, h: number) {
  return Math.min(CORNER_MAX, Math.max(CORNER_MIN, Math.round(Math.min(w, h) * CORNER_LEN_RATIO)));
}

export default function BoundingBoxes({ detections, bodies = [], videoWidth, videoHeight }: Props) {
  if (!detections.length && !bodies.length) return null;

  const jawline = Array.from({ length: 33 }, (_, i) => i);
  const leftEyebrow = Array.from({ length: 9 }, (_, i) => i + 33);
  const rightEyebrow = Array.from({ length: 9 }, (_, i) => i + 42);
  const noseBridge = Array.from({ length: 4 }, (_, i) => i + 51);
  const noseBase = Array.from({ length: 9 }, (_, i) => i + 55);
  const leftEye = [...Array.from({ length: 8 }, (_, i) => i + 64), 64];
  const rightEye = [...Array.from({ length: 8 }, (_, i) => i + 72), 72];
  const mouthOuter = [...Array.from({ length: 16 }, (_, i) => i + 80), 80];
  const mouthInner = [...Array.from({ length: 8 }, (_, i) => i + 96), 96];

  const getPointsString = (pts: [number, number][], indices: number[]) =>
    indices.map(idx => pts[idx]).filter(Boolean).map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 10 }}
    >
      <defs>
        <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-amber" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="badge-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <radialGradient id="pulse-green" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pulse-red" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* YOLO body boxes with head-region highlight */}
      {bodies.map((body, i) => {
        const [x1, y1, x2, y2, conf] = body;
        const bw = x2 - x1; const bh = y2 - y1;
        const cl = cornerLen(bw, bh);
        const headY2 = y1 + bh * 0.40;
        return (
          <g key={`body-${Math.round(x1)}-${Math.round(y1)}-${i}`}>
            <rect x={x1} y={y1} width={bw} height={bh}
              fill="none" stroke="#00e5ff" strokeWidth="1" strokeDasharray="5 4" opacity="0.45" />
            {/* Head-region indicator (top 40%) */}
            <rect x={x1 + 1} y={y1 + 1} width={bw - 2} height={headY2 - y1 - 1}
              fill="rgba(0,229,255,0.07)" stroke="#00e5ff"
              strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />
            <path d={`M ${x1} ${y1+cl} L ${x1} ${y1} L ${x1+cl} ${y1}
                      M ${x2-cl} ${y1} L ${x2} ${y1} L ${x2} ${y1+cl}
                      M ${x1} ${y2-cl} L ${x1} ${y2} L ${x1+cl} ${y2}
                      M ${x2-cl} ${y2} L ${x2} ${y2} L ${x2} ${y2-cl}`}
              fill="none" stroke="#00e5ff" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
            <text x={x1+4} y={y1-5} fill="#00e5ff" fontSize="10" fontWeight="700"
              fontFamily="'JetBrains Mono', monospace" opacity="0.85">
              PERSON {Math.round(conf * 100)}%
            </text>
          </g>
        );
      })}

      {/* Face detections */}
      {detections.map((det, i) => {
        const [x1, y1, x2, y2] = det.bbox;
        const bw = x2 - x1; const bh = y2 - y1;
        const cl = cornerLen(bw, bh);
        const isKnown = det.matched;
        const isConfirmed = det.matched && det.confirmed;
        const color = isConfirmed ? "#10b981" : isKnown ? "#f59e0b" : "#ef4444";
        const glowId = isConfirmed ? "url(#glow-green)" : isKnown ? "url(#glow-amber)" : "url(#glow-red)";
        const badgeBg = isConfirmed ? "rgba(4,120,87,0.93)" : isKnown ? "rgba(146,64,14,0.93)" : "rgba(153,27,27,0.93)";
        const statusIcon = isConfirmed ? "✓" : isKnown ? "~" : "?";
        const label = isKnown ? `${det.name}  ${Math.round(det.confidence * 100)}%` : "Unknown";
        const faceKey = `det-${det.name}-${Math.round(x1)}-${Math.round(y1)}-${i}`;
        const badgeW = Math.max(100, label.length * 7.0 + 28);
        const badgeH = 22;
        const badgeY = y1 > badgeH + 4 ? y1 - badgeH - 2 : y2 + 2;

        return (
          <g key={faceKey}>
            {/* Animated pulse on confirmed known */}
            {isConfirmed && (
              <ellipse cx={(x1+x2)/2} cy={(y1+y2)/2} rx={bw * 0.6} ry={bh * 0.55} fill="url(#pulse-green)">
                <animate attributeName="rx" values={`${bw*0.55};${bw*0.72};${bw*0.55}`} dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="ry" values={`${bh*0.5};${bh*0.67};${bh*0.5}`} dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2.2s" repeatCount="indefinite" />
              </ellipse>
            )}
            {/* Unknown pulse */}
            {!isKnown && (
              <ellipse cx={(x1+x2)/2} cy={(y1+y2)/2} rx={bw * 0.55} ry={bh * 0.5} fill="url(#pulse-red)" opacity="0.4">
                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.8s" repeatCount="indefinite" />
              </ellipse>
            )}

            {/* Corner-bracket scope style — NO full rectangle */}
            <path
              d={`M ${x1} ${y1+cl} L ${x1} ${y1} L ${x1+cl} ${y1}
                  M ${x2-cl} ${y1} L ${x2} ${y1} L ${x2} ${y1+cl}
                  M ${x1} ${y2-cl} L ${x1} ${y2} L ${x1+cl} ${y2}
                  M ${x2-cl} ${y2} L ${x2} ${y2} L ${x2} ${y2-cl}`}
              fill="none" stroke={color}
              strokeWidth={isConfirmed ? 3.5 : 2.5}
              strokeLinecap="round"
              filter={glowId}
              style={{ transition: "stroke 0.3s ease-out" }}
            />

            {/* Inner dashed subtle box */}
            <rect x={x1+2} y={y1+2} width={bw-4} height={bh-4}
              fill="none" stroke={color} strokeWidth="0.6" opacity="0.25" strokeDasharray="3 5" />

            {/* ── Name Badge ── */}
            {/* Badge shadow */}
            <rect x={x1+1} y={badgeY+1} width={badgeW} height={badgeH}
              rx="5" fill="rgba(0,0,0,0.4)" filter="url(#badge-blur)" />
            {/* Badge body */}
            <rect x={x1} y={badgeY} width={badgeW} height={badgeH}
              rx="5" fill={badgeBg} stroke={color} strokeWidth="0.8" />
            {/* Left color stripe */}
            <rect x={x1} y={badgeY} width="5" height={badgeH}
              rx="4" fill={color} />
            {/* Status icon */}
            <text x={x1+10} y={badgeY+15} fill="#fff" fontSize="11" fontWeight="900"
              fontFamily="'JetBrains Mono', monospace">
              {statusIcon}
            </text>
            {/* Label */}
            <text x={x1+22} y={badgeY+14} fill="#fff" fontSize="9.5" fontWeight="700"
              fontFamily="'JetBrains Mono', monospace" letterSpacing="0.04em">
              {label}
            </text>

            {/* Det score tag */}
            {det.det_score !== undefined && (
              <text x={x2-2} y={y2+13} fill={color} fontSize="8.5"
                fontFamily="'JetBrains Mono', monospace" textAnchor="end" opacity="0.7">
                det {Math.round(det.det_score * 100)}%
              </text>
            )}

            {/* Facial landmark mesh */}
            {det.landmarks && det.landmarks.length > 0 && (
              <g opacity={isConfirmed ? 0.65 : 0.42}>
                <polyline points={getPointsString(det.landmarks, jawline)} fill="none" stroke={color} strokeWidth="0.8" />
                <polyline points={getPointsString(det.landmarks, leftEyebrow)} fill="none" stroke={color} strokeWidth="0.8" />
                <polyline points={getPointsString(det.landmarks, rightEyebrow)} fill="none" stroke={color} strokeWidth="0.8" />
                <polyline points={getPointsString(det.landmarks, noseBridge)} fill="none" stroke={color} strokeWidth="0.8" />
                <polyline points={getPointsString(det.landmarks, noseBase)} fill="none" stroke={color} strokeWidth="0.8" />
                <polygon points={getPointsString(det.landmarks, leftEye)} fill="none" stroke={color} strokeWidth="0.8" />
                <polygon points={getPointsString(det.landmarks, rightEye)} fill="none" stroke={color} strokeWidth="0.8" />
                <polygon points={getPointsString(det.landmarks, mouthOuter)} fill="none" stroke={color} strokeWidth="0.8" />
                <polygon points={getPointsString(det.landmarks, mouthInner)} fill="none" stroke={color} strokeWidth="0.8" />
                <path
                  d={det.landmarks.map(([lx, ly]) =>
                    `M ${lx - 1.5},${ly} a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0`
                  ).join(" ")}
                  fill={color} opacity="0.85"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
