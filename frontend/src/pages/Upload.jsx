import React, { useState } from 'react';
import axios from 'axios';
import { UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Upload = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return alert('Please select a file');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const res = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      navigate(`/?dataset=${res.data._id}`);
    } catch (err) {
      alert('Upload failed. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-4xl mx-auto h-full flex flex-col items-center justify-center">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Upload Dataset</h1>
        <p className="text-slate-500 mt-3 text-lg">Upload an Excel (.xlsx) file containing resistance gene data</p>
      </div>

      <div className="w-full bg-white border-2 border-dashed border-indigo-200 rounded-3xl p-16 flex flex-col items-center justify-center shadow-sm transition hover:border-indigo-400">
        <div className="bg-indigo-50 p-6 rounded-full mb-6">
          <UploadCloud size={48} className="text-indigo-500" />
        </div>
        
        <input 
          type="file" 
          accept=".xlsx, .xls"
          onChange={handleFileChange} 
          className="block w-full max-w-sm text-sm text-slate-500
            file:mr-4 file:py-3 file:px-6
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-indigo-50 file:text-indigo-700
            hover:file:bg-indigo-100 cursor-pointer mb-6"
        />

        {file && <p className="text-slate-600 font-medium mb-6">Selected: {file.name}</p>}

        <button 
          onClick={handleUpload}
          disabled={loading}
          className="bg-indigo-600 text-white px-10 py-4 rounded-full font-bold shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2 text-lg"
        >
          {loading ? 'Processing...' : 'Upload & Analyze Data'}
        </button>
      </div>
    </div>
  );
};

export default Upload;
