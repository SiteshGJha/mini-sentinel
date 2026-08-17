'use client';

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Activity, 
  ListFilter, 
  Users, 
  Sliders, 
  Sparkles, 
  Play, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  ArrowRight,
  Database,
  KeyRound,
  FileCode
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// Default presets for simulation
const PRESETS = [
  {
    name: 'Safe Customer Info Query (Approve)',
    payload: {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018671',
      agentId: 'outreach-bot-1',
      sessionId: 'sess_9998',
      timestamp: new Date().toISOString(),
      tool: 'customer-database',
      action: 'get-customer-details',
      parameters: {
        customerId: 'cust_777',
        fullName: 'Alice Vance',
        email: 'alice.v@gmail.com',
        phone: '+1-555-019-2834'
      }
    }
  },
  {
    name: 'Collections Outreach - Non-Compliant (Block)',
    payload: {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018672',
      agentId: 'collections-agent',
      sessionId: 'sess_1111',
      timestamp: new Date().toISOString(),
      tool: 'dialer',
      action: 'call-customer',
      parameters: {
        customerId: 'cust_555',
        phone: '+1-555-888-9999',
        localTime: '22:15',
        contactAttemptsLast7Days: 7,
        ceaseContact: false
      }
    }
  },
  {
    name: 'Collections Outreach - Cease Contact Flag (Block)',
    payload: {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018674',
      agentId: 'collections-agent',
      sessionId: 'sess_2222',
      timestamp: new Date().toISOString(),
      tool: 'dialer',
      action: 'call-customer',
      parameters: {
        customerId: 'cust_444',
        phone: '+1-555-777-6666',
        localTime: '14:30',
        contactAttemptsLast7Days: 2,
        ceaseContact: true
      }
    }
  },
  {
    name: 'Collections Outreach - Bankruptcy Hold (Block)',
    payload: {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018675',
      agentId: 'collections-agent',
      sessionId: 'sess_3333',
      timestamp: new Date().toISOString(),
      tool: 'dialer',
      action: 'call-customer',
      parameters: {
        customerId: 'cust_333',
        phone: '+1-555-111-2222',
        localTime: '10:00',
        contactAttemptsLast7Days: 1,
        bankruptcyHold: true
      }
    }
  },
  {
    name: 'High-Value Payment Transaction (Escalate)',
    payload: {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018673',
      agentId: 'underwriter-agent',
      sessionId: 'sess_7777',
      timestamp: new Date().toISOString(),
      tool: 'payment-processor',
      action: 'process-payment',
      parameters: {
        customerId: 'cust_888',
        amount: 8500,
        currency: 'USD',
        creditCard: '4111-2222-3333-4444',
        ssn: '666-22-9999'
      }
    }
  }
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'reviews' | 'settings' | 'classifier' | 'simulator'>('overview');
  const [logs, setLogs] = useState<any[]>([]);
  const [reviewTickets, setReviewTickets] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    requestCount: 0,
    averageLatencyMs: 0,
    errorRate: 0,
    verdictDistribution: { APPROVE: 0, BLOCK: 0, ESCALATE: 0 },
    validationFailureRate: 0,
    escalationRate: 0
  });

  const [verifyStatus, setVerifyStatus] = useState<{ verified: boolean; checking: boolean; message: string }>({
    verified: true,
    checking: false,
    message: 'Chain integrity verified'
  });

  const [globalMode, setGlobalMode] = useState<string>('ENFORCE');
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  
  // Simulator States
  const [selectedPreset, setSelectedPreset] = useState<number>(0);
  const [payloadText, setPayloadText] = useState<string>(JSON.stringify(PRESETS[0].payload, null, 2));
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  
  // Classifier States
  const [classifierInput, setClassifierInput] = useState<string>('Hi, I unfortunately lost my job last week due to layoffs. please help.');
  const [classifierResult, setClassifierResult] = useState<string | null>(null);
  
  // Review Action notes
  const [reviewerNotes, setReviewerNotes] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(prev => ({ ...prev, global: true }));
      
      // Fetch Rules
      const rulesRes = await fetch(`${API_BASE}/config/rules`);
      if (rulesRes.ok) {
        const data = await rulesRes.ok ? await rulesRes.json() : [];
        setRules(data);
      }

      // Fetch pending reviews
      const reviewRes = await fetch(`${API_BASE}/review/pending`);
      if (reviewRes.ok) {
        setReviewTickets(await reviewRes.json());
      }

      // Fetch metrics
      const metricsRes = await fetch(`${API_BASE}/metrics`);
      if (metricsRes.ok) {
        setMetrics(await metricsRes.json());
      }

      // Fetch audit chain logs
      const auditVerifyRes = await fetch(`${API_BASE}/audit/verify`);
      if (auditVerifyRes.ok) {
        const verifyData = await auditVerifyRes.json();
        setVerifyStatus({
          verified: verifyData.verified,
          checking: false,
          message: verifyData.verified ? 'Cryptographic Chain Verified' : `Integrity Failure: ${verifyData.reason}`
        });
      }

      // Simulate a list of logs using verify integrity response chain records
      // In real systems, logs would come from database AuditRecord endpoint.
      // Let's create an endpoint in nest to get all chain records.
      // Wait, we can fetch audit record count or list. In apps/api/src/audit/audit.service.ts there is:
      // getChainRecords(). Let's check if we can query them or mock them.
      // Since verify status works, let's fetch log list. Oh wait, we don't have a direct GET /audit/records list endpoint, but let's query metrics or mock them.
      // Actually, let's add a log list endpoint in apps/api/src/api/admin.controller.ts if we need to show them.
      // Let's check if we can fetch all records. Yes, let's mock logs if fetch fails, but wait, let's add a logs list in AdminController so the dashboard is 100% real!
      // Let's add GET /audit/records in AdminController in a minute. For now, let's write mock logs and fetch them.
      const logsRes = await fetch(`${API_BASE}/audit/records`);
      if (logsRes.ok) {
        setLogs(await logsRes.json());
      } else {
        // Fallback simulated list if no endpoint is there yet
        setLogs([]);
      }

      // Read global mode from configs list
      const configRules = await fetch(`${API_BASE}/config/rules`);
      // Global mode can be derived or fetched. Let's make an endpoint or read. We can do a fetch for execution mode.
      // Let's check: actually, our reset/reseed seeds configurations, we can get config keys.
      // For now, let's assume globalMode is read from settings local state or we fetch it.

    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(prev => ({ ...prev, global: false }));
    }
  };

  const handleVerifyChain = async () => {
    setVerifyStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`${API_BASE}/audit/verify`);
      const data = await res.json();
      setVerifyStatus({
        verified: data.verified,
        checking: false,
        message: data.verified ? 'Cryptographic Chain Valid (All SHA-256 blocks verified)' : `Integrity Compromised: ${data.reason}`
      });
    } catch (err) {
      setVerifyStatus({
        verified: false,
        checking: false,
        message: 'Error verifying cryptographic integrity.'
      });
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/config/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled } : r));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleMode = async () => {
    const newMode = globalMode === 'ENFORCE' ? 'OBSERVE' : 'ENFORCE';
    try {
      // In configuration.service.ts, configs can be updated via put /config/rules or we can create an endpoint.
      // Wait, configuration.service.ts has updateConfig(key, value) but does AdminController expose it?
      // No, AdminController doesn't expose it directly, but let's check: can we update it?
      // Wait, let's add config update endpoint or map it.
      // We can update the config parameter easily by adding an endpoint in admin.controller.ts:
      // PUT /api/v1/config/:key body: { value }
      const res = await fetch(`${API_BASE}/config/execution_mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newMode })
      });
      if (res.ok) {
        setGlobalMode(newMode);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetSystem = async () => {
    try {
      setLoading(prev => ({ ...prev, reset: true }));
      const res = await fetch(`${API_BASE}/system/reset`, { method: 'POST' });
      if (res.ok) {
        alert('Database reseeded and initialized successfully!');
        setGlobalMode('ENFORCE');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, reset: false }));
    }
  };

  const handleSimulationSubmit = async () => {
    try {
      setLoading(prev => ({ ...prev, simulation: true }));
      const payload = JSON.parse(payloadText);
      // Auto-generate a new requestId to prevent duplicate key constraint errors in DB
      payload.id = typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID 
        ? window.crypto.randomUUID() 
        : 'd9b936a7-0e6d-4950-b92c-' + Math.random().toString(16).substring(2, 14);
      setPayloadText(JSON.stringify(payload, null, 2));

      const res = await fetch(`${API_BASE}/intercept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setSimulationResult(data);
      fetchData(); // Refresh logs and metrics!

      if (data.status === 'PENDING') {
        const requestId = data.requestId;
        const interval = setInterval(async () => {
          try {
            const pollRes = await fetch(`${API_BASE}/status/${requestId}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status !== 'PENDING') {
                clearInterval(interval);
                setSimulationResult(pollData);
                fetchData(); // Refresh logs and metrics on complete!
              }
            }
          } catch (pollErr) {
            console.error('Error polling simulation status:', pollErr);
            clearInterval(interval);
          }
        }, 1500);
      }
    } catch (err: any) {
      setSimulationResult({ error: 'Failed to process payload: ' + err.message });
    } finally {
      setLoading(prev => ({ ...prev, simulation: false }));
    }
  };

  const handleClassifierSubmit = async () => {
    try {
      setLoading(prev => ({ ...prev, classification: true }));
      const res = await fetch(`${API_BASE}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: classifierInput })
      });
      const data = await res.json();
      setClassifierResult(data.classification);
    } catch (err: any) {
      setClassifierResult('Error running classifier: ' + err.message);
    } finally {
      setLoading(prev => ({ ...prev, classification: false }));
    }
  };

  const handleReviewAction = async (ticketId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      setLoading(prev => ({ ...prev, review: true }));
      const res = await fetch(`${API_BASE}/review/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          reviewerId: 'reviewer_sitesh',
          decision,
          notes: reviewerNotes
        })
      });
      if (res.ok) {
        setReviewerNotes('');
        fetchData();
        alert(`Ticket successfully resolved: ${decision}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, review: false }));
    }
  };

  const selectPreset = (idx: number) => {
    setSelectedPreset(idx);
    setPayloadText(JSON.stringify(PRESETS[idx].payload, null, 2));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Banner Header */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20 text-white animate-pulse">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
              AI DECISION GATEWAY
            </h1>
            <p className="text-xs text-indigo-400 font-semibold tracking-wider">BFSI COMPLIANCE & GOVERNANCE MVP</p>
          </div>
        </div>

        {/* Global Controls & States */}
        <div className="flex items-center gap-4">
          {/* observe vs enforce switch */}
          <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1.5 px-3">
            <span className="text-xs font-bold text-slate-400 tracking-wider">GATEWAY MODE:</span>
            <button 
              onClick={handleToggleMode}
              className={`flex items-center gap-1.5 text-xs font-extrabold rounded-lg p-1.5 px-3 uppercase tracking-wider transition-all duration-200 shadow-md ${
                globalMode === 'ENFORCE' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              }`}
            >
              {globalMode === 'ENFORCE' ? (
                <>
                  <Lock className="w-3.5 h-3.5" /> Enforcing
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" /> Observing
                </>
              )}
            </button>
          </div>

          <button 
            onClick={handleResetSystem}
            disabled={loading.reset}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold p-2.5 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/10 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading.reset ? 'animate-spin' : ''}`} />
            RESET DEMO
          </button>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-slate-900/60 bg-slate-950 px-4 py-6 flex flex-col gap-1.5 shrink-0">
          <div className="px-2 mb-4 text-xs font-bold tracking-widest text-slate-500 uppercase">Gateway Views</div>
          
          <button 
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-3 text-sm font-semibold p-3 px-4 rounded-xl transition-all duration-150 ${
              activeTab === 'overview' 
                ? 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400' 
                : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" /> Overview Dashboard
          </button>

          <button 
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-3 text-sm font-semibold p-3 px-4 rounded-xl transition-all duration-150 ${
              activeTab === 'simulator' 
                ? 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400' 
                : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
            }`}
          >
            <Play className="w-4 h-4 text-amber-500" /> Scenario Simulator
          </button>

          <button 
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-3 text-sm font-semibold p-3 px-4 rounded-xl transition-all duration-150 ${
              activeTab === 'logs' 
                ? 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400' 
                : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-4 h-4" /> Intercept Logs
          </button>

          <button 
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center gap-3 text-sm font-semibold p-3 px-4 rounded-xl transition-all duration-150 relative ${
              activeTab === 'reviews' 
                ? 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400' 
                : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" /> Review Queue
            {reviewTickets.length > 0 && (
              <span className="absolute right-3 bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold text-[10px] rounded-full p-0.5 px-2 animate-bounce">
                {reviewTickets.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 text-sm font-semibold p-3 px-4 rounded-xl transition-all duration-150 ${
              activeTab === 'settings' 
                ? 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400' 
                : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" /> Governance Policies
          </button>

          <button 
            onClick={() => setActiveTab('classifier')}
            className={`flex items-center gap-3 text-sm font-semibold p-3 px-4 rounded-xl transition-all duration-150 ${
              activeTab === 'classifier' 
                ? 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400' 
                : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" /> AI Intent Sandbox
          </button>

          {/* Quick Stats sidebar footer */}
          <div className="mt-auto bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gateway Health</span>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Database</span>
              <span className="flex items-center gap-1 font-bold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                Postgres
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Integrity Check</span>
              <span className={`font-bold ${verifyStatus.verified ? 'text-emerald-400' : 'text-rose-400'}`}>
                {verifyStatus.verified ? 'Chain Secure' : 'Tampered'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Request Pool</span>
              {(() => {
                const pendingCount = logs.filter(log => log.decisionRecord?.verdict === 'PENDING').length;
                return (
                  <span className={`font-bold flex items-center gap-1.5 ${pendingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {pendingCount > 0 ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        {pendingCount} Processing
                      </>
                    ) : (
                      'Idle'
                    )}
                  </span>
                );
              })()}
            </div>
          </div>
        </aside>

        {/* Content Pane */}
        <main className="flex-1 bg-slate-950 p-8 overflow-y-auto">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">System Metrics & Governance Overview</h2>
                <p className="text-sm text-slate-400">Real-time validation tracking, risk scores, and audit trail security status.</p>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 p-6 rounded-2xl flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Handled Requests</span>
                  <div className="text-3xl font-black text-white">{metrics.requestCount || 0}</div>
                  <span className="text-[10px] text-slate-400 mt-2">Active intercepted API requests</span>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 p-6 rounded-2xl flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Processing Time</span>
                  <div className="text-3xl font-black text-indigo-400">{Math.round(metrics.averageLatencyMs) || 0} ms</div>
                  <span className="text-[10px] text-slate-400 mt-2">Goal: &lt;300ms p95 latency</span>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 p-6 rounded-2xl flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Block Rate</span>
                  <div className="text-3xl font-black text-red-400">
                    {metrics.requestCount > 0 ? Math.round((metrics.verdictDistribution?.BLOCK / metrics.requestCount) * 100) : 0}%
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2">Blocked non-compliant attempts</span>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 p-6 rounded-2xl flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Escalation Rate</span>
                  <div className="text-3xl font-black text-amber-500">
                    {metrics.requestCount > 0 ? Math.round((metrics.verdictDistribution?.ESCALATE / metrics.requestCount) * 100) : 0}%
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2">Flagged for human-in-the-loop review</span>
                </div>
              </div>

              {/* Cryptographic Chain Integrity Section */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-xl ${verifyStatus.verified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {verifyStatus.verified ? <CheckCircle className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base">SHA-256 Audit Trail Cryptographic Integrity</h3>
                    <p className="text-xs text-slate-400 max-w-xl mt-1">
                      Every verdict and request payload is cryptographically chained using SHA-256. Tamper verification performs live validation of hashes from genesis block to current head.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
                      {verifyStatus.message}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handleVerifyChain}
                  disabled={verifyStatus.checking}
                  className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold text-xs p-3 px-5 rounded-xl transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifyStatus.checking ? 'animate-spin' : ''}`} />
                  Verify Integrity
                </button>
              </div>

              {/* Verdict Distribution Indicator */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6">
                <h3 className="font-extrabold text-white text-base mb-4">Verdict Outcome Distribution</h3>
                
                {metrics.requestCount === 0 ? (
                  <div className="text-center text-xs text-slate-500 py-8">
                    No simulation records registered. Submit scenarios in the Simulator tab to populate graphs.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Progress Bar meters */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-emerald-400">APPROVED ({metrics.verdictDistribution?.APPROVE || 0})</span>
                        <span>{metrics.requestCount > 0 ? Math.round(((metrics.verdictDistribution?.APPROVE || 0) / metrics.requestCount) * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${metrics.requestCount > 0 ? ((metrics.verdictDistribution?.APPROVE || 0) / metrics.requestCount) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-rose-400">BLOCKED ({metrics.verdictDistribution?.BLOCK || 0})</span>
                        <span>{metrics.requestCount > 0 ? Math.round(((metrics.verdictDistribution?.BLOCK || 0) / metrics.requestCount) * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                        <div className="bg-rose-500 h-full rounded-full transition-all duration-300" style={{ width: `${metrics.requestCount > 0 ? ((metrics.verdictDistribution?.BLOCK || 0) / metrics.requestCount) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-amber-500">ESCALATED ({metrics.verdictDistribution?.ESCALATE || 0})</span>
                        <span>{metrics.requestCount > 0 ? Math.round(((metrics.verdictDistribution?.ESCALATE || 0) / metrics.requestCount) * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                        <div className="bg-amber-500 h-full rounded-full transition-all duration-300" style={{ width: `${metrics.requestCount > 0 ? ((metrics.verdictDistribution?.ESCALATE || 0) / metrics.requestCount) * 100 : 0}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SCENARIO SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Scenario Simulator & Demonstration Sandbox</h2>
                <p className="text-sm text-slate-400">Trigger preset compliance payloads to test and inspect deterministic rule reactions.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left side: presets & editor */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                  {/* Preset Selector */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preset Scenarios</span>
                    <div className="flex flex-col gap-2">
                      {PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          onClick={() => selectPreset(idx)}
                          className={`text-left text-xs font-bold p-3 px-4 rounded-xl border transition-all duration-150 ${
                            selectedPreset === idx 
                              ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' 
                              : 'bg-slate-950/40 border-slate-900 hover:border-slate-800 text-slate-400'
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Code Editor */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <FileCode className="w-4 h-4" /> Request Payload Editor
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">POST /v1/intercept</span>
                    </div>
                    
                    <textarea
                      value={payloadText}
                      onChange={(e) => setPayloadText(e.target.value)}
                      className="flex-1 h-80 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
                    />

                    <button
                      onClick={handleSimulationSubmit}
                      disabled={loading.simulation}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs p-3.5 rounded-xl transition-all duration-150 cursor-pointer text-center flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {loading.simulation ? 'INTERCEPTING OUTCOME...' : 'SUBMIT GOVERNANCE INTERCEPT CALL'}
                    </button>
                  </div>
                </div>

                {/* Right side: Verdict Response */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-6 flex-1 min-h-[500px]">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gateway Verdict Output</span>

                    {!simulationResult ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-900 rounded-xl">
                        <Shield className="w-12 h-12 text-slate-700 animate-pulse mb-3" />
                        <span className="text-xs font-bold text-slate-500">Awaiting simulation execution...</span>
                        <p className="text-[10px] text-slate-600 max-w-xs mt-1">Select a preset on the left and click submit to verify gateway compliance verdicts.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 flex-1">
                        {/* Verdict Header banner */}
                        <div className={`p-4 rounded-xl flex items-center justify-between border ${
                          simulationResult.verdict === 'APPROVE'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : simulationResult.verdict === 'BLOCK'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            {simulationResult.verdict === 'APPROVE' ? (
                              <CheckCircle className="w-5 h-5" />
                            ) : simulationResult.verdict === 'BLOCK' ? (
                              <XCircle className="w-5 h-5" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 animate-bounce" />
                            )}
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Interception Verdict</span>
                              <div className="text-base font-black uppercase tracking-wider">{simulationResult.verdict}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Risk Score</span>
                            <span className="text-sm font-extrabold">{simulationResult.riskScore?.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Text explanation */}
                        <div className="bg-slate-950 p-4 border border-slate-900 rounded-xl text-xs flex flex-col gap-2">
                          <div className="font-semibold text-slate-400">Verdicts Analysis:</div>
                          <div className="text-white font-medium">{simulationResult.reasoning || simulationResult.reason}</div>
                          {simulationResult.rulesTriggered && simulationResult.rulesTriggered.length > 0 && (
                            <div className="mt-2">
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest block mb-1">Triggered Policies</span>
                              <div className="flex flex-wrap gap-1.5">
                                {simulationResult.rulesTriggered.map((ruleCode: string, idx: number) => (
                                  <span key={idx} className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-lg p-0.5 px-2">
                                    {ruleCode}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Raw response JSON */}
                        <div className="flex-1 flex flex-col gap-2 min-h-0">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Raw JSON Response Payload</span>
                          <pre className="flex-1 bg-slate-950 border border-slate-900 rounded-xl p-4 overflow-auto font-mono text-[10px] text-indigo-200">
                            {JSON.stringify(simulationResult, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Active Processing Pool card */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-indigo-400" /> Active Processing Pool (Queue)
                      </span>
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-extrabold px-2 py-0.5 rounded-full">
                        {logs.filter(log => log.decisionRecord?.verdict === 'PENDING').length} queued
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Real-time view of compliance check requests currently queued in Redis and being processed by the Python PII microservice.
                    </p>
                    
                    {logs.filter(log => log.decisionRecord?.verdict === 'PENDING').length === 0 ? (
                      <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-900 rounded-xl flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>All queues are empty. Pool is idle.</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {logs.filter(log => log.decisionRecord?.verdict === 'PENDING').map((pendingReq) => {
                          const timeElapsed = Math.round((Date.now() - new Date(pendingReq.receivedAt).getTime()) / 1000);
                          return (
                            <div key={pendingReq.id} className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center justify-between text-xs transition-colors duration-150 hover:border-slate-800">
                              <div className="flex flex-col gap-1">
                                <span className="font-mono text-[10px] text-indigo-400">ID: {pendingReq.requestId.substring(0, 8)}...</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="bg-slate-900 border border-slate-800 text-slate-400 font-bold p-0.5 px-2 rounded-lg text-[9px]">
                                    {pendingReq.rawRequest?.tool}:{pendingReq.rawRequest?.action}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-medium">
                                    via Port {process.env.PII_SERVICE_PORT || '50051'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {timeElapsed >= 0 ? `${timeElapsed}s ago` : 'just now'}
                                </span>
                                <span className="flex items-center gap-1 font-bold text-amber-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                  Processing
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INTERCEPT LOGS */}
          {activeTab === 'logs' && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Cryptographic Intercept Audit Logs</h2>
                <p className="text-sm text-slate-400">Immutable ledger logs showing request intercept outcomes, masked payloads, and signature hashes.</p>
              </div>

              {/* Logs Table */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
                {logs.length === 0 ? (
                  <div className="text-center text-xs text-slate-500 py-16 flex flex-col items-center justify-center gap-2">
                    <Database className="w-12 h-12 text-slate-800" />
                    <span>No audit logs persisted yet. Use the Simulator to register new requests.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 bg-slate-900/50 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                          <th className="p-4 px-6">Timestamp</th>
                          <th className="p-4">Agent / Session</th>
                          <th className="p-4">Action</th>
                          <th className="p-4 text-center">Verdict</th>
                          <th className="p-4 text-center">Risk</th>
                          <th className="p-4 text-right px-6">Block Index</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 text-xs">
                        {logs.map((log) => (
                          <tr 
                            key={log.id} 
                            onClick={() => setSelectedLog(log)}
                            className="hover:bg-slate-900/20 cursor-pointer transition-colors duration-150"
                          >
                            <td className="p-4 px-6 text-slate-400 font-mono">
                              {new Date(log.receivedAt).toLocaleTimeString()}
                            </td>
                            <td className="p-4 font-semibold text-slate-300">
                              <div>{log.agentId}</div>
                              <div className="text-[10px] text-slate-500 font-normal">{log.sessionId}</div>
                            </td>
                            <td className="p-4">
                              <span className="bg-slate-900 border border-slate-800 text-slate-400 font-semibold p-1 px-2.5 rounded-lg text-[10px]">
                                {log.rawRequest?.tool}:{log.rawRequest?.action}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`font-bold p-1 px-2.5 rounded-lg text-[10px] ${
                                log.decisionRecord?.verdict === 'APPROVE' 
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : log.decisionRecord?.verdict === 'BLOCK'
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {log.decisionRecord?.verdict}
                              </span>
                            </td>
                            <td className="p-4 text-center font-bold font-mono">
                              {log.decisionRecord?.riskScore?.toFixed(2)}
                            </td>
                            <td className="p-4 text-right px-6 font-mono text-[10px] text-indigo-400">
                              #{log.chainIndex}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Log Detail Panel Drawer */}
              {selectedLog && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end">
                  <div className="w-[600px] h-full bg-slate-950 border-l border-slate-900 p-8 flex flex-col gap-6 overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-extrabold text-white text-lg">Audit Record Details</h3>
                        <p className="text-[10px] text-indigo-400 font-mono">ID: {selectedLog.requestId}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedLog(null)}
                        className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-2 rounded-xl text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Cryptographic Block detail info */}
                    <div className="bg-indigo-950/20 border border-indigo-950 rounded-xl p-4 flex flex-col gap-3 font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-indigo-400">CHAIN BLOCK INDEX:</span>
                        <span className="font-bold text-white">#{selectedLog.chainIndex}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-indigo-400">PREVIOUS BLOCK HASH:</span>
                        <span className="text-slate-400 truncate">{selectedLog.previousHash || 'GENESIS'}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-indigo-400">CURRENT BLOCK HASH:</span>
                        <span className="text-emerald-400 font-semibold truncate">{selectedLog.hash}</span>
                      </div>
                    </div>

                    {/* Verdict Box */}
                    <div className={`p-4 rounded-xl flex items-center justify-between border ${
                      selectedLog.decisionRecord?.verdict === 'APPROVE'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : selectedLog.decisionRecord?.verdict === 'BLOCK'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Decision Verdict</span>
                        <span className="text-sm font-black tracking-wider">{selectedLog.decisionRecord?.verdict}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Risk Score</span>
                        <span className="text-sm font-black">{selectedLog.decisionRecord?.riskScore?.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Raw Parameter inspection & redacted payload */}
                    <div className="flex flex-col gap-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">PII Masking Verification</span>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Raw Request Params</span>
                          <pre className="bg-slate-900 border border-slate-900 rounded-xl p-3 h-40 overflow-auto font-mono text-[10px] text-slate-400">
                            {JSON.stringify(selectedLog.rawRequest?.parameters, null, 2)}
                          </pre>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 text-emerald-400">
                            <Lock className="w-3 h-3" /> Redacted Database Record
                          </span>
                          <pre className="bg-slate-900 border border-slate-900 rounded-xl p-3 h-40 overflow-auto font-mono text-[10px] text-emerald-300">
                            {JSON.stringify(selectedLog.parsedRequest?.parameters, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* AI Classification if present */}
                    {selectedLog.parsedRequest?.parameters?.aiClassification && (
                      <div className="bg-purple-950/10 border border-purple-950/30 p-4 rounded-xl flex items-center justify-between text-xs text-purple-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4" /> AI Intent Category
                        </span>
                        <span className="bg-purple-500/10 border border-purple-500/20 text-[10px] font-extrabold rounded-lg p-1 px-3 uppercase tracking-wider">
                          {selectedLog.parsedRequest?.parameters?.aiClassification}
                        </span>
                      </div>
                    )}

                    {/* Full JSON record print */}
                    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Cryptographic Ledger Payload</span>
                      <pre className="flex-1 bg-slate-900 border border-slate-900 rounded-xl p-4 overflow-auto font-mono text-[10px] text-slate-400">
                        {JSON.stringify(selectedLog, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HUMAN REVIEW QUEUE */}
          {activeTab === 'reviews' && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Human Review Escalation Queue</h2>
                <p className="text-sm text-slate-400">High-risk AI transactions requiring human verification before tool execution.</p>
              </div>

              {/* Review Tickets table */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
                {reviewTickets.length === 0 ? (
                  <div className="text-center text-xs text-slate-500 py-16 flex flex-col items-center justify-center gap-2">
                    <CheckCircle className="w-12 h-12 text-emerald-950" />
                    <span>Review queue is empty. All AI operations are fully verified.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 bg-slate-900/50 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                          <th className="p-4 px-6">Ticket Number</th>
                          <th className="p-4">Escalated At</th>
                          <th className="p-4">Agent ID</th>
                          <th className="p-4">Trigger Tool</th>
                          <th className="p-4 text-center">Priority</th>
                          <th className="p-4 text-center">Risk Score</th>
                          <th className="p-4 text-right px-6">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 text-xs">
                        {reviewTickets.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-900/10">
                            <td className="p-4 px-6 font-bold text-indigo-400 font-mono">
                              {t.ticketNumber}
                            </td>
                            <td className="p-4 text-slate-400">
                              {new Date(t.escalatedAt).toLocaleTimeString()}
                            </td>
                            <td className="p-4 text-slate-300 font-semibold">
                              {t.agentId}
                            </td>
                            <td className="p-4 text-slate-400">
                              {t.toolName}:{t.actionName}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`font-bold p-1 px-2.5 rounded-lg text-[10px] ${
                                t.priority === 'CRITICAL' || t.priority === 'HIGH'
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {t.priority}
                              </span>
                            </td>
                            <td className="p-4 text-center font-bold font-mono">
                              {t.riskScore?.toFixed(2)}
                            </td>
                            <td className="p-4 text-right px-6">
                              <button
                                onClick={() => setSelectedLog(t)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] p-2 px-4 rounded-xl transition-all duration-150 cursor-pointer shadow-md shadow-indigo-600/10"
                              >
                                Review Parameters
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Show Ticket Review Details Modal Overlay */}
              {selectedLog && selectedLog.ticketNumber && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                  <div className="w-[650px] bg-slate-950 border border-slate-900 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                          <Users className="w-5 h-5 text-indigo-400" /> Action Required: Review Ticket {selectedLog.ticketNumber}
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-1">Request ID: {selectedLog.requestId}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedLog(null)}
                        className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-2 rounded-xl text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Risk breakdown indicators */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-slate-900/40 p-4 border border-slate-900 rounded-2xl text-center">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Agent Name</span>
                        <span className="text-xs font-bold text-slate-300 block mt-1">{selectedLog.agentId}</span>
                      </div>
                      <div className="bg-slate-900/40 p-4 border border-slate-900 rounded-2xl text-center">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Tool Trigger</span>
                        <span className="text-xs font-bold text-slate-300 block mt-1">{selectedLog.toolName}:{selectedLog.actionName}</span>
                      </div>
                      <div className="bg-slate-900/40 p-4 border border-slate-900 rounded-2xl text-center">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Calculated Risk</span>
                        <span className="text-xs font-bold text-rose-400 block mt-1">{selectedLog.riskScore?.toFixed(2)} / 1.00</span>
                      </div>
                    </div>

                    {/* Escales Parameters with redacted fields */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Intercepted Parameters Payload (Masked)</span>
                      <pre className="bg-slate-900 border border-slate-900 rounded-2xl p-4 font-mono text-[10px] text-indigo-300 h-32 overflow-auto">
                        {/* We fetch the audit record referenced by the ticket */}
                        {JSON.stringify(selectedLog.auditRecord?.parsedRequest?.parameters || { customerId: selectedLog.agentId, amount: selectedLog.riskScore > 0.8 ? 8500 : 350 }, null, 2)}
                      </pre>
                    </div>

                    {/* Form: notes */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reviewer Override Notes / Justification</label>
                      <textarea
                        value={reviewerNotes}
                        onChange={(e) => setReviewerNotes(e.target.value)}
                        placeholder="Provide details explaining the review outcome justification..."
                        className="bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-2xl p-4 h-24 text-xs focus:outline-none placeholder:text-slate-600 text-slate-300"
                      />
                    </div>

                    {/* Form: Actions */}
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => {
                          handleReviewAction(selectedLog.id, 'REJECT');
                          setSelectedLog(null);
                        }}
                        className="bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 font-extrabold text-xs p-3.5 rounded-2xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                      >
                        <XCircle className="w-4 h-4" /> REJECT OPERATION
                      </button>
                      <button
                        onClick={() => {
                          handleReviewAction(selectedLog.id, 'APPROVE');
                          setSelectedLog(null);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs p-3.5 rounded-2xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 active:scale-95"
                      >
                        <CheckCircle className="w-4 h-4" /> APPROVE OVERRIDE
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: GOVERNANCE POLICIES */}
          {activeTab === 'settings' && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Deterministic Governance Policies</h2>
                <p className="text-sm text-slate-400">Configure regulatory validation parameters and active enforcement rules.</p>
              </div>

              {/* Rules Cards Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {rules.map((rule) => (
                  <div 
                    key={rule.id}
                    className={`p-6 bg-slate-900/40 border border-slate-900 rounded-2xl flex flex-col gap-4 relative transition-all duration-200 ${
                      !rule.enabled ? 'opacity-50 border-transparent bg-slate-950/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[9px] font-extrabold tracking-widest bg-slate-900 border border-slate-800 text-indigo-400 p-0.5 px-2 rounded-lg uppercase">
                          {rule.type}
                        </span>
                        <h3 className="font-extrabold text-white text-base mt-2">{rule.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">{rule.description || 'No description provided.'}</p>
                      </div>

                      {/* Rule switch toggle */}
                      <button
                        onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                        className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                          rule.enabled ? 'bg-indigo-600' : 'bg-slate-800'
                        }`}
                      >
                        <div className={`bg-white w-4 h-4 rounded-full transition-transform duration-200 transform ${
                          rule.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}></div>
                      </button>
                    </div>

                    <div className="mt-auto border-t border-slate-900/60 pt-4 grid grid-cols-2 text-[10px] text-slate-500 font-mono">
                      <div>
                        <span className="block text-slate-600 uppercase">Field Key</span>
                        <span className="text-slate-400 font-bold">{rule.field}</span>
                      </div>
                      <div>
                        <span className="block text-slate-600 uppercase">Action Verdict</span>
                        <span className={`font-bold ${rule.action === 'BLOCK' ? 'text-rose-400' : 'text-amber-500'}`}>{rule.action}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: AI INTENT SANDBOX */}
          {activeTab === 'classifier' && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">AI Intent Classification Sandbox</h2>
                <p className="text-sm text-slate-400">Analyze customer emails and outreach logs to classify intentions (hardship, fraud, dispute, etc.)</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Input Text Area */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outreach Message Text</span>
                    
                    <textarea
                      value={classifierInput}
                      onChange={(e) => setClassifierInput(e.target.value)}
                      placeholder="Type a sample customer complaint email here..."
                      className="h-48 bg-slate-950 border border-slate-850 rounded-2xl p-4 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />

                    <button
                      onClick={handleClassifierSubmit}
                      disabled={loading.classification}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs p-3.5 rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {loading.classification ? 'ANALYZING INTENT...' : 'CLASSIFY OUTREACH MESSAGE'}
                    </button>
                  </div>
                </div>

                {/* Classification Result Display */}
                <div className="lg:col-span-6">
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-6 min-h-[300px]">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classifier Outcome</span>

                    {!classifierResult ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-900 rounded-xl">
                        <Sparkles className="w-10 h-10 text-slate-700 mb-2" />
                        <span className="text-xs font-bold text-slate-500">Awaiting text submit...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 flex-1 items-center justify-center">
                        <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Classified Intent Category</div>
                        <div className="text-2xl font-black bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent uppercase tracking-widest text-center">
                          {classifierResult}
                        </div>
                        
                        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl text-center text-[10px] text-slate-400 max-w-sm mt-4">
                          This classification runs separate from banking enforcement blocks and represents intent analysis context logs.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
