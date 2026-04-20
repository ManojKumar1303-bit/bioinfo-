import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Star, Search, Download, Trash2, Eye, Filter } from 'lucide-react';
import { API_BASE_URL, authHeaders, exportSavedResultPDF } from '../utils/savedResults';

const PAGE_SIZE = 8;

const TYPE_STYLES = {
  dataset: 'bg-indigo-100 text-indigo-700',
  gene: 'bg-emerald-100 text-emerald-700',
  organism: 'bg-amber-100 text-amber-700'
};

const formatType = (type) => {
  if (type === 'dataset') return 'Dataset';
  if (type === 'gene') return 'Gene';
  if (type === 'organism') return 'Organism';
  return type;
};

const SavedResultsView = ({ title, subtitle, mode = 'summary' }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedResult, setSelectedResult] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '' });

  const showToast = (message) => {
    setToast({ open: true, message });
    setTimeout(() => setToast({ open: false, message: '' }), 2000);
  };

  const fetchResults = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/api/save/all`, { headers: authHeaders() });
      const fetched = Array.isArray(res.data) ? res.data : [];
      setResults(fetched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch {
      showToast('Failed to load saved results');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const filtered = useMemo(() => {
    let scoped = results.filter((item) => (mode === 'summary' ? item.type === 'dataset' : item.type !== 'dataset'));

    if (mode === 'details' && activeTab !== 'all') {
      scoped = scoped.filter((item) => item.type === activeTab);
    }

    if (typeFilter !== 'all') {
      scoped = scoped.filter((item) => item.type === typeFilter);
    }

    if (favoritesOnly) {
      scoped = scoped.filter((item) => item.isFavorite);
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      scoped = scoped.filter((item) =>
        String(item.name || '').toLowerCase().includes(query) ||
        String(item.content || '').toLowerCase().includes(query)
      );
    }

    return scoped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [results, mode, activeTab, typeFilter, favoritesOnly, search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, typeFilter, favoritesOnly, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleFavorite = async (id) => {
    try {
      const res = await axios.patch(`${API_BASE_URL}/api/save/favorite/${id}`, {}, { headers: authHeaders() });
      setResults((prev) => prev.map((item) => (item._id === id ? res.data.result : item)));
    } catch {
      showToast('Failed to update favorite');
    }
  };

  const deleteResult = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/save/${id}`, { headers: authHeaders() });
      setResults((prev) => prev.filter((item) => item._id !== id));
      if (selectedResult?._id === id) setSelectedResult(null);
      showToast('Result deleted');
    } catch {
      showToast('Failed to delete result');
    }
  };

  if (loading) return <div className="p-10 text-slate-500 font-medium text-lg">Loading saved results...</div>;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">{title}</h1>
        <p className="text-slate-500 mt-2 text-lg">{subtitle}</p>
      </div>

      {mode === 'details' && (
        <div className="flex gap-2 bg-white rounded-xl p-2 border border-slate-200 w-fit">
          {['all', 'gene', 'organism'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${activeTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved results..."
            className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2 items-center">
          <Filter size={16} className="text-slate-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            <option value="all">All Types</option>
            <option value="dataset">Dataset</option>
            <option value="gene">Gene</option>
            <option value="organism">Organism</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
          Show Favorites Only
        </label>
      </div>

      {pageSlice.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border text-center text-slate-500">
          No saved results found for the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pageSlice.map((item) => (
            <div
              key={item._id}
              className={`bg-white rounded-2xl border p-5 shadow-sm transition ${item.isFavorite ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-100'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 line-clamp-2">{item.name}</h3>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${TYPE_STYLES[item.type] || 'bg-slate-100 text-slate-700'}`}>
                    {formatType(item.type)}
                  </span>
                </div>
                <button onClick={() => toggleFavorite(item._id)} className="text-amber-500 hover:scale-110 transition">
                  <Star size={20} fill={item.isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>

              <p className="text-sm text-slate-600 line-clamp-4">{item.content}</p>
              <p className="text-xs text-slate-400 mt-3">{new Date(item.createdAt).toLocaleString()}</p>

              <div className="mt-4 flex gap-2 flex-wrap">
                <button onClick={() => setSelectedResult(item)} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium inline-flex items-center gap-1.5">
                  <Eye size={14} /> View
                </button>
                <button onClick={() => exportSavedResultPDF(item)} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium inline-flex items-center gap-1.5">
                  <Download size={14} /> Export PDF
                </button>
                <button onClick={() => deleteResult(item._id)} className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-medium inline-flex items-center gap-1.5">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-white border text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg bg-white border text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {selectedResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-slate-800">{selectedResult.name}</h2>
              <button onClick={() => setSelectedResult(null)} className="text-slate-500 hover:text-slate-700">Close</button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {formatType(selectedResult.type)} • {new Date(selectedResult.createdAt).toLocaleString()}
            </p>
            <p className="text-slate-700 whitespace-pre-line leading-relaxed">{selectedResult.content}</p>
          </div>
        </div>
      )}

      {toast.open && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-[80]">
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default SavedResultsView;
