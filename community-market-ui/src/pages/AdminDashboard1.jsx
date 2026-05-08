import React, { useEffect, useState } from 'react';
import api from '../api';

const AdminDashboard = () => {
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchAllPosts();
  }, []);

  const fetchAllPosts = async () => {
    try {
      const res = await api.get('/admin/posts');
      const sortedData = res.data.sort((a, b) => b.id - a.id);
      setPosts(sortedData);
      console.log(res.data);
    } catch (err) {
      alert("목록을 불러오는데 실패했습니다.");
    }
  };

  const handleApprove = async (postId) => {
    if (!window.confirm("정말 승인하시겠습니까?")) return;
    try {
      await api.post(`/admin/posts/${postId}/approve`);
      alert("승인되었습니다!");
      fetchAllPosts();
    } catch (err) {
      alert("승인 처리 중 오류 발생");
    }
  };

  const handleReject = async (postId) => {
    const reason = prompt("거절 사유를 입력하세요:");
    if (!reason) return;
    try {
      await api.post(`/admin/posts/${postId}/reject`, { reason });
      alert("거절되었습니다.");
      fetchAllPosts();
    } catch (err) {
      alert("거절 처리 중 오류 발생");
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter === 'ALL') return true;
    if (filter === 'AI_SUCCESS') return post.aiResult === 'SUCCESS';
    return post.adminStatus === filter;
  });

  return (
    <div>
      <h2>관리자 대시보드</h2>
      <div style={{ marginBottom: '20px' }}>
        {['ALL', 'WAITING', 'APPROVED', 'REJECTED'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            style={{ marginRight: '10px', backgroundColor: filter === status ? '#ddd' : '#fff' }}
          >
            {status}
          </button>
        ))}
      </div>
      {filteredPosts.length === 0 ? (
        <p>해당 조건의 게시글이 없습니다.</p>
      ) : (
        filteredPosts.map(post => (
          <div key={post.id} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3>{post.title}</h3>
              {post.aiScore >= 0.8 && (
                <span style={{
                  padding: '4px 8px',
                  backgroundColor: '#e6fffa',
                  color: '#2c7a7b',
                  borderRadius: '15px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  border: '1px solid #b2f5ea'
                }}>
                  AI 분석 성공
                </span>
              )}
            </div>
            <p>작성자 ID: {post.memberId}</p>
            <div style={{ display: 'flex', gap: '10px', margin: '10px 0' }}>
              {post.imageUrls && post.imageUrls.map((url, index) => (
                <img key={index} src={url} alt="인증샷" style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '5px' }} />
              ))}
            </div>
            <div style={{ backgroundColor: '#f9f9f9', padding: '5px', marginBottom: '10px' }}>
              <p>AI 예측 활동: <strong>{post.aiResult}</strong></p>
              <p>AI 신뢰도:
                <span style={{ color: post.aiScore < 0.8 ? 'red' : 'blue', fontWeight: 'bold' }}>
                  {(post.aiScore * 100).toFixed(1)}%
                </span>
              </p>
            </div>
            {post.adminStatus === 'WAITING' && (
              <>
                <button onClick={() => handleApprove(post.id)}>승인하기</button>
                <button onClick={() => handleReject(post.id)}>거절하기</button>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
};

export default AdminDashboard;