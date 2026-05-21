import React, { useEffect, useState, useCallback, useRef } from 'react';
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

  // 🌟 무한 스크롤을 위한 상태 추가
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef(null);

  const activityMap = {
    'tumbler': '🥤 텀블러 사용',
    'transport': '🚲 대중교통 이용',
    'recycle': '♻️ 분리배출',
    'fail': '❌ 인증 실패'
  };

  // 🌟 페이지 단위로 데이터를 불러오는 함수 (초기화 or 이어붙이기)
  const fetchPosts = useCallback(async (pageNum = 0, isReset = false, searchKeyword = keyword) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      const url = searchKeyword
        ? `/community/posts/search?keyword=${searchKeyword}&page=${pageNum}&size=10`
        : `/community/posts?page=${pageNum}&size=10`;

      const response = await api.get(url, { headers });
      const newPosts = response.data.content || [];

      setPosts(prev => {
        const merged = isReset ? newPosts : [...prev, ...newPosts];
        return Array.from(new Map(merged.map(post => [post.id, post])).values());
      });

      setHasMore(!response.data.last);
      setPage(pageNum);
    } catch (error) {
      console.error('데이터 조회 실패:', error);
    } finally {
      setIsLoading(false);
    }
  }, [targetCompanyId, keyword, isLoading]);

  useEffect(() => {
    fetchPosts(0, true);
  }, [targetCompanyId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          fetchPosts(page + 1, false); // 다음 페이지 이어붙이기
        }
      },
      { threshold: 0.5 } // 타겟이 50% 이상 보일 때 트리거
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => {
      if (observerRef.current) observer.unobserve(observerRef.current);
    };
  }, [hasMore, isLoading, page, fetchPosts]);

  // 검색 버튼 클릭 시
  const handleSearch = () => {
    fetchPosts(0, true, keyword);
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
      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId ? { ...post, isLiked: liked, likeCount: count } : post
        )
      );
    } catch (err) {
      console.error("좋아요 처리 실패:", err);
    }
  };

  const renderStatusBadge = (post) => {
    if (!user || String(user.memberId) !== String(post.memberId)) return null;

    let badgeText = '';
    let badgeColor = '';
    let badgeBg = '';

    if (post.adminStatus === 'APPROVED') {
      badgeText = '✅ 인증 완료';
      badgeColor = '#339af0';
      badgeBg = '#e7f5ff';
    } else if (post.adminStatus === 'REJECTED') {
      badgeText = '❌ 관리자 반려';
      badgeColor = '#fa5252';
      badgeBg = '#fff5f5';
    } else if (post.adminStatus === 'AUTO_REJECTED') {
      badgeText = '🤖❌ AI 자동 반려';
      badgeColor = '#fa5252';
      badgeBg = '#fff5f5';
    } else if (post.aiStatus === 'PROCESSING') {
      badgeText = '🤖 분석 중';
      badgeColor = '#adb5bd';
      badgeBg = '#f8f9fa';
    } else {
      badgeText = '⏳ 심사 대기';
      badgeColor = '#fd7e14';
      badgeBg = '#fff4e6';
    }

    return (<span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px', color: badgeColor, backgroundColor: badgeBg, border: `1px solid ${badgeColor}50`, marginLeft: '8px' }}>{badgeText}</span>);
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
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="검색어를 입력하세요..."
            />
            <button onClick={handleSearch} style={{ cursor: 'pointer', background: 'none', border: 'none', fontWeight: 'bold', color: '#339af0' }}>검색</button>
          </div>
        </div>
      </div>

      <div className="instagram-feed" style={{ display: 'flex', flexDirection: 'column', gap: '40px', alignItems: 'center' }}>
        {posts.length > 0 ? (
          posts.map((post) => (
            <article key={post.id} className="post-card" style={{
              width: '100%', maxWidth: '600px', backgroundColor: '#fff',
              borderRadius: '12px', border: '1px solid #efefef', overflow: 'hidden'
            }}>
              <div className="post-header" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="user-avatar" style={{
                    width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#339af0',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold'
                  }}>
                    {post.nickname ? post.nickname.substring(0, 1) : '?'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="username" style={{ fontWeight: 'bold', fontSize: '14px' }}>
                      {post.nickname || `Member #${post.memberId}`}
                    </span>
                    {renderStatusBadge(post)}
                  </div>
                </div>
                {String(user?.memberId) === String(post.memberId) && (
                  <span style={activityBadgeStyle}>
                    {activityMap[post.aiResult?.toLowerCase()] || 'ESG 활동'}
                  </span>
                )}
              </div>

              <Link to={`/posts/${post.id}`} className="post-image-link">
                <PostImageSlider imageUrls={post.imageUrls} />
              </Link>

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
          !isLoading && <div style={{ padding: '100px 0', color: '#adb5bd' }}>아직 등록된 활동이 없습니다.</div>
        )}

        {/* 🌟 무한 스크롤 감지 및 로딩 표시 영역 */}
        <div ref={observerRef} style={{ padding: '20px', textAlign: 'center', color: '#339af0', fontWeight: 'bold', fontSize: '14px' }}>
          {isLoading && '게시물을 불러오는 중... 🌱'}
        </div>
      </div>

      {isLoggedIn && <Link to="/write" className="fab-button">+</Link>}
    </div>
  );
};

// 스타일 가이드
const fabStyle = { position: 'fixed', bottom: '30px', right: '30px', width: '60px', height: '60px', backgroundColor: '#339af0', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '35px', textDecoration: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 1000, transition: 'transform 0.2s', cursor: 'pointer' };
const activityBadgeStyle = { backgroundColor: '#ebfbee', color: '#2b8a3e', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #d3f9d8' };

export default PostList;