import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
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
import ReportPage from './pages/analysis/ReportPage';

const CommunityLayout = () => (
  <>
    <Header />
    <div style={{ padding: '20px', minHeight: 'calc(100vh - 60px)' }}>
      <Outlet /> {/* 여기에 PostList, MarketList 등이 렌더링됩니다. */}
    </div>
  </>
);

const AnalysisLayout = () => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <Header /> 
    <div style={{ display: 'flex', flex: 1 }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0, background: '#F9FAFB',padding: '20px'}}>
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
            <Route element={<CommunityLayout />}>
              <Route path="/" element={<PostList />} />
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
            <Route path="/analysis" element={
                <AdminRoute>
                  <AnalysisLayout />
                </AdminRoute>
              }
            >
              {/* /analysis 로 들어오면 기본적으로 dashboard를 보여줌 */}
              <Route index element={<DashboardPage />} /> 
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="detail" element={<AnalysisPage />} />
              <Route path="report" element={<ReportPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </AnalysisProvider>
    </AuthProvider>
  );
}

export default App;