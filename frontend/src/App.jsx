import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import History from './pages/History';
import Sidebar from './components/Sidebar';
import SavedSummary from './pages/SavedSummary';
import SavedDetails from './pages/SavedDetails';

const App = () => {
  const token = localStorage.getItem('token');

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex h-screen bg-slate-50">
        {token && <Sidebar />}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/login" element={!token ? <Login /> : <Navigate to="/" />} />
            <Route path="/signup" element={!token ? <Signup /> : <Navigate to="/" />} />
            <Route path="/" element={token ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="/upload" element={token ? <Upload /> : <Navigate to="/login" />} />
            <Route path="/history" element={token ? <History /> : <Navigate to="/login" />} />
            <Route path="/saved-summary" element={token ? <SavedSummary /> : <Navigate to="/login" />} />
            <Route path="/saved-details" element={token ? <SavedDetails /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;
