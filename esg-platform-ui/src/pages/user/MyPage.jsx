import React, { useEffect, useState, useContext } from 'react';
import api from '../../api/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MyPage = () => {
  const [orders, setOrders] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [myComments, setMyComments] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.memberId) {
      fetchMyOrders();
      fetchMyActivity();
    }
  }, [user]);

  const fetchMyOrders = async () => {
    try {
      const res = await api.get('/market/orders/my', { headers: { 'X-Member-Id': user.memberId } });
      console.log("주문 데이터 확인:", res.data.content[0]);
      setOrders(res.data.content);
    } catch (err) {
      console.error("주문 내역 조회 실패");
    }
  };

  const fetchMyActivity = async () => {
    console.log("현재 확인된 memberId:", user.memberId);
    try {
      const config = {
        headers: {
          'X-Member-Id': user.memberId,
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      };

      const [postsRes, commentsRes, likesRes] = await Promise.all([
        api.get('/community/posts/my-posts', config),
        api.get('/community/posts/my-comments', config),
        api.get('/community/posts/my-likes', config)
      ]);

      console.log("데이터: ", commentsRes.data);

      setMyPosts(postsRes.data.content);
      setMyComments(commentsRes.data.content);
      setLikedPosts(likesRes.data.content);
    } catch (err) { console.error("활동 내역 로드 실패"); }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm("주문을 취소하시겠습니까?")) return;
    try {
      await api.post(`/market/orders/${orderId}/cancel`, {}, {
        headers: { 'X-Member-Id': user.memberId }
      });
      alert("취소 완료!");
      fetchMyOrders();
    } catch (err) {
      alert(err.response?.data?.message || "취소가 불가능한 주문입니다.");
    }
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', backgroundColor: '#fdfdfd' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '40px', color: '#1a1a1a' }}>My Page</h1>

      {/* 1. 주문 내역 섹션 */}
      <section style={sectionCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>🛍️ 나의 주문 내역</h3>
          {/* 🔗 주문 내역 전체보기 링크 연결 */}
          <Link to="/my-activity/orders" style={moreLinkStyle}>전체보기 〉</Link>
        </div>
        {orders.length === 0 ? <p style={{ color: '#999' }}>주문 내역이 없습니다.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {orders.map(o => (
              <div key={o.orderId} style={orderItemStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '18px', marginBottom: '5px' }}>{o.productName}</div>
                  <div style={{ color: '#22b8cf', fontWeight: 'bold' }}>{o.totalPrice.toLocaleString()} P</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={statusBadgeStyle(o.status)}>{o.status}</span>

                  {/* 핵심 추가: 바우처 확인 버튼 (주문 취소 상태가 아닐 때만 노출) */}
                  {o.status !== 'CANCELLED' && (
                    <button onClick={() => navigate(`/my-page/${o.orderId}`)} style={viewVoucherBtnStyle}>
                      {o.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                    </button>
                  )}

                  {o.status !== 'CANCELLED' && (
                    <button onClick={() => handleCancel(o.orderId)} style={cancelBtnStyle}>취소</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>


      {/* 2. 내가 쓴 게시글 섹션 */}
      <section style={sectionCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>📝 내가 쓴 글 ({myPosts.length})</h3>
          <Link to="/my-activity/posts" style={moreLinkStyle}>전체보기 〉</Link>
        </div>

        {myPosts.length === 0 ? <p style={emptyTextStyle}>작성한 글이 없습니다.</p> :
          myPosts.slice(0, 5).map(post => (
            <div key={post.id} style={activityItemStyle}>
              <Link to={`/posts/${post.id}`} style={linkStyle}>{post.title}</Link>
              <span style={dateTextStyle}>{new Date(post.createdDate).toLocaleDateString()}</span>
            </div>
          ))
        }
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {/* 4. 좋아요 한 글 섹션 */}
        <section style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>❤️ 좋아요 ({likedPosts.length})</h3>
            <Link to="/my-activity/likes" style={moreLinkStyle}>더보기</Link>
          </div>
          {likedPosts.slice(0, 5).map(post => (
            <div key={post.id} style={activityItemStyle}>
              <Link to={`/posts/${post.id}`} style={linkStyle}>{post.title}</Link>
            </div>
          ))}
        </section>

        {/* 4. 내가 쓴 댓글 섹션 */}
        <section style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>💬 댓글 ({myComments.length})</h3>
            <Link to="/my-activity/comments" style={moreLinkStyle}>더보기</Link>
          </div>
          {myComments.slice(0, 5).map(comment => (
            <div key={comment.id} style={activityItemStyle}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#444' }}>{comment.content}</p>
                <Link to={`/posts/${comment.postId}`} style={{ fontSize: '12px', color: '#339af0', textDecoration: 'none' }}>원문 보기</Link>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

const moreLinkStyle = { fontSize: '13px', color: '#adb5bd', textDecoration: 'none', fontWeight: '500' };
const emptyTextStyle = { color: '#adb5bd', fontSize: '14px', padding: '20px 0' };
const dateTextStyle = { fontSize: '12px', color: '#dee2e6', marginLeft: '10px' };

// --- 고도화된 스타일 객체 ---
const sectionCardStyle = {
  backgroundColor: '#fff', padding: '25px', borderRadius: '20px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f3f5', marginBottom: '25px'
};
const sectionTitleStyle = { marginTop: 0, marginBottom: '20px', fontSize: '20px', color: '#333', borderLeft: '5px solid #339af0', paddingLeft: '12px' };
const orderItemStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '15px 0', borderBottom: '1px solid #f8f9fa'
};
const statusBadgeStyle = (status) => ({
  padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
  backgroundColor: status === 'CANCELLED' ? '#fff5f5' : '#e7f5ff',
  color: status === 'CANCELLED' ? '#fa5252' : '#1c7ed6',
  marginRight: '10px'
});
const viewVoucherBtnStyle = {
  backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '8px 16px',
  borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
};
const cancelBtnStyle = {
  backgroundColor: 'transparent', color: '#adb5bd', border: '1px solid #dee2e6',
  padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px'
};
const activityItemStyle = { padding: '12px 0', borderBottom: '1px solid #f8f9fa' };
const linkStyle = { textDecoration: 'none', color: '#495057', fontSize: '15px', fontWeight: '500' };

//   return (
//     <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
//       <h1>마이페이지</h1>

//       {/* 1. 주문 내역 섹션 */}
//       <section style={sectionStyle}>
//         <h3>🛍️ 나의 주문 내역</h3>
//         {orders.length === 0 ? <p>주문 내역이 없습니다.</p> : (
//           <ul style={{ listStyle: 'none', padding: 0 }}>
//             {orders.map(o => (
//               <li key={o.orderId} style={itemStyle}>
//                 <span>{o.productName} ({o.totalPrice}P)</span>
//                 <div>
//                   <span style={{ color: o.status === 'CANCELLED' ? 'red' : 'green', marginRight: '10px' }}>{o.status}</span>
//                   {o.status !== 'CANCELLED' && (
//                     <button onClick={() => handleCancel(o.orderId)}>취소</button>
//                   )}
//                 </div>
//               </li>
//             ))}
//           </ul>
//         )}
//       </section>

//       {/* 2. 내가 쓴 게시글 섹션 */}
//       <section style={sectionStyle}>
//         <h3>📝 내가 쓴 글 ({myPosts.length})</h3>
//         {myPosts.map(post => (
//           <div key={post.id} style={itemStyle}>
//             <Link to={`/posts/${post.id}`}>{post.title}</Link>
//             <span style={{ fontSize: '0.8rem', color: '#999' }}>{post.createdAt}</span>
//           </div>
//         ))}
//       </section>

//       {/* 3. 내가 쓴 댓글 섹션 */}
//       <section style={sectionStyle}>
//         <h3>💬 작성한 댓글 ({myComments.length})</h3>
//         {myComments.map(comment => (
//           <div key={comment.id} style={itemStyle}>
//             <p style={{ margin: 0 }}>{comment.content}</p>
//             <Link to={`/posts/${comment.postId}`} style={{ fontSize: '0.75rem', color: '#339af0' }}>원문 보기</Link>
//           </div>
//         ))}
//       </section>

//       {/* 4. 좋아요 한 글 섹션 */}
//       <section style={sectionStyle}>
//         <h3>❤️ 좋아요 한 글 ({likedPosts.length})</h3>
//         {likedPosts.map(post => (
//           <div key={post.id} style={itemStyle}>
//             <Link to={`/posts/${post.id}`}>{post.title}</Link>
//           </div>
//         ))}
//       </section>
//     </div>
//   );
// };

// const sectionStyle = { marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' };
// const itemStyle = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed #fafafa' };

export default MyPage;