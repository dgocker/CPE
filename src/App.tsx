import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, Globe, Signal, SignalHigh, SignalMedium, SignalLow, SignalZero, 
  Power, RefreshCw, Activity, Search, CheckCircle2, Loader2, 
  Wifi, Server, Smartphone, ShieldAlert, ChevronRight, ArrowLeft, Save, 
  HardDrive, RotateCcw, Trash2, Users, Plus, Trash, Edit2, Usb, Lock, Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- API Helper ---
const apiCall = async (payload: any, timeoutMs = 15000) => {
  try {
    const sessionId = localStorage.getItem('sessionId');
    
    // Always include sessionId in payload ONLY if it exists
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (sessionId) {
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

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const text = await response.text();
    if (!text) throw new Error('Empty response');
    
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON response from router');
    }

    if (json.reply === 'Authorization') {
      localStorage.removeItem('sessionId');
      window.dispatchEvent(new Event('auth-error'));
      throw new Error('Authorization failed');
    }
    return json;
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error('Request timeout');
    console.warn('API call failed', error);
    throw error;
  }
};

const execAtCmd = async (cmd: string) => {
  try {
    const cmd_b64 = btoa(cmd);
    const d = await apiCall({ at_cmd_b64: cmd_b64 });
    
    let resText = '';
    if (d.response_base64) {
      try { resText = atob(d.response_base64); } catch (e) { resText = '[Base64 Decode Error]'; }
    } else if (d.response) {
      resText = d.response.replace(/\\n/g, '\n');
    }
    if (d.reply === 'error') throw new Error(d.message || 'AT command failed');
    return resText;
  } catch (error: any) {
    console.warn('AT command failed', error);
    throw error;
  }
};

// --- Mock Data for Development ---
// --- Constants & Mapping ---
const isDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' || 
   window.location.hostname.includes('run.app'));

