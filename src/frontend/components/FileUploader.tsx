import React, { useRef, useState } from 'react';

const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', 'text/markdown'];
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface FileUploaderProps {
  onUpload?: (file: File) => Promise<void>;
}

export function FileUploader({ onUpload }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.md')) {
      setError('Invalid file type. Only PDF, DOCX, CSV, Markdown are accepted.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File size exceeds ${MAX_SIZE_MB}MB limit.`);
      return;
    }
    setUploading(true);
    try {
      if (onUpload) await onUpload(file);
      setUploadedFile(file);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <button
        role="button"
        aria-label="Drop files here or browse"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading...' : 'Drop files here or browse'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.csv,.md"
        onChange={handleChange}
        style={{ display: 'none' }}
        data-testid="file-input"
      />
      <p>Accepted types: PDF, DOCX, CSV, Markdown</p>
      <p>Maximum file size: {MAX_SIZE_MB}MB</p>
      {error && <p role="alert" data-testid="upload-error">{error}</p>}
      {uploadedFile && <p data-testid="upload-success">Uploaded: {uploadedFile.name}</p>}
    </div>
  );
}

export default FileUploader;
