type HistoryChartPoint = {
  date: string;
  score: number;
};

interface HistoryChartProps {
  points: HistoryChartPoint[];
}

function formatXLabel(dateStr: string, allSameDay: boolean): string {
  const d = new Date(dateStr);
  if (allSameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Zooms the Y-axis to the actual data range (with padding and a sane
 * minimum span) so genuine ups/downs are visible, rather than flattening
 * everything against a fixed 0–32 axis — the same approach fitness/health
 * trend charts commonly use. The axis labels always show the true values,
 * so this stays honest rather than hiding the zoom.
 */
function computeYDomain(scores: number[]): [number, number] {
  const rawMin = Math.min(...scores);
  const rawMax = Math.max(...scores);
  const span = rawMax - rawMin;
  const pad = Math.max(span * 0.4, 2);

  let yMin = Math.max(0, Math.floor(rawMin - pad));
  let yMax = Math.ceil(rawMax + pad);

  const MIN_SPAN = 6;
  if (yMax - yMin < MIN_SPAN) {
    const mid = (yMax + yMin) / 2;
    yMin = Math.max(0, Math.round(mid - MIN_SPAN / 2));
    yMax = Math.round(mid + MIN_SPAN / 2);
  }
  return [yMin, yMax];
}

export default function HistoryChart({ points }: HistoryChartProps) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted">
        Scan at least twice to see your total lesion count trend over time.
      </p>
    );
  }

  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 30, left: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const [yMin, yMax] = computeYDomain(points.map((p) => p.score));
  const yRange = yMax - yMin;

  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const toXY = (i: number, score: number) => {
    const x = padding.left + i * xStep;
    const y = padding.top + plotH - ((score - yMin) / yRange) * plotH;
    return [x, y] as const;
  };

  const linePath = points
    .map((p, i) => {
      const [x, y] = toXY(i, p.score);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const [firstX] = toXY(0, points[0].score);
  const [lastX] = toXY(points.length - 1, points[points.length - 1].score);
  const baselineY = padding.top + plotH;
  const areaPath = `${linePath} L ${lastX.toFixed(1)} ${baselineY} L ${firstX.toFixed(1)} ${baselineY} Z`;

  const latestScore = points[points.length - 1].score;
  const lineColor = "#B23A48";

  const allSameDay = points.every(
    (p) => new Date(p.date).toDateString() === new Date(points[0].date).toDateString()
  );

  // 5 evenly spaced ticks across the zoomed domain (not fixed 0/25/50/75/100).
  const gridValues = Array.from({ length: 5 }, (_, i) =>
    Math.round(yMin + (yRange * i) / 4)
  );
  const gradientId = "history-chart-fill";

  // Thin out x-axis labels so they don't overlap when there are many scans —
  // show at most ~6 evenly spaced labels.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + Y-axis labels */}
        {gridValues.map((v, i) => {
          const y = padding.top + plotH - ((v - yMin) / yRange) * plotH;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#E6E0D6"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="var(--font-plex-mono), monospace"
                fill="#8A8178"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* X-axis date/time labels */}
        {points.map((p, i) => {
          if (i % labelStep !== 0 && i !== points.length - 1) return null;
          const [x] = toXY(i, p.score);
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-plex-mono), monospace"
              fill="#8A8178"
            >
              {formatXLabel(p.date, allSameDay)}
            </text>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const [x, y] = toXY(i, p.score);
          return <circle key={i} cx={x} cy={y} r="3.5" fill={lineColor} />;
        })}
      </svg>
      <p className="text-[10px] font-mono text-muted/70 text-right -mt-1">
        Scale zoomed to {yMin}–{yMax} to show day-to-day detail
      </p>
    </div>
  );
}
