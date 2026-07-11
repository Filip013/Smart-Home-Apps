import React, { useState, useRef, useEffect } from 'react';

// Common interfaces
interface ChartData {
  [key: string]: any;
}

interface LineAreaChartProps {
  data: ChartData[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
  fillColor?: string;
  height?: number;
  valueSuffix?: string;
  showMinMax?: boolean;
}

export const LineAreaChart: React.FC<LineAreaChartProps> = ({
  data,
  xKey,
  yKey,
  yLabel = '',
  color = '#6366f1', // Indigo
  fillColor = 'url(#gradient-indigo)',
  height = 220,
  valueSuffix = '',
  showMinMax = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
      }
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div 
        className="custom-chart-placeholder glass" 
        style={{ 
          height, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'var(--color-text-muted)',
          fontSize: '13px',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--color-border)'
        }}
      >
        <span>No sensor history log records found.</span>
      </div>
    );
  }

  const margin = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Extract values
  const yValues = data.map((d) => Number(d[yKey]));
  const minYVal = Math.min(...yValues);
  const maxYVal = Math.max(...yValues);
  
  // Give some padding to Y axis
  const yPadding = (maxYVal - minYVal) * 0.15 || 1;
  const minY = Math.max(0, minYVal - yPadding / 2); // default min 0 unless negative
  const maxY = maxYVal + yPadding;

  // Helper to map data index & value to coordinates
  const getCoords = (index: number, val: number) => {
    const x = margin.left + (index / (data.length - 1)) * chartWidth;
    const y = height - margin.bottom - ((val - minY) / (maxY - minY)) * chartHeight;
    return { x, y };
  };

  // Generate paths
  let linePath = '';
  let areaPath = '';
  
  if (data.length > 0) {
    const points = data.map((d, i) => getCoords(i, Number(d[yKey])));
    linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    // Close the area path along the bottom axis
    const bottomY = height - margin.bottom;
    areaPath = `${linePath} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;
  }

  // Handle Mouse Hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    
    // Find closest index
    const relativeX = clientX - margin.left;
    const pct = relativeX / chartWidth;
    const approxIndex = Math.round(pct * (data.length - 1));
    const finalIndex = Math.max(0, Math.min(data.length - 1, approxIndex));
    
    setHoverIndex(finalIndex);

    // Compute coordinates for tooltip
    const coords = getCoords(finalIndex, Number(data[finalIndex][yKey]));
    setTooltipPos({
      x: coords.x,
      y: coords.y - 15,
    });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Generate Y axis ticks (4 ticks)
  const yTicks = Array.from({ length: 4 }).map((_, i) => {
    const val = minY + (i * (maxY - minY)) / 3;
    return {
      val,
      label: val.toFixed(val > 100 ? 0 : 1),
      y: height - margin.bottom - (i * chartHeight) / 3,
    };
  });

  // Generate X axis ticks (approx 6 ticks)
  const step = Math.max(1, Math.floor(data.length / 5));
  const xTicks = data
    .map((d, i) => ({ label: String(d[xKey]), index: i }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div ref={containerRef} className="custom-chart-container" style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ overflow: 'visible', cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id="gradient-indigo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="gradient-cyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="gradient-emerald" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="gradient-amber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i} className="chart-grid-line">
            <line
              x1={margin.left}
              y1={tick.y}
              x2={width - margin.right}
              y2={tick.y}
              stroke="var(--color-grid-line)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={margin.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-text-muted)"
              fontFamily="Inter"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={fillColor} />

        {/* Line stroke */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X Axis labels */}
        {xTicks.map((tick, i) => {
          const coords = getCoords(tick.index, minY);
          return (
            <text
              key={i}
              x={coords.x}
              y={height - 10}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-text-muted)"
              fontFamily="Inter"
            >
              {tick.label}
            </text>
          );
        })}

        {/* Min/Max indicators */}
        {showMinMax && data.length > 0 && (
          <>
            {/* Max Point indicator */}
            {(() => {
              const maxIdx = yValues.indexOf(maxYVal);
              const coords = getCoords(maxIdx, maxYVal);
              return (
                <g>
                  <circle cx={coords.x} cy={coords.y} r={3} fill={color} />
                  <text
                    x={coords.x}
                    y={coords.y - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="bold"
                    fill="var(--color-accent-max)"
                    fontFamily="Inter"
                  >
                    Peak: {maxYVal.toFixed(1)}{valueSuffix}
                  </text>
                </g>
              );
            })()}
          </>
        )}

        {/* Hover elements */}
        {hoverIndex !== null && (
          <g>
            {/* Vertical hover line */}
            <line
              x1={tooltipPos.x}
              y1={margin.top}
              x2={tooltipPos.x}
              y2={height - margin.bottom}
              stroke="var(--color-text-muted)"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            {/* Interactive dot */}
            <circle
              cx={tooltipPos.x}
              cy={getCoords(hoverIndex, Number(data[hoverIndex][yKey])).y}
              r={6}
              fill={color}
              stroke="var(--color-card-bg)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && (
        <div
          className="chart-tooltip glass"
          style={{
            position: 'absolute',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 50}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 10,
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
            {data[hoverIndex][xKey]}
          </span>
          <span style={{ color: color, fontWeight: 700 }}>
            {yLabel ? `${yLabel}: ` : ''}
            {Number(data[hoverIndex][yKey]).toFixed(2)}
            {valueSuffix}
          </span>
        </div>
      )}
    </div>
  );
};

// --- BAR CHART COMPONENT ---
interface BarChartProps {
  data: ChartData[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
  height?: number;
  valueSuffix?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  xKey,
  yKey,
  yLabel = '',
  color = '#06b6d4', // Cyan
  height = 220,
  valueSuffix = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
      }
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div 
        className="custom-chart-placeholder glass" 
        style={{ 
          height, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'var(--color-text-muted)',
          fontSize: '13px',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--color-border)'
        }}
      >
        <span>No power consumption log records found.</span>
      </div>
    );
  }

  const margin = { top: 20, right: 15, bottom: 35, left: 45 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Math sizing
  const yValues = data.map((d) => Number(d[yKey]));
  const maxY = Math.max(...yValues) * 1.15 || 1;

  const barWidth = Math.max(2, (chartWidth / data.length) * 0.7);
  const barGap = (chartWidth / data.length) * 0.3;

  const getCoords = (index: number, val: number) => {
    const x = margin.left + index * (barWidth + barGap) + barGap / 2;
    const y = height - margin.bottom - (val / maxY) * chartHeight;
    const h = (val / maxY) * chartHeight;
    return { x, y, h };
  };

  const handleMouseMove = (index: number, _e: React.MouseEvent<SVGRectElement>) => {
    setHoverIndex(index);
    const coords = getCoords(index, Number(data[index][yKey]));
    setTooltipPos({
      x: coords.x + barWidth / 2,
      y: coords.y - 10,
    });
  };

  // Generate ticks
  const yTicks = Array.from({ length: 4 }).map((_, i) => {
    const val = (i * maxY) / 3;
    return {
      val,
      label: val.toFixed(val > 10 ? 0 : 1),
      y: height - margin.bottom - (i * chartHeight) / 3,
    };
  });

  const step = Math.max(1, Math.floor(data.length / 6));
  const xTicks = data
    .map((d, i) => ({ label: String(d[xKey]), index: i }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div ref={containerRef} className="custom-chart-container" style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        style={{ overflow: 'visible' }}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i} className="chart-grid-line">
            <line
              x1={margin.left}
              y1={tick.y}
              x2={width - margin.right}
              y2={tick.y}
              stroke="var(--color-grid-line)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={margin.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-text-muted)"
              fontFamily="Inter"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const val = Number(d[yKey]);
          const { x, y, h } = getCoords(i, val);
          const isHovered = hoverIndex === i;

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, h)} // Minimum 2px height
              rx={Math.min(4, barWidth / 2)} // rounded corners
              fill={isHovered ? 'var(--color-accent)' : color}
              fillOpacity={isHovered ? 1 : 0.85}
              style={{ transition: 'fill 0.1s ease, fill-opacity 0.1s ease', cursor: 'pointer' }}
              onMouseMove={(e) => handleMouseMove(i, e)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          );
        })}

        {/* X Axis labels */}
        {xTicks.map((tick, i) => {
          const coords = getCoords(tick.index, 0);
          return (
            <text
              key={i}
              x={coords.x + barWidth / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-text-muted)"
              fontFamily="Inter"
            >
              {tick.label}
            </text>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && (
        <div
          className="chart-tooltip glass"
          style={{
            position: 'absolute',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 45}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 10,
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
            {data[hoverIndex][xKey]}
          </span>
          <span style={{ color: color, fontWeight: 700 }}>
            {yLabel ? `${yLabel}: ` : ''}
            {Number(data[hoverIndex][yKey]).toFixed(2)}
            {valueSuffix}
          </span>
        </div>
      )}
    </div>
  );
};

// --- DONUT BREAKDOWN CHART ---
interface DonutData {
  name: string;
  percentage: number;
  kwh: number;
  color: string;
}

interface DonutBreakdownChartProps {
  data: DonutData[];
  size?: number;
}

export const DonutBreakdownChart: React.FC<DonutBreakdownChartProps> = ({
  data,
  size = 200,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const radius = size * 0.35;
  const strokeWidth = size * 0.13;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate cumulative percentages
  let accumulatedAngle = -90; // Start from top

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '24px', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(0deg)' }}>
          {data.map((item, idx) => {
            const angle = (item.percentage / 100) * 360;
            const strokeDashoffset = circumference - (item.percentage / 100) * circumference;
            const currentRotation = accumulatedAngle;
            accumulatedAngle += angle;

            const isHovered = hoveredIdx === idx;

            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transform: `rotate(${currentRotation}deg)`,
                  transformOrigin: `${center}px ${center}px`,
                  transition: 'stroke-width 0.2s, stroke-opacity 0.2s',
                  cursor: 'pointer',
                }}
                strokeOpacity={hoveredIdx !== null && !isHovered ? 0.6 : 1}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}

          {/* Inner circle text */}
          <circle cx={center} cy={center} r={radius - strokeWidth / 2 - 2} fill="var(--color-card-bg)" />
        </svg>

        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {hoveredIdx !== null ? (
            <>
              <div style={{ fontSize: '20px', fontWeight: 800, color: data[hoveredIdx].color, fontFamily: 'Outfit' }}>
                {data[hoveredIdx].percentage}%
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data[hoveredIdx].name}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Inter' }}>
                Total usage
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'Outfit' }}>
                100%
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: '1', minWidth: '180px' }}>
        {data.map((item, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: isHovered ? 'var(--color-hover-bg)' : 'transparent',
                transition: 'background-color 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  backgroundColor: item.color,
                  boxShadow: `0 0 8px ${item.color}40`,
                }}
              />
              <div style={{ flex: 1, fontSize: '13px', color: 'var(--color-text)', display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter' }}>
                <span style={{ fontWeight: isHovered ? 600 : 400 }}>{item.name}</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  {item.kwh} kWh ({item.percentage}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
