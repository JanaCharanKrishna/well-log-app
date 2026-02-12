import React, { useMemo, useState, useRef, useEffect } from 'react';
import Plot from 'react-plotly.js';

// Color palette for curves
const CURVE_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
    '#a855f7', '#f43f5e', '#d946ef', '#84cc16', '#0ea5e9',
    '#fbbf24', '#fb923c', '#34d399', '#2dd4bf', '#818cf8',
];

// Curves that usually look better in log scale
const LOG_CURVES = new Set([
    'TOTAL_GAS', 'HC1', 'HC2', 'HC3', 'HC4', 'HC5',
    'HC6', 'HC7', 'HC8', 'HC9', 'HC10', 'C1', 'C2', 'C3',
    'NormC1', 'NormC4', 'NormC7', 'RAW_NAPH'
]);

const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};

export default function WellLogChart({ data, curves, wellName, depthUnit, compact = false }) {
    const chartRootRef = useRef(null);
    const [useLogScale, setUseLogScale] = useState(false);
    const [viewMode, setViewMode] = useState('2d');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [plotRenderKey, setPlotRenderKey] = useState(0);

    useEffect(() => {
        const onFullscreenChange = () => {
            if (typeof document === 'undefined') return;
            setIsFullscreen(Boolean(document.fullscreenElement));
        };
        if (typeof document !== 'undefined') {
            document.addEventListener('fullscreenchange', onFullscreenChange);
        }
        return () => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('fullscreenchange', onFullscreenChange);
            }
        };
    }, []);

    const toggleFullscreen = async () => {
        if (!chartRootRef.current || typeof document === 'undefined') return;
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await chartRootRef.current.requestFullscreen();
            }
        } catch {
            // Ignore fullscreen permission or browser limitations.
        }
    };

    // Check if we have gas data to auto-suggest log scale
    const hasGasCurves = useMemo(() => {
        return curves.some(c => LOG_CURVES.has(c));
    }, [curves]);

    const rowsWithDepth = useMemo(() => {
        if (!Array.isArray(data) || data.length === 0) return [];
        return data
            .map((row) => {
                const depth = toFiniteNumber(row?.depth);
                if (depth == null) return null;
                return { row, depth };
            })
            .filter(Boolean);
    }, [data]);

    const depthExtent = useMemo(() => {
        if (!rowsWithDepth.length) return null;

        let minDepth = Number.POSITIVE_INFINITY;
        let maxDepth = Number.NEGATIVE_INFINITY;

        for (const { depth } of rowsWithDepth) {
            if (depth < minDepth) minDepth = depth;
            if (depth > maxDepth) maxDepth = depth;
        }

        if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth)) return null;
        return { min: minDepth, max: maxDepth };
    }, [rowsWithDepth]);

    const dataSignature = useMemo(() => {
        if (!rowsWithDepth.length) return 'empty';
        const first = rowsWithDepth[0].depth;
        const last = rowsWithDepth[rowsWithDepth.length - 1].depth;
        return `${rowsWithDepth.length}:${first}:${last}`;
    }, [rowsWithDepth]);

    const plotKey = useMemo(
        () => `${viewMode}:${useLogScale ? 1 : 0}:${curves.join('|')}:${dataSignature}:${plotRenderKey}`,
        [viewMode, useLogScale, curves, dataSignature, plotRenderKey]
    );

    const plotData = useMemo(() => {
        if (!rowsWithDepth.length || !curves.length) return [];

        if (viewMode === '3d') {
            const maxPointsPerCurve = 1800;
            const stride = Math.max(1, Math.ceil(rowsWithDepth.length / maxPointsPerCurve));
            const sampledData = rowsWithDepth.filter((_, index) => index % stride === 0);
            const trackSpacing = 1.5;

            return curves.map((curve, i) => {
                const rawValues = sampledData.map(({ row }) => toFiniteNumber(row[curve]));
                const numericValues = rawValues.filter((value) => value != null);
                const min = numericValues.length ? Math.min(...numericValues) : 0;
                const max = numericValues.length ? Math.max(...numericValues) : 1;
                const span = max - min || 1;

                const normalizedX = rawValues.map((value) => (
                    value != null ? ((value - min) / span) + (i * trackSpacing) : null
                ));

                return {
                    type: 'scatter3d',
                    mode: 'lines',
                    name: curve,
                    x: normalizedX,
                    y: sampledData.map(({ depth }) => depth),
                    z: sampledData.map(() => i),
                    customdata: rawValues,
                    line: {
                        color: CURVE_COLORS[i % CURVE_COLORS.length],
                        width: 4,
                    },
                    hovertemplate:
                        `<b>${curve}</b><br>Depth: %{y:.2f} ${depthUnit}<br>Value: %{customdata:.4f}<extra></extra>`,
                };
            });
        }

        const depths = rowsWithDepth.map(({ depth }) => depth);

        return curves.map((curve, i) => {
            const isLog = useLogScale || (hasGasCurves && LOG_CURVES.has(curve));

            const values = rowsWithDepth.map(({ row }) => {
                const value = toFiniteNumber(row[curve]);
                if (value == null) return null;
                if (isLog && value <= 0) return null;
                return value;
            });

            return {
                x: values,
                y: depths,
                type: 'scatter',
                mode: 'lines',
                name: curve,
                line: {
                    color: CURVE_COLORS[i % CURVE_COLORS.length],
                    width: 1.5,
                },
                xaxis: `x${i === 0 ? '' : i + 1}`,
                yaxis: 'y',
                hovertemplate: `<b>${curve}</b><br>Depth: %{y} ${depthUnit}<br>Value: %{x:.4f}<extra></extra>`,
            };
        });
    }, [rowsWithDepth, curves, depthUnit, useLogScale, hasGasCurves, viewMode]);

    const layout = useMemo(() => {
        const n = curves.length;
        if (n === 0) return {};

        if (viewMode === '3d') {
            return {
                autosize: true,
                scene: {
                    xaxis: {
                        title: '',
                        showgrid: false,
                        showticklabels: false,
                        zeroline: false,
                        showbackground: false,
                    },
                    yaxis: {
                        title: `DEPTH [${depthUnit}]`,
                        autorange: false,
                        range: depthExtent ? [depthExtent.max, depthExtent.min] : undefined,
                        showgrid: false,
                        zeroline: false,
                        showbackground: false,
                    },
                    zaxis: {
                        title: '',
                        showgrid: false,
                        showticklabels: false,
                        zeroline: false,
                        showbackground: false,
                    },
                    camera: {
                        eye: { x: 1.65, y: 1.7, z: 0.9 },
                    },
                    aspectmode: 'manual',
                    aspectratio: { x: 1.9, y: 1.6, z: 0.5 },
                    bgcolor: 'rgba(0,0,0,0)',
                },
                hoverlabel: {
                    bgcolor: 'rgba(7, 16, 33, 0.96)',
                    bordercolor: '#22d3ee',
                    font: { family: 'var(--font-mono)', size: 12, color: '#e2e8f0' },
                },
                plot_bgcolor: 'rgba(0,0,0,0.2)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                margin: { t: 20, b: 16, l: 20, r: 20 },
                showlegend: false,
                dragmode: 'turntable',
                uirevision: `welllog-3d-${dataSignature}`,
                font: { family: 'var(--font-family)', color: 'var(--text-secondary)' },
            };
        }

        const gap = 0.005; // Extremely tight gap for high density
        const totalGap = gap * (n - 1);
        const width = (1 - totalGap) / n;

        const xaxes = {};
        curves.forEach((curve, i) => {
            const isLog = useLogScale || (hasGasCurves && LOG_CURVES.has(curve));
            const key = i === 0 ? 'xaxis' : `xaxis${i + 1}`;

            xaxes[key] = {
                title: {
                    text: `<b>${curve}</b>`,
                    font: {
                        family: 'var(--font-mono)',
                        size: 10,
                        color: CURVE_COLORS[i % CURVE_COLORS.length]
                    },
                    standoff: 8
                },
                domain: [i * (width + gap), i * (width + gap) + width],
                side: 'top',
                type: isLog ? 'log' : 'linear',
                tickfont: { family: 'var(--font-mono)', size: 9, color: 'var(--text-muted)' },
                showgrid: false,
                showline: true,
                linecolor: 'rgba(255,255,255,0.14)',
                zeroline: false,
                automargin: true,
                fixedrange: false,
            };
        });

        return {
            autosize: true,
            ...xaxes,
            yaxis: {
                title: {
                    text: `DEPTH [${depthUnit}]`,
                    font: { family: 'var(--font-mono)', size: 11, color: 'var(--text-secondary)' },
                    standoff: 20
                },
                autorange: false,
                range: depthExtent ? [depthExtent.max, depthExtent.min] : undefined,
                tickfont: { family: 'var(--font-mono)', size: 10, color: 'var(--text-muted)' },
                showgrid: false,
                linecolor: 'rgba(255,255,255,0.15)',
                showline: true,
                zeroline: false,
            },
            plot_bgcolor: 'rgba(0,0,0,0.2)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            margin: { t: 56, b: 34, l: 64, r: 14 },
            hoverlabel: {
                bgcolor: 'rgba(7, 16, 33, 0.96)',
                bordercolor: '#22d3ee',
                font: { family: 'var(--font-mono)', size: 12, color: '#e2e8f0' },
            },
            showlegend: false,
            hovermode: 'closest',
            hoverdistance: 20,
            dragmode: 'zoom',
            uirevision: `welllog-2d-${dataSignature}:${curves.join('|')}:${useLogScale ? 1 : 0}`,
            font: { family: 'var(--font-family)', color: 'var(--text-secondary)' },
            shapes: [
                // Technical separator lines between tracks
                ...curves.slice(0, -1).map((_, i) => ({
                    type: 'line',
                    x0: (i + 1) * (width + gap) - (gap / 2),
                    x1: (i + 1) * (width + gap) - (gap / 2),
                    y0: 0,
                    y1: 1,
                    xref: 'paper',
                    yref: 'paper',
                    line: { color: 'rgba(255,255,255,0.2)', width: 1.5 }
                }))
            ]
        };
    }, [curves, depthUnit, useLogScale, hasGasCurves, viewMode, depthExtent, dataSignature]);

    if (!rowsWithDepth.length || !curves.length) {
        return (
            <div className="chart-container">
                <div className="chart-placeholder">
                    <div className="chart-placeholder-icon" style={{ fontSize: '2.5rem' }}>⌬</div>
                    <h3 style={{ letterSpacing: '0.05em', color: 'var(--text-accent)', fontSize: '0.85rem' }}>No chart data yet</h3>
                    <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Select curves, set a depth range, then click Load Data.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`chart-container ${compact ? 'compact' : ''}`} ref={chartRootRef}>
            <div className="card-header" style={{ padding: '0 0 var(--space-3) 0', marginBottom: 0 }}>
                <div>
                    <h3 className="card-title" style={{ fontSize: compact ? '0.72rem' : '0.8rem' }}>
                        {compact ? 'Chart Context' : 'Well Log Chart'}
                    </h3>
                    {!compact && (
                        <p className="card-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>
                            Well: {wellName} | Curves: {curves.length} | Points: {rowsWithDepth.length.toLocaleString()}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {!compact && (
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                                const headers = ['depth', ...curves].join(',');
                                const rows = rowsWithDepth.map(({ row, depth }) => [depth, ...curves.map(c => row[c] ?? '')].join(','));
                                const csvContent = [headers, ...rows].join('\n');
                                const blob = new Blob([csvContent], { type: 'text/csv' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${wellName}_data_export.csv`;
                                a.click();
                                window.URL.revokeObjectURL(url);
                            }}
                            title="Export current view to CSV"
                        >
                            Export CSV
                        </button>
                    )}
                    <button
                        className={`btn btn-sm ${viewMode === '3d' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode((prev) => (prev === '2d' ? '3d' : '2d'))}
                        title="Toggle 2D/3D view"
                    >
                        View: {viewMode === '2d' ? '2D' : '3D'}
                    </button>
                    <button
                        className={`btn btn-sm ${useLogScale ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setUseLogScale(!useLogScale)}
                        title="Toggle Log Scale for all curves"
                        disabled={viewMode === '3d'}
                    >
                        Log Scale: {useLogScale ? 'On' : 'Off'}
                    </button>
                    <button
                        className={`btn btn-sm ${isFullscreen ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={toggleFullscreen}
                        title="View chart in full screen"
                    >
                        {isFullscreen ? 'Exit Full' : 'Full Screen'}
                    </button>
                    <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setPlotRenderKey((prev) => prev + 1)}
                        title="Clear hover/zoom and reset chart view"
                    >
                        Clear View
                    </button>
                </div>
            </div>
            <div className="chart-plot-wrap">
                <Plot
                    key={plotKey}
                    data={plotData}
                    layout={layout}
                    config={{
                        responsive: true,
                        displayModeBar: true,
                        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                        displaylogo: false,
                        scrollZoom: true,
                        doubleClick: 'reset+autosize',
                        toImageButtonOptions: {
                            format: 'png',
                            filename: `${wellName}_log_chart`,
                            width: 1600,
                            height: 900,
                        },
                    }}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler
                />
            </div>
        </div>
    );
}
