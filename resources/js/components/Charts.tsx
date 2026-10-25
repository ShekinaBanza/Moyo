import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState } from '@/components/ui';

interface Props {
    title: string;
    unit: string;
    period: string;
    data: Record<string, string | number | null>[];
    xKey: string;
    yKey: string;
    kind?: 'bar' | 'line';
    emptyText: string;
    emptyAction?: ReactNode;
    formatY?: (v: number) => string;
    formatX?: (v: string) => string;
    yDomain?: [number | 'auto', number | 'auto'];
}

/**
 * Chart of REAL recorded values only. Always shows title, unit and period, an empty state
 * without data, and a hidden data table for screen readers.
 */
export function ChartCard({ title, unit, period, data, xKey, yKey, kind = 'bar', emptyText, emptyAction, formatY = String, formatX = String, yDomain }: Props) {
    const points = data.filter((d) => d[yKey] !== null && d[yKey] !== undefined);
    return (
        <Card className="relative overflow-hidden">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
                <h3 className="font-bold">{title}</h3>
                <p className="text-xs text-muted">
                    {unit} · {period}
                </p>
            </div>
            {points.length === 0 ? (
                <EmptyState title="Pas encore de données" text={emptyText} action={emptyAction} />
            ) : (
                <>
                    <div className="h-56 w-full" role="img" aria-label={`${title}, ${points.length} valeurs sur la période ${period}`}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            {kind === 'bar' ? (
                                <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey={xKey} tickFormatter={formatX} tick={{ fontSize: 11 }} minTickGap={16} />
                                    <YAxis tickFormatter={(v: number) => formatY(v)} tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip formatter={(v) => [formatY(Number(v)), title]} labelFormatter={(l) => formatX(String(l))} />
                                    <Bar dataKey={yKey} fill="#0f766e" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            ) : (
                                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey={xKey} tickFormatter={formatX} tick={{ fontSize: 11 }} minTickGap={16} />
                                    <YAxis tickFormatter={(v: number) => formatY(v)} tick={{ fontSize: 11 }} width={48} domain={yDomain ?? ['auto', 'auto']} />
                                    <Tooltip formatter={(v) => [formatY(Number(v)), title]} labelFormatter={(l) => formatX(String(l))} />
                                    <Line type="monotone" dataKey={yKey} stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                    <div className="sr-only">
                    <table>
                        <caption>
                            {title} ({unit}), {period}
                        </caption>
                        <tbody>
                            {points.map((p, i) => (
                                <tr key={i}>
                                    <th scope="row">{formatX(String(p[xKey]))}</th>
                                    <td>{formatY(Number(p[yKey]))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </>
            )}
        </Card>
    );
}
