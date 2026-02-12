import React, { useState, useEffect, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import CurveSelector from './components/CurveSelector';
import DepthRangeSelector from './components/DepthRangeSelector';
import WellLogChart from './components/WellLogChart';
import InterpretationPanel from './components/InterpretationPanel';
import ChatBot from './components/ChatBot';
import { listWells, getWell, getWellData, interpretWell, deleteWell } from './services/api';

const UI_STATE_STORAGE_KEY = 'well-log-ui-state-v1';
const VALID_TABS = new Set(['chart', 'interpretation', 'chat']);

const loadPersistedUiState = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
};

export default function App() {
    const restoredStateRef = useRef(loadPersistedUiState());
    const persistEnabledRef = useRef(false);
    const hasTriedRestoreRef = useRef(false);
    const initialActiveTab = restoredStateRef.current?.activeTab;

    // ── State ──
    const [wells, setWells] = useState([]);
    const [wellsLoaded, setWellsLoaded] = useState(false);
    const [selectedWellId, setSelectedWellId] = useState(null);
    const [wellDetail, setWellDetail] = useState(null);
    const [selectedCurves, setSelectedCurves] = useState(new Set());
    const [depthMin, setDepthMin] = useState(null);
    const [depthMax, setDepthMax] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [chartCurves, setChartCurves] = useState([]);
    const [interpretation, setInterpretation] = useState(null);
    const [interpLoading, setInterpLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(VALID_TABS.has(initialActiveTab) ? initialActiveTab : 'chart');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showCurveSelector, setShowCurveSelector] = useState(false);
    const curveSelectorRef = useRef(null);

    // ── Keyboard Shortcuts & Click Outside ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setShowCurveSelector(false);
            }
            if (e.altKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                setShowCurveSelector(prev => !prev);
            }
        };

        const handleClickOutside = (e) => {
            if (curveSelectorRef.current && !curveSelectorRef.current.contains(e.target)) {
                setShowCurveSelector(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // ── Logs ──
    const [logs, setLogs] = useState([{ time: new Date().toLocaleTimeString(), msg: 'Application started', type: 'info' }]);
    const addLog = useCallback((msg, type = 'info') => {
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 50));
    }, []);

    useEffect(() => {
        if (wellDetail) addLog(`Loaded well: ${wellDetail.well_name}`, 'success');
    }, [wellDetail, addLog]);

    // ── Toast helper ──
    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    // ── Load wells list ──
    const loadWells = useCallback(async () => {
        try {
            const res = await listWells();
            setWells(res.data);
        } catch (err) {
            showToast('Failed to load wells', 'error');
        } finally {
            setWellsLoaded(true);
        }
    }, [showToast]);

    useEffect(() => {
        loadWells();
    }, [loadWells]);

    // ── Select a well ──
    const selectWell = useCallback(async (wellId, options = {}) => {
        const {
            preserveSelections = false,
            restoredCurves = [],
            restoredDepthMin = null,
            restoredDepthMax = null,
            restoredChartCurves = [],
            restoredInterpretation = null,
            restoredTab = null,
            silent = false,
        } = options;

        setSelectedWellId(wellId);
        setChartData(null);
        setChartCurves([]);
        setInterpretation(null);
        if (!preserveSelections) {
            setSelectedCurves(new Set());
        }
        if (!silent) {
            addLog(`Selected well ID: ${wellId}`, 'info');
        }

        try {
            const res = await getWell(wellId);
            const detail = res.data;
            setWellDetail(detail);

            const availableCurves = new Set((detail.curves || []).map((curve) => curve.mnemonic));
            const minBound = detail.start_depth;
            const maxBound = detail.stop_depth;

            let nextDepthMin = minBound;
            let nextDepthMax = maxBound;

            if (preserveSelections) {
                const curveList = (restoredCurves || []).filter((curve) => availableCurves.has(curve));
                setSelectedCurves(new Set(curveList));

                const candidateMin = restoredDepthMin ?? minBound;
                const candidateMax = restoredDepthMax ?? maxBound;
                const clampedMin = Math.max(minBound, Math.min(candidateMin, maxBound));
                const clampedMax = Math.max(minBound, Math.min(candidateMax, maxBound));

                if (clampedMin < clampedMax) {
                    nextDepthMin = clampedMin;
                    nextDepthMax = clampedMax;
                }

                setDepthMin(nextDepthMin);
                setDepthMax(nextDepthMax);

                if (VALID_TABS.has(restoredTab)) {
                    setActiveTab(restoredTab);
                }

                const validChartCurves = (restoredChartCurves || []).filter((curve) => availableCurves.has(curve));
                if (validChartCurves.length > 0) {
                    try {
                        const chartRes = await getWellData(wellId, validChartCurves, nextDepthMin, nextDepthMax);
                        setChartData(chartRes.data.data);
                        setChartCurves(validChartCurves);
                        if (!silent) {
                            addLog(`Restored chart with ${validChartCurves.length} curve(s)`, 'success');
                        }
                    } catch (err) {
                        addLog('Could not restore chart data from previous session', 'error');
                    }
                }

                if (restoredInterpretation && typeof restoredInterpretation === 'object') {
                    setInterpretation(restoredInterpretation);
                }
            } else {
                setDepthMin(minBound);
                setDepthMax(maxBound);
            }

            if (!silent) {
                addLog(`Well details ready for ${detail.well_name}`, 'success');
            }
            return detail;
        } catch (err) {
            showToast('Failed to load well details', 'error');
            addLog(`Failed to load well details for ID ${wellId}`, 'error');
            return null;
        }
    }, [showToast, addLog]);

    useEffect(() => {
        if (!wellsLoaded || hasTriedRestoreRef.current) return;
        hasTriedRestoreRef.current = true;

        const restored = restoredStateRef.current;
        if (!restored?.selectedWellId) {
            persistEnabledRef.current = true;
            return;
        }

        if (Array.isArray(restored.logs) && restored.logs.length > 0) {
            setLogs(restored.logs.slice(0, 50));
        }

        const matchingWell = wells.find((well) => well.id === restored.selectedWellId);
        if (!matchingWell) {
            persistEnabledRef.current = true;
            return;
        }

        selectWell(restored.selectedWellId, {
            preserveSelections: true,
            restoredCurves: restored.selectedCurves,
            restoredDepthMin: restored.depthMin,
            restoredDepthMax: restored.depthMax,
            restoredChartCurves: restored.chartCurves,
            restoredInterpretation: restored.interpretation,
            restoredTab: restored.activeTab,
            silent: true,
        }).then((detail) => {
            if (detail) {
                addLog('Restored previous session state', 'info');
            }
        }).finally(() => {
            persistEnabledRef.current = true;
        });
    }, [wellsLoaded, wells, selectWell, addLog]);

    useEffect(() => {
        if (!persistEnabledRef.current || typeof window === 'undefined') return;
        try {
            const interpretationSnapshot = interpretation
                ? (JSON.stringify(interpretation).length <= 250000 ? interpretation : null)
                : null;

            window.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({
                selectedWellId,
                selectedCurves: Array.from(selectedCurves),
                depthMin,
                depthMax,
                chartCurves: chartData ? chartCurves : [],
                interpretation: interpretationSnapshot,
                activeTab,
                logs: logs.slice(0, 50),
                updatedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore localStorage errors and continue without persisted UI state.
        }
    }, [selectedWellId, selectedCurves, depthMin, depthMax, chartCurves, chartData, interpretation, activeTab, logs]);

    // ── Upload success ──
    const handleUploadSuccess = useCallback((data) => {
        const s3Status = data.s3_key ? ' (Backed up to S3)' : ' (S3 storage skipped)';
        showToast(`Uploaded ${data.well_name} (${data.curve_count} curves)${s3Status}`, 'success');
        addLog(`File uploaded: ${data.well_name}${s3Status}`, 'success');
        loadWells();
        selectWell(data.well_id);
    }, [loadWells, selectWell, showToast, addLog]);

    // ── Load chart data ──
    const loadData = useCallback(async () => {
        if (!selectedWellId || selectedCurves.size === 0) {
            showToast('Select at least one curve', 'info');
            return;
        }

        setLoading(true);
        try {
            const curveList = Array.from(selectedCurves);
            const res = await getWellData(selectedWellId, curveList, depthMin, depthMax);
            setChartData(res.data.data);
            setChartCurves(curveList);
            showToast(`Loaded ${res.data.data.length.toLocaleString()} points`, 'success');
            addLog(`Loaded chart data for ${curveList.length} curve(s)`, 'success');
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to load curve data', 'error');
            addLog('Curve data load failed', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedWellId, selectedCurves, depthMin, depthMax, showToast, addLog]);

    // ── Run interpretation ──
    const runInterpretation = useCallback(async () => {
        if (!selectedWellId || selectedCurves.size === 0) {
            showToast('Select curves to interpret', 'info');
            return;
        }

        setInterpLoading(true);
        setActiveTab('interpretation');
        addLog('Interpretation started', 'info');
        try {
            const curveList = Array.from(selectedCurves);
            const res = await interpretWell(selectedWellId, curveList, depthMin, depthMax);
            setInterpretation(res.data.interpretation);
            showToast('Interpretation complete', 'success');
            addLog('Interpretation completed', 'success');
        } catch (err) {
            showToast(err.response?.data?.detail || 'Interpretation failed', 'error');
            addLog('Interpretation failed', 'error');
        } finally {
            setInterpLoading(false);
        }
    }, [selectedWellId, selectedCurves, depthMin, depthMax, showToast, addLog]);

    // ── Delete well ──
    const handleDeleteWell = useCallback(async (wellId, e) => {
        e.stopPropagation();
        if (!confirm('Delete this well and all associated data? This cannot be undone.')) return;
        try {
            await deleteWell(wellId);
            showToast('Well deleted', 'success');
            addLog(`Deleted well ID ${wellId}`, 'info');
            if (selectedWellId === wellId) {
                setSelectedWellId(null);
                setWellDetail(null);
                setChartData(null);
                setChartCurves([]);
                setSelectedCurves(new Set());
                setDepthMin(null);
                setDepthMax(null);
                setInterpretation(null);
                setActiveTab('chart');
            }
            loadWells();
        } catch (err) {
            showToast('Failed to delete well', 'error');
            addLog(`Failed to delete well ID ${wellId}`, 'error');
        }
    }, [selectedWellId, loadWells, showToast, addLog]);

    // ── Clear All & Reset ──
    const handleClearAll = useCallback(async () => {
        const confirmMessage = wells.length > 0
            ? `Clear all data and reset the application?\n\nThis will:\n• Delete all ${wells.length} uploaded well(s)\n• Clear all visualizations and interpretations\n• Reset to initial state\n\nThis action cannot be undone.`
            : 'Reset the application to initial state?';

        if (!confirm(confirmMessage)) return;

        try {
            setLoading(true);

            // Delete all wells from backend
            if (wells.length > 0) {
                addLog('Deleting all wells...', 'info');
                const deletePromises = wells.map(well => deleteWell(well.id).catch(() => null));
                await Promise.all(deletePromises);
            }

            // Reset all state
            setWells([]);
            setSelectedWellId(null);
            setWellDetail(null);
            setSelectedCurves(new Set());
            setDepthMin(null);
            setDepthMax(null);
            setChartData(null);
            setChartCurves([]);
            setInterpretation(null);
            setActiveTab('chart');

            // Clear localStorage
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(UI_STATE_STORAGE_KEY);
            }

            // Reset logs with fresh start message
            setLogs([{
                time: new Date().toLocaleTimeString(),
                msg: 'Application reset - ready for new upload',
                type: 'success'
            }]);

            showToast('Application cleared successfully', 'success');
        } catch (err) {
            showToast('Failed to clear all data', 'error');
            addLog('Clear all operation failed', 'error');
        } finally {
            setLoading(false);
        }
    }, [wells, showToast, addLog]);

    // ── Templates ──
    const applyTemplate = useCallback((templateType) => {
        if (!wellDetail) return;
        const next = new Set();
        if (templateType === 'standard_gas') {
            ['HC1', 'HC2', 'HC3', 'HC4', 'HC5', 'TOTAL_GAS', 'ROP(ft/hr)'].forEach(c => next.add(c));
        } else if (templateType === 'ratios') {
            ['PIX1', 'PIX2', 'PIX3', 'PIX4', 'C1_THC', 'G_L', 'GO'].forEach(c => next.add(c));
        }
        setSelectedCurves(next);
        const templateLabel = templateType === 'standard_gas' ? 'Gas Curves' : 'Ratios';
        showToast(`Applied template: ${templateLabel}`, 'info');
        addLog(`Template applied: ${templateLabel}`, 'info');
    }, [wellDetail, showToast, addLog]);

    const chatContextCurves = chartData && chartCurves.length > 0
        ? chartCurves
        : Array.from(selectedCurves);

    const formatDepthValue = (value) => (
        value == null || Number.isNaN(Number(value))
            ? '--'
            : Number(value).toLocaleString()
    );



    return (
        <div className="app-container">
            {/* ── Header ── */}
            <header className="app-header">
                {/* Left: Sidebar Toggle + Brand */}
                <div className="header-left">
                    <button
                        className="btn-sidebar-toggle"
                        onClick={() => setSidebarOpen(p => !p)}
                        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                    >
                        {sidebarOpen ? '◂' : '☰'}
                    </button>
                    <div className="header-brand">
                        <div className="header-logo">
                            <img src="/logo.png" alt="Logo" />
                        </div>
                        <div>
                            <h1 className="header-title">Well Log Analyzer</h1>
                            <p className="header-subtitle">Ingestion · Visualization · Interpretation</p>
                        </div>
                    </div>
                </div>

                {/* Center: Well Info Pills */}
                {wellDetail && (
                    <div className="header-stats-group">
                        <div className="insight-pill">
                            <span className="pill-label">Well</span>
                            <span className="pill-value">
                                {wellDetail.well_name}<span className="pill-meta">• {wellDetail.curves?.length} curves</span>
                            </span>
                        </div>
                        <div className="insight-pill">
                            <span className="pill-label">Range</span>
                            <span className="pill-value">
                                {wellDetail.start_depth.toLocaleString()} — {wellDetail.stop_depth.toLocaleString()}<span className="pill-meta">{wellDetail.depth_unit}</span>
                            </span>
                        </div>
                    </div>
                )}

                {/* Right: Action Buttons */}
                {wellDetail && (
                    <div className="header-action-group">
                        <button
                            className="btn btn-primary btn-sm btn-glow"
                            onClick={loadData}
                            disabled={selectedCurves.size === 0 || loading}
                        >
                            {loading ? 'Loading...' : 'Load Data'}
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={runInterpretation}
                            disabled={selectedCurves.size === 0 || interpLoading}
                        >
                            {interpLoading ? 'Analyzing...' : 'Run Interpretation'}
                        </button>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={handleClearAll}
                            title="Clear all data and reset"
                            style={{ marginLeft: '8px', opacity: 0.8 }}
                        >
                            Clear Reset
                        </button>
                    </div>
                )}
            </header>

            {/* ── Main Grid ── */}
            <div className="main-grid" style={{ gridTemplateColumns: sidebarOpen ? '280px 1fr' : '1fr', gap: 'var(--space-3)' }}>
                {/* ── Sidebar ── */}
                {sidebarOpen && (
                    <div className="sidebar">
                        <FileUpload onUploadSuccess={handleUploadSuccess} />

                        {/* Well List — compact, scrollable */}
                        {wells.length > 0 && (
                            <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                    <span className="card-title" style={{ fontSize: '0.65rem' }}>Wells ({wells.length})</span>
                                </div>
                                <div className="well-list" style={{ overflowY: 'auto', maxHeight: 'min(34vh, 260px)' }}>
                                    {wells.map((w) => (
                                        <div
                                            key={w.id}
                                            className={`well-item ${selectedWellId === w.id ? 'active' : ''}`}
                                            onClick={() => selectWell(w.id)}
                                            style={{ padding: 'var(--space-1) var(--space-2)' }}
                                        >
                                            <div className="well-item-info">
                                                <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{w.well_name}</h4>
                                                <p style={{ fontSize: '0.58rem' }}>
                                                    {w.original_filename} • ID:{w.id}
                                                </p>
                                            </div>
                                            <button
                                                className="well-delete-btn"
                                                onClick={(e) => handleDeleteWell(w.id, e)}
                                                style={{ fontSize: '0.85rem', padding: '2px' }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity Log — compact, scrollable */}
                        <div className="card" style={{ background: 'rgba(0,0,0,0.3)', padding: 'var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column', minHeight: '220px', flex: 1, overflow: 'hidden' }}>
                            <div style={{ marginBottom: 'var(--space-2)' }}>
                                <span className="card-title" style={{ fontSize: '0.65rem' }}>Activity Log</span>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', maxHeight: 'none', minHeight: '180px', flex: 1, paddingRight: '4px', scrollbarGutter: 'stable' }}>
                                {logs.map((log, i) => (
                                    <div key={i} style={{ color: log.type === 'success' ? 'var(--success)' : log.type === 'error' ? 'var(--danger)' : 'var(--text-muted)', lineHeight: 1.3 }}>
                                        <span style={{ opacity: 0.4 }}>[{log.time}]</span> {log.msg}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Main Content ── */}
                <div className="main-content">
                    {wellDetail ? (
                        <div className="workspace-shell">
                            {/* ═══ TOP CONTROL BAR ═══ */}
                            <div className="control-bar">
                                {/* Curve Selector Group */}
                                <div className="control-group">
                                    <div className="popover-container" ref={curveSelectorRef}>
                                        <button
                                            className={`btn btn-sm ${showCurveSelector ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setShowCurveSelector(!showCurveSelector)}
                                            style={{ minWidth: '140px', justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
                                            title="Select Curves (Alt+C)"
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '1.2em', lineHeight: 0.8, opacity: 0.8 }}>≡</span>
                                                Select Curves
                                            </span>
                                            <span className="badge" style={{ background: 'rgba(0,0,0,0.2)', marginLeft: '8px' }}>
                                                {selectedCurves.size}
                                            </span>
                                        </button>

                                        {/* POPOVER CONTENT */}
                                        {showCurveSelector && (
                                            <div className="popover-card">
                                                <CurveSelector
                                                    curves={wellDetail.curves}
                                                    selectedCurves={selectedCurves}
                                                    onSelectionChange={setSelectedCurves}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span className="control-label">Curves</span>
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {selectedCurves.size > 0 ? Array.from(selectedCurves).slice(0, 3).join(', ') + (selectedCurves.size > 3 ? ` +${selectedCurves.size - 3}` : '') : 'None'}
                                        </span>
                                    </div>
                                </div>

                                {/* Depth Range Group */}
                                <DepthRangeSelector
                                    wellMin={wellDetail.start_depth}
                                    wellMax={wellDetail.stop_depth}
                                    depthMin={depthMin}
                                    depthMax={depthMax}
                                    unit={wellDetail.depth_unit}
                                    onChange={(min, max) => {
                                        setDepthMin(min);
                                        setDepthMax(max);
                                    }}
                                    horizontal={true}
                                />

                                <div style={{ flex: 1 }}></div>

                                {/* Right Side Actions: moved from sidebar templates */}
                                <div className="control-group" style={{ borderRight: 'none', paddingRight: 0 }}>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginRight: '8px' }}>Presets:</span>
                                    <button className="btn btn-sm btn-secondary" onClick={() => applyTemplate('standard_gas')} title="Standard Gas Curves">Gas</button>
                                    <button className="btn btn-sm btn-secondary" onClick={() => applyTemplate('ratios')} title="Key Ratios">Ratios</button>
                                </div>
                            </div>

                            <div className="tabs">
                                <button
                                    className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
                                    onClick={() => { setActiveTab('chart'); addLog('Switched to Chart view', 'info'); }}
                                >
                                    Chart
                                </button>
                                <button
                                    className={`tab-btn ${activeTab === 'interpretation' ? 'active' : ''}`}
                                    onClick={() => { setActiveTab('interpretation'); addLog('Switched to Interpretation view', 'info'); }}
                                >
                                    Interpretation
                                </button>
                                <button
                                    className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                                    onClick={() => { setActiveTab('chat'); addLog('Switched to Chat view', 'info'); }}
                                >
                                    Chat Assistant
                                </button>
                            </div>

                            {/* Chat workspace — always mounted, hidden when not active */}
                            <div className="chat-workspace" style={{ display: activeTab === 'chat' ? 'flex' : 'none' }}>


                                <div className="chat-split-layout">
                                    <div className="card chat-chart-card">
                                        <div className="card-header" style={{ marginBottom: 'var(--space-2)' }}>
                                            <div>
                                                <h4 className="card-title" style={{ fontSize: '0.72rem' }}>Live Chart Context</h4>
                                                <p className="card-subtitle" style={{ fontSize: '0.62rem' }}>
                                                    {chartCurves.length || chatContextCurves.length} curves • {formatDepthValue(depthMin)} - {formatDepthValue(depthMax)} {wellDetail.depth_unit}
                                                </p>
                                            </div>
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => { setActiveTab('chart'); addLog('Switched to Chart view', 'info'); }}
                                            >
                                                Open Chart
                                            </button>
                                        </div>
                                        <div className="chat-chart-body">
                                            {chartData ? (
                                                <WellLogChart
                                                    data={chartData}
                                                    curves={chartCurves.length ? chartCurves : chatContextCurves}
                                                    wellName={wellDetail.well_name}
                                                    depthUnit={wellDetail.depth_unit}
                                                    compact={true}
                                                />
                                            ) : (
                                                <div className="chat-chart-empty">
                                                    <div style={{ fontSize: '1.1rem', opacity: 0.4 }}>▧</div>
                                                    <p style={{ fontSize: '0.68rem', maxWidth: '250px' }}>
                                                        No chart loaded yet. Load data to see live chart + chat side by side.
                                                    </p>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={loadData}
                                                        disabled={selectedCurves.size === 0 || loading}
                                                    >
                                                        {loading ? 'Loading...' : 'Load Chart'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="tab-content chat-tab-content">
                                        <ChatBot
                                            wellId={selectedWellId}
                                            wellName={wellDetail.well_name}
                                            selectedCurves={chatContextCurves}
                                            depthMin={depthMin}
                                            depthMax={depthMax}
                                            depthUnit={wellDetail.depth_unit}
                                            contextMode={chartData ? 'chart' : 'selection'}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Chart/Interpretation workspace */}
                            <div className="workspace-single-column" style={{ display: activeTab !== 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
                                <div className="tab-content" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                    {activeTab === 'chart' && (
                                        <div
                                            className="card chart-host"
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                minHeight: 0,
                                                flex: 1,
                                                width: '100%',
                                                alignItems: chartData ? 'stretch' : 'center',
                                                justifyContent: chartData ? 'flex-start' : 'center',
                                                background: 'rgba(0,0,0,0.2)',
                                            }}
                                        >
                                            {!chartData ? (
                                                <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                                    <div style={{ fontSize: '1.5rem', marginBottom: '10px', animation: 'pulse-text 2s infinite' }}>▧</div>
                                                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>No data loaded yet</div>
                                                    <div style={{ fontSize: '0.55rem', marginTop: '4px' }}>Select curves and click Load Data.</div>
                                                </div>
                                            ) : (
                                                <div style={{ width: '100%', minWidth: 0, minHeight: 0, flex: 1, display: 'flex' }}>
                                                    <WellLogChart
                                                        data={chartData}
                                                        curves={chartCurves}
                                                        wellName={wellDetail.well_name}
                                                        depthUnit={wellDetail.depth_unit}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'interpretation' && (
                                        <InterpretationPanel
                                            interpretation={interpretation}
                                            loading={interpLoading}
                                            wellName={wellDetail.well_name}
                                            curves={Array.from(selectedCurves)}
                                            depthRange={{
                                                min: depthMin,
                                                max: depthMax,
                                                unit: wellDetail.depth_unit,
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="chart-placeholder" style={{ maxWidth: '400px' }}>
                                <div className="chart-placeholder-icon" style={{ fontSize: '4rem', marginBottom: 'var(--space-4)' }}>⌬</div>
                                <h3 style={{ letterSpacing: '0.1em', color: 'var(--text-accent)' }}>No Well Selected</h3>
                                <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: 'var(--space-6)' }}>
                                    Upload a LAS file or select an existing well to start analysis.
                                </p>
                                <div style={{ width: '100%', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-6)' }}>
                                    <FileUpload onUploadSuccess={handleUploadSuccess} noFrame={true} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Toast Notification ── */}
            {
                toast && (
                    <div className={`toast toast-${toast.type}`}>
                        {toast.message}
                    </div>
                )
            }
        </div >
    );
}
