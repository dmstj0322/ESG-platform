import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/api';
import '../../styles/Feed.css';
import PostImageSlider from '../../components/community/PostImageSlider';

const PostList = () => {
  const [posts, setPosts] = useState([]);
  const { isLoggedIn, user } = useAuth();
  const [keyword, setKeyword] = useState('');
  const navigate = useNavigate();

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const targetCompanyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  const activityMap = {
    'tumbler': '🥤 텀블러 사용',
    'transport': '🚲 대중교통 이용',
    'recycle': '♻️ 분리배출',
    'fail': '❌ 인증 실패'
  };

  const fetchPosts = useCallback(async () => {
    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      const response = await api.get('/community/posts', { headers });
      setPosts(response.data.content);
    } catch (error) {
      console.error('데이터 조회 실패:', error.response?.status, error.message);
    }
  }, [targetCompanyId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleSearch = async () => {
    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      const res = await api.get(`/community/posts/search?keyword=${keyword}`, { headers });
      setPosts(res.data.content);
    } catch (err) {
      console.error("검색 실패:", err);
    }
  };

  const handleLike = async (postId) => {
    if (!isLoggedIn) {
      alert("로그인이 필요한 서비스입니다.");
      navigate('/login');
      return;
    }

    try {
      const res = await api.post(`/community/posts/${postId}/likes`);
      const { liked, count } = res.data;
      console.log(res.data);
      // 특정 포스트의 좋아요 상태만 업데이트
      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId ? { ...post, isLiked: liked, likeCount: count } : post
        )
      );
    } catch (err) {
      console.error("좋아요 처리 실패:", err);
    }
  };

  return (
    <div className="feed-wrapper" style={{ textAlign: 'left' }}>
      <div className="feed-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>🌱 ESG Community</h2>
          {isSystemAdmin && (
            <span style={{ fontSize: '12px', color: '#339af0', fontWeight: 'bold' }}>● 시스템 관리자 모드 (전체 기업 노출)</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="search-box" style={{ display: 'flex', gap: '5px' }}>
            <input
              type="text"
              style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="검색어 입력..."
            />
            <button onClick={handleSearch} style={{ cursor: 'pointer', background: 'none', border: 'none', fontWeight: 'bold' }}>검색</button>
          </div>
          {/* {isLoggedIn && (
            <Link to="/write" className="write-btn" style={{
              textDecoration: 'none', backgroundColor: '#2b8a3e', color: '#fff',
              padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px'
            }}>
              글쓰기
            </Link>
          )} */}
          {isLoggedIn && (
            <Link to="/write" style={fabStyle} title="새 글 작성">
              +
            </Link>
          )}
        </div>
      </div>

      {/* 피드 리스트 */}
      <div className="instagram-feed" style={{ display: 'flex', flexDirection: 'column', gap: '40px', alignItems: 'center' }}>
        {posts.length > 0 ? (
          posts.map((post) => (
            <article key={post.id} className="post-card" style={{
              width: '100%', maxWidth: '600px', backgroundColor: '#fff',
              borderRadius: '12px', border: '1px solid #efefef', overflow: 'hidden'
            }}>

              {/* 카드 상단: 유저 정보 (왼쪽 정렬) */}
              <div className="post-header" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="user-avatar" style={{
                    width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#339af0',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold'
                  }}>
                    {post.nickname ? post.nickname.substring(0, 1) : '?'}
                  </div>
                  <span className="username" style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    {post.nickname || `Member #${post.memberId}`}
                  </span>
                </div>
                {/* <span className="activity-tag" style={{ fontSize: '12px', backgroundColor: '#f1f3f5', padding: '4px 10px', borderRadius: '15px', color: '#495057' }}> */}
                <span style={activityBadgeStyle}>
                  {activityMap[post.aiResult?.toLowerCase()] || 'ESG 활동'}
                </span>
              </div>

              {/* 이미지 슬라이더 */}
              <Link to={`/posts/${post.id}`} className="post-image-link">
                <PostImageSlider imageUrls={post.imageUrls} />
              </Link>

              {/* 카드 하단: 본문 (왼쪽 정렬) */}
              <div className="post-content" style={{ padding: '16px', textAlign: 'left' }}>
                <div className="post-actions" style={{ display: 'flex', gap: '15px', marginBottom: '12px' }}>
                  <div className="like-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }}
                      onClick={() => handleLike(post.id)}
                    >
                      {post.isLiked ? '❤️' : '🤍'}
                    </button>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{post.likeCount || 0}</span>
                  </div>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }}
                    onClick={() => navigate(`/posts/${post.id}`)}
                  >
                    💬 <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{post.commentCount || 0}</span>
                  </button>
                </div>

                <div className="post-text">
                  <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '15px' }}>{post.title}</div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#444', lineHeight: '1.4' }}>{post.content}</p>
                </div>

                <div className="post-meta" style={{ marginTop: '12px' }}>
                  <Link to={`/posts/${post.id}`} style={{ textDecoration: 'none', color: '#8e8e8e', fontSize: '13px' }}>
                    {post.commentCount > 0 ? `댓글 ${post.commentCount}개 모두 보기` : '댓글 달기...'}
                  </Link>
                  <div style={{ color: '#8e8e8e', fontSize: '10px', marginTop: '8px', textTransform: 'uppercase' }}>
                    {new Date(post.createdDate).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div style={{ padding: '100px 0', color: '#adb5bd' }}>아직 등록된 활동이 없습니다.</div>
        )}
      </div>
    </div>
  );
};

