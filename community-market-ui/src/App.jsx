import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './pages/Header';
import PostList from './pages/PostList';
import PostWrite from './components/PostWrite';
import PostDetail from './components/PostDetail';
import PostEdit from './components/PostEdit';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PointHistory from './components/PointHistory';
import { AuthProvider } from './context/AuthContext';
import AdminDashboard from './pages/AdminDashboard';
import AdminRoute from './components/AdminRoute';
import MarketList from './pages/MarketList';
import ProductDetail from './components/ProductDetail';
import MyPage from './pages/MyPage';
import VoucherDetail from './components/VoucherDetail';
import ProductAdmin from './components/ProductAdmin';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<PostList />} />
          <Route path="/write" element={<PostWrite />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/edit/:id" element={<PostEdit />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/points/:id" element={<PointHistory />} />
          <Route path="/admin" element={
            <AdminRoute><AdminDashboard /></AdminRoute>
          } />
          <Route path="/admin/products" element={
            <AdminRoute><ProductAdmin /></AdminRoute>
          } />
          <Route path="/market" element={<MarketList />} />
          <Route path="/products/:productId" element={<ProductDetail />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/my-page/:orderId" element={<VoucherDetail />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App