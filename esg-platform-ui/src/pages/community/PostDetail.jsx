import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/api';
import CommentSection from '../../components/community/CommentSection';
import { useAuth } from '../../context/AuthContext';

const PostDetails = () => {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const { isLoggedIn } = useAuth();

  const token = localStorage.getItem('accessToken');
  const currentMemberId = localStorage.getItem('memberId');
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const navigate = useNavigate();
  const isMounted = useRef(false);

  useEffect(() => {
    if (isMounted.current) return;
    isMounted.current = true;

    const fetchPost = async () => {
      try {
        const res = await api.get(`/community/posts/${id}`);
        setPost(res.data);

        const likeRes = await api.get(`/community/posts/${id}/likes`);
        setIsLiked(likeRes.data.liked);
        setLikeCount(likeRes.data.count);
      } catch (err) {
        console.error("데이터 로드 실패:", err);
      }
    };
    fetchPost();
  }, [id]);

  const handleDelete = () => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    api.delete(`/community/posts/${id}`)
      .then(() => {
        alert("삭제되었습니다.");
        navigate('/');
      })
      .catch((err) => {
        console.error("삭제 실패:", err);
        alert("삭제 권한이 없거나 오류가 발생했습니다.");
      });
  };

  const handleLike = async () => {
    try {
      const res = await api.post(`/community/posts/${id}/likes`);

      setIsLiked(res.data.liked);
      setLikeCount(res.data.count);
    } catch (err) {
      alert("좋아요 처리에 실패했습니다.");
    }
  };

  if (!post) return <div>로딩중...</div>;
  return (
    <div>
      <h1>{post.title}</h1>
      <p>조회수: {post.viewCount}</p>
      <div className="image-container">
        {post.imageUrls && post.imageUrls.map((url, index) => (
          <img
            key={index}
            src={url}
            alt={`게시글 이미지 ${index + 1}`}
            style={{ width: '100%', maxWidth: '500px', margin: '10px 0' }}
          />
        ))}
      </div>
      <p>{post.content}</p>
      <div>
        <button onClick={handleLike}>
          {isLiked ? '❤️' : '🤍'} 좋아요 ({likeCount})
        </button>
      </div>
      {isLoggedIn && String(post.memberId) === String(currentMemberId) && (
          <div style={{ marginTop: '20px' }}>
          <button onClick={() => navigate(`/edit/${id}`)}>수정하기</button>
          <button onClick={handleDelete} style={{ color: 'red' }}>삭제</button>
        </div>
      )}
      
      <button onClick={() => navigate('/')} style={{ display: 'block', marginTop: '10px' }}>목록으로</button>
      <CommentSection postId={id} currentMemberId={currentMemberId} />
    </div>
  );
};

export default PostDetails;