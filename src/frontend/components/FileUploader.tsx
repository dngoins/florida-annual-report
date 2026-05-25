import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', 'text/markdown'];
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface FileUploaderProps {
  onUpload?: (_file: File) => Promise<void>;
}

export function FileUploader({ onUpload }: FileUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastFailedFile, setLastFailedFile] = useState<File | null>(null);

  const uploadViaFetch = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || 'Upload failed');
    }
    const data = await response.json();
    if (data?.document_id) {
      router.push(`/review/${data.document_id}`);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setLastFailedFile(null);
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.md')) {
      setError('Invalid file type. Only PDF, DOCX, CSV, Markdown are accepted.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File size exceeds ${MAX_SIZE_MB}MB limit.`);
      return;
    }
    setUploadedFile(file);
    setUploading(true);
    try {
      if (onUpload) {
        await onUpload(file);
      } else {
        await uploadViaFetch(file);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setLastFailedFile(file);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRetry = () => {
    if (lastFailedFile) {
      handleFile(lastFailedFile);
    }
  };

  return (
    <div role="region" aria-label="Document submission area">
      <button
        type="button"
        aria-label="Drop files here or browse"
        className={isDragOver ? 'border-blue-500' : ''}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading...' : 'Drop files here or browse'}
      </button>
      <label htmlFor="file-upload-input" style={{ position: 'absolute', left: '-9999px' }}>
        Upload file
      </label>
      <input
        id="file-upload-input"
        ref={inputRef}
        type="file"
        onChange={handleChange}
        style={{ display: 'none' }}
        data-testid="file-input"
      />
      <p>Accepted types: PDF, DOCX, CSV, Markdown</p>
      <p>Maximum file size: {MAX_SIZE_MB}MB</p>
      <p role="status" aria-live="polite" data-testid="upload-status" style={uploading || uploadedFile ? undefined : { position: 'absolute', left: '-9999px' }}>
        {uploading ? `Uploading ${uploadedFile?.name || ''}...` : uploadedFile && !error ? `Uploaded ${uploadedFile.name}` : ''}
      </p>
      {uploading && (
        <>
          <div role="progressbar" aria-label="Upload progress" data-testid="upload-progress" />
          {uploadedFile && <p data-testid="upload-filename">{uploadedFile.name}</p>}
        </>
      )}
      {error && (
        <>
          <p role="alert" data-testid="upload-error">{error}</p>
          {lastFailedFile && (
            <button type="button" onClick={handleRetry} aria-label="Retry upload">
              Retry
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default FileUploader;
