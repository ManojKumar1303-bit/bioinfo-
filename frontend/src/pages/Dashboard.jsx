import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Search, Info, Bot, Activity, Dna, Database, BookOpen } from 'lucide-react';
import AIModal from '../components/AIModal';
import { API_BASE_URL, authHeaders } from '../utils/savedResults';

const AI_TIMEOUT_MS = 35000;
const AI_MAX_RETRIES = 2;
const CHART_HEIGHT = 300;
const isValidDatasetId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));

const getErrorMessage = (error) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.response?.data?.error || error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error occurred';
};

const StableChartFrame = ({ children }) => {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const updateWidth = () => {
      const nextWidth = Math.floor(containerRef.current?.getBoundingClientRect().width || 0);
      setWidth(nextWidth > 0 ? nextWidth : 0);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full min-w-0 h-[300px]">
      {width > 0 ? children(width, CHART_HEIGHT) : <div className="w-full h-full bg-slate-50 rounded-xl animate-pulse" />}
    </div>
  );
};

const Dashboard = () => {
  const [dataset, setDataset] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // AI Modal states
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTitle, setAiTitle] = useState('');
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiStatus, setAiStatus] = useState('Idle');
  const [aiError, setAiError] = useState('');
  const [aiRetryCount, setAiRetryCount] = useState(0);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMeta, setSaveMeta] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '' });

  const location = useLocation();
  const navigate = useNavigate();
  const aiAbortRef = useRef(null);
  const datasetAbortRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const lastAiRequestRef = useRef(null);

  const requestHeaders = useMemo(() => authHeaders(), []);

  const showToast = useCallback((message) => {
    setToast({ open: true, message });
    setTimeout(() => {
      setToast({ open: false, message: '' });
    }, 2200);
  }, []);

  const closeAiModal = useCallback(() => {
    setAiModalOpen(false);
    setAiLoading(false);
    setAiStatus('Cancelled');
    setSaveMeta(null);
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    const fetchDataset = async () => {
      if (datasetAbortRef.current) datasetAbortRef.current.abort();
      const controller = new AbortController();
      datasetAbortRef.current = controller;

      try {
        setLoading(true);
        const queryParams = new URLSearchParams(location.search);
        let dsId = queryParams.get('dataset');
        if (!isValidDatasetId(dsId)) dsId = null;

        if (!dsId) {
          const res = await axios.get(`${API_BASE_URL}/api/datasets`, { headers: requestHeaders, signal: controller.signal });
          if (res.data.length > 0) {
            dsId = res.data[res.data.length - 1]._id; // latest
            navigate(`/?dataset=${dsId}`, { replace: true });
            return;
          } else {
            setDataset(null);
            setLoading(false);
            return;
          }
        }

        const res = await axios.get(`${API_BASE_URL}/api/dataset/${dsId}`, { headers: requestHeaders, signal: controller.signal });
        const fetchedDataset = res.data?.data || res.data;
        setDataset(fetchedDataset);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setDataset(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchDataset();
    return () => {
      if (datasetAbortRef.current) {
        datasetAbortRef.current.abort();
      }
    };
  }, [location.search, navigate, requestHeaders]);

  useEffect(() => () => {
    if (aiAbortRef.current) aiAbortRef.current.abort();
    if (datasetAbortRef.current) datasetAbortRef.current.abort();
  }, []);

  const runAIRequest = useCallback(async ({ title, endpoint, payload, responseKey, savePayload }) => {
    if (!dataset?._id) return;

    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    lastAiRequestRef.current = { title, endpoint, payload, responseKey, savePayload };

    if (aiAbortRef.current) aiAbortRef.current.abort();

    setAiTitle(title);
    setAiModalOpen(true);
    setAiLoading(true);
    setAiExplanation('');
    setAiError('');
    setAiRetryCount(0);
    setSaveMeta(null);
    setAiStatus('Preparing request...');

    let lastError = null;

    for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setAiRetryCount(attempt);
      setAiStatus(attempt === 0 ? 'Contacting AI service...' : `Retrying (${attempt}/${AI_MAX_RETRIES})...`);

      const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      try {
        const res = await axios.post(
          `${API_BASE_URL}${endpoint}`,
          payload,
          { headers: requestHeaders, signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (requestId !== aiRequestIdRef.current) return;

        const text = (res.data?.[responseKey] || '').trim();
        if (!text) throw new Error('AI response was empty');

        setAiExplanation(text);
        setSaveMeta({
          ...savePayload,
          content: text,
          datasetId: dataset?._id
        });
        setAiStatus('Response generated.');
        setAiLoading(false);
        aiAbortRef.current = null;
        return;
      } catch (error) {
        clearTimeout(timeoutId);
        if (requestId !== aiRequestIdRef.current) return;

        if (controller.signal.aborted) {
          lastError = new Error('Request timed out. Please try again.');
        } else {
          lastError = error;
        }

        if (attempt < AI_MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
    }

    if (requestId !== aiRequestIdRef.current) return;

    console.error('[AI] request failed:', getErrorMessage(lastError));
    setAiError(getErrorMessage(lastError));
    setAiStatus('Failed to generate response.');
    setAiLoading(false);
    setAiExplanation('');
    aiAbortRef.current = null;
  }, [dataset?._id, requestHeaders]);

  const handleSaveResult = useCallback(async () => {
    if (!saveMeta?.type || !saveMeta?.name || !saveMeta?.content) return;

    try {
      setSaveLoading(true);
      const payload = {
        type: saveMeta.type,
        name: saveMeta.name,
        content: saveMeta.content,
        datasetId: saveMeta.datasetId
      };
      const res = await axios.post(`${API_BASE_URL}/api/save`, payload, {
        headers: requestHeaders
      });

      showToast(res.data?.message || 'Result saved successfully');
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setSaveLoading(false);
    }
  }, [saveMeta, requestHeaders, showToast]);

  const handleRetryAI = useCallback(() => {
    if (lastAiRequestRef.current) {
      runAIRequest(lastAiRequestRef.current);
    }
  }, [runAIRequest]);

  const handleDatasetAI = useCallback(() => {
    runAIRequest({
      title: 'Dataset Summary Insight',
      endpoint: `/api/ai/dataset/${dataset?._id}`,
      payload: { dataset: Array.isArray(dataset?.data) ? dataset.data : [] },
      responseKey: 'summary',
      savePayload: {
        type: 'dataset',
        name: `${dataset?.filename || 'Dataset'} Summary`
      }
    });
  }, [dataset?._id, dataset?.data, dataset?.filename, runAIRequest]);

  const handleOrganismAI = useCallback((organism) => {
    runAIRequest({
      title: `AI Insight: ${organism}`,
      endpoint: `/api/ai/organism/${dataset?._id}`,
      payload: {
        organism,
        list: Array.isArray(dataset?.data) ? dataset.data.map((row) => row.resistanceType).filter(Boolean) : []
      },
      responseKey: 'explanation',
      savePayload: {
        type: 'organism',
        name: organism
      }
    });
  }, [dataset?._id, dataset?.data, runAIRequest]);

  const handleGeneAI = useCallback((gene, organism) => {
    runAIRequest({
      title: `AI Insight: ${gene}`,
      endpoint: `/api/ai/gene/${dataset?._id}`,
      payload: { gene, organism },
      responseKey: 'explanation',
      savePayload: {
        type: 'gene',
        name: gene
      }
    });
  }, [dataset?._id, runAIRequest]);

  const deferredSearch = useDeferredValue(search);
  const safeRows = useMemo(() => (
    Array.isArray(dataset?.data) ? dataset.data : []
  ), [dataset?.data]);
  const filteredData = useMemo(() => {
    const query = String(deferredSearch || '').toLowerCase().trim();
    if (!query) return safeRows;

    return safeRows.filter((row) =>
      String(row?.geneName || '').toLowerCase().includes(query) ||
      String(row?.organism || '').toLowerCase().includes(query)
    );
  }, [safeRows, deferredSearch]);
  const analysis = dataset?.analysis || {};

  if (loading) return <div className="p-10 text-slate-500 font-medium text-lg">Loading dashboard...</div>;

  if (!dataset) return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <Database size={64} className="text-slate-300 mb-6" />
      <h2 className="text-3xl font-bold text-slate-700">No Dataset Found</h2>
      <p className="text-slate-500 mt-2 text-lg mb-8">Please upload a dataset to see the analysis dashboard.</p>
      <Link to="/upload" className="bg-indigo-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-indigo-700 transition">
        Go to Upload
      </Link>
    </div>
  );

  const resChartData = Object.entries(analysis.resistanceDistribution || {}).map(([name, count]) => ({ name, count }));
  const orgChartData = Object.entries(analysis.organismDistribution || {}).map(([name, count]) => ({ name, value: count }));
  const COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#60a5fa'];

  const proteinLenData = analysis.proteinLengthDistribution
    ? Object.entries(analysis.proteinLengthDistribution).map(([name, count]) => ({ name, count }))
    : [];
  let insightText = "No protein length data available.";
  if (proteinLenData.length > 0) {
    const maxRange = proteinLenData.reduce((prev, current) => (prev.count > current.count) ? prev : current);
    if (maxRange && maxRange.count > 0) {
      insightText = `Most proteins fall in the ${maxRange.name} amino acid range.`;
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Analysis Dashboard</h1>
          <p className="text-slate-500 mt-2 text-lg font-medium">Dataset: <span className="text-indigo-600">{dataset.filename}</span></p>
        </div>
        <button 
          onClick={handleDatasetAI}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
        >
          <Bot size={20} />
          Generate AI Summary
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-50 text-blue-500 rounded-xl"><Dna size={24} /></div>
            <h3 className="text-slate-500 font-medium">Total Genes</h3>
          </div>
          <p className="text-3xl font-extrabold text-slate-800">{analysis.totalGenes || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-red-50 text-red-500 rounded-xl"><Activity size={24} /></div>
            <h3 className="text-slate-500 font-medium">Dominant Resistance</h3>
          </div>
          <p className="text-2xl font-extrabold text-slate-800 truncate">{analysis.frequentResistance || 'N/A'}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-green-50 text-green-500 rounded-xl"><Bot size={24} /></div>
            <h3 className="text-slate-500 font-medium">Dominant Organism</h3>
          </div>
          <p className="text-xl font-extrabold text-slate-800 truncate">{analysis.frequentOrganism || 'N/A'}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><BookOpen size={24} /></div>
            <h3 className="text-slate-500 font-medium">Avg Protein Length</h3>
          </div>
          <p className="text-2xl font-extrabold text-slate-800">{Number(analysis.avgProteinLength || 0).toFixed(0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-w-0">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Resistance Distribution</h3>
          <StableChartFrame>
            {(width, height) => (
              <BarChart width={width} height={height} data={resChartData}>
                <XAxis dataKey="name" tick={{fontSize: 12}} />
                <YAxis />
                <Tooltip cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="count" fill="#818cf8" radius={[4,4,0,0]} />
              </BarChart>
            )}
          </StableChartFrame>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-w-0">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Organism Distribution</h3>
          <StableChartFrame>
            {(width, height) => (
              <PieChart width={width} height={height}>
                <Pie data={orgChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {orgChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            )}
          </StableChartFrame>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-w-0">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-lg font-bold text-slate-800">Protein Analysis (Length Distribution)</h3>
          </div>
          <StableChartFrame>
            {(width, height) => (
              <BarChart width={width} height={height} data={proteinLenData}>
                <XAxis dataKey="name" tick={{fontSize: 12}} />
                <YAxis />
                <Tooltip cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="count" fill="#34d399" radius={[4,4,0,0]} />
              </BarChart>
            )}
          </StableChartFrame>
          <div className="mt-4 p-4 bg-indigo-50 rounded-xl text-indigo-700 text-sm font-medium flex items-center justify-center gap-2">
            <Info size={16} /> {insightText}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b flex items-center justify-between bg-slate-50">
          <h3 className="text-xl font-bold text-slate-800">Dataset Records</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg">
              {filteredData.length} rows
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search genes or organisms..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white text-sm w-64 text-slate-800"
              />
            </div>
          </div>
        </div>
        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold py-4 border-b">
              <tr>
                <th className="px-6 py-4">Gene Name</th>
                <th className="px-6 py-4">Organism</th>
                <th className="px-6 py-4">Resistance Type</th>
                <th className="px-6 py-4">Length</th>
                <th className="px-6 py-4">Function</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-indigo-600 cursor-pointer group" onClick={() => handleGeneAI(row.geneName, row.organism)}>
                    {row.geneName} <Info size={14} className="inline ml-1 text-slate-300 group-hover:text-indigo-500" />
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700 cursor-pointer group" onClick={() => handleOrganismAI(row.organism)}>
                    {row.organism} <Info size={14} className="inline ml-1 text-slate-300 group-hover:text-indigo-500" />
                  </td>
                  <td className="px-6 py-4">{row.resistanceType}</td>
                  <td className="px-6 py-4">{row.proteinLength}</td>
                  <td className="px-6 py-4 truncate max-w-xs">{row.function}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AIModal 
        isOpen={aiModalOpen} 
        onClose={closeAiModal}
        onRetry={handleRetryAI}
        onSave={handleSaveResult}
        canSave={Boolean(saveMeta?.content)}
        saveLoading={saveLoading}
        title={aiTitle} 
        loading={aiLoading} 
        status={aiStatus}
        retryCount={aiRetryCount}
        error={aiError}
        explanation={aiExplanation} 
      />
      {toast.open && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg z-[70] text-sm">
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
