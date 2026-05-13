import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { ChartDayData } from '../types';
import { fmtCurrency, fmtDate } from '../data/calculations';

const BOXES_COLOR = '#22d3ee';

interface PerformanceTrendChartProps {
  data: ChartDayData[];
  onSelectDate: (date: string) => void;
  height?: number;
  showBoxes?: boolean;
  showGoal?: boolean;
}

function perfColor(pct: number): string {
  if (pct >= 100) return '#22c55e';
  if (pct >= 75) return '#f59e0b';
  return '#ef4444';
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartDayData }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-navy-600 border border-navy-400 rounded-xl p-3 text-xs space-y-1 shadow-lg">
      <p className="font-bold text-ink-primary">{fmtDate(d.date)}</p>
      <p className="text-ink-secondary">
        Attachments:{' '}
        <span className="font-semibold text-ink-primary">{fmtCurrency(d.attachment)}</span>
      </p>
      <p className="text-ink-secondary">
        Goal:{' '}
        <span className="font-semibold text-signal-red">{fmtCurrency(d.goal)}</span>
      </p>
      <p className="text-ink-secondary">
        Boxes:{' '}
        <span className="font-semibold" style={{ color: BOXES_COLOR }}>{d.boxes}</span>
      </p>
      <p className="text-ink-secondary">
        % to Goal:{' '}
        <span
          className={`font-bold ${
            d.pctToGoal >= 100
              ? 'text-signal-green'
              : d.pctToGoal >= 75
              ? 'text-signal-amber'
              : 'text-signal-red'
          }`}
        >
          {d.pctToGoal}%
        </span>
      </p>
    </div>
  );
}

export function PerformanceTrendChart({
  data,
  onSelectDate,
  height = 260,
  showBoxes = true,
  showGoal = true,
}: PerformanceTrendChartProps) {
  if (data.length === 0) return null;

  const tickInterval = Math.max(0, Math.floor(data.length / 10) - 1);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis
            dataKey="dayLabel"
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            yAxisId="att"
            orientation="left"
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            width={45}
          />
          {showBoxes && (
            <YAxis
              yAxisId="boxes"
              orientation="right"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
          )}
          <Tooltip content={<ChartTooltip />} />
          <Bar
            yAxisId="att"
            dataKey="attachment"
            radius={[3, 3, 0, 0]}
            cursor="pointer"
            maxBarSize={40}
            onClick={(entry: unknown) => {
              const d = entry as { date?: string };
              if (d?.date) onSelectDate(d.date);
            }}
            background={(bgProps: Record<string, unknown>) => {
              const entry = data[bgProps.index as number];
              if (!entry?.isSelected) return <rect width={0} height={0} />;
              return (
                <rect
                  x={bgProps.x as number}
                  y={bgProps.y as number}
                  width={bgProps.width as number}
                  height={bgProps.height as number}
                  fill="#7c3aed"
                  fillOpacity={0.15}
                  rx={3}
                />
              );
            }}
          >
            {data.map(entry => (
              <Cell key={entry.date} fill={perfColor(entry.pctToGoal)} />
            ))}
          </Bar>
          {showGoal && (
            <Line
              yAxisId="att"
              type="monotone"
              dataKey="goal"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={false}
            />
          )}
          {showBoxes && (
            <Line
              yAxisId="boxes"
              type="monotone"
              dataKey="boxes"
              stroke={BOXES_COLOR}
              strokeWidth={2}
              dot={{ fill: BOXES_COLOR, r: 2 }}
              activeDot={{ r: 4 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-3 flex-wrap text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-signal-green inline-block" /> ≥100%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-signal-amber inline-block" /> 75–99%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-signal-red inline-block" /> &lt;75%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 border-t-2 border-dashed border-signal-red" /> Goal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 inline-block" style={{ backgroundColor: BOXES_COLOR }} /> Boxes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#7c3aed] opacity-30 inline-block" /> Selected Day
        </span>
      </div>
    </div>
  );
}
