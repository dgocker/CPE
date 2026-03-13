import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, Globe, Signal, SignalHigh, SignalMedium, SignalLow, SignalZero, 
  Power, RefreshCw, Activity, Search, CheckCircle2, Loader2, 
  Wifi, Server, Smartphone, ShieldAlert, ChevronRight, ArrowLeft, Save, 
  HardDrive, RotateCcw, Trash2, Users, Plus, Trash, Edit2, Usb, Lock, Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- API Helper ---
const apiCall = async (payload: any, timeoutMs = 10000) => {
  try {
    const sessionId = localStorage.getItem('sessionId');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionId) {
      payload.sessionId = sessionId;
      headers['Authorization'] = sessionId;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('/cgi-bin/api', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Network response was not ok');
    const json = await response.json();
    if (json.reply === 'Authorization') {
      localStorage.removeItem('sessionId');
      window.dispatchEvent(new Event('auth-error'));
      throw new Error('Authorization failed');
    }
    return json;
  } catch (error) {
    console.warn('API call failed', error);
    throw error;
  }
};

const execAtCmd = async (cmd: string) => {
  try {
    const cmd_b64 = btoa(cmd);
    const response = await fetch('/cgi-bin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at_cmd_b64: cmd_b64 })
    });
    if (!response.ok) throw new Error('Network response was not ok');
    const d = await response.json();
    let resText = '';
    if (d.response_base64) {
      try { resText = atob(d.response_base64); } catch (e) { resText = '[Base64 Decode Error]'; }
    } else if (d.response) {
      resText = d.response.replace(/\\n/g, '\n');
    }
    if (d.reply === 'error') throw new Error(d.message || 'AT command failed');
    return resText;
  } catch (error) {
    console.warn('AT command failed', error);
    throw error;
  }
};

// --- Mock Data for Development ---
const MOCK_DATA = {
  // Dashboard
  internetState: 'connected', signalStrength: -65, carrier: 'MTS RUS', netWorkMode: 11, wanIpAddress: '100.64.23.11',
  // Wi-Fi
  wifiApSwitch: 'on', ssidName: 'CPE_Router_5G', ssidBroadcast: true, ssidSecureMode: 'WPA2_PSK', ssidPassword: 'password123', ssidMaxUserCount: 10, channleType: 6, channelSelect: 6,
  // LAN
  ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', dhcpSwitch: 'on', dhcpFrom: '192.168.1.100', dhcpTo: '192.168.1.200', dhcpLeases: 24, ethType: 'lan',
  // Mobile
  ttl: '64', 
  // APN
  apnMode: 'auto', currentConfig: '1',
  apnConfigs: [
    { id: 1, name: 'MTS Internet', apn: 'internet.mts.ru', pdpType: 'IPv4', authtype: 0, apnUser: 'mts', apnPassword: 'mts' },
    { id: 2, name: 'Beeline', apn: 'internet.beeline.ru', pdpType: 'IPv4', authtype: 1, apnUser: 'beeline', apnPassword: 'beeline' }
  ],
  // SIM
  simCardCurrent: 0, simCardSlotCount: 2,
  // Watchdog
  testConnect: false, pingAddress1: '8.8.8.8', pingAddress2: '1.1.1.1', pingAddress3: '', testInterval: 60, testTimes: 3,
  // System Info
  imei: '864293054744665', imsi: '250970123456789', iccid: '8970101122334455667', mac: '00:11:22:33:44:55', hardwareVersion: 'V1.0', systemVersion: 'UFI103_CT_V5',
  usbMode: 0, language: 'en',
  // Devices
  deviceCounts: { ethCount: 0, wifiCount: 2 },
  deviceList: [
    { deviceName: 'iPhone-13', deviceIp: '192.168.1.101', deviceAddress: 'A1:B2:C3:D4:E5:F6', deviceType: 'wifi', deviceState: 'active' },
    { deviceName: 'MacBook-Pro', deviceIp: '192.168.1.102', deviceAddress: '11:22:33:44:55:66', deviceType: 'wifi', deviceState: 'active' }
  ]
};

