import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/api';
import '../../styles/Feed.css';
import PostImageSlider from '../../components/community/PostImageSlider';

const PostList = () => {
  const [posts, setPosts] = useState([]);
  const { isLoggedIn } = useAuth();
  const [keyword, setKeyword] = useState('');
  const navigate = useNavigate();

  const activityMap = {
    'tumbler': '🥤 텀블러 사용',
    'transport': '🚲 대중교통 이용',
    'recycle': '♻️ 분리배출',
    'fail': '❌ 인증 실패'
  };

  const fetchPosts = async () => {
    try {
      const response = await api.get('/community/posts');
      setPosts(response.data.content);
    } catch (error) {
      console.error('데이터 조회 실패:', error.response?.status, error.message);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleSearch = async () => {
    try {
      const res = await api.get(`/community/posts/search?keyword=${keyword}`);
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
    <div className="feed-wrapper">
      <div className="feed-header">
        <h2>ESG Community</h2>
        <div className="search-box">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="검색..."
          />
          <button onClick={handleSearch}>검색</button>
        </div>
        {isLoggedIn && (
          <Link to="/write" className="write-btn">게시물 올리기</Link>
        )}
      </div>

      {/* 피드 리스트 */}
      <div className="instagram-feed">
        {posts.map((post) => (
          <article key={post.id} className="post-card">
            {/* 카드 상단: 유저 정보 */}
            <div className="post-header">
              <div className="user-info">
                <div className="user-avatar">{post.memberId.toString().substring(0, 1)}</div>
                <span className="username">Member #{post.memberId}</span>
              </div>
              <span className="activity-tag">{activityMap[post.aiResult?.toLowerCase()] || 'ESG 활동'}</span>
            </div>

            <Link to={`/posts/${post.id}`} className="post-image-link">
              <PostImageSlider imageUrls={post.imageUrls} />
                {/* {post.imageUrls && post.imageUrls.length > 0 ? (
                  <img src={post.imageUrls[0]} alt="Post" className="post-image" />
                ) : (
                  <div className="no-image-placeholder">No Image</div>
                )}
                {post.imageUrls?.length > 1 && (
                  <span className="image-count-badge">1/{post.imageUrls.length}</span>
                )} */}
            </Link>

            <div className="post-text">
              <span className="post-title">{post.title}</span>
              <p className="post-description">{post.content}</p>
            </div>

            {/* 카드 하단: 본문 및 상태 */}
            <div className="post-content">
              <div className="post-actions">
                <div className="like-group">
                  <button className={`action-btn like-btn ${post.isLiked ? 'active' : ''}`}
                    onClick={() => handleLike(post.id)}>{post.isLiked ? '❤️' : '🤍'}
                  </button>
                  <span className="like-count-text">
                    {post.likeCount > 0 ? post.likeCount : 0}
                  </span>
                </div>
                <button className="action-btn" onClick={() => navigate(`/posts/${post.id}`)}>
                  💬 <span className="comment-count-text">{post.commentCount || 0}</span>
                </button>
              </div>
              <div className="post-comments-link">
                <Link to={`/posts/${post.id}`}>
                  {post.commentCount > 0 ? `댓글 ${post.commentCount}개 모두 보기` : '댓글 달기...'}
                </Link>
              </div>
              <div className="post-meta">

                <span className="post-date">{new Date(post.createdDate).toLocaleDateString()}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default PostList;