import React, { useMemo } from 'react';

export default function InterpretationPanel({ interpretation, loading, depthRange, wellName, curves = [] }) {
    const cleanText = (value) => (
        typeof value === 'string'
            ? value.replace(/_/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim()
            : value
    );

    const humanize = (value) => cleanText(value);

    const formatMetric = (rawMetric) => {
        const text = cleanText(rawMetric);
        if (typeof text !== 'string' || text.length === 0) {
            return { value: '--', note: '' };
        }
        const [value, ...rest] = text.split(',');
        return {
            value: value.trim() || '--',
            note: rest.join(',').trim(),
        };
    };

    if (loading) {
        return (
            <div className="interpretation-panel">
                <div className="loading-overlay">
                    <div className="spinner" style={{ width: '30px', height: '30px', borderWidth: '3px' }} />
                    <p className="loading-text" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.05em' }}>Generating interpretation...</p>
                </div>
            </div>
        );
    }

    if (!interpretation) {
        return (
            <div className="interpretation-panel">
                <div className="empty-state" style={{ minHeight: '300px' }}>
                    <div className="empty-state-icon" style={{ fontSize: '2rem' }}>⌬</div>
                    <h3 style={{ color: 'var(--text-accent)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
                        AI Interpretation
                    </h3>
                    <p style={{ fontSize: '0.65rem', maxWidth: '300px', opacity: 0.6 }}>
                        Select curves and depth range, then click Run Interpretation.
                    </p>
                </div>
            </div>
        );
    }

    const interp = interpretation;
    const wetnessMetric = useMemo(
        () => formatMetric(interp?.geochemical_metrics?.wetness_index),
        [interp]
    );
    const balanceMetric = useMemo(
        () => formatMetric(interp?.geochemical_metrics?.balance_ratio),
        [interp]
    );
    const characterMetric = useMemo(
        () => formatMetric(interp?.geochemical_metrics?.character_ratio),
        [interp]
    );

    return (
        <div className="interpretation-panel">
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)', marginBottom: 0, position: 'relative', zIndex: 1 }}>
                <div>
                    <h3 className="card-title" style={{ fontSize: 'var(--font-md)', color: 'var(--text-accent)', letterSpacing: '0.15em', fontWeight: '800' }}>
                        AI Interpretation Summary
                    </h3>
                    <p className="card-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', opacity: 0.6 }}>
                        Well: {wellName || 'Not selected'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div className="badge" style={{ borderColor: 'var(--success)', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}>AI Assisted</div>
                    <div className="badge">{depthRange?.min?.toLocaleString()} - {depthRange?.max?.toLocaleString()} {depthRange?.unit}</div>
                </div>
            </div>

            {/* Top Analysis Bar: Haworth Ratios */}
            {interp.geochemical_metrics && (
                <div className="interpretation-metrics-grid">
                    <div className="interpretation-section" style={{ textAlign: 'center', background: 'rgba(99, 102, 241, 0.05)' }}>
                        <div style={{ fontSize: '0.6rem', opacity: 0.6, letterSpacing: '0.1em' }}>Wetness Index (Wh)</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: 'var(--text-accent)' }}>{wetnessMetric.value}</div>
                        {wetnessMetric.note && (
                            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '4px' }}>{wetnessMetric.note}</div>
                        )}
                    </div>
                    <div className="interpretation-section" style={{ textAlign: 'center', background: 'rgba(168, 85, 247, 0.05)' }}>
                        <div style={{ fontSize: '0.6rem', opacity: 0.6, letterSpacing: '0.1em' }}>Balance Ratio (Bh)</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: 'var(--accent-secondary)' }}>{balanceMetric.value}</div>
                        {balanceMetric.note && (
                            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '4px' }}>{balanceMetric.note}</div>
                        )}
                    </div>
                    <div className="interpretation-section" style={{ textAlign: 'center', background: 'rgba(59, 130, 246, 0.05)' }}>
                        <div style={{ fontSize: '0.6rem', opacity: 0.6, letterSpacing: '0.1em' }}>Character Ratio (Ch)</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: 'var(--info)' }}>{characterMetric.value}</div>
                        {characterMetric.note && (
                            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '4px' }}>{characterMetric.note}</div>
                        )}
                    </div>
                </div>
            )}

            {/* Summary Briefing */}
            {interp.summary && (
                <div className="interpretation-section" style={{ borderLeft: '4px solid var(--accent-primary)', fontSize: '0.85rem' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-accent)', marginBottom: '4px', letterSpacing: '0.2em', fontWeight: '800' }}>Summary</div>
                    <p style={{ lineHeight: '1.6', color: 'var(--text-primary)' }}>{cleanText(interp.summary)}</p>
                </div>
            )}

            <div className="interpretation-main-grid">
                {/* Left Column: Fluid Intel & Shows */}
                <div className="interpretation-column">
                    {interp.fluid_type && (
                        <div className="interpretation-section" style={{ background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, rgba(0,0,0,0) 100%)', borderTop: '2px solid var(--accent-primary)' }}>
                            <div style={{ fontSize: '0.6rem', opacity: 0.7, marginBottom: '2px' }}>Primary Fluid Type</div>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px' }}>{humanize(interp.fluid_type)}</h2>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '10px' }}>
                                {cleanText(interp.fluid_evidence)}
                            </div>
                        </div>
                    )}

                    {interp.gas_shows && interp.gas_shows.length > 0 && (
                        <div className="interpretation-section">
                            <div className="interpretation-subheading">Gas Shows</div>
                            {interp.gas_shows.map((show, i) => (
                                <div className="zone-card" key={i}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-accent)' }}>{show.depth_top} - {show.depth_bottom} {depthRange?.unit}</div>
                                        <span className="interpretation-tag tag-high">{humanize(show.fluid_probability)} probability</span>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{cleanText(show.analysis)}</div>
                                    <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{cleanText(show.geological_context)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {curves.length > 0 && (
                        <div className="interpretation-section">
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.1em' }}>Analyzed Curves</div>
                            <div className="curve-chip-wrap">
                                {curves.map((curve) => (
                                    <span key={curve} className="curve-chip">{curve}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {interp.recommendations && (
                        <div className="interpretation-section" style={{ background: 'rgba(16, 185, 129, 0.03)', borderLeft: '2px solid var(--success)' }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--success)', marginBottom: '8px', letterSpacing: '0.1em' }}>Recommendations</div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {interp.recommendations.map((r, i) => (
                                    <li key={i} style={{ fontSize: '0.72rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                        <span style={{ color: 'var(--success)' }}>▶</span>
                                        <span>{cleanText(r)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Right Column: Risk & Classification */}
                <div className="interpretation-column">
                    {/* Reservoir Risk Matrix */}
                    {interp.risk_profile && (
                        <div className="interpretation-section" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-medium)' }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--danger)', marginBottom: '10px', letterSpacing: '0.15em', fontWeight: '800' }}>Risk Profile</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.55rem', opacity: 0.5 }}>Seal Integrity</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: interp.risk_profile.seal_risk === 'High' ? 'var(--danger)' : 'var(--success)' }}>{interp.risk_profile.seal_risk}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.55rem', opacity: 0.5 }}>Saturation Risk</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: interp.risk_profile.saturation_risk === 'High' ? 'var(--danger)' : 'var(--success)' }}>{interp.risk_profile.saturation_risk}</div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.65rem', marginTop: '10px', opacity: 0.7, fontStyle: 'italic' }}>{cleanText(interp.risk_profile.technical_summary)}</div>
                        </div>
                    )}

                    {interp.zones && interp.zones.length > 0 && (
                        <div className="interpretation-section">
                            <div className="interpretation-subheading" style={{ color: 'var(--text-secondary)' }}>Zone Interpretation</div>
                            <div className="zone-list-scroll">
                                {interp.zones.map((zone, i) => (
                                    <div className="zone-card" key={i} style={{ borderLeftColor: 'var(--accent-secondary)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', opacity: 0.5 }}>Zone {i + 1} | {zone.depth_top} - {zone.depth_bottom}</div>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '800', margin: '4px 0', color: 'var(--text-accent)' }}>{humanize(zone.characterization)}</div>
                                        <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>{cleanText(zone.key_markers)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
