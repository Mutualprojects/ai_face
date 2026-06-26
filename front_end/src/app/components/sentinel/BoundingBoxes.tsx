"use client";
import { Detection } from "./types";

interface Props {
  detections: Detection[];
  bodies?: [number, number, number, number, number][];
  videoWidth: number;
  videoHeight: number;
}

export default function BoundingBoxes({ detections, bodies = [], videoWidth, videoHeight }: Props) {
  if ((!detections.length && !bodies.length) || !videoWidth || !videoHeight) return null;

  // Face mesh index mappings for 106-point landmarks
  const jawline = Array.from({ length: 33 }, (_, i) => i); // 0-32
  const leftEyebrow = Array.from({ length: 9 }, (_, i) => i + 33); // 33-41
  const rightEyebrow = Array.from({ length: 9 }, (_, i) => i + 42); // 42-50
  const noseBridge = Array.from({ length: 4 }, (_, i) => i + 51); // 51-54
  const noseBase = Array.from({ length: 9 }, (_, i) => i + 55); // 55-63
  const leftEye = [...Array.from({ length: 8 }, (_, i) => i + 64), 64]; // 64-71, loop
  const rightEye = [...Array.from({ length: 8 }, (_, i) => i + 72), 72]; // 72-79, loop
  const mouthOuter = [...Array.from({ length: 16 }, (_, i) => i + 80), 80]; // 80-95, loop
  const mouthInner = [...Array.from({ length: 8 }, (_, i) => i + 96), 96]; // 96-103, loop

  const getPointsString = (pts: [number, number][], indices: number[]) => {
    return indices
      .map(idx => pts[idx])
      .filter(Boolean)
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
  };

  return (
    <svg
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10
      }}
    >
      <defs>
        <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* YOLO Body Bounding Boxes */}
      {bodies.map((body, i) => {
        const [x1, y1, x2, y2, conf] = body;
        return (
          <g key={`body-${i}`}>
            <rect
              x={x1}
              y={y1}
              width={x2 - x1}
              height={y2 - y1}
              fill="none"
              stroke="#00f0ff"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.7"
            />
            <text
              x={x1}
              y={y1 - 6}
              fill="#00f0ff"
              fontSize="10"
              opacity="0.9"
              fontWeight="bold"
              fontFamily="'JetBrains Mono', monospace"
            >
              PERSON {Math.round(conf * 100)}%
            </text>
          </g>
        );
      })}

      {detections.map((det, i) => {
        const [x1, y1, x2, y2] = det.bbox;
        const color = det.matched ? "#00ff88" : "#ff3b5c";
        const glowId = det.matched ? "url(#glow-green)" : "url(#glow-red)";
        const label = det.matched
          ? `${det.name}  ${Math.round(det.confidence * 100)}%`
          : `Unknown`;

        return (
          <g key={i}>
            {/* 1. Neon glowing bounding box */}
            <rect
              x={x1}
              y={y1}
              width={x2 - x1}
              height={y2 - y1}
              fill="none"
              stroke={color}
              strokeWidth="2"
              filter={glowId}
              style={{ transition: "all 0.15s ease-out" }}
            />

            {/* Corner Ticks (Overlaying for extra details) */}
            <path
              d={`
                M ${x1} ${y1 + 16} L ${x1} ${y1} L ${x1 + 16} ${y1}
                M ${x2 - 16} ${y1} L ${x2} ${y1} L ${x2} ${y1 + 16}
                M ${x1} ${y2 - 16} L ${x1} ${y2} L ${x1 + 16} ${y2}
                M ${x2 - 16} ${y2} L ${x2} ${y2} L ${x2} ${y2 - 16}
              `}
              fill="none"
              stroke={color}
              strokeWidth="3.5"
            />

            {/* 2. HUD Label Background & Text */}
            <g transform={`translate(${x1}, ${y1 - 10})`}>
              <rect
                x="-1.5"
                y="-18"
                width={Math.max(130, label.length * 7)}
                height="20"
                rx="4"
                fill={det.matched ? "rgba(0, 200, 100, 0.95)" : "rgba(220, 30, 60, 0.95)"}
                stroke={color}
                strokeWidth="1"
              />
              <text
                x="6"
                y="-4"
                fill="#ffffff"
                fontSize="10"
                fontWeight="700"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.04em"
              >
                {det.matched ? "✓ " : "? "}{label}
              </text>
            </g>

            {/* 3. Det Score Tag */}
            {det.det_score !== undefined && (
              <text
                x={x2}
                y={y2 + 14}
                fill={color}
                fontSize="9"
                fontFamily="monospace"
                textAnchor="end"
                opacity="0.8"
              >
                det {Math.round(det.det_score * 100)}%
              </text>
            )}

            {/* 4. Facial Mesh / Landmark Lines & Keypoints */}
            {det.landmarks && det.landmarks.length > 0 && (
              <g opacity="0.75">
                {/* Mesh Connecting Lines */}
                <polyline
                  points={getPointsString(det.landmarks, jawline)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polyline
                  points={getPointsString(det.landmarks, leftEyebrow)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polyline
                  points={getPointsString(det.landmarks, rightEyebrow)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polyline
                  points={getPointsString(det.landmarks, noseBridge)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polyline
                  points={getPointsString(det.landmarks, noseBase)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polygon
                  points={getPointsString(det.landmarks, leftEye)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polygon
                  points={getPointsString(det.landmarks, rightEye)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polygon
                  points={getPointsString(det.landmarks, mouthOuter)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />
                <polygon
                  points={getPointsString(det.landmarks, mouthInner)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.85"
                />

                {/* Individual Glowing Landmark Dots */}
                {det.landmarks.map(([lx, ly], lIdx) => (
                  <circle
                    key={lIdx}
                    cx={lx}
                    cy={ly}
                    r="1.8"
                    fill={color}
                    opacity="0.9"
                    style={{ transition: "all 0.1s ease" }}
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
