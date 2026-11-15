import React, { useState, useEffect, useCallback } from 'react';
import {
  Tv,
  Plus,
  RefreshCw,
  X,
  Video,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit2,
  QrCode,
  Radio,
  Globe,
  Check,
  ShieldAlert,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  fetchCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  testRegisteredCamera,
  testCameraConnection,
  discoverONVIFCameras,
  revokeMobilePairing,
} from '../../services/cameraApi';
import {
  CameraDevice,
  CameraCreatePayload,
  CameraTestResult,
  ONVIFDiscoveredCamera,
} from '../../types/camera';
import { formatApiErrorMessage } from '../../utils/apiError';
import { apiClient } from '../../services/api';
import { CameraPreview } from '../../components/CameraPreview';

interface PhysicalWebcam {
  deviceId: string;
  label: string;
}

export const CameraManagementPage: React.FC = () => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isOnvifModalOpen, setIsOnvifModalOpen] = useState<boolean>(false);

  // Selected camera for Preview / Edit / Test
  const [selectedCamera, setSelectedCamera] = useState<CameraDevice | null>(null);
  const [testResult, setTestResult] = useState<CameraTestResult | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  // Mobile pairing state
  const [pairingMode, setPairingMode] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [mobileUrl, setMobileUrl] = useState<string>('');
  const [pairingLoading, setPairingLoading] = useState<boolean>(false);

  // ONVIF Discovery State
  const [discoveringOnvif, setDiscoveringOnvif] = useState<boolean>(false);
  const [onvifCameras, setOnvifCameras] = useState<ONVIFDiscoveredCamera[]>([]);

  // Physical webcams discovered on host
  const [physicalWebcams, setPhysicalWebcams] = useState<PhysicalWebcam[]>([]);

  // Add / Edit Form State
  const [formData, setFormData] = useState<CameraCreatePayload>({
    name: '',
    location: '',
    source_type: 'WEBCAM',
    device_id: '',
    stream_url: '0',
    assigned_class: '',
    target_fps: 15,
    resolution: '1280x720',
  });

  const [formTestResult, setFormTestResult] = useState<CameraTestResult | null>(null);
  const [formTesting, setFormTesting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCameras();
      setCameras(list);
    } catch (err) {
      console.error('Failed to load cameras:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Enumerate hardware webcam inputs
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const vInputs = devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, idx) => ({
              deviceId: d.deviceId,
              label: d.label || `Hardware Webcam ${idx + 1}`,
            }));
          setPhysicalWebcams(vInputs);
          if (vInputs.length > 0 && !formData.device_id) {
            setFormData((prev) => ({ ...prev, device_id: vInputs[0].deviceId }));
          }
        })
        .catch((e) => console.warn('Webcam enumeration notice:', e));
    }
  }, [loadData]);

  // Periodic health check refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCameras().then(setCameras).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Open Preview Modal
  const handleOpenPreview = (cam: CameraDevice) => {
    setSelectedCamera(cam);
    setIsPreviewModalOpen(true);
  };

  // Execute Real Diagnostic Test on Registered Camera
  const handleRunTest = async (cam: CameraDevice) => {
    setSelectedCamera(cam);
    setIsTesting(true);
    setTestResult(null);
    setIsTestModalOpen(true);

    try {
      const res = await testRegisteredCamera(cam.id);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'CAMERA ERROR',
        message: formatApiErrorMessage(err, 'Camera diagnostic failed to connect.'),
        connection: false,
        stream: false,
        frames: false,
        detector: false,
        fps: 0,
        latency_ms: 0,
      });
    } finally {
      setIsTesting(false);
      loadData();
    }
  };

  // Test Camera Connection in Add Modal before saving
  const handleTestInForm = async () => {
    setFormTesting(true);
    setFormTestResult(null);
    try {
      const res = await testCameraConnection(formData.stream_url || undefined, formData.device_id || undefined);
      setFormTestResult(res);
      if (res.resolution) {
        setFormData((prev) => ({ ...prev, resolution: res.resolution || prev.resolution }));
      }
    } catch (err: any) {
      setFormTestResult({
        success: false,
        status: 'CONNECTION FAILED',
        message: formatApiErrorMessage(err, 'Failed to establish test stream.'),
        connection: false,
        stream: false,
        frames: false,
        detector: false,
        fps: 0,
        latency_ms: 0,
      });
    } finally {
      setFormTesting(false);
    }
  };

  // Run ONVIF Network Discovery
  const handleDiscoverOnvif = async () => {
    setDiscoveringOnvif(true);
    setIsOnvifModalOpen(true);
    try {
      const res = await discoverONVIFCameras(2.0);
      setOnvifCameras(res.cameras || []);
    } catch (err) {
      console.warn('ONVIF discovery error:', err);
    } finally {
      setDiscoveringOnvif(false);
    }
  };

  // Start QR Pairing for mobile phone
  const handleGenerateMobileQR = async (existingCamId?: string) => {
    setPairingLoading(true);
    try {
      const res = await apiClient.post('/cameras/mobile-pairing', null, {
        params: {
          camera_id: existingCamId || undefined,
          camera_name: formData.name || 'Mobile Phone Camera',
          location: formData.location || 'Classroom',
          assigned_class: formData.assigned_class || undefined,
        },
      });

      const host = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : '';
      const protocol = window.location.protocol;
      const url = `${protocol}//${host}${port}/mobile-camera?camera_id=${res.data.camera_id}&token=${res.data.token}`;

      setMobileUrl(url);
      const qr = await QRCode.toDataURL(url, { width: 280, margin: 2 });
      setQrDataUrl(qr);
      setPairingMode(true);
      loadData();
    } catch (err) {
      alert('Could not generate mobile pairing token.');
    } finally {
      setPairingLoading(false);
    }
  };

  // Revoke Mobile Pairing
  const handleRevokePairing = async (cam: CameraDevice) => {
    if (window.confirm(`Revoke wireless pairing for "${cam.name}"?`)) {
      try {
        await revokeMobilePairing(cam.id);
        loadData();
      } catch (err) {
        alert('Failed to revoke mobile pairing.');
      }
    }
  };

  // Handle Delete Camera
  const handleDelete = async (cam: CameraDevice) => {
    if (window.confirm(`Are you sure you want to delete camera "${cam.name}"?`)) {
      try {
        await deleteCamera(cam.id);
        loadData();
      } catch (err) {
        alert('Failed to delete camera.');
      }
    }
  };

  // Create Camera Submit
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.source_type === 'MOBILE') {
      await handleGenerateMobileQR();
      return;
    }

    try {
      await createCamera(formData);
      setIsAddModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to add camera.'));
    }
  };

  // Edit Camera Submit
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCamera) return;

    try {
      await updateCamera(selectedCamera.id, formData);
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to update camera.'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Camera Infrastructure</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Physical live camera sources: USB Webcams, Wireless Smartphone Stations, and CCTV / RTSP Streams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscoverOnvif}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition border border-slate-200"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            <span>Discover ONVIF</span>
          </button>

          <button
            onClick={() => {
              setPairingMode(false);
              setQrDataUrl(null);
              setFormTestResult(null);
              setFormData({
                name: '',
                location: '',
                source_type: 'WEBCAM',
                device_id: physicalWebcams[0]?.deviceId || '',
                stream_url: '0',
                assigned_class: '',
                target_fps: 15,
                resolution: '1280x720',
              });
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Camera</span>
          </button>
        </div>
      </div>

      {/* Camera Grid or Real Empty State */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
          Loading camera infrastructure...
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <Tv className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-800">No cameras configured</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Connect a hardware webcam, pair your smartphone wirelessly via QR, or register an RTSP classroom CCTV stream.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register First Camera</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cameras.map((cam) => {
            const isStreaming = cam.status === 'STREAMING' || cam.status === 'CONNECTED';
            const isNoFrame = cam.status === 'NO_FRAME';

            return (
              <div
                key={cam.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Header: Icon, Title, Type & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                        {cam.source_type === 'MOBILE' ? (
                          <Smartphone className="w-4 h-4 text-blue-600" />
                        ) : cam.source_type === 'RTSP' ? (
                          <Radio className="w-4 h-4 text-purple-600" />
                        ) : (
                          <Video className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm leading-tight">{cam.name}</h3>
                        <p className="text-xs text-slate-500">
                          {cam.location}
                          {cam.assigned_class && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[10px]">
                              {cam.assigned_class}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isStreaming
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isNoFrame
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isStreaming ? 'bg-emerald-500 animate-pulse' : isNoFrame ? 'bg-amber-500' : 'bg-slate-400'
                        }`}
                      />
                      <span>{cam.status}</span>
                    </span>
                  </div>

                  {/* Metadata telemetry card */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Source:</span>
                      <span className="font-semibold text-slate-700">{cam.source_type}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Resolution & FPS:</span>
                      <span className="font-mono text-slate-700">
                        {cam.resolution} · {cam.fps > 0 ? `${cam.fps} FPS` : `${cam.target_fps} FPS target`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 font-medium">Last frame received:</span>
                      <span className="font-medium text-slate-700">
                        {cam.seconds_since_last_frame !== null && cam.seconds_since_last_frame !== undefined
                          ? `${cam.seconds_since_last_frame}s ago`
                          : 'Awaiting stream'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenPreview(cam)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold transition"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleRunTest(cam)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                    >
                      Test
                    </button>
                    {cam.source_type === 'MOBILE' && (
                      <button
                        onClick={() => {
                          setSelectedCamera(cam);
                          setFormData({
                            name: cam.name,
                            location: cam.location,
                            source_type: 'MOBILE',
                            assigned_class: cam.assigned_class || '',
                            target_fps: cam.target_fps,
                            resolution: cam.resolution,
                          });
                          handleGenerateMobileQR(cam.id);
                          setIsAddModalOpen(true);
                        }}
                        title="Re-pair Smartphone QR"
                        className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {cam.source_type === 'MOBILE' && isStreaming && (
                      <button
                        onClick={() => handleRevokePairing(cam)}
                        title="Revoke Pairing Session"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedCamera(cam);
                        setFormData({
                          name: cam.name,
                          location: cam.location,
                          source_type: cam.source_type,
                          device_id: cam.device_id || '',
                          stream_url: cam.stream_url || '',
                          assigned_class: cam.assigned_class || '',
                          target_fps: cam.target_fps,
                          resolution: cam.resolution,
                          is_active: cam.is_active,
                        });
                        setIsEditModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(cam)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Camera Live Preview */}
      {isPreviewModalOpen && selectedCamera && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>{selectedCamera.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
                    {selectedCamera.source_type}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">{selectedCamera.location}</p>
              </div>
              <button onClick={() => setIsPreviewModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Reusable Camera Preview */}
            <CameraPreview camera={selectedCamera} />

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3 text-center bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
              <div>
                <div className="text-slate-400 text-[10px]">Resolution</div>
                <div className="font-bold text-slate-800 mt-0.5">{selectedCamera.resolution}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Live Telemetry</div>
                <div className="font-bold text-slate-800 mt-0.5">
                  {selectedCamera.fps > 0 ? `${selectedCamera.fps} FPS` : '0 FPS'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Assigned Class</div>
                <div className="font-bold text-blue-600 mt-0.5">{selectedCamera.assigned_class || 'All Classes'}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setIsPreviewModalOpen(false);
                  handleRunTest(selectedCamera);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Run Diagnostic
              </button>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Real Camera Diagnostic Test Result */}
      {isTestModalOpen && selectedCamera && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Diagnostic Verification</h3>
                <p className="text-xs text-slate-500">
                  {selectedCamera.name} ({selectedCamera.location})
                </p>
              </div>
              <button onClick={() => setIsTestModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isTesting ? (
              <div className="py-10 text-center space-y-3 text-xs text-slate-500">
                <RefreshCw className="w-7 h-7 animate-spin mx-auto text-blue-600" />
                <p className="font-medium">Testing connection, stream decoding, and face detector...</p>
              </div>
            ) : testResult ? (
              <div className="space-y-4 text-xs">
                <div
                  className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-sm">{testResult.status}</div>
                    <div className="text-[11px] opacity-90">{testResult.message}</div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">IP / Socket Handshake</span>
                    <span className={testResult.connection ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {testResult.connection ? '✓ Pass' : '✗ Fail'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Stream Ingestion</span>
                    <span className={testResult.stream ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {testResult.stream ? '✓ Pass' : '✗ Fail'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Frame Decoding</span>
                    <span className={testResult.frames ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {testResult.frames ? '✓ Pass' : '✗ Fail'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Face Detector Pipeline</span>
                    <span className={testResult.detector ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                      {testResult.detector ? '✓ Verified' : '⚠ Skipped/Warning'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Measured Resolution</span>
                    <span className="font-bold text-slate-800">{testResult.resolution || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Frame Latency</span>
                    <span className="font-bold text-slate-800">{testResult.latency_ms} ms</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsTestModalOpen(false)}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm text-xs"
                >
                  Done
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal: Register Camera (3 Physical Source Types ONLY) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {pairingMode ? 'Smartphone Wireless Pairing' : 'Register Camera Source'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pairingMode && qrDataUrl ? (
              <div className="text-center space-y-4 py-2">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block shadow-inner">
                  <img src={qrDataUrl} alt="Mobile Camera Pairing QR" className="w-56 h-56 mx-auto rounded-lg" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900">Scan with smartphone browser</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Opens the dedicated wireless camera station on your phone. Connects via real-time frame transport.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded-lg truncate select-all border border-slate-200">
                  {mobileUrl}
                </div>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    loadData();
                  }}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
                >
                  Done & Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4 text-xs">
                {/* 3-Tab Physical Source Selector */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">1. Select Camera Source</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, source_type: 'WEBCAM', stream_url: '0' })}
                      className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition ${
                        formData.source_type === 'WEBCAM'
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Video className="w-4 h-4" />
                      <span>Webcam</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, source_type: 'MOBILE', stream_url: 'mobile://qr' })}
                      className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition ${
                        formData.source_type === 'MOBILE'
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Mobile Phone</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, source_type: 'RTSP', stream_url: '' })}
                      className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition ${
                        formData.source_type === 'RTSP'
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Radio className="w-4 h-4" />
                      <span>CCTV / RTSP</span>
                    </button>
                  </div>
                </div>

                {/* Dynamic Configuration Fields */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <label className="font-semibold text-slate-700">2. Configuration</label>

                  {formData.source_type === 'WEBCAM' && physicalWebcams.length > 0 && (
                    <div className="space-y-1">
                      <label className="font-medium text-slate-600">Hardware Video Device</label>
                      <select
                        value={formData.device_id || ''}
                        onChange={(e) => {
                          const dev = physicalWebcams.find((p) => p.deviceId === e.target.value);
                          setFormData({
                            ...formData,
                            device_id: e.target.value,
                            name: formData.name || dev?.label || 'Hardware Webcam',
                          });
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                      >
                        {physicalWebcams.map((p) => (
                          <option key={p.deviceId} value={p.deviceId}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.source_type === 'RTSP' && (
                    <div className="space-y-1">
                      <label className="font-medium text-slate-600">RTSP Stream URL *</label>
                      <input
                        type="text"
                        required
                        placeholder="rtsp://username:password@192.168.1.100:554/live/ch0"
                        value={formData.stream_url || ''}
                        onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="font-medium text-slate-600">Camera Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Room 204 Front CCTV"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="font-medium text-slate-600">Location *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Room 204"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-medium text-slate-600">Assigned Class</label>
                      <input
                        type="text"
                        placeholder="e.g. CSE-4A"
                        value={formData.assigned_class || ''}
                        onChange={(e) => setFormData({ ...formData, assigned_class: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {formData.source_type !== 'MOBILE' && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleTestInForm}
                        disabled={formTesting || (!formData.stream_url && !formData.device_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition border border-slate-200 disabled:opacity-50"
                      >
                        {formTesting && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                        <span>Test Feed Connection</span>
                      </button>

                      {formTestResult && (
                        <div
                          className={`mt-2 p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                            formTestResult.success
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-rose-50 border-rose-200 text-rose-800'
                          }`}
                        >
                          {formTestResult.success ? (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>{formTestResult.message}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pairingLoading}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm flex items-center gap-1.5"
                  >
                    {pairingLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{formData.source_type === 'MOBILE' ? 'Generate Pairing QR' : 'Save Camera'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Edit Camera */}
      {isEditModalOpen && selectedCamera && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Edit Camera</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Camera Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Location *</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Assigned Class</label>
                  <input
                    type="text"
                    value={formData.assigned_class || ''}
                    onChange={(e) => setFormData({ ...formData, assigned_class: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {formData.source_type === 'RTSP' && (
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">RTSP Stream URL</label>
                  <input
                    type="text"
                    value={formData.stream_url || ''}
                    onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                >
                  Update Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: ONVIF IP Camera Discovery */}
      {isOnvifModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">ONVIF IP Camera Discovery</h3>
                <p className="text-xs text-slate-500">Scanning local LAN subnet for WS-Discovery endpoints...</p>
              </div>
              <button onClick={() => setIsOnvifModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {discoveringOnvif ? (
              <div className="py-12 text-center space-y-3 text-xs text-slate-500">
                <RefreshCw className="w-7 h-7 animate-spin mx-auto text-blue-600" />
                <p className="font-medium">Probing local subnet (239.255.255.250:3702)...</p>
              </div>
            ) : onvifCameras.length === 0 ? (
              <div className="py-10 text-center space-y-2 text-xs text-slate-500">
                <Radio className="w-8 h-8 mx-auto text-slate-300" />
                <p className="font-semibold text-slate-700">No ONVIF cameras responded on local subnet</p>
                <p className="text-slate-400 max-w-xs mx-auto text-[11px]">
                  Make sure your IP cameras are powered on, connected to the same LAN, and have ONVIF discovery enabled.
                </p>
                <button
                  onClick={handleDiscoverOnvif}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition"
                >
                  Scan Again
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {onvifCameras.map((onvifCam, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 transition bg-slate-50/50 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{onvifCam.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {onvifCam.ip}:{onvifCam.port} · {onvifCam.manufacturer || 'ONVIF Device'}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate max-w-xs">
                        {onvifCam.rtsp_url_hint}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFormData({
                          name: onvifCam.name,
                          location: 'Classroom',
                          source_type: 'RTSP',
                          stream_url: onvifCam.rtsp_url_hint,
                          target_fps: 15,
                          resolution: '1920x1080',
                        });
                        setIsOnvifModalOpen(false);
                        setIsAddModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shrink-0 text-xs shadow-sm"
                    >
                      Use Camera
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsOnvifModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
