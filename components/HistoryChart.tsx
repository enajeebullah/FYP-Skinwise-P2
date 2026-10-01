import type { OverallSeverity } from "@/lib/overallSeverity";

type HistoryChartPoint = {
  date: string;
  severity: OverallSeverity;
};

interface HistoryChartProps {
  points: HistoryChartPoint[];
}

const SEVERITY_ORDER: OverallSeverity[] = ["clear", "mild", "moderate", "severe"];

function formatXLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function severityRank(severity: OverallSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export default function HistoryChart({ points }: HistoryChartProps) {
  if (points.length < 2) {
    return (
      <div className="history-chart-empty">
        <span aria-hidden="true">↗</span>
        <p>Complete at least two scans to see your severity trend.</p>
      </div>
    );
  }

  const visiblePoints = points.slice(-7);
  const width = 720;
  const height = 174;
  const padding = { top: 13, right: 18, bottom: 26, left: 53 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const toXY = (index: number, severity: OverallSeverity) => ({
    x: padding.left + (index * plotWidth) / Math.max(visiblePoints.length - 1, 1),
    y: padding.top + plotHeight - (severityRank(severity) * plotHeight) / 3,
  });

  const coords = visiblePoints.map((point, index) =>
    toXY(index, point.severity)
  );
  const curve = coords.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = coords[index - 1];
    const middleX = (previous.x + point.x) / 2;
    return `${path} Q ${middleX} ${previous.y} ${middleX} ${(previous.y + point.y) / 2} T ${point.x} ${point.y}`;
  }, "");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const baseY = padding.top + plotHeight;
  const area = `${curve} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
  const gradientId = "history-severity-fill";

  return (
    <div className="history-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Severity trend over your recent scans"
        className="history-chart-svg"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF9B37" stopOpacity=".19" />
            <stop offset="100%" stopColor="#FF9B37" stopOpacity="0" />
          </linearGradient>
        </defs>

        {SEVERITY_ORDER.map((severity, index) => {
          const y = padding.top + plotHeight - (index * plotHeight) / 3;
          const label = severity.charAt(0).toUpperCase() + severity.slice(1);
          return (
            <g key={severity}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#EDF0F7"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="var(--font-inter), sans-serif"
                fill="#7886A1"
              >
                {label}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={curve}
          fill="none"
          stroke="#FF8D36"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {visiblePoints.map((point, index) => {
          const coord = coords[index];
          return (
            <g key={`${point.date}-${index}`}>
              <circle cx={coord.x} cy={coord.y} r="5" fill="#fff" />
              <circle cx={coord.x} cy={coord.y} r="3.4" fill="#FF8D36" />
              <text
                x={coord.x}
                y={height - 5}
                textAnchor="middle"
                fontSize="8"
                fontFamily="var(--font-inter), sans-serif"
                fill="#8793AA"
              >
                {formatXLabel(point.date)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
