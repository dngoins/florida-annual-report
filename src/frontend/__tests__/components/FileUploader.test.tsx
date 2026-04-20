/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUploader } from '../../components/FileUploader';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('FileUploader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Rendering and Structure', () => {
    it('renders the upload zone', () => {
      render(<FileUploader />);
      expect(screen.getByRole('button', { name: /drop.*files.*browse/i })).toBeInTheDocument();
    });

    it('displays accepted file types', () => {
      render(<FileUploader />);
      expect(screen.getByText(/PDF, DOCX, CSV, Markdown/i)).toBeInTheDocument();
    });

    it('displays maximum file size', () => {
      render(<FileUploader />);
      expect(screen.getByText(/20MB/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible file input', () => {
      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'file');
    });

    it('is keyboard navigable', () => {
      render(<FileUploader />);
      const dropZone = screen.getByRole('button', { name: /drop.*files.*browse/i });
      dropZone.focus();
      expect(dropZone).toHaveFocus();
    });

    it('has ARIA labels for screen readers', () => {
      render(<FileUploader />);
      expect(screen.getByRole('region', { name: /document upload/i })).toBeInTheDocument();
    });

    it('announces upload status to screen readers', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        const statusRegion = screen.getByRole('status');
        expect(statusRegion).toBeInTheDocument();
      });
    });
  });

  describe('File Type Validation', () => {
    it('accepts PDF files', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.queryByText(/invalid file type/i)).not.toBeInTheDocument();
    });

    it('accepts DOCX files', async () => {
      const file = new File(['test'], 'document.docx', { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.queryByText(/invalid file type/i)).not.toBeInTheDocument();
    });

    it('accepts CSV files', async () => {
      const file = new File(['test'], 'data.csv', { type: 'text/csv' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.queryByText(/invalid file type/i)).not.toBeInTheDocument();
    });

    it('accepts Markdown files', async () => {
      const file = new File(['test'], 'readme.md', { type: 'text/markdown' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.queryByText(/invalid file type/i)).not.toBeInTheDocument();
    });

    it('rejects invalid file types', async () => {
      const file = new File(['test'], 'script.exe', { type: 'application/x-msdownload' });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
      });
    });
  });

  describe('File Size Validation', () => {
    it('accepts files under 20MB', async () => {
      const content = new Array(1024 * 1024).fill('a').join(''); // 1MB
      const file = new File([content], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.queryByText(/file size exceeds/i)).not.toBeInTheDocument();
    });

    it('rejects files over 20MB', async () => {
      // Create a file object with size property mocked
      const file = new File(['test'], 'large.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 }); // 21MB

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByText(/file size exceeds 20MB/i)).toBeInTheDocument();
      });
    });
  });

  describe('Drag and Drop', () => {
    it('shows visual feedback on drag over', () => {
      render(<FileUploader />);
      const dropZone = screen.getByRole('button', { name: /drop.*files.*browse/i });
      
      fireEvent.dragEnter(dropZone);
      
      expect(dropZone).toHaveClass('border-blue-500');
    });

    it('removes visual feedback on drag leave', () => {
      render(<FileUploader />);
      const dropZone = screen.getByRole('button', { name: /drop.*files.*browse/i });
      
      fireEvent.dragEnter(dropZone);
      fireEvent.dragLeave(dropZone);
      
      expect(dropZone).not.toHaveClass('border-blue-500');
    });

    it('handles file drop', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
      });

      render(<FileUploader />);
      const dropZone = screen.getByRole('button', { name: /drop.*files.*browse/i });
      
      const dataTransfer = {
        files: [file],
        items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
        types: ['Files'],
      };
      
      fireEvent.drop(dropZone, { dataTransfer });
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('Upload Progress', () => {
    it('shows progress indicator during upload', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      
      // Delay the response to allow progress UI to show
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
          }), 100)
        )
      );

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows file name during upload', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ document_id: '123', status: 'processing' }),
          }), 100)
        )
      );

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });
  });

  describe('Success Handling', () => {
    it('redirects to review page on success', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: 'doc-123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/review/doc-123');
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message on upload failure', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Upload failed' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Upload failed' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('allows retry after error', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Upload failed' }),
      });
      
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: 'doc-123', status: 'processing' }),
      });

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
      
      await userEvent.click(screen.getByRole('button', { name: /retry/i }));
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/review/doc-123');
      });
    });

    it('handles network errors gracefully', async () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<FileUploader />);
      const input = screen.getByLabelText(/upload/i);
      
      await userEvent.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });
});
