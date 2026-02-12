import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadLasFile } from '../services/api';

export default function FileUpload({ onUploadSuccess, noFrame = false }) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);

    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.las')) {
            setError('Please upload a .las file');
            return;
        }

        setUploading(true);
        setProgress(0);
        setError(null);

        try {
            const response = await uploadLasFile(file, (e) => {
                if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
            });
            setUploading(false);
            setProgress(100);
            if (onUploadSuccess) onUploadSuccess(response.data);
            setTimeout(() => setProgress(0), 2000);
        } catch (err) {
            setUploading(false);
            setProgress(0);
            setError(err.response?.data?.detail || 'Upload failed. Please try again.');
        }
    }, [onUploadSuccess]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/octet-stream': ['.las'] },
        multiple: false,
        disabled: uploading,
    });

    const content = (
        <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
            id="las-dropzone"
            style={noFrame ? { borderStyle: 'solid', borderWidth: '1px', background: 'rgba(255,255,255,0.03)' } : {}}
        >
            <input {...getInputProps()} />
            {uploading ? (
                <>
                    <div className="dropzone-icon" style={{ animation: 'spin 2s linear infinite', opacity: 0.8 }}>⚙</div>
                    <p className="dropzone-text" style={{ fontSize: '0.65rem', letterSpacing: '0.05em', marginTop: '8px' }}>Uploading and parsing LAS file...</p>
                    <div className="progress-bar" style={{ height: '2px', width: '80%', background: 'rgba(255,255,255,0.05)', marginTop: '8px' }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--accent-primary)', boxShadow: '0 0 10px var(--accent-glow)' }} />
                    </div>
                </>
            ) : isDragActive ? (
                <>
                    <div className="dropzone-icon" style={{ color: 'var(--accent-primary)' }}>▼</div>
                    <p className="dropzone-text" style={{ fontSize: '0.65rem', color: 'var(--accent-primary)' }}>Drop to upload</p>
                </>
            ) : (
                <>
                    <div className="dropzone-icon" style={{ fontSize: '1.2rem', opacity: 0.3, marginBottom: '4px' }}>⌬</div>
                    <p className="dropzone-text" style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.05em' }}>
                        Drop LAS file here
                    </p>
                    <p className="dropzone-hint" style={{ fontSize: '0.55rem', opacity: 0.4, marginTop: '2px' }}>or click to browse</p>
                </>
            )}
        </div>
    );

    if (noFrame) return content;

    return (
        <div className="card card-tight">
            <div className="card-header" style={{ marginBottom: 'var(--space-2)' }}>
                <h3 className="card-title" style={{ fontSize: '0.8rem' }}>File Upload</h3>
            </div>
            {content}
            {error && (
                <p style={{ color: 'var(--danger)', fontSize: 'var(--font-xs)', marginTop: 'var(--space-3)' }}>
                    ⚠️ {error}
                </p>
            )}
        </div>
    );
}