const MCC_MNC_MAP: Record<string, string> = {
  '25001': 'MTS',
  '25002': 'MegaFon',
  '25003': 'MTS',
  '25011': 'Yota',
  '25017': 'MTS',
  '25020': 'Tele2',
  '25028': 'Beeline',
  '25035': 'MOTIV',
  '25039': 'Rostelecom',
  '25099': 'Beeline',
  '40101': 'Beeline KZ',
  '40102': 'Kcell',
  '40177': 'Tele2 KZ',
  '25501': 'Vodafone UA',
  '25502': 'Kyivstar',
  '25503': 'Lifecell',
  '25701': 'A1 BY',
  '25702': 'MTS BY',
  '25704': 'life:) BY'
};

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
  imei: '864293054744665', imsi: '250970123456789', iccId: '8970101122334455667', mac: '00:11:22:33:44:55', hardwareVersion: 'V1.0', systemVersion: 'UFI103_CT_V5',
  usbMode: 0, language: 'en', imeiSwitch: true,
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
  const [data, setData] = useState<any>({}); // Start empty to avoid stale mock data
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [copsData, setCopsData] = useState('');
  const [isAutoMode, setIsAutoMode] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  
  // Network Scan State
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const isScanningRef = useRef(false);
  const [operators, setOperators] = useState<any[]>([]);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, 'success' | 'error' | 'connecting'>>({});

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    if (!localStorage.getItem('sessionId') && !isDev) return;
    if (isScanningRef.current) return;
    
    // 1. Fetch Fields
    try {
      const rpcRes = await apiCall({
        fid: 'queryFields',
        fields: Object.keys(MOCK_DATA).reduce((acc, key) => ({ ...acc, [key]: '' }), {})
      });
      if (rpcRes && rpcRes.fields) {
        setData((prev: any) => ({ ...prev, ...rpcRes.fields }));
        setIsInitialLoading(false);
      }
    } catch (e) {
      console.warn('queryFields failed', e);
      if (isDev && isInitialLoading) {
        setData(MOCK_DATA);
        setIsInitialLoading(false);
      }
    }

    // 2. Fetch APN
    try {
      const apnRes = await apiCall({ fid: 'queryApn', fields: {} });
      console.log('APN Response:', apnRes);
      if (apnRes) {
         const f = apnRes.fields || apnRes;
         const configs = f.apnConfigs || f.apn_configs || f.apnList || f.apn_list || (Array.isArray(f) ? f : []);
         setData((prev: any) => ({ 
           ...prev, 
           apnConfigs: Array.isArray(configs) ? configs : [], 
           currentConfig: f.currentConfig ?? f.current_config, 
           selectId: f.selectId !== undefined ? Number(f.selectId) : prev.selectId,
           apnMode: f.apnMode ?? f.apn_mode 
         }));
      }
    } catch (e) {
      console.warn('queryApn failed', e);
      if (isDev) {
        setData((prev: any) => ({ 
           ...prev, 
           apnConfigs: MOCK_DATA.apnConfigs, 
           currentConfig: MOCK_DATA.currentConfig,
           apnMode: MOCK_DATA.apnMode
        }));
      }
    }

    // 3. Fetch COPS
    try {
      const copsStr = await execAtCmd('AT+COPS?');
      if (copsStr) {
        const match = copsStr.match(/\+COPS:\s*(.*)/);
        if (match) {
          const parsedStr = match[1].trim();
          setCopsData('+COPS: ' + parsedStr);
          // Формат может быть: 0 или 0,0,"Operator" или 1,2,"25001"
          const parts = parsedStr.split(',');
          const mode = parts[0];
          setIsAutoMode(mode === '0');
        } else {
          setCopsData(copsStr.trim());
          // Если просто OK или пусто, не меняем режим
        }
      }
    } catch (e) {
      console.warn('AT+COPS? failed', e);
    }
  }, [isInitialLoading]);

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
      setLoginError('Пароль должен содержать от 3 до 20 символов');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await apiCall({
        fid: 'login',
        password: loginPassword
      }, 10000); // Increased timeout to 10s
      if (res.reply === 'ok' || res.session || res.sessionId) {
        const newSid = res.session || res.sessionId;
        localStorage.setItem('sessionId', newSid);
        setSessionId(newSid);
        setLoginPassword('');
      } else if (res.reply === 'password_error') {
        setLoginError('Неверный пароль');
      } else {
        setLoginError(res.reply || 'Ошибка входа');
      }
    } catch (e: any) {
      setLoginError(e.message === 'Empty response' ? 'Пустой ответ от роутера' : 'Ошибка сети');
    }
    setIsLoggingIn(false);
  };

  if (!sessionId && !isDev) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-sm bg-zinc-900/50 border border-white/5 rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
              <Lock className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-center mb-2">CPE Роутер</h1>
          <p className="text-zinc-500 text-sm text-center mb-8">Введите пароль администратора</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Пароль"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            {loginError && <p className="text-red-400 text-xs text-center">{loginError}</p>}
            <button
              type="submit"
              disabled={isLoggingIn || !loginPassword}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center"
            >
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (isScanningRef.current) return;
    fetchData();
    const interval = setInterval(() => {
      if (!isScanningRef.current) fetchData();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- Network Scan Logic ---
  useEffect(() => {
    let pollInterval: any;
    let timeoutId: any;
    let errorCount = 0;

    const checkScanStatus = async () => {
      try {
        const sessionId = localStorage.getItem('sessionId');
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (sessionId) headers['Authorization'] = sessionId;

        const res = await fetch('/cgi-bin/scan.cgi?action=status', { headers });
        if (!res.ok) throw new Error('Status check failed');
        
        const json = await res.json();
        errorCount = 0; // Reset on success
        
        if (json.status === 'done') {
          isScanningRef.current = false;
          setScanStatus('done');
          parseOperators(json.data || '');
        } else if (json.status === 'error') {
          isScanningRef.current = false;
          setScanStatus('error');
          showToast('Ошибка модема при поиске', 'error');
        }
      } catch (e) {
        errorCount++;
        console.warn('Scan status check failed', e);
        if (errorCount > 5) {
          setScanStatus('error');
          showToast('Потеряна связь с роутером при поиске', 'error');
        }
      }
    };

    if (scanStatus === 'scanning') {
      pollInterval = setInterval(checkScanStatus, 3000);
      timeoutId = setTimeout(() => {
        if (scanStatus === 'scanning') {
          setScanStatus('error');
          showToast('Превышено время ожидания (3 мин)', 'error');
        }
      }, 180000);
    }

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeoutId);
    };
  }, [scanStatus]);

  const parseOperators = (rawData: string) => {
    // Очистка от всех префиксов +COPS:
    const cleanData = rawData.replace(/\+COPS:/g, '');
    
    const regex = /\((\d+),"([^"]*)","([^"]*)","([^"]*)"(?:,(\d+))?\)/g;
    const ops = [];
    let match;
    while ((match = regex.exec(cleanData)) !== null) {
      const numeric = match[4];
      const longName = match[2] || MCC_MNC_MAP[numeric] || numeric;
      ops.push({ 
        status: match[1], 
        longName: longName, 
        shortName: match[3] || longName, 
        numeric: numeric, 
        act: match[5] || '0' 
      });
    }
    
    if (ops.length === 0 && (isDev || rawData === '')) {
      ops.push(
        { status: '2', longName: 'MTS RUS', shortName: 'MTS', numeric: '25001', act: '7' },
        { status: '1', longName: 'Beeline', shortName: 'Beeline', numeric: '25099', act: '7' },
        { status: '3', longName: 'MegaFon', shortName: 'MegaFon', numeric: '25002', act: '7' }
      );
    }
    setOperators(ops);
  };

  const startScan = async () => {
    isScanningRef.current = true;
    setScanStatus('scanning');
    setOperators([]);
    
    if (isDev) {
      // В режиме разработки имитируем работу scan.cgi
      setData((prev: any) => ({ ...prev, internetState: 'disconnected' }));
      setTimeout(() => {
        isScanningRef.current = false;
        setScanStatus('done');
        parseOperators('(+COPS: (2,"MTS","MTS","25001",7),(1,"Beeline","Beeline","25099",7),(3,"MegaFon","MegaFon","25002",7))');
        showToast('Поиск завершен (MOCK)');
      }, 5000);
      return;
    }

    try {
      // Запускаем scan.cgi
      // Он сам сделает kill_smd_users (очистку сессий порта), 
      // AT+COPS=2 (выключит интернет) и AT+COPS=?
      const sessionId = localStorage.getItem('sessionId');
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (sessionId) headers['Authorization'] = sessionId;
      
      const res = await fetch('/cgi-bin/scan.cgi?action=start', { headers });
      
      if (res.ok) {
        showToast('Поиск запущен (интернет будет отключен)');
      } else {
        throw new Error('Failed to start scan.cgi');
      }
    } catch (err) {
      isScanningRef.current = false;
      setScanStatus('error');
      showToast('Не удалось запустить поиск', 'error');
    }
  };

  const stopScan = async () => {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (sessionId) headers['Authorization'] = sessionId;
      await fetch('/cgi-bin/scan.cgi?action=stop', { headers });
      isScanningRef.current = false;
      setScanStatus('idle');
      showToast('Поиск прерван');
    } catch (e) {
      console.error('Failed to stop scan', e);
      isScanningRef.current = false;
      setScanStatus('idle');
    }
  };

  const connectToOperator = async (numeric: string) => {
    setConnectingTo(numeric);
    // Сбрасываем предыдущие результаты, чтобы только текущая попытка была активна
    setConnectionResults({ [numeric]: 'connecting' });
    
    try {
      // Отправка команды подключения
      await execAtCmd(`AT+COPS=1,2,"${numeric}"`);
      
      // Опрос статуса (проверка AT+COPS? каждые 3с, до 15 раз = 45 сек)
      let attempts = 0;
      const checkStatus = async () => {
        attempts++;
        try {
          // Запрашиваем и COPS, и текущий IP, чтобы избежать проблем со старыми данными
          const [copsRes, fieldsRes] = await Promise.all([
            apiCall({ fid: 'terminal', fields: { command: 'AT+COPS?' } }),
            apiCall({ fid: 'queryFields', fields: { wanIpAddress: '' } })
          ]);

          const output = copsRes.reply || '';
          const currentIp = fieldsRes.fields?.wanIpAddress || '0.0.0.0';
          
          // Успех если: 
          // 1. В ответе COPS есть код оператора
          // 2. ИЛИ появился реальный IP адрес (значит интернет уже работает)
          const isConnectedInCops = output.includes(numeric);
          const hasInternet = currentIp !== '0.0.0.0' && currentIp !== '';

          if (isConnectedInCops || hasInternet) {
            setConnectionResults(prev => ({ ...prev, [numeric]: 'success' }));
            setConnectingTo(null);
            setIsAutoMode(false);
            fetchData();
            showToast(isConnectedInCops ? 'Подключено успешно' : 'Подключено (интернет активен)', 'success');
          } else if (attempts < 15) {
            setTimeout(checkStatus, 3000);
          } else {
            setConnectionResults(prev => ({ ...prev, [numeric]: 'error' }));
            setConnectingTo(null);
            showToast('Не удалось подтвердить регистрацию', 'error');
          }
        } catch (e) {
          console.warn('Check status attempt failed', e);
          if (attempts < 15) {
            setTimeout(checkStatus, 3000);
          } else {
            setConnectionResults(prev => ({ ...prev, [numeric]: 'error' }));
            setConnectingTo(null);
          }
        }
      };
      
      setTimeout(checkStatus, 3000);
    } catch (e) {
      setConnectionResults(prev => ({ ...prev, [numeric]: 'error' }));
      setConnectingTo(null);
      showToast('Ошибка при отправке команды', 'error');
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
    if (enableAuto) {
      setIsAutoMode(true);
      try {
        await execAtCmd('AT+COPS=0');
        showToast('Включен автоматический выбор сети');
        setTimeout(fetchData, 2000);
      } catch (e) {
        showToast('Ошибка при смене режима', 'error');
        fetchData();
      }
    } else {
      showToast('Выберите сеть из списка ниже для ручного подключения', 'error');
    }
  };

  // --- Settings Handlers ---
  const handleSaveSettings = async (fid: string, fields: any, timeoutMs?: number) => {
    try {
      const res = await apiCall({ fid, fields }, timeoutMs);
      if (res.reply === 'ok' || res.reply === 'success') {
        showToast('Настройки успешно сохранены');
        fetchData();
      } else {
        showToast(res.reply || 'Не удалось сохранить', 'error');
      }
    } catch (e) {
      showToast('Ошибка при сохранении настроек', 'error');
    }
  };

  const handleSystemAction = async (fid: string, fields: any = {}) => {
    if (fid === 'rebootSystem' || fid === 'factoryReset') {
      const msg = fid === 'rebootSystem' ? 'Вы уверены, что хотите перезагрузить устройство?' : 'Вы уверены, что хотите сбросить настройки до заводских?';
      if (!window.confirm(msg)) return;
    }
    try {
      const res = await apiCall({ fid, fields });
      if (res.reply === 'ok' || res.reply === 'success') {
        showToast('Действие выполнено успешно');
        fetchData();
      } else {
        showToast(res.reply || 'Ошибка выполнения', 'error');
      }
    } catch (e) {
      showToast('Ошибка выполнения', 'error');
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
  const networkModeStr = data.netWorkMode == 11 ? '4G LTE' : data.netWorkMode == 2 ? '3G' : 'Авто';

  // Получаем реального оператора из AT+COPS?
  const getConnectedOperator = () => {
    // Формат: +COPS: <mode>,<format>,"<operator>",<act>
    const match = copsData.match(/\+COPS: \d,\d,"([^"]+)"/);
    if (match && match[1]) {
      const op = match[1];
      // Если это цифры и они есть в нашем справочнике - возвращаем имя
      if (/^\d+$/.test(op) && MCC_MNC_MAP[op]) {
        return MCC_MNC_MAP[op];
      }
      // Если цифры, но нет в базе - возвращаем как есть
      if (/^\d+$/.test(op)) return op;
      return op;
    }
    
    // Если в COPS пусто или 0, значит регистрации нет
    if (copsData.includes('+COPS: 0')) return 'Нет сети';
    
    // Фолбэк на данные из SIM, если COPS еще не прогрузился
    return data.carrier || 'Поиск...';
  };

  const connectedOp = getConnectedOperator();

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
          <h1 className="text-2xl font-semibold tracking-tight">CPE Роутер</h1>
          <p className="text-[10px] text-zinc-500 font-mono mt-1">
            {data.internetState === 'connected' ? `WAN IP: ${data.wanIpAddress}` : `LAN IP: ${data.ipAddress}`}
          </p>
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
                  <span className="text-sm font-semibold tracking-wider uppercase text-white/90">{isConnected ? 'В сети' : 'Не в сети'}</span>
                </motion.button>
              </div>

              <div className="w-full bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest">Статус сети</h2>
                  <Activity className="w-4 h-4 text-zinc-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <p className="text-[10px] text-zinc-500 uppercase mb-1">Сеть (PLMN)</p>
                    {isInitialLoading ? (
                      <div className="h-4 w-20 bg-zinc-800 animate-pulse rounded mt-1" />
                    ) : (
                      <p className="text-sm font-semibold text-zinc-100 truncate">{connectedOp}</p>
                    )}
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <p className="text-[10px] text-zinc-500 uppercase mb-1">Режим</p>
                    {isInitialLoading ? (
                      <div className="h-4 w-12 bg-zinc-800 animate-pulse rounded mt-1" />
                    ) : (
                      <p className="text-sm font-semibold text-zinc-100">{networkModeStr}</p>
                    )}
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <p className="text-[10px] text-zinc-500 uppercase mb-1">Сигнал</p>
                    {isInitialLoading ? (
                      <div className="h-4 w-16 bg-zinc-800 animate-pulse rounded mt-1" />
                    ) : (
                      <p className="text-sm font-semibold text-zinc-100">{data.signalStrength} dBm</p>
                    )}
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <p className="text-[10px] text-zinc-500 uppercase mb-1">WAN IP</p>
                    {isInitialLoading ? (
                      <div className="h-4 w-24 bg-zinc-800 animate-pulse rounded mt-1" />
                    ) : (
                      <p className="text-sm font-semibold text-emerald-400 truncate">{data.wanIpAddress || '-'}</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* NETWORK SCAN TAB */}
          {activeTab === 'network' && (
            <motion.div key="network" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="mt-6">
              <h2 className="text-2xl font-semibold mb-6">Поиск сети</h2>

              {/* Network Selection Toggle */}
              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-4 mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">Выбор сети</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {isAutoMode === null ? 'Определение...' : isAutoMode ? 'Автоматический режим' : 'Ручной режим'}
                  </p>
                </div>
                <button 
                  onClick={() => toggleAutoMode(!isAutoMode)}
                  disabled={isAutoMode === null}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isAutoMode ? 'bg-emerald-500' : 'bg-zinc-700'} ${isAutoMode === null ? 'opacity-50' : ''}`}
                >
                  <motion.div 
                    animate={{ x: isAutoMode ? 24 : 2 }} 
                    className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm"
                  />
                </button>
              </div>

              {/* Current Operator Display (Only when not scanning) */}
              {scanStatus !== 'scanning' && copsData && copsData.includes('"') && (
                <div className="mb-6">
                  <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2 px-1">Текущая сеть</h4>
                  <div className="bg-zinc-900/50 border border-emerald-500/20 rounded-3xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-100">
                          {copsData.split('"')[1] || 'Неизвестно'}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {copsData.split(',').slice(-1)[0] === '7' ? '4G LTE' : 
                           copsData.split(',').slice(-1)[0] === '2' ? '3G UMTS' : 
                           copsData.split(',').slice(-1)[0] === '0' ? '2G GSM' : 'Connected'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Активно</span>
                    </div>
                  </div>
                </div>
              )}

              {scanStatus === 'idle' || scanStatus === 'error' ? (
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 text-center">
                  <Search className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400 text-sm mb-6">Поиск доступных мобильных сетей (AT+COPS=?)</p>
                  {scanStatus === 'error' && <p className="text-red-400 text-xs mb-4">Произошла ошибка при последнем поиске.</p>}
                  <button onClick={startScan} className="bg-white text-black px-6 py-3 rounded-full font-medium text-sm w-full hover:bg-zinc-200 transition-colors">Начать поиск</button>
                </div>
              ) : scanStatus === 'scanning' ? (
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-8 text-center flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                  <p className="text-zinc-300 font-medium">Поиск сетей...</p>
                  <p className="text-zinc-500 text-xs mt-2">Это может занять до 3 минут.</p>
                  <button 
                    onClick={stopScan}
                    className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4"
                  >
                    Прервать поиск
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-zinc-400">Доступные сети</span>
                    <button onClick={startScan} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Обновить</button>
                  </div>
                  {operators.map((op, idx) => (
                    <div key={idx} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{op.longName}</span>
                          {op.status === '2' && <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Текущая</span>}
                          {op.status === '3' && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Запрещена</span>}
                        </div>
                        <p className="text-xs text-zinc-500 font-mono mt-1">{op.numeric} • Тип: {op.act}</p>
                      </div>
                      {op.status !== '2' && op.status !== '3' && (
                        <button 
                          onClick={() => connectToOperator(op.numeric)} 
                          disabled={connectingTo === op.numeric} 
                          className={`px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-2 ${
                            connectionResults[op.numeric] === 'success' 
                              ? 'bg-emerald-500 text-white' 
                              : connectionResults[op.numeric] === 'error'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-white/10 hover:bg-white/20 text-white'
                          }`}
                        >
                          {connectingTo === op.numeric ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Подключение...
                            </>
                          ) : connectionResults[op.numeric] === 'success' ? (
                            'Подключено'
                          ) : connectionResults[op.numeric] === 'error' ? (
                            'Повторить'
                          ) : (
                            'Подключить'
                          )}
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
              <h2 className="text-2xl font-semibold mb-6">Инженерный терминал</h2>
              
              {/* Band Management */}
              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 mb-6">
                <h3 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2"><Signal className="w-4 h-4 text-emerald-400"/> Управление диапазонами (Bands)</h3>
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
                <div className="flex flex-wrap gap-3">
                  <button onClick={async () => {
                    let mask = 0;
                    document.querySelectorAll('input[id^="band-"]:checked').forEach((el: any) => { mask |= parseInt(el.value, 16); });
                    if (mask === 0) { showToast('Выберите хотя бы один диапазон', 'error'); return; }
                    const hexMask = mask.toString(16).toUpperCase();
                    const cmd = `AT+QCFG="band",0,${hexMask},1`;
                    const out = document.getElementById('at-out');
                    if (out) out.innerText += `\n>>> ${cmd}`;
                    try {
                      const res = await execAtCmd(cmd);
                      if (out) { out.innerText += `\n${res}`; out.scrollTop = out.scrollHeight; }
                    } catch (e: any) {
                      if (out) { out.innerText += `\n[Ошибка]: ${e.message}`; out.scrollTop = out.scrollHeight; }
                    }
                  }} className="flex-1 min-w-[140px] bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-emerald-500/20">Применить</button>
                  <button onClick={async () => {
                    const cmd = 'AT+QCFG="band"';
                    const out = document.getElementById('at-out');
                    if (out) out.innerText += `\n>>> ${cmd}`;
                    try {
                      const res = await execAtCmd(cmd);
                      if (out) { out.innerText += `\n${res}`; out.scrollTop = out.scrollHeight; }
                    } catch (e: any) {
                      if (out) { out.innerText += `\n[Ошибка]: ${e.message}`; out.scrollTop = out.scrollHeight; }
                    }
                  }} className="flex-1 min-w-[140px] bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">Текущие конфиги</button>
                </div>
              </div>

              {/* AT Terminal */}
              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
                <h3 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2"><Terminal className="w-4 h-4 text-emerald-400"/> AT-Команды</h3>
                <div className="space-y-3 mb-4">
                  <input type="text" id="at-in" placeholder="AT+CSQ" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 font-mono text-sm transition-all" onKeyDown={(e) => {
                    if (e.key === 'Enter') document.getElementById('btn-send-at')?.click();
                  }} />
                  <div className="flex gap-2">
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
                        out.innerText += `\n[Ошибка]: ${e.message}`;
                      }
                      out.scrollTop = out.scrollHeight;
                    }} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95">ОТПРАВИТЬ</button>
                    <button onClick={async () => {
                      try {
                        await apiCall({ action: "kill_at" });
                        const out = document.getElementById('at-out');
                        if (out) { out.innerText += '\n[СИСТЕМА]: OK (CAT Killed)'; out.scrollTop = out.scrollHeight; }
                      } catch (e) {}
                    }} className="px-6 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95">СБРОС</button>
                  </div>
                </div>
                <div id="at-out" className="bg-[#0A0A0C] border border-white/5 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs text-emerald-400 whitespace-pre-wrap">
                  {'> Готов.'}
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
                    <h2 className="text-2xl font-semibold mb-6">Настройки</h2>
                    <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden divide-y divide-white/5">
                      <SettingsMenuItem icon={<Globe className="text-purple-400" />} label="Мобильная сеть и APN" onClick={() => setActiveSettingsPage('mobile')} />
                      <SettingsMenuItem icon={<Wifi className="text-blue-400" />} label="Настройки Wi-Fi" onClick={() => setActiveSettingsPage('wifi')} />
                      <SettingsMenuItem icon={<Server className="text-emerald-400" />} label="LAN и DHCP" onClick={() => setActiveSettingsPage('lan')} />
                      <SettingsMenuItem icon={<Users className="text-pink-400" />} label="Подключенные устройства" onClick={() => setActiveSettingsPage('devices')} />
                      <SettingsMenuItem icon={<Smartphone className="text-orange-400" />} label="Управление SIM" onClick={() => setActiveSettingsPage('sim')} />
                      <SettingsMenuItem icon={<ShieldAlert className="text-yellow-400" />} label="Watchdog (Пинг-тест)" onClick={() => setActiveSettingsPage('watchdog')} />
                      <SettingsMenuItem icon={<HardDrive className="text-zinc-400" />} label="Система и Информация" onClick={() => setActiveSettingsPage('system')} />
                      <SettingsMenuItem icon={<Power className="text-red-400" />} label="Выйти" onClick={() => {
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
                    showToast={showToast}
                    fetchData={fetchData}
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
          <NavItem icon={<Globe />} label="Главная" isActive={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setActiveSettingsPage(null); }} />
          <NavItem icon={<Signal />} label="Сеть" isActive={activeTab === 'network'} onClick={() => { setActiveTab('network'); setActiveSettingsPage(null); }} />
          <NavItem icon={<Terminal />} label="Терминал" isActive={activeTab === 'terminal'} onClick={() => { setActiveTab('terminal'); setActiveSettingsPage(null); }} />
          <NavItem icon={<Settings />} label="Настройки" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
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

function SettingsSubPage({ page, data, onBack, onSave, onSystemAction, showToast, fetchData }: { key?: string, page: string, data: any, onBack: () => void, onSave: (fid: string, fields: any, timeoutMs?: number) => void, onSystemAction: (fid: string, fields?: any) => void, showToast: (msg: string, type?: 'success'|'error') => void, fetchData: () => void }) {
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingApn, setEditingApn] = useState<any>(null); // null = list, {} = new, {...} = edit
  const touchedFields = useRef<Set<string>>(new Set());

  // Синхронизируем данные извне, но НЕ перезаписываем те, что юзер уже трогал
  useEffect(() => {
    setFormData((prev: any) => {
      const newData = { ...prev };
      Object.keys(data).forEach(key => {
        if (!touchedFields.current.has(key)) {
          newData[key] = data[key];
        }
      });
      return newData;
    });
  }, [data]);

  // При смене страницы сбрасываем "тронутые" поля
  useEffect(() => {
    touchedFields.current.clear();
    setFormData({ ...data });
  }, [page]);

  const handleChange = (key: string, value: any) => {
    touchedFields.current.add(key);
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    let fid = 'setFields';
    let fieldsToSave: any = {};
    let timeoutMs = 10000;

    if (page === 'wifi') {
      fid = 'setFields';
      timeoutMs = 20000;
      if (formData.ssidName?.length < 5 || formData.ssidName?.length > 32) {
        showToast('Имя сети (SSID) должно быть от 5 до 32 символов', 'error');
        setIsSaving(false); return;
      }
      if (formData.ssidSecureMode !== 'NONE' && (formData.ssidPassword?.length < 8 || formData.ssidPassword?.length > 63)) {
        showToast('Пароль Wi-Fi должен быть от 8 до 63 символов', 'error');
        setIsSaving(false); return;
      }
      fieldsToSave = {
        wifiApSwitch: toStr(formData.wifiApSwitch),
        ssidName: formData.ssidName,
        ssidBroadcast: toStr(formData.ssidBroadcast),
        ssidSecureMode: formData.ssidSecureMode,
        ssidPassword: formData.ssidPassword,
        ssidMaxUserCount: parseInt(formData.ssidMaxUserCount),
        channleType: parseInt(formData.channleType)
      };
    } else if (page === 'lan') {
      fid = 'setFields';
      timeoutMs = 20000;
      fieldsToSave = {
        ipAddress: formData.ipAddress,
        subnetMask: formData.subnetMask,
        dhcpSwitch: toStr(formData.dhcpSwitch),
        dhcpFrom: formData.dhcpFrom,
        dhcpTo: formData.dhcpTo,
        dhcpLeases: parseInt(formData.dhcpLeases),
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
      fid = 'setFields';
      fieldsToSave = { simCardCurrent: parseInt(formData.simCardCurrent) };
      if (data.simCardSwitchCheck) {
        if (!formData.simPassword) {
          showToast('Для переключения SIM требуется пароль', 'error');
          setIsSaving(false); return;
        }
        fieldsToSave.password = formData.simPassword;
      }
    } else if (page === 'watchdog') {
      fid = 'setFields';
      fieldsToSave = {
        testConnect: toStr(formData.testConnect),
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

    try {
      await onSave(fid, fieldsToSave, timeoutMs);
      touchedFields.current.clear(); // Сбрасываем после успешного сохранения
    } catch (e) {
      console.warn('Save failed', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditApn = async (apn: any) => {
    try {
      // Пробуем запросить детали по ID (используем и id и selectId для совместимости)
      const res = await apiCall({ fid: 'queryApn', fields: { id: apn.id, selectId: apn.id } });
      const details = res.fields || res;
      setEditingApn({ ...apn, ...details });
    } catch (e) {
      setEditingApn(apn);
    }
  };

  const handleSaveApn = async () => {
    setIsSaving(true);
    try {
      // Извлекаем MCC/MNC из IMSI для привязки профиля к SIM-карте
      const imsi = data.imsi || '';
      const mcc = imsi.substring(0, 3) || '250';
      const mnc = imsi.substring(3, 5) || '01';
      
      const fields: any = {
        id: (editingApn.id !== undefined && editingApn.id !== null) ? Number(editingApn.id) : -1,
        configName: editingApn.name || editingApn.configName || 'New APN',
        apn: editingApn.apn || '',
        apnUser: editingApn.apnUser || '',
        apnPassword: editingApn.apnPassword || '',
        apnProxy: editingApn.apnProxy || '',
        apnPort: editingApn.apnPort || '',
        pdpType: (editingApn.pdpType || 'IPV4').toUpperCase(),
        protocol: (editingApn.pdpType || 'IPV4').toUpperCase(),
        authtype: parseInt(editingApn.authtype?.toString() || '0'),
        mcc: mcc,
        mnc: mnc,
        numeric: mcc + mnc,
        type: 'default'
      };

      await onSystemAction('setApn', fields);
      setEditingApn(null);
      showToast('Профиль APN сохранен');
      setTimeout(fetchData, 2000);
    } catch (e: any) {
      showToast(e.message || 'Ошибка при сохранении APN', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefaultApn = async (id: number) => {
    setIsSaving(true);
    try {
      await onSystemAction('setDefaultApn', { id });
      showToast('Профиль APN установлен по умолчанию');
      setTimeout(fetchData, 2000);
    } catch (e: any) {
      showToast(e.message || 'Ошибка при смене APN', 'error');
    } finally {
      setIsSaving(false);
    }
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
    wifi: 'Настройки Wi-Fi', lan: 'LAN и DHCP', mobile: 'Мобильная сеть и APN',
    sim: 'Управление SIM', watchdog: 'Watchdog', system: 'Система и Информация', devices: 'Подключенные устройства'
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => editingApn ? setEditingApn(null) : onBack()} className="p-2 -ml-2 text-zinc-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-5 h-5" /> <span className="text-sm font-medium">Назад</span>
        </button>
        <h2 className="text-lg font-semibold">{editingApn ? 'Редактировать APN' : titles[page]}</h2>
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
                <div className="text-xs text-zinc-500">Wi-Fi клиенты</div>
              </div>
              <div className="flex-1 bg-zinc-900/50 border border-white/5 rounded-2xl p-4 text-center">
                <Server className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <div className="text-2xl font-semibold">{data.deviceCounts?.ethCount || 0}</div>
                <div className="text-xs text-zinc-500">LAN клиенты</div>
              </div>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200/70 leading-relaxed">
                Фильтрация по MAC и блокировка клиентов не поддерживаются текущей прошивкой. Вы можете только просматривать список подключенных устройств.
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
                      <div className="text-sm font-medium text-zinc-200">{dev.deviceName || 'Неизвестное устройство'}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5">{dev.deviceIp} • {dev.deviceAddress}</div>
                    </div>
                  </div>
                  <button disabled className="px-3 py-1.5 rounded-full bg-white/5 text-zinc-600 text-xs font-medium cursor-not-allowed">
                    Блок
                  </button>
                </div>
              ))}
              {(!data.deviceList || data.deviceList.length === 0) && (
                <div className="text-center text-zinc-500 text-sm py-8">Нет подключенных устройств.</div>
              )}
            </div>
          </>
        )}

        {page === 'wifi' && (
          <FormGroup>
            <ToggleRow label="Включить Wi-Fi" value={toBool(formData.wifiApSwitch)} onChange={(v) => handleChange('wifiApSwitch', v)} />
            <InputRow label="Имя сети (SSID)" value={formData.ssidName} onChange={(v) => handleChange('ssidName', v)} />
            <ToggleRow label="Транслировать SSID" value={toBool(formData.ssidBroadcast)} onChange={(v) => handleChange('ssidBroadcast', v)} />
            <SelectRow label="Безопасность" value={formData.ssidSecureMode} onChange={(v) => handleChange('ssidSecureMode', v)} options={[{l:'NONE', v:'NONE'}, {l:'WPA-PSK', v:'WPA_PSK'}, {l:'WPA2-PSK', v:'WPA2_PSK'}]} />
            {formData.ssidSecureMode !== 'NONE' && (
              <InputRow label="Пароль" value={formData.ssidPassword} onChange={(v) => handleChange('ssidPassword', v)} type="password" />
            )}
            <InputRow label="Макс. пользователей" value={formData.ssidMaxUserCount} onChange={(v) => handleChange('ssidMaxUserCount', v)} type="number" />
            <SelectRow 
              label="Канал Wi-Fi" 
              value={(formData.channleType ?? formData.channelSelect)?.toString() || '0'} 
              onChange={(v) => handleChange('channleType', v)} 
              options={[
                { l: 'Авто', v: '0' },
                ...Array.from({ length: 13 }, (_, i) => ({ l: `Канал ${i + 1}`, v: `${i + 1}` }))
              ]} 
            />
          </FormGroup>
        )}

        {page === 'lan' && (
          <FormGroup>
            <InputRow label="IP-адрес" value={formData.ipAddress} onChange={(v) => handleChange('ipAddress', v)} />
            <InputRow label="Маска подсети" value={formData.subnetMask} onChange={(v) => handleChange('subnetMask', v)} />
            <SelectRow label="Тип порта" value={formData.ethType} onChange={(v) => handleChange('ethType', v)} options={[{l:'LAN', v:'lan'}, {l:'WAN', v:'wan'}]} />
            <div className="h-px bg-white/5 my-2" />
            <ToggleRow label="Включить DHCP" value={toBool(formData.dhcpSwitch)} onChange={(v) => handleChange('dhcpSwitch', v)} />
            {toBool(formData.dhcpSwitch) && (
              <>
                <InputRow label="Начальный IP" value={formData.dhcpFrom} onChange={(v) => handleChange('dhcpFrom', v)} />
                <InputRow label="Конечный IP" value={formData.dhcpTo} onChange={(v) => handleChange('dhcpTo', v)} />
                <InputRow label="Время аренды (ч)" value={formData.dhcpLeases} onChange={(v) => handleChange('dhcpLeases', v)} type="number" />
              </>
            )}
          </FormGroup>
        )}

        {page === 'mobile' && !editingApn && (
          <>
            <FormGroup>
              <SelectRow label="Режим сети" value={formData.netWorkMode?.toString()} onChange={(v) => handleChange('netWorkMode', v)} options={[{l:'Авто (3G/4G)', v:'12'}, {l:'Только 4G LTE', v:'11'}, {l:'Только 3G', v:'2'}]} />
              <InputRow label="Значение TTL" value={formData.ttl} onChange={(v) => handleChange('ttl', v)} type="number" />
            </FormGroup>

            <div className="mt-4 mb-4 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Профили APN</h3>
                <button 
                  onClick={() => fetchData()}
                  className="p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors"
                  title="Обновить список"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <button 
                onClick={() => setEditingApn({})} 
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-full"
              >
                <Plus className="w-3.5 h-3.5" /> ДОБАВИТЬ
              </button>
            </div>

            <div className="space-y-3">
              {(!formData.apnConfigs || formData.apnConfigs.length === 0) && (
                <div className="p-8 text-center border-2 border-dashed border-white/5 rounded-3xl">
                  <div className="text-zinc-500 text-xs font-medium">Список профилей пуст</div>
                  <button 
                    onClick={() => fetchData()}
                    className="mt-2 text-[10px] text-emerald-400 font-bold hover:underline"
                  >
                    ОБНОВИТЬ
                  </button>
                </div>
              )}
              {formData.apnConfigs?.map((apn: any) => {
                // currentConfig может быть как ID, так и именем
                const isActive = (data.selectId !== undefined && Number(data.selectId) === Number(apn.id)) || 
                                 (data.currentConfig === (apn.name || apn.configName));
                return (
                  <div 
                    key={apn.id} 
                    className={`group relative overflow-hidden rounded-3xl border transition-all duration-300 ${
                      isActive 
                        ? 'bg-emerald-500/10 border-emerald-500/30' 
                        : 'bg-zinc-900/40 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="p-4 flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => !isActive && handleSetDefaultApn(apn.id)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isActive 
                              ? 'border-emerald-500 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' 
                              : 'border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {isActive && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${isActive ? 'text-emerald-400' : 'text-zinc-200'}`}>
                              {apn.name || apn.configName || 'Без названия'}
                            </span>
                            {isActive && (
                              <span className="text-[8px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5 flex items-center gap-2">
                            {apn.apn && <span>{apn.apn}</span>}
                            {apn.apn && apn.pdpType && <span className="w-1 h-1 rounded-full bg-zinc-800" />}
                            {apn.pdpType && <span>{apn.pdpType}</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEditApn(apn)} 
                          className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (isActive) {
                              showToast('Нельзя удалить активный профиль', 'error');
                              return;
                            }
                            if (window.confirm(`Удалить профиль "${apn.name || apn.configName || 'Без названия'}"?`)) {
                              onSystemAction('deleteApn', { id: apn.id });
                            }
                          }} 
                          className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {(!formData.apnConfigs || formData.apnConfigs.length === 0) && (
                <div className="text-center py-10 bg-zinc-900/20 border border-dashed border-white/5 rounded-3xl">
                  <Globe className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">Список профилей пуст</p>
                </div>
              )}
            </div>
          </>
        )}

        {page === 'mobile' && editingApn && (
          <FormGroup>
            <InputRow label="Имя профиля" value={editingApn.name || editingApn.configName} onChange={(v) => setEditingApn({...editingApn, name: v, configName: v})} />
            <SelectRow label="Тип PDP" value={(editingApn.pdpType || 'IPV4').toUpperCase()} onChange={(v) => setEditingApn({...editingApn, pdpType: v})} options={[{l:'IPv4', v:'IPV4'}, {l:'IPv6', v:'IPV6'}, {l:'IPv4v6', v:'IPV4V6'}, {l:'IP', v:'IP'}]} />
            <InputRow label="APN" value={editingApn.apn} onChange={(v) => setEditingApn({...editingApn, apn: v})} />
            <div className="flex divide-x divide-white/5">
              <InputRow label="MCC" value={editingApn.mcc || ''} onChange={(v) => setEditingApn({...editingApn, mcc: v})} placeholder="250" />
              <InputRow label="MNC" value={editingApn.mnc || ''} onChange={(v) => setEditingApn({...editingApn, mnc: v})} placeholder="01" />
            </div>
            <InputRow label="Имя пользователя" value={editingApn.apnUser} onChange={(v) => setEditingApn({...editingApn, apnUser: v})} />
            <InputRow label="Пароль" value={editingApn.apnPassword} onChange={(v) => setEditingApn({...editingApn, apnPassword: v})} type="password" />
            <SelectRow label="Тип аутентификации" value={editingApn.authtype?.toString() || '0'} onChange={(v) => setEditingApn({...editingApn, authtype: v})} options={[{l:'Нет', v:'0'}, {l:'PAP', v:'1'}, {l:'CHAP', v:'2'}, {l:'PAP/CHAP', v:'3'}]} />
          </FormGroup>
        )}

        {page === 'sim' && (
          <FormGroup>
            <InfoRow label="Всего слотов" value={formData.simCardSlotCount} />
            <SelectRow label="Активная SIM" value={formData.simCardCurrent?.toString()} onChange={(v) => handleChange('simCardCurrent', v)} options={[{l:'SIM 1', v:'0'}, {l:'SIM 2', v:'1'}]} />
            {data.simCardSwitchCheck && (
              <InputRow label="Пароль переключения SIM" value={formData.simPassword || ''} onChange={(v) => handleChange('simPassword', v)} type="password" />
            )}
          </FormGroup>
        )}

        {page === 'watchdog' && (
          <FormGroup>
            <ToggleRow label="Включить Watchdog" value={toBool(formData.testConnect)} onChange={(v) => handleChange('testConnect', v)} />
            {toBool(formData.testConnect) && (
              <>
                <InputRow label="Адрес пинга 1" value={formData.pingAddress1} onChange={(v) => handleChange('pingAddress1', v)} />
                <InputRow label="Адрес пинга 2" value={formData.pingAddress2} onChange={(v) => handleChange('pingAddress2', v)} />
                <InputRow label="Интервал проверки (с)" value={formData.testInterval} onChange={(v) => handleChange('testInterval', v)} type="number" />
                <InputRow label="Макс. неудач" value={formData.testTimes} onChange={(v) => handleChange('testTimes', v)} type="number" />
              </>
            )}
          </FormGroup>
        )}

        {page === 'system' && (
          <>
            <FormGroup>
              <SelectRow label="Язык" value={formData.language} onChange={(v) => handleChange('language', v)} options={[{l:'English', v:'en'}, {l:'Русский', v:'ru'}, {l:'Español', v:'es'}, {l:'中文', v:'zh'}]} />
              <SelectRow label="Режим USB" value={formData.usbMode?.toString()} onChange={(v) => handleChange('usbMode', v)} options={[{l:'Сеть (RNDIS)', v:'0'}, {l:'Передача файлов (MTP)', v:'1'}]} />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Информация об устройстве</h3>
            <FormGroup>
              <InfoRow label="Аппаратная версия" value={data.hardwareVersion} />
              <InfoRow label="Версия прошивки" value={data.systemVersion} />
              <InfoRow label="MAC-адрес" value={data.mac} />
              <InfoRow label="ICCID" value={data.iccId} />
              <InfoRow label="IMSI" value={data.imsi} />
              <InfoRow label="Текущий IMEI" value={data.imei} />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Изменить пароль администратора</h3>
            <FormGroup>
              <InputRow label="Старый пароль" value={formData.oldPassword || ''} onChange={(v) => handleChange('oldPassword', v)} type="password" />
              <InputRow label="Новый пароль" value={formData.newPassword || ''} onChange={(v) => handleChange('newPassword', v)} type="password" />
            </FormGroup>
            <button onClick={handleChangePassword} disabled={!formData.oldPassword || !formData.newPassword || isSaving} className="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-2xl font-medium transition-colors disabled:opacity-50">
              Обновить пароль
            </button>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Изменить IMEI</h3>
            <FormGroup>
              <InputRow label="Новый IMEI" value={formData.newImei || ''} onChange={(v) => handleChange('newImei', v)} placeholder="15 цифр" />
            </FormGroup>

            <h3 className="text-sm font-medium text-zinc-500 ml-4 mt-6 mb-2 uppercase tracking-wider">Системные действия</h3>
            <div className="space-y-3">
              <button onClick={() => onSystemAction('rebootSystem')} className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-center gap-2 text-zinc-200 hover:bg-white/5 transition-colors">
                <RotateCcw className="w-5 h-5" /> Перезагрузить устройство
              </button>
              <button onClick={() => onSystemAction('factoryReset')} className="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/20 transition-colors">
                <Trash2 className="w-5 h-5" /> Сброс до заводских настроек
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
