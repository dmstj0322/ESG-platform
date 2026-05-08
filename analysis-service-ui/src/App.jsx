import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnalysisProvider } from './context/AnalysisContext';
import Sidebar from './components/layout/Sidebar';
import DashboardPage from './pages/DashboardPage';
import AnalysisPage from './pages/AnalysisPage';
import ReportPage from './pages/ReportPage';
import 'antd/dist/reset.css';

const Layout = ({ children }) => (
  <div style={{ display: 'flex', minHeight: '100vh', background: '#F9FAFB' }}>
    <Sidebar />
    <main style={{ flex: 1, overflow: 'auto', minWidth: 0, background: '#F9FAFB' }}>
      {children}
    </main>
  </div>
);

export default function App() {
  return (
    <AnalysisProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/"         element={<DashboardPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/report"   element={<ReportPage />} />
            <Route path="*"         element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AnalysisProvider>
  );
}
