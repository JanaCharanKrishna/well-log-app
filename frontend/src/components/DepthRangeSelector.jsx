import React from 'react';

export default function DepthRangeSelector({ depthMin, depthMax, wellMin, wellMax, unit, onChange, horizontal = false }) {
    if (horizontal) {
        return (
            <div className="control-group">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="control-label">Depth Interval</span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>
                        {((depthMax || wellMax) - (depthMin || wellMin)).toLocaleString()} {unit}
                    </span>
                </div>

                <div className="depth-inputs-row">
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', opacity: 0.5, pointerEvents: 'none', color: 'var(--text-muted)' }}>TOP</span>
                        <input
                            className="depth-input-compact"
                            type="number"
                            value={depthMin ?? ''}
                            onChange={(e) => onChange(parseFloat(e.target.value) || wellMin, depthMax)}
                            placeholder={wellMin}
                            style={{ paddingLeft: '32px' }}
                        />
                    </div>
                    <span style={{ opacity: 0.3 }}>—</span>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', opacity: 0.5, pointerEvents: 'none', color: 'var(--text-muted)' }}>BTM</span>
                        <input
                            className="depth-input-compact"
                            type="number"
                            value={depthMax ?? ''}
                            onChange={(e) => onChange(depthMin, parseFloat(e.target.value) || wellMax)}
                            placeholder={wellMax}
                            style={{ paddingLeft: '32px' }}
                        />
                    </div>
                    <button
                        className="btn btn-sm btn-icon"
                        onClick={() => onChange(wellMin, wellMax)}
                        title="Reset Depth Range"
                        style={{ padding: '4px', opacity: 0.7 }}
                    >
                        ↺
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="card card-tight">
            <div className="card-header" style={{ marginBottom: 'var(--space-3)' }}>
                <div>
                    <h3 className="card-title" style={{ fontSize: '0.75rem' }}>Depth Range</h3>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                        Bounds: {wellMin} - {wellMax} {unit}
                    </p>
                </div>
                <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => onChange(wellMin, wellMax)}
                    style={{ fontSize: '0.6rem', padding: '1px 8px' }}
                >
                    Reset
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                    <label className="label" style={{ fontSize: '0.6rem' }}>Top Depth</label>
                    <input
                        className="input"
                        type="number"
                        value={depthMin ?? ''}
                        onChange={(e) => onChange(parseFloat(e.target.value) || wellMin, depthMax)}
                        style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', padding: '4px 8px' }}
                    />
                </div>
                <div>
                    <label className="label" style={{ fontSize: '0.6rem' }}>Bottom Depth</label>
                    <input
                        className="input"
                        type="number"
                        value={depthMax ?? ''}
                        onChange={(e) => onChange(depthMin, parseFloat(e.target.value) || wellMax)}
                        style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', padding: '4px 8px' }}
                    />
                </div>
            </div>

            <div style={{
                marginTop: 'var(--space-3)',
                padding: '4px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '2px',
                fontSize: '0.65rem',
                color: 'var(--text-accent)',
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                border: '1px solid var(--border-subtle)'
            }}>
                Interval: {((depthMax || wellMax) - (depthMin || wellMin)).toLocaleString()} {unit}
            </div>
        </div>
    );
}
