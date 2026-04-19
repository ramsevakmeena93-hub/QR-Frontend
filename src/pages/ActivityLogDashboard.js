import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { FiRefreshCw, FiTrash2, FiDownload, FiTerminal } from 'react-icons/fi';

const LOG_COLORS = {
  LOGIN:             { dot: 'bg-green-400',  text: 'text-green-400',  label: 'LOGIN'     },
  LOGOUT:            { dot: 'bg-gray-400',   text: 'text-gray-400',   label: 'LOGOUT'    },
  LOGIN_FAILED:      { dot: 'bg-red-500',    text: 'text-red-400',    label: 'ERROR'     },
  QR_GENERATED:      { dot: 'bg-blue-400',   text: 'text-blue-400',   label: 'QR'        },
  QR_SCAN:           { dot: 'bg-purple-400', text: 'text-purple-400', label: 'SCAN'      },
  ATTENDANCE_MARKED: { dot: 'bg-emerald-400',text: 'text-emerald-400',label: 'ATTEND'    },
  FEEDBACK_SUBMITTED:{ dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'FEEDBACK'  },
  PAGE_VISIT:        { dot: 'bg-gray-500',   text: 'text-gray-500',   label: 'VISIT'     },
};

const ActivityLogDashboard = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const bottomRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await axios.get('/api/logs?limit=500');
      setLogs(res.data.logs || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchLogs, 3000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchLogs]);

  const formatTs = (ts) => {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const buildLogLine = (log) => {
    const meta = log.metadata ? JSON.stringify(log.metadata) : '';
    return {
      ts: formatTs(log.timestamp),
      level: LOG_COLORS[log.action] || { dot: 'bg-gray-400', text: 'text-gray-400', label: 'INFO' },
      action: log.action,
      user: `${log.user?.name || 'unknown'} <${log.user?.email || ''}>`,
      role: log.user?.role || 'unknown',
      details: log.details || '',
      meta,
      ip: log.ip || '',
      raw: JSON.stringify(log, null, 2),
    };
  };

  const filtered = logs.filter(l =>
    filter === 'ALL' || l.action === filter
  ).map(buildLogLine);

  const downloadLogs = () => {
    const text = filtered.map(l =>
      `[${l.ts}] [${l.level.label}] [${l.role.toUpperCase()}] ${l.user} → ${l.action}: ${l.details} ${l.meta}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mits-logs-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 font-mono">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FiTerminal className="text-green-400 w-5 h-5" />
          <span className="text-green-400 font-bold text-sm">MITS Attendance — Activity Log</span>
          <span className={`w-2 h-2 rounded-full ml-2 ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-500">{autoRefresh ? 'LIVE' : 'PAUSED'}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter */}
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-600 outline-none"
          >
            <option value="ALL">ALL</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="LOGIN_FAILED">ERRORS</option>
            <option value="QR_GENERATED">QR GENERATED</option>
            <option value="ATTENDANCE_MARKED">ATTENDANCE</option>
            <option value="FEEDBACK_SUBMITTED">FEEDBACK</option>
          </select>

          <button onClick={() => setAutoRefresh(p => !p)}
            className={`text-xs px-3 py-1 rounded border ${autoRefresh ? 'border-green-500 text-green-400' : 'border-gray-600 text-gray-400'}`}>
            {autoRefresh ? '⏸ Pause' : '▶ Resume'}
          </button>

          <button onClick={fetchLogs}
            className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-400 hover:text-white flex items-center gap-1">
            <FiRefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>

          <button onClick={downloadLogs}
            className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-400 hover:text-white flex items-center gap-1">
            <FiDownload className="w-3 h-3" /> Export
          </button>

          <button onClick={() => setLogs([])}
            className="text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:text-red-300 flex items-center gap-1">
            <FiTrash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-6 px-4 py-1.5 bg-gray-900 border-b border-gray-800 text-xs text-gray-500 flex-shrink-0">
        <span>Total: <span className="text-white font-bold">{logs.length}</span></span>
        <span>Showing: <span className="text-white font-bold">{filtered.length}</span></span>
        <span>Logins: <span className="text-green-400 font-bold">{logs.filter(l=>l.action==='LOGIN').length}</span></span>
        <span>Attendance: <span className="text-emerald-400 font-bold">{logs.filter(l=>l.action==='ATTENDANCE_MARKED').length}</span></span>
        <span>QR Generated: <span className="text-blue-400 font-bold">{logs.filter(l=>l.action==='QR_GENERATED').length}</span></span>
        <span>Errors: <span className="text-red-400 font-bold">{logs.filter(l=>l.action==='LOGIN_FAILED').length}</span></span>
      </div>

      {/* Log Output */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5">
        {loading && (
          <div className="text-gray-500 text-sm py-4">Loading logs...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-gray-600 text-sm py-8 text-center">
            No logs yet. Actions will appear here in real-time.
          </div>
        )}

        {filtered.map((log, i) => (
          <div key={i} className="flex gap-3 text-xs hover:bg-gray-900 px-1 py-0.5 rounded group">
            {/* Timestamp */}
            <span className="text-gray-600 flex-shrink-0 w-40">{log.ts}</span>

            {/* Level badge */}
            <span className={`flex-shrink-0 w-16 font-bold ${log.level.text}`}>
              [{log.level.label}]
            </span>

            {/* Role */}
            <span className="flex-shrink-0 w-12 text-gray-500 uppercase">{log.role}</span>

            {/* User */}
            <span className="flex-shrink-0 w-48 text-cyan-400 truncate">{log.user}</span>

            {/* Action */}
            <span className="flex-shrink-0 w-32 text-yellow-300">{log.action}</span>

            {/* Details */}
            <span className="text-gray-300 flex-1 truncate">{log.details}</span>

            {/* Metadata */}
            {log.meta && log.meta !== '{}' && (
              <span className="text-gray-600 truncate max-w-xs">{log.meta}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Bottom bar */}
      <div className="px-4 py-1.5 bg-gray-900 border-t border-gray-800 text-xs text-gray-600 flex-shrink-0">
        MITS Attendance System — Activity Monitor | Auto-refresh: {autoRefresh ? '3s' : 'OFF'} | {new Date().toLocaleString()}
      </div>
    </div>
  );
};

export default ActivityLogDashboard;