const fabStyle = {
  position: 'fixed',
  bottom: '30px',
  right: '30px',
  width: '60px',
  height: '60px',
  backgroundColor: '#339af0', // 유저님의 브랜드 컬러 (블루)
  color: 'white',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '35px',
  textDecoration: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  zIndex: 1000,
  transition: 'transform 0.2s',
  cursor: 'pointer'
};

const activityBadgeStyle = {
  backgroundColor: '#ebfbee', // 아주 연한 녹색 (배경)
  color: '#2b8a3e',           // 진한 녹색 (글자)
  padding: '4px 12px',
  borderRadius: '20px',       // 알약 모양
  fontSize: '12px',
  fontWeight: 'bold',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: '1px solid #d3f9d8' // 미세한 테두리 추가로 선명도 향상
};

//   return (
//     <div className="feed-wrapper">
//       <div className="feed-header">
//         <h2>ESG Community</h2>
//         <div className="search-box">
//           <input
//             type="text"
//             value={keyword}
//             onChange={(e) => setKeyword(e.target.value)}
//             placeholder="검색..."
//           />
//           <button onClick={handleSearch}>검색</button>
//         </div>
//         {isLoggedIn && (
//           <Link to="/write" className="write-btn">게시물 올리기</Link>
//         )}
//       </div>

//       {/* 피드 리스트 */}
//       <div className="instagram-feed">
//         {posts.map((post) => (
//           <article key={post.id} className="post-card">
//             {/* 카드 상단: 유저 정보 */}
//             <div className="post-header">
//               <div className="user-info">
//                 <div className="user-avatar">{post.nickname ? post.nickname.substring(0, 1) : '?'}</div>
//                 {/* <span className="username">Member #{post.memberId}</span> */}
//                 <div className="user-text-info">
//                   {/* 닉네임 표시 (없으면 아이디 표시) */}
//                   <span className="username">{post.nickname || `Member #${post.memberId}`}</span>
//                   {/* B2B 성격을 강조하고 싶다면 회사 정보를 추가하세요 */}
//                   {/* <span className="user-company">{post.companyName}</span> */}
//                 </div>
//               </div>
//               <span className="activity-tag">{activityMap[post.aiResult?.toLowerCase()] || 'ESG 활동'}</span>
//             </div>

//             <Link to={`/posts/${post.id}`} className="post-image-link">
//               <PostImageSlider imageUrls={post.imageUrls} />
//               {/* {post.imageUrls && post.imageUrls.length > 0 ? (
//                   <img src={post.imageUrls[0]} alt="Post" className="post-image" />
//                 ) : (
//                   <div className="no-image-placeholder">No Image</div>
//                 )}
//                 {post.imageUrls?.length > 1 && (
//                   <span className="image-count-badge">1/{post.imageUrls.length}</span>
//                 )} */}
//             </Link>

//             <div className="post-text">
//               <span className="post-title">{post.title}</span>
//               <p className="post-description">{post.content}</p>
//             </div>

//             {/* 카드 하단: 본문 및 상태 */}
//             <div className="post-content">
//               <div className="post-actions">
//                 <div className="like-group">
//                   <button className={`action-btn like-btn ${post.isLiked ? 'active' : ''}`}
//                     onClick={() => handleLike(post.id)}>{post.isLiked ? '❤️' : '🤍'}
//                   </button>
//                   <span className="like-count-text">
//                     {post.likeCount > 0 ? post.likeCount : 0}
//                   </span>
//                 </div>
//                 <button className="action-btn" onClick={() => navigate(`/posts/${post.id}`)}>
//                   💬 <span className="comment-count-text">{post.commentCount || 0}</span>
//                 </button>
//               </div>
//               <div className="post-comments-link">
//                 <Link to={`/posts/${post.id}`}>
//                   {post.commentCount > 0 ? `댓글 ${post.commentCount}개 모두 보기` : '댓글 달기...'}
//                 </Link>
//               </div>
//               <div className="post-meta">

//                 <span className="post-date">{new Date(post.createdDate).toLocaleDateString()}</span>
//               </div>
//             </div>
//           </article>
//         ))}
//       </div>
//     </div>
//   );
// };

export default PostList;