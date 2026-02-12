import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { chatWithWell } from '../services/api';

const CHAT_STATE_STORAGE_PREFIX = 'well-log-chat-state-v1';
const inMemoryChatSessions = new Map();
const DETAIL_LABELS = {
    1: 'Brief',
    2: 'Compact',
    3: 'Balanced',
    4: 'Detailed',
    5: 'Deep',
};

const clampDetailLevel = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 3;
    return Math.min(5, Math.max(1, Math.round(numeric)));
};

const formatDepth = (value) => {
    if (value == null || Number.isNaN(Number(value))) return null;
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const buildContextSummary = (curves, depthMin, depthMax, depthUnit) => {
    const depthStart = formatDepth(depthMin);
    const depthEnd = formatDepth(depthMax);
    const depthText = depthStart && depthEnd
        ? `${depthStart} to ${depthEnd} ${depthUnit || ''}`.trim()
        : 'full available interval';
    return `${curves.length} curve${curves.length === 1 ? '' : 's'} • ${depthText}`;
};

const buildIntroMessage = (wellName, contextSummary, contextMode) => ({
    role: 'assistant',
    content: `Hello. I can analyze well "${wellName}" using the current ${contextMode} context (${contextSummary}). Ask for interval analysis, curve comparison, anomalies, or interpretation support.`,
});

const buildSuggestions = (curves, depthMin, depthMax, depthUnit) => {
    const depthStart = formatDepth(depthMin);
    const depthEnd = formatDepth(depthMax);
    const depthText = depthStart && depthEnd
        ? `${depthStart}-${depthEnd} ${depthUnit || ''}`.trim()
        : 'the current interval';
    const topCurve = curves[0] || 'TOTAL_GAS';
    const secondCurve = curves[1] || 'HC1';

    return [
        `Summarize key signals in ${depthText}.`,
        `Which depth interval has the strongest ${topCurve} response?`,
        `Compare ${topCurve} and ${secondCurve} trends in this view.`,
        'What is the most likely fluid behavior in this interval?',
    ];
};

export default function ChatBot({
    wellId,
    wellName,
    selectedCurves = [],
    depthMin = null,
    depthMax = null,
    depthUnit = 'F',
    contextMode = 'selection',
}) {
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const hasHydratedRef = useRef(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [detailLevel, setDetailLevel] = useState(3);

    const curvesInScope = useMemo(
        () => [...new Set((selectedCurves || []).filter(Boolean))],
        [selectedCurves]
    );

    const contextSummary = useMemo(
        () => buildContextSummary(curvesInScope, depthMin, depthMax, depthUnit),
        [curvesInScope, depthMin, depthMax, depthUnit]
    );

    const suggestions = useMemo(
        () => buildSuggestions(curvesInScope, depthMin, depthMax, depthUnit),
        [curvesInScope, depthMin, depthMax, depthUnit]
    );

    const contextMeta = useMemo(
        () => ({
            mode: contextMode,
            curves: curvesInScope,
            depthMin: depthMin ?? null,
            depthMax: depthMax ?? null,
            detailLevel,
        }),
        [contextMode, curvesInScope, depthMin, depthMax, detailLevel]
    );

    const introMessage = useMemo(
        () => buildIntroMessage(wellName, contextSummary, contextMode),
        [wellName, contextSummary, contextMode]
    );

    const chatStorageKey = useMemo(
        () => (wellId != null ? `${CHAT_STATE_STORAGE_PREFIX}:${String(wellId)}` : null),
        [wellId]
    );

    const [messages, setMessages] = useState([
        introMessage,
    ]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        hasHydratedRef.current = false;

        if (!chatStorageKey || typeof window === 'undefined') {
            setMessages([introMessage]);
            setInput('');
            hasHydratedRef.current = true;
            return;
        }

        const cached = inMemoryChatSessions.get(chatStorageKey);
        if (cached?.messages?.length) {
            setMessages(cached.messages.slice(-40));
            if (cached?.detailLevel != null) {
                setDetailLevel(clampDetailLevel(cached.detailLevel));
            }
            setInput('');
            hasHydratedRef.current = true;
            return;
        }

        try {
            const raw = window.localStorage.getItem(chatStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
                    const restoredMessages = parsed.messages.slice(-40);
                    setMessages(restoredMessages);
                    const restoredDetailLevel = clampDetailLevel(parsed?.context?.detailLevel ?? 3);
                    setDetailLevel(restoredDetailLevel);
                    inMemoryChatSessions.set(chatStorageKey, {
                        messages: restoredMessages,
                        detailLevel: restoredDetailLevel,
                    });
                    setInput('');
                    hasHydratedRef.current = true;
                    return;
                }
            }
        } catch {
            // Ignore malformed chat state and start with a fresh intro message.
        }

        setMessages([introMessage]);
        setDetailLevel(3);
        setInput('');
        hasHydratedRef.current = true;
    }, [chatStorageKey]);

    useEffect(() => {
        setMessages((prev) => {
            if (!prev.length) return [introMessage];
            if (prev.length === 1 && prev[0].role === 'assistant') return [introMessage];
            return prev;
        });
    }, [introMessage]);

    useEffect(() => {
        if (!hasHydratedRef.current) return;
        if (!chatStorageKey || typeof window === 'undefined') return;
        try {
            const normalizedMessages = messages.slice(-40);
            inMemoryChatSessions.set(chatStorageKey, {
                messages: normalizedMessages,
                detailLevel,
            });
            window.localStorage.setItem(chatStorageKey, JSON.stringify({
                context: contextMeta,
                messages: normalizedMessages,
                updatedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore storage write errors.
        }
    }, [chatStorageKey, contextMeta, messages, detailLevel]);

    const clearChat = () => {
        const resetMessages = [introMessage];
        setMessages(resetMessages);
        setInput('');
        setLoading(false);

        if (!chatStorageKey || typeof window === 'undefined') return;
        try {
            inMemoryChatSessions.set(chatStorageKey, {
                messages: resetMessages,
                detailLevel,
            });
            window.localStorage.setItem(chatStorageKey, JSON.stringify({
                context: contextMeta,
                messages: resetMessages,
                updatedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore storage write errors.
        }
    };

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || loading || !wellId) return;

        const userMsg = { role: 'user', content: text };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setLoading(true);

        try {
            const response = await chatWithWell(
                wellId,
                text,
                updatedMessages.slice(1).map((m) => ({ role: m.role, content: m.content })),
                {
                    curves: curvesInScope,
                    depth_min: depthMin,
                    depth_max: depthMax,
                    detail_level: detailLevel,
                }
            );
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: response.data.response },
            ]);
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Unable to generate a response right now. Verify backend availability and API credentials, then try again.',
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chat-container">
            <div className="card-header" style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)', marginBottom: 0 }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 className="card-title" style={{ fontSize: '0.75rem', color: 'var(--text-accent)', marginBottom: '6px' }}>
                            Well Data Assistant
                        </h3>
                        <div className="chat-context-row">
                            <span className="chat-context-badge">{contextMode === 'chart' ? 'Chart Context' : 'Selection Context'}</span>
                            <span className="chat-context-text">{contextSummary}</span>
                        </div>
                        <div className="chat-context-curves">
                            {curvesInScope.length > 0 ? (
                                curvesInScope.slice(0, 10).map((curve) => (
                                    <span key={curve} className="chat-curve-pill">{curve}</span>
                                ))
                            ) : (
                                <span className="chat-context-muted">No curves selected. Select curves for scoped answers.</span>
                            )}
                            {curvesInScope.length > 10 && (
                                <span className="chat-context-muted">+{curvesInScope.length - 10} more</span>
                            )}
                        </div>

                        <div className="chat-detail-row">
                            <div className="chat-detail-label">
                                Response Depth <span className="chat-detail-pill">{DETAIL_LABELS[detailLevel]}</span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={5}
                                step={1}
                                value={detailLevel}
                                onChange={(e) => setDetailLevel(clampDetailLevel(e.target.value))}
                                className="chat-detail-slider"
                                aria-label="Chat response detail level"
                            />
                        </div>
                    </div>
                    <button
                        className="btn btn-sm btn-secondary"
                        onClick={clearChat}
                        disabled={loading || messages.length <= 1}
                        title="Clear current chat history for this well"
                    >
                        Clear Chat
                    </button>
                </div>
            </div>

            <div className="chat-messages" style={{ background: 'rgba(0,0,0,0.2)' }}>
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        <div className={`chat-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
                            {msg.role === 'user' ? 'YOU' : 'AI'}
                        </div>
                        <div className="chat-bubble" style={msg.role === 'assistant' ? { borderLeft: '2px solid var(--accent-primary)' } : {}}>
                            {msg.role === 'assistant' ? (
                                <div className="chat-markdown">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            ) : (
                                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="chat-message assistant">
                        <div className="chat-avatar ai">AI</div>
                        <div className="chat-bubble">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="spinner" style={{ width: 14, height: 14 }} />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Analyzing selected context...</span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {messages.length <= 1 && (
                <div className="chat-suggestions">
                    {suggestions.map((suggestion, i) => (
                        <button
                            key={i}
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                                setInput(suggestion);
                                inputRef.current?.focus();
                            }}
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}

            <div className="chat-input-area" style={{ padding: 'var(--space-3)' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <input
                        ref={inputRef}
                        className="input"
                        type="text"
                        placeholder={curvesInScope.length ? 'Ask about the current chart context...' : 'Select curves, then ask a question...'}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}
                    />
                </div>
                <button
                    className="btn btn-primary"
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    style={{ padding: '0 var(--space-4)' }}
                >
                    {loading ? '...' : 'Send'}
                </button>
            </div>
        </div>
    );
}