// --- Utility ---
const toBool = (val: any) => val === 'on' || val === true || val === 'true' || val === 1;
const toStr = (val: boolean) => val ? 'on' : 'off';

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem('sessionId'));
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSettingsPage, setActiveSettingsPage] = useState<string | null>(null);
  const [data, setData] = useState<any>(process.env.NODE_ENV === 'development' ? MOCK_DATA : {});
  const [copsData, setCopsData] = useState('+COPS: 0,0,"MTS RUS",7');
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  
  // Network Scan State
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [operators, setOperators] = useState<any[]>([]);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    if (!localStorage.getItem('sessionId') && process.env.NODE_ENV !== 'development') return;
    try {
      // Fetch ALL fields for settings
      const rpcRes = await apiCall({
        fid: 'queryFields',
        fields: Object.keys(MOCK_DATA).reduce((acc, key) => ({ ...acc, [key]: '' }), {})
      });
      
      if (rpcRes && rpcRes.fields) {
        setData((prev: any) => ({ ...prev, ...rpcRes.fields }));
      }

      // Fetch APN configs specifically
      const apnRes = await apiCall({ fid: 'queryApn', fields: {} });
      if (apnRes && apnRes.apnConfigs) {
         setData((prev: any) => ({ 
           ...prev, 
           apnConfigs: apnRes.apnConfigs, 
           currentConfig: apnRes.currentConfig, 
           apnMode: apnRes.apnMode 
         }));
      }

      // Fetch COPS data for dashboard
      const copsStr = await execAtCmd('AT+COPS?');
      if (copsStr) {
        const match = copsStr.match(/\+COPS:\s*(.*)/);
        if (match) {
          const parsedStr = match[1];
          setCopsData('+COPS: ' + parsedStr);
          const mode = parsedStr.split(',')[0];
          setIsAutoMode(mode === '0');
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        // Fallback to mock data silently in dev
      }
    }
  }, []);

  useEffect(() => {
    const handleAuthError = () => setSessionId(null);
    window.addEventListener('auth-error', handleAuthError);
    
    let inactivityTimer: any;
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (localStorage.getItem('sessionId')) {
        inactivityTimer = setTimeout(() => {
          localStorage.removeItem('sessionId');
          setSessionId(null);
          showToast('Session expired due to inactivity', 'error');
        }, 300000); // 5 minutes
      }
    };
    
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    resetTimer();

    return () => {
      window.removeEventListener('auth-error', handleAuthError);
      clearTimeout(inactivityTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword.length < 3 || loginPassword.length > 20) {
      setLoginError('Password must be 3-20 characters');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await apiCall({
        fid: 'login',
        password: loginPassword
      }, 2000);
      if (res.reply === 'ok' || res.session || res.sessionId) {
        const newSid = res.session || res.sessionId;
        localStorage.setItem('sessionId', newSid);
        setSessionId(newSid);
        setLoginPassword('');
      } else if (res.reply === 'password_error') {
        setLoginError('Invalid password');
      } else {
        setLoginError(res.reply || 'Login failed');
      }
    } catch (e) {
      setLoginError('Network error');
    }
    setIsLoggingIn(false);
  };

  if (!sessionId && process.env.NODE_ENV !== 'development') {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-sm bg-zinc-900/50 border border-white/5 rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
              <Lock className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-center mb-2">CPE Router</h1>
          <p className="text-zinc-500 text-sm text-center mb-8">Enter admin password to continue</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            {loginError && <p className="text-red-400 text-xs text-center">{loginError}</p>}
            <button
              type="submit"
              disabled={isLoggingIn || !loginPassword}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center"
            >
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- Network Scan Logic ---
  useEffect(() => {
    let pollInterval: any;
    const checkScanStatus = async () => {
      try {
        const res = await fetch('/cgi-bin/scan.cgi?action=status');
        const json = await res.json();
        if (json.status === 'done') {
          setScanStatus('done');
          clearInterval(pollInterval);
          parseOperators(json.data);
        } else if (json.status === 'error') {
          setScanStatus('error');
          clearInterval(pollInterval);
        } else if (json.status === 'scanning') {
          setScanStatus('scanning');
        }
      } catch (e) {
        console.warn('Scan status check failed', e);
      }
    };
    if (scanStatus === 'scanning') pollInterval = setInterval(checkScanStatus, 3000);
    return () => clearInterval(pollInterval);
  }, [scanStatus]);

  const parseOperators = (rawData: string) => {
    const regex = /\((\d+),"([^"]*)","([^"]*)","([^"]*)"(?:,(\d+))?\)/g;
    const ops = [];
    let match;
    while ((match = regex.exec(rawData)) !== null) {
      ops.push({ status: match[1], longName: match[2], shortName: match[3], numeric: match[4], act: match[5] || '0' });
    }
    if (ops.length === 0) {
      ops.push(
        { status: '2', longName: 'MTS RUS', shortName: 'MTS', numeric: '25001', act: '7' },
        { status: '1', longName: 'Beeline', shortName: 'Beeline', numeric: '25099', act: '7' },
        { status: '3', longName: 'MegaFon', shortName: 'MegaFon', numeric: '25002', act: '7' }
      );
    }
    setOperators(ops);
  };

  const startScan = async () => {
    setScanStatus('scanning');
    setOperators([]);
    try {
      await fetch('/cgi-bin/scan.cgi?action=start');
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => { setScanStatus('done'); parseOperators(''); }, 5000);
      }
    } catch (e) {
      setScanStatus('error');
    }
  };

  const connectToOperator = async (numeric: string) => {
    setConnectingTo(numeric);
    try {
      await execAtCmd(`AT+COPS=1,2,"${numeric}"`);
      setTimeout(() => { fetchData(); setConnectingTo(null); }, 3000);
    } catch (e) {
      setConnectingTo(null);
    }
  };

  const toggleInternet = async () => {
    const newState = data.internetState === 'connected' ? 'disconnected' : 'connected';
    setData((prev: any) => ({ ...prev, internetState: newState }));
    try {
      await execAtCmd(newState === 'connected' ? 'AT+CGACT=1,1' : 'AT+CGACT=0,1');
      setTimeout(fetchData, 2000);
    } catch (e) {}
  };

  const toggleAutoMode = async (enableAuto: boolean) => {
    setIsAutoMode(enableAuto);
    try {
      await execAtCmd(enableAuto ? 'AT+COPS=0' : 'AT+COPS=2');
      showToast(`Switched to ${enableAuto ? 'Automatic' : 'Manual'} mode`);
      setTimeout(fetchData, 2000);
    } catch (e) {
      showToast('Failed to change mode', 'error');
      fetchData();
    }
  };

  // --- Settings Handlers ---
  const handleSaveSettings = async (fid: string, fields: any, timeoutMs?: number) => {
    try {
      const res = await apiCall({ fid, fields }, timeoutMs);
      if (res.reply === 'ok' || res.reply === 'success') {
        showToast('Settings saved successfully');
        fetchData();
      } else {
        showToast(res.reply || 'Failed to save', 'error');
      }
    } catch (e) {
      showToast('Error saving settings', 'error');
    }
  };

  const handleSystemAction = async (fid: string, fields: any = {}) => {
    if (fid === 'rebootSystem' || fid === 'factoryReset') {
      if (!window.confirm(`Are you sure you want to execute: ${fid}?`)) return;
    }
    try {
      const res = await apiCall({ fid, fields });
      if (res.reply === 'ok' || res.reply === 'success') {
        showToast('Action executed successfully');
        fetchData();
      } else {
        showToast(res.reply || 'Action failed', 'error');
      }
    } catch (e) {
      showToast('Action failed', 'error');
    }
  };

  // --- UI Helpers ---
  const getSignalIcon = (dbm: number) => {
    if (dbm > -70) return <SignalHigh className="w-6 h-6 text-emerald-400" />;
    if (dbm > -85) return <SignalMedium className="w-6 h-6 text-emerald-400" />;
    if (dbm > -100) return <SignalLow className="w-6 h-6 text-yellow-400" />;
    return <SignalZero className="w-6 h-6 text-red-500" />;
  };

  const isConnected = data.internetState === 'connected';
  const networkModeStr = data.netWorkMode == 11 ? '4G LTE' : data.netWorkMode == 2 ? '3G' : 'Auto';

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white font-sans selection:bg-emerald-500/30 pb-24">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full backdrop-blur-md border text-sm font-medium shadow-2xl flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100' : 'bg-red-500/20 border-red-500/50 text-red-100'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="pt-12 pb-6 px-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent sticky top-0 z-10 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CPE Router</h1>
          <p className="text-xs text-zinc-500 font-mono mt-1">{data.wanIpAddress || data.ipAddress}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-zinc-400">{networkModeStr}</span>
            <span className="text-[10px] text-zinc-600 font-mono">{data.signalStrength} dBm</span>
          </div>
          {getSignalIcon(parseInt(data.signalStrength) || -100)}
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6">
        <AnimatePresence mode="wait">
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col items-center mt-6">
              <div className="relative w-64 h-64 flex items-center justify-center mb-12">
                {isConnected && (
                  <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute inset-0 bg-emerald-500 rounded-full blur-3xl" />
                )}
                {!isConnected && <div className="absolute inset-0 bg-red-500/20 rounded-full blur-3xl" />}
                <motion.button
                  whileTap={{ scale: 0.95 }} onClick={toggleInternet}
                  className={`relative z-10 w-48 h-48 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 ${
                    isConnected ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-emerald-500/20 border-4 border-emerald-300/30' : 'bg-gradient-to-b from-red-500 to-red-700 shadow-red-500/20 border-4 border-red-400/30'
                  }`}
                >
                  <Power className={`w-16 h-16 mb-2 ${isConnected ? 'text-emerald-50' : 'text-red-50'}`} strokeWidth={1.5} />
                  <span className="text-sm font-semibold tracking-wider uppercase text-white/90">{isConnected ? 'Online' : 'Offline'}</span>
                </motion.button>
              </div>

              <div className="w-full bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest">Network Status</h2>
                  <Activity className="w-4 h-4 text-zinc-500" />
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Carrier</p>
                    <p className="text-xl font-medium text-zinc-100">{data.carrier || 'Searching...'}</p>
                  </div>
                  <div className="h-px w-full bg-white/5" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">AT+COPS?</p>
                    <div className="bg-black/50 rounded-lg p-3 font-mono text-xs text-emerald-400 border border-white/5 overflow-x-auto whitespace-nowrap">
                      {copsData}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* NETWORK SCAN TAB */}
          {activeTab === 'network' && (
            <motion.div key="network" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="mt-6">
              <h2 className="text-2xl font-semibold mb-6">Network Scan</h2>

              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-4 mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">Network Selection</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{isAutoMode ? 'Automatic Mode' : 'Manual Mode'}</p>
                </div>
                <button 
                  onClick={() => toggleAutoMode(!isAutoMode)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isAutoMode ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                >
                  <motion.div 
                    animate={{ x: isAutoMode ? 24 : 2 }} 
                    className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm"
                  />
                </button>
              </div>

              {scanStatus === 'idle' || scanStatus === 'error' ? (
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 text-center">
                  <Search className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400 text-sm mb-6">Scan for available mobile networks using AT+COPS=?</p>
                  {scanStatus === 'error' && <p className="text-red-400 text-xs mb-4">An error occurred during the last scan.</p>}
                  <button onClick={startScan} className="bg-white text-black px-6 py-3 rounded-full font-medium text-sm w-full hover:bg-zinc-200 transition-colors">Start Scan</button>
                </div>
              ) : scanStatus === 'scanning' ? (
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-8 text-center flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                  <p className="text-zinc-300 font-medium">Scanning Networks...</p>
                  <p className="text-zinc-500 text-xs mt-2">This may take up to 3 minutes.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-zinc-400">Available Networks</span>
                    <button onClick={startScan} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Rescan</button>
                  </div>
                  {operators.map((op, idx) => (
                    <div key={idx} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{op.longName}</span>
                          {op.status === '2' && <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Current</span>}
                          {op.status === '3' && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Forbidden</span>}
                        </div>
                        <p className="text-xs text-zinc-500 font-mono mt-1">{op.numeric} • Act: {op.act}</p>
                      </div>
                      {op.status !== '2' && op.status !== '3' && (
                        <button onClick={() => connectToOperator(op.numeric)} disabled={connectingTo === op.numeric} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                          {connectingTo === op.numeric ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Connect
                        </button>
                      )}
                      {op.status === '2' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* TERMINAL TAB */}
          {activeTab === 'terminal' && (
            <motion.div key="terminal" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="mt-6">
              <h2 className="text-2xl font-semibold mb-6">Engineering Terminal</h2>
              
              {/* Band Management */}
              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 mb-6">
                <h3 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2"><Signal className="w-4 h-4 text-emerald-400"/> Band Management</h3>
                <div className="flex flex-wrap gap-4 mb-6">
                  {['0x1|B1 (2100)', '0x4|B3 (1800)', '0x40|B7 (2600)', '0x80000|B20 (800)'].map(b => {
                    const [val, label] = b.split('|');
                    return (
                      <label key={val} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                        <input type="checkbox" value={val} className="w-4 h-4 rounded border-white/10 bg-black/50 text-emerald-500 focus:ring-emerald-500/20" id={`band-${val}`} />
                        {label}
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button onClick={async () => {
                    let mask = 0;
                    document.querySelectorAll('input[id^="band-"]:checked').forEach((el: any) => { mask |= parseInt(el.value, 16); });
                    if (mask === 0) { showToast('Select at least one band', 'error'); return; }
                    const hexMask = mask.toString(16).toUpperCase();
                    const cmd = `AT+QCFG="band",0,${hexMask},1`;
                    const out = document.getElementById('at-out');
                    if (out) out.innerText += `\n>>> ${cmd}`;
                    try {
                      const res = await execAtCmd(cmd);
                      if (out) { out.innerText += `\n${res}`; out.scrollTop = out.scrollHeight; }
                    } catch (e: any) {
                      if (out) { out.innerText += `\n[Error]: ${e.message}`; out.scrollTop = out.scrollHeight; }
                    }
                  }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Apply Selected</button>
                  <button onClick={async () => {
                    const cmd = 'AT+QCFG="band"';
                    const out = document.getElementById('at-out');
                    if (out) out.innerText += `\n>>> ${cmd}`;
                    try {
                      const res = await execAtCmd(cmd);
                      if (out) { out.innerText += `\n${res}`; out.scrollTop = out.scrollHeight; }
                    } catch (e: any) {
                      if (out) { out.innerText += `\n[Error]: ${e.message}`; out.scrollTop = out.scrollHeight; }
                    }
                  }} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Refresh Current</button>
                </div>
              </div>

              {/* AT Terminal */}
              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
                <h3 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2"><Terminal className="w-4 h-4 text-emerald-400"/> AT Commands</h3>
                <div className="flex gap-2 mb-4">
                  <input type="text" id="at-in" placeholder="AT+CSQ" className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 font-mono text-sm" onKeyDown={(e) => {
                    if (e.key === 'Enter') document.getElementById('btn-send-at')?.click();
                  }} />
                  <button id="btn-send-at" onClick={async () => {
                    const inp = document.getElementById('at-in') as HTMLInputElement;
                    const out = document.getElementById('at-out');
                    const cmd = inp.value;
                    if (!cmd || !out) return;
                    out.innerText += `\n>>> ${cmd}`;
                    inp.value = '';
                    try {
                      const res = await execAtCmd(cmd);
                      out.innerText += `\n${res}`;
                    } catch (e: any) {
                      out.innerText += `\n[Error]: ${e.message}`;
                    }
                    out.scrollTop = out.scrollHeight;
                  }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">SEND</button>
                  <button onClick={async () => {
                    try {
                      await fetch('/cgi-bin/api', { method: 'POST', body: JSON.stringify({ action: "kill_at" }) });
                      const out = document.getElementById('at-out');
                      if (out) { out.innerText += '\n[SYSTEM]: OK (CAT Killed)'; out.scrollTop = out.scrollHeight; }
                    } catch (e) {}
                  }} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-4 py-2 rounded-xl text-sm font-medium transition-colors">KILL</button>
                </div>
                <div id="at-out" className="bg-[#0A0A0C] border border-white/5 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs text-emerald-400 whitespace-pre-wrap">
                  {'> Ready.'}
                </div>
              </div>
            </motion.div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="mt-2">
              <AnimatePresence mode="wait">
                {!activeSettingsPage ? (
                  <motion.div key="menu" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <h2 className="text-2xl font-semibold mb-6">Settings</h2>
                    <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden divide-y divide-white/5">
                      <SettingsMenuItem icon={<Globe className="text-purple-400" />} label="Mobile Network & APN" onClick={() => setActiveSettingsPage('mobile')} />
                      <SettingsMenuItem icon={<Wifi className="text-blue-400" />} label="Wi-Fi Settings" onClick={() => setActiveSettingsPage('wifi')} />
                      <SettingsMenuItem icon={<Server className="text-emerald-400" />} label="LAN & DHCP" onClick={() => setActiveSettingsPage('lan')} />
                      <SettingsMenuItem icon={<Users className="text-pink-400" />} label="Connected Devices" onClick={() => setActiveSettingsPage('devices')} />
                      <SettingsMenuItem icon={<Smartphone className="text-orange-400" />} label="SIM Management" onClick={() => setActiveSettingsPage('sim')} />
                      <SettingsMenuItem icon={<ShieldAlert className="text-yellow-400" />} label="Watchdog (Ping Test)" onClick={() => setActiveSettingsPage('watchdog')} />
                      <SettingsMenuItem icon={<HardDrive className="text-zinc-400" />} label="System & Info" onClick={() => setActiveSettingsPage('system')} />
                      <SettingsMenuItem icon={<Power className="text-red-400" />} label="Logout" onClick={() => {
                        apiCall({ fid: 'logout', fields: {} }).catch(() => {});
                        localStorage.removeItem('sessionId');
                        setSessionId(null);
                      }} />
                    </div>
                  </motion.div>
                ) : (
                  <SettingsSubPage 
                    key="subpage" 
                    page={activeSettingsPage} 
                    data={data} 
                    onBack={() => setActiveSettingsPage(null)} 
                    onSave={handleSaveSettings}
                    onSystemAction={handleSystemAction}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-white/10 pb-safe pt-2 px-6 z-50">
        <div className="flex justify-around items-center pb-4">
          <NavItem icon={<Globe />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setActiveSettingsPage(null); }} />
          <NavItem icon={<Signal />} label="Network" isActive={activeTab === 'network'} onClick={() => { setActiveTab('network'); setActiveSettingsPage(null); }} />
          <NavItem icon={<Terminal />} label="Terminal" isActive={activeTab === 'terminal'} onClick={() => { setActiveTab('terminal'); setActiveSettingsPage(null); }} />
          <NavItem icon={<Settings />} label="Settings" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </nav>
    </div>
  );
}

// --- Components ---

function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1.5 p-2 transition-colors ${isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
      <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'scale-100'}`}>
        {React.cloneElement(icon as React.ReactElement, { className: `w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}` })}
      </div>
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </button>
  );
}

function SettingsMenuItem({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left">
      <div className="flex items-center gap-4">
        <div className="p-2 bg-black/30 rounded-xl">{icon}</div>
        <span className="font-medium text-zinc-200">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-600" />
    </button>
  );
}

// --- Settings Sub-Pages ---

function SettingsSubPage({ page, data, onBack, onSave, onSystemAction }: { key?: string, page: string, data: any, onBack: () => void, onSave: (fid: string, fields: any, timeoutMs?: number) => void, onSystemAction: (fid: string, fields?: any) => void }) {
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingApn, setEditingApn] = useState<any>(null); // null = list, {} = new, {...} = edit

  useEffect(() => {
    setFormData({ ...data });
  }, [data, page]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    let fid = 'setFields';
    let fieldsToSave: any = {};
    let timeoutMs = 10000;

    if (page === 'wifi') {
      fid = 'setWifi';
      timeoutMs = 20000;
      if (formData.ssidName?.length < 5 || formData.ssidName?.length > 32) {
        showToast('SSID must be 5-32 characters', 'error');
        setIsSaving(false); return;
      }
      if (formData.ssidSecureMode !== 'NONE' && (formData.ssidPassword?.length < 8 || formData.ssidPassword?.length > 63)) {
        showToast('Wi-Fi password must be 8-63 characters', 'error');
        setIsSaving(false); return;
      }
      fieldsToSave = {
        wifiApSwitch: toStr(formData.wifiApSwitch),
        ssidName: formData.ssidName,
        ssidBroadcast: formData.ssidBroadcast,
        ssidSecureMode: formData.ssidSecureMode,
        ssidPassword: formData.ssidPassword,
        ssidMaxUserCount: parseInt(formData.ssidMaxUserCount),
        channleType: parseInt(formData.channleType),
        channelSelect: parseInt(formData.channleType)
      };
    } else if (page === 'lan') {
      fid = 'setGW';
      timeoutMs = 20000;
      fieldsToSave = {
        ipAddress: formData.ipAddress,
        subnetMask: formData.subnetMask,
        dhcpSwitch: toStr(formData.dhcpSwitch),
        dhcpFrom: formData.dhcpFrom,
        dhcpTo: formData.dhcpTo,
        dhcpLeases: formData.dhcpLeases,
        ethType: formData.ethType
      };
    } else if (page === 'mobile') {
      fid = 'setFields';
      fieldsToSave = {
        netWorkMode: parseInt(formData.netWorkMode),
        ttl: formData.ttl,
        apnMode: formData.apnMode
      };
    } else if (page === 'sim') {
      fid = 'switchSimCard';
      fieldsToSave = { simCardCurrent: parseInt(formData.simCardCurrent) };
      if (data.simCardSwitchCheck) {
        if (!formData.simPassword) {
          showToast('SIM switch requires password', 'error');
          setIsSaving(false); return;
        }
        fieldsToSave.password = formData.simPassword;
      }
    } else if (page === 'watchdog') {
      fid = 'setFields';
      fieldsToSave = {
        testConnect: formData.testConnect,
        pingAddress1: formData.pingAddress1,
        pingAddress2: formData.pingAddress2,
        pingAddress3: formData.pingAddress3,
        testInterval: parseInt(formData.testInterval),
        testTimes: parseInt(formData.testTimes)
      };
    } else if (page === 'system') {
      fid = 'setFields';
      fieldsToSave = {
        usbMode: parseInt(formData.usbMode),
        language: formData.language
      };
      if (formData.newImei) {
        fieldsToSave.imei = formData.newImei;
        fieldsToSave.zxcvbn = 'zxcvbn';
      }
    }

    await onSave(fid, fieldsToSave, timeoutMs);
    setIsSaving(false);
  };

  const handleSaveApn = async () => {
    setIsSaving(true);
    await onSystemAction('setApn', {
      id: editingApn.id, // undefined if new
      configName: editingApn.name || 'New APN',
      pdpType: editingApn.pdpType || 'IPv4',
      apn: editingApn.apn || '',
      authtype: parseInt(editingApn.authtype || '0'),
      apnUser: editingApn.apnUser || '',
      apnPassword: editingApn.apnPassword || ''
    });
    setEditingApn(null);
    setIsSaving(false);
  };

  const handleChangePassword = async () => {
    if (!formData.oldPassword || !formData.newPassword) return;
    setIsSaving(true);
    await onSystemAction('changePassword', {
      oldPassword: formData.oldPassword,
      newPassword: formData.newPassword
    });
    setFormData((prev: any) => ({ ...prev, oldPassword: '', newPassword: '' }));
    setIsSaving(false);
  };

  const titles: Record<string, string> = {
    wifi: 'Wi-Fi Settings', lan: 'LAN & DHCP', mobile: 'Mobile & APN',
    sim: 'SIM Management', watchdog: 'Watchdog', system: 'System & Info', devices: 'Connected Devices'
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => editingApn ? setEditingApn(null) : onBack()} className="p-2 -ml-2 text-zinc-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-5 h-5" /> <span className="text-sm font-medium">Back</span>
        </button>
        <h2 className="text-lg font-semibold">{editingApn ? 'Edit APN' : titles[page]}</h2>
        {page !== 'devices' && !editingApn ? (
          <button onClick={handleSave} disabled={isSaving} className="p-2 -mr-2 text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          </button>
        ) : editingApn ? (
          <button onClick={handleSaveApn} disabled={isSaving} className="p-2 -mr-2 text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          </button>
        ) : <div className="w-9" />}
      </div>

      <div className="space-y-6 pb-12">
        {page === 'devices' && (
          <>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-zinc-900/50 border border-white/5 rounded-2xl p-4 text-center">
                <Wifi className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <div className="text-2xl font-semibold">{data.deviceCounts?.wifiCount || 0}</div>
                <div className="text-xs text-zinc-500">Wi-Fi Clients</div>
              </div>
              <div className="flex-1 bg-zinc-900/50 border border-white/5 rounded-2xl p-4 text-center">
                <Server className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <div className="text-2xl font-semibold">{data.deviceCounts?.ethCount || 0}</div>
                <div className="text-xs text-zinc-500">LAN Clients</div>
              </div>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200/70 leading-relaxed">
                MAC filtering and blocking clients are not supported by the current router API firmware. You can only view connected devices.
              </p>
            </div>

            <div className="space-y-3">
              {data.deviceList?.map((dev: any, i: number) => (
                <div key={i} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-full">
                      {dev.deviceType === 'wifi' ? <Wifi className="w-4 h-4 text-zinc-300" /> : <Server className="w-4 h-4 text-zinc-300" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{dev.deviceName || 'Unknown Device'}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5">{dev.deviceIp} • {dev.deviceAddress}</div>
                    </div>
                  </div>
                  <button disabled className="px-3 py-1.5 rounded-full bg-white/5 text-zinc-600 text-xs font-medium cursor-not-allowed">
                    Block
                  </button>
                </div>
              ))}
              {(!data.deviceList || data.deviceList.length === 0) && (
                <div className="text-center text-zinc-500 text-sm py-8">No devices connected.</div>
              )}
            </div>
          </>
        )}

        {page === 'wifi' && (
          <FormGroup>
            <ToggleRow label="Enable Wi-Fi" value={toBool(formData.wifiApSwitch)} onChange={(v) => handleChange('wifiApSwitch', v)} />
            <InputRow label="SSID Name" value={formData.ssidName} onChange={(v) => handleChange('ssidName', v)} />
            <ToggleRow label="Broadcast SSID" value={toBool(formData.ssidBroadcast)} onChange={(v) => handleChange('ssidBroadcast', v)} />
            <SelectRow label="Security" value={formData.ssidSecureMode} onChange={(v) => handleChange('ssidSecureMode', v)} options={[{l:'NONE', v:'NONE'}, {l:'WPA-PSK', v:'WPA_PSK'}, {l:'WPA2-PSK', v:'WPA2_PSK'}]} />
            {formData.ssidSecureMode !== 'NONE' && (
              <InputRow label="Password" value={formData.ssidPassword} onChange={(v) => handleChange('ssidPassword', v)} type="password" />
            )}
            <InputRow label="Max Users" value={formData.ssidMaxUserCount} onChange={(v) => handleChange('ssidMaxUserCount', v)} type="number" />
            <SelectRow 
              label="Wi-Fi Channel" 
              value={(formData.channleType ?? formData.channelSelect)?.toString() || '0'} 
              onChange={(v) => handleChange('channleType', v)} 
              options={[
                { l: 'Auto', v: '0' },
                ...Array.from({ length: 13 }, (_, i) => ({ l: `Channel ${i + 1}`, v: `${i + 1}` }))
              ]} 
            />
          </FormGroup>
        )}

        {page === 'lan' && (
          <FormGroup>
            <InputRow label="IP Address" value={formData.ipAddress} onChange={(v) => handleChange('ipAddress', v)} />
            <InputRow label="Subnet Mask" value={formData.subnetMask} onChange={(v) => handleChange('subnetMask', v)} />
            <SelectRow label="Port Type" value={formData.ethType} onChange={(v) => handleChange('ethType', v)} options={[{l:'LAN', v:'lan'}, {l:'WAN', v:'wan'}]} />
            <div className="h-px bg-white/5 my-2" />
            <ToggleRow label="Enable DHCP" value={toBool(formData.dhcpSwitch)} onChange={(v) => handleChange('dhcpSwitch', v)} />
            {toBool(formData.dhcpSwitch) && (
              <>
                <InputRow label="DHCP Start" value={formData.dhcpFrom} onChange={(v) => handleChange('dhcpFrom', v)} />
                <InputRow label="DHCP End" value={formData.dhcpTo} onChange={(v) => handleChange('dhcpTo', v)} />
                <InputRow label="Lease Time (h)" value={formData.dhcpLeases} onChange={(v) => handleChange('dhcpLeases', v)} type="number" />
              </>
            )}
          </FormGroup>
        )}

        {page === 'mobile' && !editingApn && (
          <>
            <FormGroup>
              <SelectRow label="Network Mode" value={formData.netWorkMode?.toString()} onChange={(v) => handleChange('netWorkMode', v)} options={[{l:'Auto (3G/4G)', v:'12'}, {l:'4G LTE Only', v:'11'}, {l:'3G Only', v:'2'}]} />
              <InputRow label="TTL Value" value={formData.ttl} onChange={(v) => handleChange('ttl', v)} type="number" />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">APN Profiles</h3>
            <FormGroup>
              <SelectRow label="APN Mode" value={formData.apnMode} onChange={(v) => handleChange('apnMode', v)} options={[{l:'Auto', v:'auto'}, {l:'Manual', v:'manual'}]} />
            </FormGroup>

            {formData.apnMode === 'manual' && (
              <div className="mt-4 space-y-3">
                {formData.apnConfigs?.map((apn: any) => (
                  <div key={apn.id} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => onSystemAction('setDefaultApn', { selectId: apn.id })}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${formData.currentConfig == apn.id ? 'border-emerald-500' : 'border-zinc-600'}`}
                      >
                        {formData.currentConfig == apn.id && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                      </button>
                      <div>
                        <div className="text-sm font-medium text-zinc-200">{apn.name}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5">{apn.apn}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingApn(apn)} className="p-2 text-zinc-400 hover:text-white bg-white/5 rounded-full"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => onSystemAction('deleteApn', { selectId: apn.id })} className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 rounded-full"><Trash className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setEditingApn({})} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-center gap-2 text-zinc-300 hover:bg-white/10 transition-colors border-dashed">
                  <Plus className="w-4 h-4" /> Add New APN
                </button>
              </div>
            )}
          </>
        )}

        {page === 'mobile' && editingApn && (
          <FormGroup>
            <InputRow label="Profile Name" value={editingApn.name} onChange={(v) => setEditingApn({...editingApn, name: v})} />
            <SelectRow label="PDP Type" value={editingApn.pdpType || 'IPv4'} onChange={(v) => setEditingApn({...editingApn, pdpType: v})} options={[{l:'IPv4', v:'IPv4'}, {l:'IPv6', v:'IPv6'}, {l:'IPv4v6', v:'IPv4V6'}]} />
            <InputRow label="APN" value={editingApn.apn} onChange={(v) => setEditingApn({...editingApn, apn: v})} />
            <InputRow label="Username" value={editingApn.apnUser} onChange={(v) => setEditingApn({...editingApn, apnUser: v})} />
            <InputRow label="Password" value={editingApn.apnPassword} onChange={(v) => setEditingApn({...editingApn, apnPassword: v})} type="password" />
            <SelectRow label="Auth Type" value={editingApn.authtype?.toString() || '0'} onChange={(v) => setEditingApn({...editingApn, authtype: v})} options={[{l:'None', v:'0'}, {l:'PAP', v:'1'}, {l:'CHAP', v:'2'}, {l:'PAP/CHAP', v:'3'}]} />
          </FormGroup>
        )}

        {page === 'sim' && (
          <FormGroup>
            <InfoRow label="Total Slots" value={formData.simCardSlotCount} />
            <SelectRow label="Active SIM" value={formData.simCardCurrent?.toString()} onChange={(v) => handleChange('simCardCurrent', v)} options={[{l:'SIM 1', v:'0'}, {l:'SIM 2', v:'1'}]} />
            {data.simCardSwitchCheck && (
              <InputRow label="SIM Switch Password" value={formData.simPassword || ''} onChange={(v) => handleChange('simPassword', v)} type="password" />
            )}
          </FormGroup>
        )}

        {page === 'watchdog' && (
          <FormGroup>
            <ToggleRow label="Enable Watchdog" value={toBool(formData.testConnect)} onChange={(v) => handleChange('testConnect', v)} />
            {toBool(formData.testConnect) && (
              <>
                <InputRow label="Ping Address 1" value={formData.pingAddress1} onChange={(v) => handleChange('pingAddress1', v)} />
                <InputRow label="Ping Address 2" value={formData.pingAddress2} onChange={(v) => handleChange('pingAddress2', v)} />
                <InputRow label="Check Interval (s)" value={formData.testInterval} onChange={(v) => handleChange('testInterval', v)} type="number" />
                <InputRow label="Max Failures" value={formData.testTimes} onChange={(v) => handleChange('testTimes', v)} type="number" />
              </>
            )}
          </FormGroup>
        )}

        {page === 'system' && (
          <>
            <FormGroup>
              <SelectRow label="Language" value={formData.language} onChange={(v) => handleChange('language', v)} options={[{l:'English', v:'en'}, {l:'Русский', v:'ru'}, {l:'Español', v:'es'}, {l:'中文', v:'zh'}]} />
              <SelectRow label="USB Mode" value={formData.usbMode?.toString()} onChange={(v) => handleChange('usbMode', v)} options={[{l:'Network (RNDIS)', v:'0'}, {l:'File Transfer (MTP)', v:'1'}]} />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Device Info</h3>
            <FormGroup>
              <InfoRow label="Hardware" value={data.hardwareVersion} />
              <InfoRow label="Firmware" value={data.systemVersion} />
              <InfoRow label="MAC Address" value={data.mac} />
              <InfoRow label="ICCID" value={data.iccid} />
              <InfoRow label="IMSI" value={data.imsi} />
              <InfoRow label="Current IMEI" value={data.imei} />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Change Admin Password</h3>
            <FormGroup>
              <InputRow label="Old Password" value={formData.oldPassword || ''} onChange={(v) => handleChange('oldPassword', v)} type="password" />
              <InputRow label="New Password" value={formData.newPassword || ''} onChange={(v) => handleChange('newPassword', v)} type="password" />
            </FormGroup>
            <button onClick={handleChangePassword} disabled={!formData.oldPassword || !formData.newPassword || isSaving} className="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-2xl font-medium transition-colors disabled:opacity-50">
              Update Password
            </button>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Change IMEI</h3>
            <FormGroup>
              <InputRow label="New IMEI" value={formData.newImei || ''} onChange={(v) => handleChange('newImei', v)} placeholder="15 digits" />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">System Actions</h3>
            <div className="space-y-3">
              <button onClick={() => onSystemAction('rebootSystem')} className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-center gap-2 text-zinc-200 hover:bg-white/5 transition-colors">
                <RotateCcw className="w-5 h-5" /> Reboot Device
              </button>
              <button onClick={() => onSystemAction('factoryReset')} className="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/20 transition-colors">
                <Trash2 className="w-5 h-5" /> Factory Reset
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// --- Form Components ---

function FormGroup({ children }: { children: React.ReactNode }) {
  return <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden divide-y divide-white/5">{children}</div>;
}

function InfoRow({ label, value }: { label: string, value: any }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-zinc-400 text-sm">{label}</span>
      <span className="text-zinc-100 text-sm font-mono">{value || '-'}</span>
    </div>
  );
}

function InputRow({ label, value, onChange, type = "text", placeholder = "" }: { label: string, value: any, onChange: (v: string) => void, type?: string, placeholder?: string }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-zinc-200 text-sm w-1/3">{label}</span>
      <input 
        type={type} 
        value={value || ''} 
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-2/3 bg-transparent text-right text-sm text-emerald-400 focus:outline-none placeholder:text-zinc-600 font-mono"
      />
    </div>
  );
}

function SelectRow({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: {l: string, v: string}[] }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-zinc-200 text-sm w-1/3">{label}</span>
      <select 
        value={value || ''} 
        onChange={(e) => onChange(e.target.value)}
        className="w-2/3 bg-transparent text-right text-sm text-emerald-400 focus:outline-none appearance-none font-medium"
        dir="rtl"
      >
        {options.map(o => <option key={o.v} value={o.v} className="bg-zinc-900 text-left">{o.l}</option>)}
      </select>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-zinc-200 text-sm">{label}</span>
      <button 
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors relative ${value ? 'bg-emerald-500' : 'bg-zinc-700'}`}
      >
        <motion.div 
          animate={{ x: value ? 24 : 2 }} 
          className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm"
        />
      </button>
    </div>
  );
}
