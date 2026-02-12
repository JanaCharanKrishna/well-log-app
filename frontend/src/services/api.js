import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    timeout: 120000,
});

// ── Wells ───────────────────────────────────────
export const uploadLasFile = (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/wells/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onProgress,
    });
};

export const listWells = () => api.get('/wells');

export const getWell = (wellId) => api.get(`/wells/${wellId}`);

export const getWellData = (wellId, curves, depthMin, depthMax) => {
    const params = { curves: curves.join(',') };
    if (depthMin != null) params.depth_min = depthMin;
    if (depthMax != null) params.depth_max = depthMax;
    return api.get(`/wells/${wellId}/data`, { params });
};

export const deleteWell = (wellId) => api.delete(`/wells/${wellId}`);

// ── Interpretation ──────────────────────────────
export const interpretWell = (wellId, curves, depthMin, depthMax) =>
    api.post(`/wells/${wellId}/interpret`, {
        curves,
        depth_min: depthMin,
        depth_max: depthMax,
    });

// ── Chat ────────────────────────────────────────
export const chatWithWell = (wellId, message, history = [], context = {}) =>
    api.post('/chat', {
        well_id: wellId,
        message,
        history,
        curves: context.curves || [],
        depth_min: context.depth_min ?? null,
        depth_max: context.depth_max ?? null,
        detail_level: context.detail_level ?? 3,
    });

// ── Health ──────────────────────────────────────
export const healthCheck = () => api.get('/health');

export default api;
