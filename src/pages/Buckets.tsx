import { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressStepper } from '../components/ProgressStepper';
import {
  createBucket,
  verifyBucketCreation,
  waitForBackendBucketReady,
  deleteBucket,
  getBucketsFromMSP,
} from '../operations';
import { EyeIcon, TrashIcon } from '../components/Icons';
import type { Bucket, BucketInfo, BucketCreationProgress } from '../types';

export function Buckets() {
  const { isAuthenticated, isMspConnected, handleAuthError } = useAppState();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<BucketInfo | null>(null);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
  const [isLoadingBucketInfo, setIsLoadingBucketInfo] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create bucket form
  const [bucketName, setBucketName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [createProgress, setCreateProgress] = useState<BucketCreationProgress>({
    step: 'idle',
    message: '',
  });

  const loadBuckets = useCallback(async () => {
    if (!isMspConnected) return;
    setIsLoadingBuckets(true);
    setError(null);
    try {
      const data = await getBucketsFromMSP();
      setBuckets(data);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof Error ? err.message : 'Failed to load buckets');
      }
    } finally {
      setIsLoadingBuckets(false);
    }
  }, [isMspConnected, handleAuthError]);

  useEffect(() => {
    if (isMspConnected) {
      loadBuckets();
    }
  }, [isMspConnected, loadBuckets]);

  const handleViewBucket = async (bucketId: string) => {
    setSelectedBucketId(bucketId);
    setIsLoadingBucketInfo(true);
    setError(null);
    try {
      const info = await verifyBucketCreation(bucketId);
      setSelectedBucket(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bucket info');
    } finally {
      setIsLoadingBucketInfo(false);
    }
  };

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucketName.trim()) return;

    setError(null);

    try {
      // Step 1: Create bucket on-chain
      setCreateProgress({ step: 'creating', message: 'Creating bucket on-chain...' });
      const { bucketId } = await createBucket(bucketName, isPrivate);

      // Step 2: Verify on-chain
      setCreateProgress({ step: 'verifying', message: 'Verifying bucket on-chain...' });
      await verifyBucketCreation(bucketId);

      // Step 3: Wait for backend
      setCreateProgress({ step: 'waiting', message: 'Waiting for backend to index...' });
      await waitForBackendBucketReady(bucketId);

      // Done
      setCreateProgress({ step: 'done', message: 'Bucket created successfully!' });
      setBucketName('');

      // Refresh bucket list
      await loadBuckets();

      // Reset progress after a delay
      setTimeout(() => {
        setCreateProgress({ step: 'idle', message: '' });
      }, 2000);
    } catch (err) {
      setCreateProgress({
        step: 'error',
        message: err instanceof Error ? err.message : 'Failed to create bucket',
      });
      setError(err instanceof Error ? err.message : 'Failed to create bucket');
    }
  };

  const handleDeleteBucket = async (bucketId: string) => {
    if (!confirm('Are you sure you want to delete this bucket?')) return;

    setIsDeleting(bucketId);
    setError(null);
    try {
      await deleteBucket(bucketId);
      await loadBuckets();
      if (selectedBucketId === bucketId) {
        setSelectedBucket(null);
        setSelectedBucketId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bucket');
    } finally {
      setIsDeleting(null);
    }
  };

  const getProgressSteps = () => {
    const steps = [
      { label: 'Creating bucket on-chain...', status: 'pending' as const },
      { label: 'Verifying on-chain...', status: 'pending' as const },
      { label: 'Waiting for backend...', status: 'pending' as const },
      { label: 'Done!', status: 'pending' as const },
    ];

    const stepMap: Record<string, number> = {
      creating: 0,
      verifying: 1,
      waiting: 2,
      done: 3,
    };

    const currentStep = stepMap[createProgress.step] ?? -1;

    return steps.map((step, index) => ({
      ...step,
      status:
        createProgress.step === 'error' && index === currentStep
          ? 'error'
          : index < currentStep
            ? 'completed'
            : index === currentStep
              ? 'active'
              : 'pending',
    })) as { label: string; status: 'pending' | 'active' | 'completed' | 'error' }[];
  };

  const truncateHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
        <p className="text-dh-300">Please connect your wallet and authenticate on the Dashboard first.</p>
        <a href="/" className="mt-4 inline-block text-sage-400 hover:text-sage-300">
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Buckets (Folders)</h1>
        <p className="mt-1 text-dh-300">Create and manage your storage buckets (folders).</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Bucket Form */}
        <Card title="Create Bucket (Folder)" className="lg:col-span-1">
          <form onSubmit={handleCreateBucket} className="space-y-4">
            <div>
              <label htmlFor="bucketName" className="block text-sm font-medium text-dh-200 mb-1">
                Bucket (Folder) Name
              </label>
              <input
                type="text"
                id="bucketName"
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                placeholder="my-bucket"
                className="w-full px-3 py-2 bg-dh-900 border border-dh-700 rounded-lg text-white placeholder-dh-400 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                disabled={
                  createProgress.step !== 'idle' && createProgress.step !== 'done' && createProgress.step !== 'error'
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dh-200 mb-2">Privacy</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  disabled={
                    createProgress.step !== 'idle' && createProgress.step !== 'done' && createProgress.step !== 'error'
                  }
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    !isPrivate
                      ? 'bg-sage-600 border-sage-600 text-white'
                      : 'bg-dh-900 border-dh-700 text-dh-300 hover:border-dh-600'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  disabled={
                    createProgress.step !== 'idle' && createProgress.step !== 'done' && createProgress.step !== 'error'
                  }
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    isPrivate
                      ? 'bg-sage-600 border-sage-600 text-white'
                      : 'bg-dh-900 border-dh-700 text-dh-300 hover:border-dh-600'
                  }`}
                >
                  Private
                </button>
              </div>
            </div>

            <Button
              type="submit"
              isLoading={
                createProgress.step !== 'idle' && createProgress.step !== 'done' && createProgress.step !== 'error'
              }
              disabled={
                !bucketName.trim() ||
                (createProgress.step !== 'idle' && createProgress.step !== 'done' && createProgress.step !== 'error')
              }
              className="w-full"
            >
              Create Bucket (Folder)
            </Button>

            {createProgress.step !== 'idle' && (
              <div className="mt-4">
                <ProgressStepper steps={getProgressSteps()} />
              </div>
            )}
          </form>
        </Card>

        {/* Bucket List */}
        <Card title="Your Buckets (Folders)" className="lg:col-span-2">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={loadBuckets} isLoading={isLoadingBuckets}>
                Refresh
              </Button>
            </div>

            {isLoadingBuckets ? (
              <div className="text-center py-8 text-dh-300">Loading buckets...</div>
            ) : buckets.length === 0 ? (
              <div className="text-center py-8 text-dh-300">
                No buckets found. Create your first bucket to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dh-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-dh-300">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-dh-300">Bucket ID</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-dh-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((bucket) => (
                      <tr
                        key={bucket.bucketId}
                        className={`border-b border-dh-700/50 hover:bg-dh-700/30 ${
                          selectedBucketId === bucket.bucketId ? 'bg-dh-700/50' : ''
                        }`}
                      >
                        <td className="py-3 px-4 text-sm text-white">{bucket.name || 'Unnamed'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-dh-200">{truncateHash(bucket.bucketId)}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleViewBucket(bucket.bucketId)}
                              disabled={isLoadingBucketInfo && selectedBucketId === bucket.bucketId}
                              className="p-2 rounded-lg text-dh-300 hover:text-sage-400 hover:bg-dh-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="View"
                            >
                              <EyeIcon />
                            </button>
                            <button
                              onClick={() => handleDeleteBucket(bucket.bucketId)}
                              disabled={isDeleting === bucket.bucketId}
                              className="p-2 rounded-lg text-dh-300 hover:text-red-400 hover:bg-dh-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="Delete"
                            >
                              <TrashIcon />
                            </button>
                          </div>
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

      {/* Bucket Details Modal */}
      {(selectedBucket || isLoadingBucketInfo) && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (!isLoadingBucketInfo) {
              setSelectedBucket(null);
              setSelectedBucketId(null);
            }
          }}
        >
          <div
            className="bg-dh-800 border border-dh-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-dh-700">
              <h3 className="text-lg font-semibold text-white">Bucket Details</h3>
              <button
                onClick={() => {
                  setSelectedBucket(null);
                  setSelectedBucketId(null);
                }}
                className="text-dh-300 hover:text-white transition-colors"
                disabled={isLoadingBucketInfo}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {isLoadingBucketInfo ? (
                <div className="text-center py-8 text-dh-300">Loading bucket details...</div>
              ) : selectedBucket ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-dh-900 rounded-lg p-4">
                    <p className="text-xs text-dh-400 mb-1">Bucket ID</p>
                    <p className="text-sm font-mono text-dh-200 break-all">{selectedBucketId}</p>
                  </div>
                  <div className="bg-dh-900 rounded-lg p-4">
                    <p className="text-xs text-dh-400 mb-1">Owner (User ID)</p>
                    <p className="text-sm font-mono text-dh-200 break-all">{selectedBucket.userId}</p>
                  </div>
                  <div className="bg-dh-900 rounded-lg p-4">
                    <p className="text-xs text-dh-400 mb-1">MSP ID</p>
                    <p className="text-sm font-mono text-dh-200 break-all">{selectedBucket.mspId}</p>
                  </div>
                  <div className="bg-dh-900 rounded-lg p-4">
                    <p className="text-xs text-dh-400 mb-1">Privacy</p>
                    <StatusBadge
                      status={selectedBucket.private ? 'pending' : 'healthy'}
                      label={selectedBucket.private ? 'Private' : 'Public'}
                    />
                  </div>
                  {selectedBucket.root && (
                    <div className="bg-dh-900 rounded-lg p-4">
                      <p className="text-xs text-dh-400 mb-1">Root Hash</p>
                      <p className="text-sm font-mono text-dh-200 break-all">{selectedBucket.root}</p>
                    </div>
                  )}
                  {selectedBucket.valuePropositionId && (
                    <div className="bg-dh-900 rounded-lg p-4">
                      <p className="text-xs text-dh-400 mb-1">Value Proposition ID</p>
                      <p className="text-sm font-mono text-dh-200 break-all">{selectedBucket.valuePropositionId}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
