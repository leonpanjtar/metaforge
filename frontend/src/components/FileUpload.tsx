import { useState, useRef } from 'react';
import api from '../services/api';

interface FileUploadProps {
  adsetId: string;
  onUploadComplete?: () => void;
}

const FileUpload = ({ adsetId, onUploadComplete }: FileUploadProps) => {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('adsetId', adsetId);
      files.forEach((file) => {
        formData.append('files', file);
      });

      // Don't set Content-Type for FormData - axios will set it automatically with boundary
      await api.post('/assets/upload', formData);

      if (onUploadComplete) {
        onUploadComplete();
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <p className="text-gray-600 mb-2">
          Drag and drop images or videos here, or
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          browse files
        </button>
        <p className="text-sm text-gray-500 mt-2">
          Supports: JPG, PNG, GIF, MP4, MOV, AVI (max 100MB per file)
        </p>
      </div>
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {uploading && (
        <div className="mt-4 text-center text-gray-600">Uploading...</div>
      )}
    </div>
  );
};

export default FileUpload;

