import React from 'react';

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import LandingPage from './pages/LandingPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnalysisProvider } from './context/AnalysisContext';

import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import AdminRoute from './components/common/AdminRoute';
import ProductAdmin from './components/market/ProductAdmin';

import PostList from './pages/community/PostList';
import PostWrite from './pages/community/PostWrite';
import PostDetail from './pages/community/PostDetail';
import PostEdit from './pages/community/PostEdit';
import Login from './pages/user/Login';
import AdminSingup from './pages/user/AdminSignup';
import UserSignup from './pages/user/UserSignup';
import PointHistory from './pages/user/PointHistory';
import AdminDashboard from './pages/user/AdminDashboard';
import MyPage from './pages/user/MyPage';
import MarketList from './pages/market/MarketList';
import ProductDetail from './pages/market/ProductDetail';
import VoucherDetail from './pages/market/VoucherDetail';
import MyActivityList from './pages/user/MyActivityList';

import DashboardPage from './pages/analysis/DashboardPage';
import AnalysisPage from './pages/analysis/AnalysisPage';
import PipelinePage from './pages/analysis/PipelinePage';
import ReportPage from './pages/analysis/ReportPage';
import AnalysisResultPage from './pages/analysis/AnalysisResultPage';

const ProtectedLanding = () => {
  const { isLoggedIn, user } = useAuth();
  if (isLoggedIn) {
    const isAdmin = user?.role === 'SYSTEM_ADMIN' || user?.role === 'COMPANY_ADMIN';
    return <Navigate to={isAdmin ? '/analysis/dashboard' : '/community'} replace />;
  }
  return <LandingPage />;
};

const CommunityLayout = () => (
  <>
    <Header />
    <div className="px-5 py-5 min-h-[calc(100vh-56px)]">
      <Outlet />
    </div>
  </>
);

const AnalysisLayout = () => (
  <div className="flex flex-col min-h-screen">
    <Header />
    <div className="flex flex-1">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0 bg-[#F7F8FA]">
        <Outlet />
      </main>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <AnalysisProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedLanding />} />
            <Route element={<CommunityLayout />}>
              <Route path="/community" element={<PostList />} />
              <Route path="/write" element={<PostWrite />} />
              <Route path="/posts/:id" element={<PostDetail />} />
              <Route path="/edit/:id" element={<PostEdit />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<UserSignup />} />
              <Route path="/signup/admin" element={<AdminSingup />} />
              <Route path="/points/:id" element={<PointHistory />} />
              <Route path="/market" element={<MarketList />} />
              <Route path="/products/:productId" element={<ProductDetail />} />
              <Route path="/mypage" element={<MyPage />} />
              <Route path="/my-page/:orderId" element={<VoucherDetail />} />
              <Route path="/my-activity/:type" element={<MyActivityList />} />

              <Route path="/admin" element={
                <AdminRoute><AdminDashboard /></AdminRoute>
              } />
              <Route path="/admin/products" element={
                <AdminRoute><ProductAdmin /></AdminRoute>
              } />
            </Route>
            {/* Pipeline: 독립 full-screen — Layout 없음 */}
            <Route path="/analysis/pipeline/:sessionId" element={
              <AdminRoute><PipelinePage /></AdminRoute>
            } />
            <Route path="/analysis" element={
                <AdminRoute>
                  <AnalysisLayout />
                </AdminRoute>
              }
            >
              <Route index element={<AnalysisPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="report" element={<ReportPage />} />
              <Route path="result/:analysisId" element={<AnalysisResultPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          
          <ToastContainer
            containerId="main-toast"
            position="top-center"
            autoClose={2500}
            hideProgressBar={true}
            newestOnTop
            closeOnClick
            pauseOnHover
            draggable
            theme="light"
            style={{ marginTop: '70px' }}
          />
          <ToastContainer
            containerId="notification-toast"
            position="top-right"
            autoClose={4000}
            newestOnTop
            closeOnClick
            pauseOnHover
            draggable
            theme="light"
            limit={3}
            style={{ marginTop: '70px' }}
          />
        </BrowserRouter>
      </AnalysisProvider>
    </AuthProvider>
  );
}

export default App;