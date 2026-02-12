import React, { useState, useMemo } from 'react';

export default function CurveSelector({ curves, selectedCurves, onSelectionChange }) {
    const [openCategories, setOpenCategories] = useState(new Set(['Hydrocarbons']));
    const [search, setSearch] = useState('');

    const [isExpanded, setIsExpanded] = useState(true);

    // Group curves by category and sort them (selected first)
    const categories = useMemo(() => {
        const groups = {};
        (curves || []).forEach((c) => {
            const cat = c.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(c);
        });

        const priority = ['Hydrocarbons', 'Drilling', 'Composition', 'Ratios', 'Pixler Ratios', 'Aromatics', 'Calculated'];

        // Sort both categories and items within them
        return Object.entries(groups)
            .map(([cat, items]) => {
                // Sort items within category: selected first, then alphabetical
                const sortedItems = [...items].sort((a, b) => {
                    const selA = selectedCurves.has(a.mnemonic);
                    const selB = selectedCurves.has(b.mnemonic);
                    if (selA && !selB) return -1;
                    if (!selA && selB) return 1;
                    return a.mnemonic.localeCompare(b.mnemonic);
                });
                return [cat, sortedItems];
            })
            .sort(([a, itemsA], [b, itemsB]) => {
                // Prioritize categories that have at least one selected curve
                const hasSelectedA = itemsA.some(c => selectedCurves.has(c.mnemonic));
                const hasSelectedB = itemsB.some(c => selectedCurves.has(c.mnemonic));

                if (hasSelectedA && !hasSelectedB) return -1;
                if (!hasSelectedA && hasSelectedB) return 1;

                // Priority-based sorting
                const ia = priority.indexOf(a);
                const ib = priority.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;

                // Alphabetical sorting
                return a.localeCompare(b);
            });
    }, [curves, selectedCurves]);

    // Filter by search
    const filteredCategories = useMemo(() => {
        if (!search.trim()) return categories;
        const q = search.toLowerCase();
        return categories
            .map(([cat, items]) => [cat, items.filter((c) => c.mnemonic.toLowerCase().includes(q))])
            .filter(([, items]) => items.length > 0);
    }, [categories, search]);

    const toggleCategory = (cat) => {
        const next = new Set(openCategories);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        setOpenCategories(next);
    };

    const toggleCurve = (mnemonic) => {
        const next = new Set(selectedCurves);
        if (next.has(mnemonic)) next.delete(mnemonic);
        else next.add(mnemonic);
        onSelectionChange(next);
    };

    const selectAll = (catCurves) => {
        const next = new Set(selectedCurves);
        catCurves.forEach((c) => next.add(c.mnemonic));
        onSelectionChange(next);
    };

    const deselectAll = (catCurves) => {
        const next = new Set(selectedCurves);
        catCurves.forEach((c) => next.delete(c.mnemonic));
        onSelectionChange(next);
    };

    return (
        <div className="card card-tight" style={{ transition: 'all 0.3s ease' }}>
            <div
                className="card-header"
                style={{ marginBottom: isExpanded ? 'var(--space-2)' : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{isExpanded ? '▼' : '▶'}</span>
                    <h3 className="card-title" style={{ fontSize: '0.8rem' }}>Curve Selection</h3>
                </div>
                {!isExpanded && (
                    <span className="badge" style={{ fontSize: '0.6rem' }}>{selectedCurves.size} selected</span>
                )}
            </div>

            {isExpanded && (
                <>
                    <input
                        className="input"
                        type="text"
                        placeholder="Search curves..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        id="curve-search"
                        autoFocus
                        style={{ marginBottom: 'var(--space-2)', fontSize: '0.65rem', padding: '6px 12px', fontFamily: 'var(--font-mono)' }}
                    />

                    <div className="curve-selector" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {filteredCategories.map(([cat, items]) => (
                            <div className="curve-category" key={cat} style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '4px' }}>
                                    <button
                                        className="curve-category-header"
                                        onClick={() => toggleCategory(cat)}
                                        style={{ padding: '2px 8px', fontSize: '0.6rem', flex: 1, textAlign: 'left', minWidth: 0 }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                            <span className={`arrow ${openCategories.has(cat) ? 'open' : ''}`} style={{ fontSize: '0.5rem', opacity: 0.5 }}>▶</span>
                                            <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{cat.toUpperCase()}</span>
                                            <span style={{ fontSize: '0.55rem', opacity: 0.4 }}>[{items.length}]</span>
                                        </span>
                                    </button>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            onClick={(e) => { e.stopPropagation(); selectAll(items); }}
                                            style={{ fontSize: '0.5rem', padding: '0 4px', height: '16px' }}
                                        >
                                            All
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            onClick={(e) => { e.stopPropagation(); deselectAll(items); }}
                                            style={{ fontSize: '0.5rem', padding: '0 4px', height: '16px' }}
                                        >
                                            None
                                        </button>
                                    </div>
                                </div>

                                {openCategories.has(cat) && (
                                    <div className="curve-items" style={{ paddingLeft: '12px', marginTop: '4px', borderLeft: '1px solid var(--border-subtle)', marginLeft: '6px' }}>
                                        {items.map((c) => (
                                            <div className="curve-item" key={c.mnemonic} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <input
                                                    type="checkbox"
                                                    id={`curve-${c.mnemonic}`}
                                                    checked={selectedCurves.has(c.mnemonic)}
                                                    onChange={() => toggleCurve(c.mnemonic)}
                                                    style={{ width: '12px', height: '12px', accentColor: 'var(--accent-primary)' }}
                                                />
                                                <label
                                                    htmlFor={`curve-${c.mnemonic}`}
                                                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', cursor: 'pointer', flex: 1, color: selectedCurves.has(c.mnemonic) ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                                >
                                                    {c.mnemonic}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
