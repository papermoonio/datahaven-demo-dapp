import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressStepper } from '../components/ProgressStepper';
import { getBucketsFromMSP } from '../services/bucketOperations';
import {
  uploadFile,
  waitForMSPConfirmOnChain,
  waitForBackendFileReady,
  downloadFile,
  requestDeleteFile,
  getBucketFilesFromMSP,
  getFileInfo,
} from '../../utils/operations/fileOperations';
import type { Bucket, FileUploadProgress } from '../types';
import type { FileInfo } from '@storagehub-sdk/core';

interface FileEntry {
  fileKey: string;
  name?: string;
  size?: number;
  status?: string;
}

export function Files() {
  const { isAuthenticated, isMspConnected } = useAppState();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingFileInfo, setIsLoadingFileInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress>({
    step: 'idle',
    message: '',
  });

  const loadBuckets = useCallback(async () => {
    if (!isMspConnected) return;
    setIsLoadingBuckets(true);
    try {
      const data = await getBucketsFromMSP();
      setBuckets(data);
      if (data.length > 0 && !selectedBucketId) {
        setSelectedBucketId(data[0].bucketId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buckets');
    } finally {
      setIsLoadingBuckets(false);
    }
  }, [isMspConnected, selectedBucketId]);

  const loadFiles = useCallback(async () => {
    if (!selectedBucketId) {
      setFiles([]);
      return;
    }
    setIsLoadingFiles(true);
    setError(null);
    try {
      const response = await getBucketFilesFromMSP(selectedBucketId);
      // The response is a FileListResponse, transform it to our FileEntry format
      // FileTree has type 'file' or 'folder', we only want files
      const fileList: FileEntry[] = (response.files || [])
        .filter((f): f is Extract<typeof f, { type: 'file' }> => 'type' in f && f.type === 'file')
        .map((f) => ({
          fileKey: f.fileKey,
          name: f.name,
          size: f.sizeBytes,
          status: f.status,
        }));
      setFiles(fileList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoadingFiles(false);
    }
  }, [selectedBucketId]);

  useEffect(() => {
    if (isMspConnected) {
      loadBuckets();
    }
  }, [isMspConnected, loadBuckets]);

  useEffect(() => {
    if (selectedBucketId) {
      loadFiles();
    }
  }, [selectedBucketId, loadFiles]);

  const handleBucketChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBucketId(e.target.value);
    setSelectedFile(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedUploadFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedUploadFile || !selectedBucketId) return;

    setError(null);

    try {
      // Step 1: Preparing
      setUploadProgress({ step: 'preparing', message: 'Preparing file...' });
      await new Promise((r) => setTimeout(r, 500)); // Small delay for UX

      // Step 2: Issue storage request
      setUploadProgress({ step: 'issuing', message: 'Issuing storage request...' });
      const { fileKey } = await uploadFile(selectedBucketId, selectedUploadFile);

      // Step 3: Upload complete, wait for confirmation
      setUploadProgress({ step: 'confirming', message: 'Waiting for MSP confirmation...' });
      await waitForMSPConfirmOnChain(fileKey);

      // Step 4: Wait for backend
      setUploadProgress({ step: 'finalizing', message: 'Finalizing...' });
      await waitForBackendFileReady(selectedBucketId, fileKey);

      // Done
      setUploadProgress({ step: 'done', message: 'File uploaded successfully!' });
      setSelectedUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Refresh file list
      await loadFiles();

      // Reset progress after a delay
      setTimeout(() => {
        setUploadProgress({ step: 'idle', message: '' });
      }, 2000);
    } catch (err) {
      setUploadProgress({
        step: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    }
  };

  const handleViewFile = async (fileKey: string) => {
    if (!selectedBucketId) return;
    setIsLoadingFileInfo(true);
    setError(null);
    try {
      const info = await getFileInfo(selectedBucketId, fileKey);
      setSelectedFile(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file info');
    } finally {
      setIsLoadingFileInfo(false);
    }
  };

  const handleDownload = async (fileKey: string, fileName?: string) => {
    setIsDownloading(fileKey);
    setError(null);
    try {
      const blob = await downloadFile(fileKey);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `file-${fileKey.slice(0, 8)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDelete = async (fileKey: string) => {
    if (!selectedBucketId) return;
    if (!confirm('Are you sure you want to delete this file?')) return;

    setIsDeleting(fileKey);
    setError(null);
    try {
      await requestDeleteFile(selectedBucketId, fileKey);
      await loadFiles();
      if (selectedFile?.fileKey === fileKey) {
        setSelectedFile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setIsDeleting(null);
    }
  };

  const getUploadSteps = () => {
    const steps = [
      { label: 'Preparing file...', status: 'pending' as const },
      { label: 'Issuing storage request...', status: 'pending' as const },
      { label: 'Waiting for MSP confirmation...', status: 'pending' as const },
      { label: 'Finalizing...', status: 'pending' as const },
      { label: 'Done!', status: 'pending' as const },
    ];

    const stepMap: Record<string, number> = {
      preparing: 0,
      issuing: 1,
      uploading: 1, // Same as issuing for simplicity
      confirming: 2,
      finalizing: 3,
      done: 4,
    };

    const currentStep = stepMap[uploadProgress.step] ?? -1;

    return steps.map((step, index) => ({
      ...step,
      status:
        uploadProgress.step === 'error' && index === currentStep
          ? 'error'
          : index < currentStep
            ? 'completed'
            : index === currentStep
              ? 'active'
              : 'pending',
    })) as { label: string; status: 'pending' | 'active' | 'completed' | 'error' }[];
  };

  const truncateHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ready':
        return <StatusBadge status="ready" />;
      case 'pending':
        return <StatusBadge status="pending" />;
      case 'rejected':
      case 'revoked':
      case 'expired':
        return <StatusBadge status="error" label={status} />;
      default:
        return <StatusBadge status="pending" label={status || 'Unknown'} />;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
        <p className="text-gray-400">Please connect your wallet and authenticate on the Dashboard first.</p>
        <a href="/" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Files</h1>
        <p className="mt-1 text-gray-400">Upload, download, and manage files in your buckets.</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Bucket Selector */}
      <Card title="Select Bucket">
        <div className="flex items-center space-x-4">
          <select
            value={selectedBucketId}
            onChange={handleBucketChange}
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoadingBuckets}
          >
            {buckets.length === 0 ? (
              <option value="">No buckets - create one first</option>
            ) : (
              buckets.map((bucket) => (
                <option key={bucket.bucketId} value={bucket.bucketId}>
                  {bucket.name || truncateHash(bucket.bucketId)}
                </option>
              ))
            )}
          </select>
          <Button variant="secondary" size="sm" onClick={loadBuckets} isLoading={isLoadingBuckets}>
            Refresh
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Form */}
        <Card title="Upload File" className="lg:col-span-1">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Select File</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                disabled={
                  !selectedBucketId ||
                  (uploadProgress.step !== 'idle' && uploadProgress.step !== 'done' && uploadProgress.step !== 'error')
                }
              />
            </div>

            {selectedUploadFile && (
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-sm text-white">{selectedUploadFile.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(selectedUploadFile.size)}</p>
              </div>
            )}

            <Button
              onClick={handleUpload}
              isLoading={
                uploadProgress.step !== 'idle' && uploadProgress.step !== 'done' && uploadProgress.step !== 'error'
              }
              disabled={
                !selectedUploadFile ||
                !selectedBucketId ||
                (uploadProgress.step !== 'idle' && uploadProgress.step !== 'done' && uploadProgress.step !== 'error')
              }
              className="w-full"
            >
              Upload File
            </Button>

            {uploadProgress.step !== 'idle' && (
              <div className="mt-4">
                <ProgressStepper steps={getUploadSteps()} />
              </div>
            )}
          </div>
        </Card>

        {/* File List */}
        <Card title="Files in Bucket" className="lg:col-span-2">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={loadFiles} isLoading={isLoadingFiles}>
                Refresh
              </Button>
            </div>

            {!selectedBucketId ? (
              <div className="text-center py-8 text-gray-400">Select a bucket to view files.</div>
            ) : isLoadingFiles ? (
              <div className="text-center py-8 text-gray-400">Loading files...</div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No files in this bucket. Upload your first file.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Size</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.fileKey} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-3 px-4 text-sm text-white">{file.name || truncateHash(file.fileKey)}</td>
                        <td className="py-3 px-4 text-sm text-gray-300">{formatFileSize(file.size)}</td>
                        <td className="py-3 px-4">{getStatusBadge(file.status)}</td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleViewFile(file.fileKey)}
                            isLoading={isLoadingFileInfo}
                          >
                            Info
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleDownload(file.fileKey, file.name)}
                            isLoading={isDownloading === file.fileKey}
                            disabled={file.status !== 'ready'}
                          >
                            Download
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(file.fileKey)}
                            isLoading={isDeleting === file.fileKey}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* File Info Panel */}
      {selectedFile && (
        <Card title="File Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">File Key</p>
              <p className="text-sm font-mono text-gray-300 break-all">{selectedFile.fileKey}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Location</p>
              <p className="text-sm text-gray-300">{selectedFile.location || 'Unknown'}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Size</p>
              <p className="text-sm text-gray-300">{formatFileSize(Number(selectedFile.size))}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Bucket ID</p>
              <p className="text-sm font-mono text-gray-300 break-all">{selectedFile.bucketId}</p>
            </div>
            {selectedFile.fingerprint && (
              <div className="bg-gray-900 rounded-lg p-4 md:col-span-2">
                <p className="text-xs text-gray-500 mb-1">Fingerprint</p>
                <p className="text-sm font-mono text-gray-300 break-all">{selectedFile.fingerprint}</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
