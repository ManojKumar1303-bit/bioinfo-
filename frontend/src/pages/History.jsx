import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Calendar, ChevronRight } from 'lucide-react';

const History = () => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/datasets', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        setDatasets(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) return <div className="p-10 text-slate-500 font-medium text-lg">Loading history...</div>;

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Dataset History</h1>
        <p className="text-slate-500 mt-2 text-lg">Access previously uploaded datasets and analyses.</p>
      </div>

      <div className="grid gap-6">
        {datasets.length === 0 ? (
          <div className="bg-white p-10 rounded-2xl shadow-sm text-center border text-slate-500 text-lg">
            No datasets uploaded yet.
          </div>
        ) : (
          datasets.map(ds => (
            <Link 
              to={`/?dataset=${ds._id}`} 
              key={ds._id}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-5">
                <div className="bg-indigo-50 p-4 rounded-xl text-indigo-600">
                  <FileSpreadsheet size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{ds.filename}</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1 font-medium">
                    <Calendar size={16} />
                    {new Date(ds.uploadDate).toLocaleDateString()}
                    <span className="mx-2">•</span>
                    <span className="bg-slate-100 px-2 py-1 rounded-md">{ds.analysis?.totalGenes} Genes</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-full text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <ChevronRight size={24} />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default History;
