import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiCheckCircle, FiX, FiStar, FiCamera, FiAlertCircle, FiMapPin, FiRefreshCw, FiRotateCcw } from 'react-icons/fi';

const MAX_DISTANCE_METERS = 50;

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const QRScanner = () => {
  const [permissionState, setPermissionState] = useState('prompt');
  const [scanning, setScanning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [attendanceData, setAttendanceData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [distanceInfo, setDistanceInfo] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({
    teachingQuality: 5, contentClarity: 5, classroomEnvironment: 5,
    comments: '', isAnonymous: false
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const navigate = useNavigate();

  // Load camera list
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      const cams = devices.filter(d => d.kind === 'videoinput');
      setCameras(cams);
      if (cams.length > 0) setSelectedCameraId(cams[0].deviceId);
    }).catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraReady(false);
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) { animFrameRef.current = requestAnimationFrame(scanFrame); return; }
    if (video.readyState < 2) { animFrameRef.current = requestAnimationFrame(scanFrame); return; }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) handleScan(code.data);
    else animFrameRef.current = requestAnimationFrame(scanFrame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async (deviceId) => {
    setCameraError(null);
    setCameraReady(false);
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: 'environment' } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        let started = false;
        const go = () => { if (started) return; started = true; setCameraReady(true); scanFrame(); };
        videoRef.current.onloadedmetadata = go;
        videoRef.current.oncanplay = go;
        setTimeout(() => { if (!started) go(); }, 1500);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') { setPermissionState('denied'); setCameraError('Camera permission denied.'); }
      else if (err.name === 'NotFoundError') { setCameraError('No camera found.'); }
      else { setCameraError('Camera error: ' + err.message); }
    }
  }, [scanFrame]);

  useEffect(() => {
    if (scanning) startCamera(selectedCameraId);
    return () => stopCamera();
  }, [scanning, selectedCameraId, startCamera, stopCamera]);

  const switchCamera = () => {
    if (cameras.length <= 1) { toast.info('Only one camera available'); return; }
    const currentIdx = cameras.findIndex(c => c.deviceId === selectedCameraId);
    const nextIdx = (currentIdx + 1) % cameras.length;
    const nextId = cameras[nextIdx].deviceId;
    setSelectedCameraId(nextId);
    stopCamera();
    setTimeout(() => startCamera(nextId), 300);
    toast.info(`Camera: ${cameras[nextIdx].label || `Camera ${nextIdx + 1}`}`, { autoClose: 2000 });
  };

  const requestPermissionsAndStart = async () => {
    setPermissionState('requesting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      // Re-enumerate after permission granted (labels now available)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      setCameras(cams);
      if (cams.length > 0) setSelectedCameraId(cams[0].deviceId);
      setPermissionState('granted');
      setScanning(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') setPermissionState('denied');
      else { setPermissionState('granted'); setScanning(true); }
    }
  };

  const getStudentLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => reject(new Error(err.code === 1 ? 'Location permission denied.' : 'Could not get location.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const handleScan = async (data) => {
    if (!data || !scanning) return;
    setScanning(false);
    stopCamera();
    try {
      let qrData;
      try { qrData = JSON.parse(data); } catch { qrData = { token: data }; }

      if (qrData.lat && qrData.lng) {
        setLocationStatus('checking');
        toast.info('📍 Verifying location...', { autoClose: 3000 });
        try {
          const loc = await getStudentLocation();
          const dist = getDistanceMeters(loc.lat, loc.lng, qrData.lat, qrData.lng);
          setDistanceInfo({ distance: Math.round(dist), accuracy: Math.round(loc.accuracy) });
          if (dist > MAX_DISTANCE_METERS) {
            setLocationStatus('far');
            toast.error(`🚫 ${Math.round(dist)}m away. Must be within ${MAX_DISTANCE_METERS}m.`, { autoClose: 6000 });
            setScanning(true); return;
          }
          setLocationStatus('ok');
          toast.success(`✅ ${Math.round(dist)}m from classroom`, { autoClose: 2000 });
        } catch (locErr) {
          setLocationStatus('denied');
          toast.error(`📍 ${locErr.message}`);
          setScanning(true); return;
        }
      }

      const token = localStorage.getItem('token');
      const googleUser = localStorage.getItem('googleUser');
      const user = googleUser ? JSON.parse(googleUser) : null;
      if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      const response = await axios.post('/api/attendance/mark', {
        token: qrData.token,
        studentId: user?.id || user?.email,
        location: distanceInfo,
        deviceInfo: { userAgent: navigator.userAgent }
      });

      setSuccess(true);
      setAttendanceData(response.data.attendance);
      toast.success(response.data.message || 'Attendance marked!');
      setTimeout(() => { setSuccess(false); setShowFeedback(true); }, 2000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to mark attendance');
      setScanning(true);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/feedback/submit', { ...feedbackForm, classId: attendanceData?.class, attendanceId: attendanceData?._id });
      toast.success('Thank you for your feedback!');
      setTimeout(() => navigate('/student'), 1500);
    } catch { toast.error('Failed to submit feedback'); }
  };

  const StarRating = ({ value, onChange, label }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <div className="flex gap-2 items-center">
        {[1,2,3,4,5].map(star => (
          <button key={star} type="button" onClick={() => onChange(star)} className="focus:outline-none hover:scale-110 transition-transform">
            <FiStar className={`w-8 h-8 ${star <= value ? 'text-yellow-400 fill-current' : 'text-gray-300 dark:text-gray-600'}`} />
          </button>
        ))}
        <span className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">{value}/5</span>
      </div>
    </div>
  );

  // ─── Permission prompt ────────────────────────────────────────────────────
  if (permissionState === 'prompt' || permissionState === 'requesting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <FiCamera className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Camera Access Needed</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Allow camera and location to scan the QR code.</p>
          <button onClick={requestPermissionsAndStart} disabled={permissionState === 'requesting'}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {permissionState === 'requesting'
              ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Requesting...</>
              : <><FiCamera className="w-5 h-5" /> Allow Camera &amp; Start Scanning</>}
          </button>
          <button onClick={() => navigate('/student')} className="mt-3 w-full text-sm text-gray-500 py-2">Cancel</button>
        </div>
      </div>
    );
  }

  // ─── Permission denied ────────────────────────────────────────────────────
  if (permissionState === 'denied') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <FiAlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Camera Blocked</h2>
          <ol className="text-left text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-6 list-decimal list-inside">
            <li>Tap the lock icon in your browser's address bar</li>
            <li>Set Camera to <strong>Allow</strong></li>
            <li>Reload the page</li>
          </ol>
          <button onClick={() => { setPermissionState('prompt'); setCameraError(null); }}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
            <FiRefreshCw className="w-5 h-5" /> Try Again
          </button>
          <button onClick={() => navigate('/student')} className="mt-3 w-full text-sm text-gray-500 py-2">Go Back</button>
        </div>
      </div>
    );
  }

  // ─── Main scanner ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full">

        {!success && !showFeedback && (
          <>
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <FiCamera className="text-blue-600 w-6 h-6" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Scan QR Code</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={switchCamera} className="p-2 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 transition-colors" title="Switch Camera">
                  <FiRotateCcw className="w-5 h-5" />
                </button>
                <button onClick={() => navigate('/student')} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <FiX className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Camera selector */}
            {cameras.length > 0 && (
              <select className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
                value={selectedCameraId || ''}
                onChange={e => { setSelectedCameraId(e.target.value); stopCamera(); setTimeout(() => startCamera(e.target.value), 300); }}>
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${i + 1}`}</option>
                ))}
              </select>
            )}

            {/* Location status */}
            {locationStatus === 'checking' && (
              <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 rounded-lg flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">Checking location...</p>
              </div>
            )}
            {locationStatus === 'ok' && distanceInfo && (
              <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-300 rounded-lg flex items-center gap-2">
                <FiMapPin className="text-green-600 w-4 h-4" />
                <p className="text-green-800 dark:text-green-300 text-sm">✅ {distanceInfo.distance}m from classroom</p>
              </div>
            )}
            {locationStatus === 'far' && distanceInfo && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-300 rounded-lg flex items-center gap-2">
                <FiMapPin className="text-red-600 w-4 h-4" />
                <p className="text-red-800 dark:text-red-300 text-sm">🚫 {distanceInfo.distance}m away (max {MAX_DISTANCE_METERS}m)</p>
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <FiAlertCircle className="text-red-600 w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-red-800 dark:text-red-300 text-sm">{cameraError}</p>
                    <button onClick={() => startCamera(selectedCameraId)} className="mt-2 text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 flex items-center gap-1">
                      <FiRefreshCw className="w-3 h-3" /> Retry
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Camera feed */}
            <div className="relative rounded-xl overflow-hidden bg-black mb-3" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="hidden" />
              {cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-52 h-52">
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                    <div className="absolute left-2 right-2 h-0.5 bg-blue-400 opacity-80 animate-bounce" style={{ top: '50%' }} />
                  </div>
                </div>
              )}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="text-center text-white">
                    <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm">Starting camera...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-center">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ⏱️ QR valid for <strong>8 seconds</strong> &nbsp;|&nbsp; 📍 Must be within <strong>{MAX_DISTANCE_METERS}m</strong>
              </p>
            </div>
          </>
        )}

        {/* Success */}
        {success && (
          <div className="text-center py-12">
            <div className="bg-green-100 dark:bg-green-900 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4 animate-bounce">
              <FiCheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Attendance Marked! ✓</h3>
            <p className="text-gray-500 dark:text-gray-400">Loading feedback form...</p>
          </div>
        )}

        {/* Feedback */}
        {showFeedback && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Class Feedback</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Help us improve</p>
              </div>
              <button onClick={() => navigate('/student')} className="text-sm text-gray-500 hover:text-gray-700">Skip →</button>
            </div>
            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              <StarRating label="Teaching Quality" value={feedbackForm.teachingQuality} onChange={v => setFeedbackForm({...feedbackForm, teachingQuality: v})} />
              <StarRating label="Content Clarity" value={feedbackForm.contentClarity} onChange={v => setFeedbackForm({...feedbackForm, contentClarity: v})} />
              <StarRating label="Classroom Environment" value={feedbackForm.classroomEnvironment} onChange={v => setFeedbackForm({...feedbackForm, classroomEnvironment: v})} />
              <textarea rows="3" placeholder="Comments (optional)"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                value={feedbackForm.comments} onChange={e => setFeedbackForm({...feedbackForm, comments: e.target.value})} />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="anon" checked={feedbackForm.isAnonymous} onChange={e => setFeedbackForm({...feedbackForm, isAnonymous: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="anon" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Submit anonymously</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all">Submit Feedback</button>
                <button type="button" onClick={() => navigate('/student')} className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Skip</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
