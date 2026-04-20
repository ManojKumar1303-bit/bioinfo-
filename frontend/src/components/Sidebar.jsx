import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, History, LogOut, Microscope } from 'lucide-react';

const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="w-64 bg-white border-r h-full flex flex-col items-center py-6 shadow-sm">
      <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl mb-10 w-full px-6">
        <Microscope size={28} />
        <span>BioDash</span>
      </div>

      <nav className="flex flex-col w-full px-4 gap-2 flex-grow">
        <NavLink to="/" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
          <LayoutDashboard size={20} />
          Dashboard
        </NavLink>
        <NavLink to="/upload" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
          <UploadCloud size={20} />
          Upload Dataset
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
          <History size={20} />
          History
        </NavLink>
      </nav>

      <div className="w-full px-4 mt-auto text-slate-600">
        <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors hover:bg-red-50 hover:text-red-600">
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
