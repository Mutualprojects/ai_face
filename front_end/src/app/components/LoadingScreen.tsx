"use client";

export default function LoadingScreen() {
  return (
    <div className="loading-screen-wrapper">
      <style>{`
        .loading-screen-wrapper {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-deep);
          background-image: radial-gradient(circle at 50% 50%, var(--bg-card) 0%, var(--bg-deep) 100%);
          position: fixed;
          inset: 0;
          z-index: 9999;
        }

        .main-container {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%;
          width: 100%;
          max-width: 680px;
          padding: 20px;
        }

        .loader {
          width: 100%;
        }

        .trace-bg {
          stroke: #cbd5e1;
          stroke-width: 1.8;
          fill: none;
        }

        .trace-flow {
          stroke-width: 1.8;
          fill: none;
          stroke-dasharray: 40 400;
          stroke-dashoffset: 438;
          filter: drop-shadow(0 0 6px currentColor);
          animation: flow 3s cubic-bezier(0.5, 0, 0.9, 1) infinite;
        }

        .yellow {
          stroke: #d97706;
          color: #d97706;
        }
        .blue {
          stroke: #2563eb;
          color: #2563eb;
        }
        .green {
          stroke: #16a34a;
          color: #16a34a;
        }
        .purple {
          stroke: #7c3aed;
          color: #7c3aed;
        }
        .red {
          stroke: #dc2626;
          color: #dc2626;
        }

        @keyframes flow {
          to {
            stroke-dashoffset: 0;
          }
        }

        /* Chip body */
        .chip-body {
          rx: 20;
          ry: 20;
        }

        /* Text inside chip */
        .chip-text {
          font-weight: bold;
          letter-spacing: 1.5px;
          animation: textPulse 1.8s ease-in-out infinite alternate;
        }

        @keyframes textPulse {
          from { opacity: 0.7; }
          to { opacity: 1; }
        }

        /* Pins */
        .chip-pin {
          stroke: #444;
          stroke-width: 0.5;
          filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.6));
        }
      `}</style>

      <div className="main-container">
        <div className="loader">
          <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="chipGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e293b"></stop>
                <stop offset="100%" stopColor="#0f172a"></stop>
              </linearGradient>

              <linearGradient id="textGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff"></stop>
                <stop offset="100%" stopColor="#94a3b8"></stop>
              </linearGradient>

              <linearGradient id="pinGradient" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor="#bbbbbb"></stop>
                <stop offset="50%" stopColor="#888888"></stop>
                <stop offset="100%" stopColor="#555555"></stop>
              </linearGradient>
            </defs>

            <g id="traces">
              <path d="M100 100 H200 V210 H326" className="trace-bg"></path>
              <path d="M100 100 H200 V210 H326" className="trace-flow purple"></path>

              <path d="M80 180 H180 V230 H326" className="trace-bg"></path>
              <path d="M80 180 H180 V230 H326" className="trace-flow blue"></path>

              <path d="M60 260 H150 V250 H326" className="trace-bg"></path>
              <path d="M60 260 H150 V250 H326" className="trace-flow yellow"></path>

              <path d="M100 350 H200 V270 H326" className="trace-bg"></path>
              <path d="M100 350 H200 V270 H326" className="trace-flow green"></path>

              <path d="M700 90 H560 V210 H474" className="trace-bg"></path>
              <path d="M700 90 H560 V210 H474" className="trace-flow blue"></path>

              <path d="M740 160 H580 V230 H474" className="trace-bg"></path>
              <path d="M740 160 H580 V230 H474" className="trace-flow green"></path>

              <path d="M720 250 H590 V250 H474" className="trace-bg"></path>
              <path d="M720 250 H590 V250 H474" className="trace-flow red"></path>

              <path d="M680 340 H570 V270 H474" className="trace-bg"></path>
              <path d="M680 340 H570 V270 H474" className="trace-flow yellow"></path>
            </g>

            {/* Microchip body */}
            <rect
              x="330"
              y="190"
              width="140"
              height="100"
              rx="20"
              ry="20"
              fill="url(#chipGradient)"
              stroke="#0f172a"
              strokeWidth="3"
              filter="drop-shadow(0 4px 20px rgba(15,23,42,0.15))"
            ></rect>

            {/* Left pins */}
            <g>
              <rect x="322" y="205" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
              <rect x="322" y="225" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
              <rect x="322" y="245" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
              <rect x="322" y="265" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
            </g>

            {/* Right pins */}
            <g>
              <rect x="470" y="205" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
              <rect x="470" y="225" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
              <rect x="470" y="245" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
              <rect x="470" y="265" width="8" height="10" fill="url(#pinGradient)" rx="2"></rect>
            </g>

            {/* Loading text inside chip */}
            <text
              x="400"
              y="246"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="20"
              className="chip-text"
              fill="url(#textGradient)"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              SENTINEL
            </text>

            {/* Circuit node connection dots */}
            <circle cx="100" cy="100" r="5" fill="#7c3aed" filter="drop-shadow(0 0 3px #7c3aed)"></circle>
            <circle cx="80" cy="180" r="5" fill="#2563eb" filter="drop-shadow(0 0 3px #2563eb)"></circle>
            <circle cx="60" cy="260" r="5" fill="#d97706" filter="drop-shadow(0 0 3px #d97706)"></circle>
            <circle cx="100" cy="350" r="5" fill="#16a34a" filter="drop-shadow(0 0 3px #16a34a)"></circle>

            <circle cx="700" cy="90" r="5" fill="#2563eb" filter="drop-shadow(0 0 3px #2563eb)"></circle>
            <circle cx="740" cy="160" r="5" fill="#16a34a" filter="drop-shadow(0 0 3px #16a34a)"></circle>
            <circle cx="720" cy="250" r="5" fill="#dc2626" filter="drop-shadow(0 0 3px #dc2626)"></circle>
            <circle cx="680" cy="340" r="5" fill="#d97706" filter="drop-shadow(0 0 3px #d97706)"></circle>
          </svg>
        </div>
      </div>
    </div>
  );
}
