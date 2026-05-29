import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';

const NotificationPanel = ({ memberId, onClose, onRead }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    if (!memberId) return;
    try {
      const typeParam = filter === 'ALL' ? '' : `?type=${filter}`;
      const listRes = await api.get(`/notification${typeParam}`, {
        headers: { 'X-Member-Id': memberId }
      });
      setNotifications(listRes.data.content || listRes.data);

      const countRes = await api.get('/notification/count', {
        headers: { 'X-Member-Id': memberId }
      });
      setUnreadCount(countRes.data);
    } catch (err) {
      console.error("데이터 로드 실패", err);
    }
  }, [memberId, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 1. 상대 시간 계산 (방금 전, n시간 전 등)
  const getRelativeTime = (dateStr) => {
    const diff = new Date() - new Date(dateStr);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    return new Date(dateStr).toLocaleDateString();
  };

  // 2. 메시지 타입별 아이콘 매핑
  const getIcon = (n) => {
    switch (n.type) {
      case 'POINT_EARNED':
        return '💰';
      case 'POINT_USED':
        return '💸';
      case 'ACTIVITY_PENDING':
        return '⏳';
      case 'ACTIVITY_APPROVED':
        return '🌱';
      case 'ACTIVITY_REJECTED':
        return '❌';
      case 'BADGE_EARNED':
        return '🎖️';
      default:
        return '🔔';
    }
  };

  // 3. 클릭 시 읽음 처리 + 페이지 이동
  const handleItemClick = async (n) => {
    console.log(n.targetId);
    const isReadStatus = n.isRead || n.read;
    if (!isReadStatus) {
      try {
        await api.patch(`/notification/${n.id}/read`);
        onRead();
      } catch (err) { console.error(err); }
    }

    // const isMarketOrPoint = 
    //   n.type?.includes('USE') ||
    //   n.message.includes('사용') || 
    //   n.message.includes('구매') || 
    //   n.message.includes('취소') || 
    //   n.message.includes('환불');

    // // 알림 클릭 시 해당 타겟(게시글 등)으로 이동
    // if (isMarketOrPoint) {
    //   navigate('/mypage'); // 포인트 관련은 마이페이지로
    // } else if (n.targetId) {
    //   navigate(`/posts/${n.targetId}`);
    // } else {
    //   navigate('/mypage');
    // }

    let navigatePath = '/mypage';

    if (n.type === 'ACTIVITY_PENDING' || n.type === 'ACTIVITY_APPROVED' || n.type === 'ACTIVITY_REJECTED' || n.type === 'POINT_EARNED') {
      navigatePath = n.targetId ? `/posts/${n.targetId}` : '/community';
    } else if (n.type === 'POINT_USED' || n.type === 'POINT_REFUNDED') {
      navigatePath = '/mypage';
    } else if (n.type === 'BADGE_EARNED') {
      navigatePath = '/mypage';
    } 
    
    navigate(navigatePath);

    onClose(); // 알림창 닫기
    fetchData(); // 상태 갱신
  };

  // 4. 모두 읽음 처리
  const handleReadAll = async () => {
    if (unreadCount === 0) return;
    try {
      await api.patch(`/notification/read-all`, {}, {
        headers: { 'X-Member-Id': memberId }
      });
      fetchData();
      onRead();
    } catch (err) { console.error(err); }
  };

  // 5. 날짜별 그룹화 로직
  const groupedNotifications = useMemo(() => {
    return notifications.reduce((acc, n) => {
      const date = new Date(n.createdDate).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(n);
      return acc;
    }, {});
  }, [notifications]);

  return (
    <div style={panelContainerStyle}>
      <div style={panelHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: '800', fontSize: '16px' }}>알림</span>
          {unreadCount > 0 && <span style={countBadgeStyle}>{unreadCount}</span>}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleReadAll} style={textBtnStyle(unreadCount > 0)}>모두 읽음</button>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
      </div>

      <div style={filterTabStyle}>
        {[{ id: 'ALL', l: '전체' }, { id: 'POINT', l: '💰 포인트' }, { id: 'ACTIVITY', l: '🌱 활동' }].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)} style={filterBtnStyle(filter === t.id)}>{t.l}</button>
        ))}
      </div>

      <div style={listScrollStyle}>
        {Object.keys(groupedNotifications).length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#adb5bd' }}>알림이 없습니다.</div>
        ) : (
          Object.keys(groupedNotifications).map(date => (
            <div key={date}>
              <div style={dateHeaderStyle}>{date}</div>
              {groupedNotifications[date].map(n => {
                const isRead = n.isRead || n.read;
                return (
                  <div key={n.id} style={itemStyle(isRead)} onClick={() => handleItemClick(n)}>
                    <div style={{ fontSize: '20px' }}>{getIcon(n)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={messageStyle(isRead)}>{n.message}</div>
                      <div style={timeStyle}>{getRelativeTime(n.createdDate)}</div>
                    </div>
                    {!isRead && <div style={dotStyle}></div>}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- 스타일 정의 ---
const panelContainerStyle = { position: 'absolute', top: '60px', right: '0', width: '500px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 12px 40px rgba(0,0,0,0.12)', zIndex: 1000, border: '1px solid #f1f3f5', overflow: 'hidden' };
const panelHeaderStyle = { padding: '18px 20px', borderBottom: '1px solid #f1f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const countBadgeStyle = { backgroundColor: '#fa5252', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' };
const filterTabStyle = { display: 'flex', gap: '8px', padding: '12px 20px', borderBottom: '1px solid #f1f3f5', backgroundColor: '#fcfcfc' };
const filterBtnStyle = (active) => ({ padding: '6px 12px', borderRadius: '20px', border: 'none', fontSize: '12px', cursor: 'pointer', backgroundColor: active ? '#339af0' : '#e9ecef', color: active ? '#fff' : '#495057', fontWeight: active ? 'bold' : '500' });
const listScrollStyle = { maxHeight: '420px', overflowY: 'auto' };
const dateHeaderStyle = { padding: '12px 20px 6px', fontSize: '11px', fontWeight: 'bold', color: '#adb5bd', backgroundColor: '#f8f9fa' };
const itemStyle = (isRead) => ({ padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid #f8f9fa', backgroundColor: isRead ? '#fff' : '#f8fcff' });
const messageStyle = (isRead) => ({ fontSize: '14px', fontWeight: isRead ? '400' : '600', color: isRead ? '#868e96' : '#212529', lineHeight: '1.4' });
const timeStyle = { fontSize: '11px', color: '#adb5bd', marginTop: '4px' };
const dotStyle = { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#339af0' };
const textBtnStyle = (active) => ({ background: 'none', border: 'none', color: active ? '#339af0' : '#adb5bd', fontSize: '12px', fontWeight: 'bold', cursor: active ? 'pointer' : 'default' });
const closeBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', color: '#adb5bd', fontSize: '18px' };

export default NotificationPanel;