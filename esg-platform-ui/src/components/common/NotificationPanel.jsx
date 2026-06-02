import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';

const NotificationPanel = ({ memberId, onClose, onRead }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth); // 🌟 반응형 감지
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 500;
   // 🌟 반응형 폰트 도우미 함수
  const fSize = (mobile, desktop) => isMobile ? mobile : desktop;

  const fetchData = useCallback(async () => {
    if (!memberId) return;
    try {
      const listRes = await api.get(`/notification`, {
        headers: { 'X-Member-Id': memberId }
      });
      const fetchedData = listRes.data.content || listRes.data;
      setNotifications(Array.isArray(fetchedData) ? fetchedData : []);
      const countRes = await api.get('/notification/count', {
        headers: { 'X-Member-Id': memberId }
      });
      setUnreadCount(countRes.data);
    } catch (err) { console.error("데이터 로드 실패", err); }
  }, [memberId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getRelativeTime = (dateStr) => {
    const diff = new Date() - new Date(dateStr);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getIcon = (n) => {
    switch (n.type) {
      case 'POINT_EARNED': return '💰';
      case 'POINT_USED': return '💸';
      case 'ACTIVITY_PENDING': return '⏳';
      case 'ACTIVITY_APPROVED': return '🌱';
      case 'ACTIVITY_REJECTED': return '❌';
      case 'BADGE_EARNED': return '🎖️';
      case 'COMMENT_RECEIVED': return '💬';
      case 'REPLY_RECEIVED': return '↪️';
      default: return '🔔';
    }
  };

  const handleItemClick = async (n) => {
    const isReadStatus = n.isRead || n.read;
    if (!isReadStatus) {
      try { await api.patch(`/notification/${n.id}/read`); onRead(); } catch (err) { console.error(err); }
    }
    let navigatePath = '/mypage';

    if (['ACTIVITY_PENDING', 'ACTIVITY_APPROVED', 'ACTIVITY_REJECTED', 'POINT_EARNED', 'COMMENT_RECEIVED', 'REPLY_RECEIVED'].includes(n.type)) {
      navigatePath = n.targetId ? `/posts/${n.targetId}` : '/community';
    } else if (['POINT_USED', 'POINT_REFUNDED', 'BADGE_EARNED'].includes(n.type)) { navigatePath = '/mypage'; }

    navigate(navigatePath);
    onClose();
    fetchData();
  };

  const handleReadAll = async () => {
    if (unreadCount === 0) return;
    try { await api.patch(`/notification/read-all`, {}, { headers: { 'X-Member-Id': memberId } }); fetchData(); onRead(); } catch (err) { console.error(err); }
  };

  const groupedNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return {};

    const filteredList = notifications.filter(n => {
      if (filter === 'ALL') return true;
      if (filter === 'POINT') return n.type?.includes('POINT');
      if (filter === 'ACTIVITY') return n.type?.includes('ACTIVITY');
      if (filter === 'COMMENT') return n.type === 'COMMENT_RECEIVED' || n.type === 'REPLY_RECEIVED';
      return true;
    });

    return filteredList.reduce((acc, n) => {
      const date = new Date(n.createdDate).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(n);
      return acc;
    }, {});
  }, [notifications, filter]);

  return (
    <div style={panelContainerStyle}>
      <div style={panelHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: '800', fontSize: fSize('13px', '15px') }}>알림</span>
          {unreadCount > 0 && <span style={countBadgeStyle}>{unreadCount}</span>}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleReadAll} style={textBtnStyle(unreadCount > 0)}>모두 읽음</button>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
      </div>

      <div style={filterTabStyle}>
        {[{ id: 'ALL', l: '전체' }, { id: 'POINT', l: '💰 포인트' }, { id: 'ACTIVITY', l: '🌱 활동' }, { id: 'COMMENT', l: '💬 소통' }].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)} style={filterBtnStyle(filter === t.id)}>{t.l}</button>
        ))}
      </div>

      <div style={listScrollStyle}>
        {Object.keys(groupedNotifications).length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#adb5bd', fontSize: fSize('12px', '14px') }}>알림이 없습니다.</div>
        ) : (
          Object.keys(groupedNotifications).map(date => (
            <div key={date}>
              <div style={dateHeaderStyle}>{date}</div>
              {groupedNotifications[date].map(n => {
                const isRead = n.isRead || n.read;
                return (
                  <div key={n.id} style={itemStyle(isRead)} onClick={() => handleItemClick(n)}>
                    <div style={{ fontSize: fSize('16px', '20px') }}>{getIcon(n)}</div>
                    <div style={contentWrapperStyle}>
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

// --- 스타일 정의 (반응형 폰트 도우미 함수 활용) ---
const panelContainerStyle = { position: 'absolute', right: '0', top: 'calc(100% + 10px)', width: '23rem', maxWidth: '90vw', backgroundColor: '#fff', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)', borderRadius: '0.75rem', overflow: 'hidden', zIndex: 1000 };
const panelHeaderStyle = { padding: '14px 16px', borderBottom: '1px solid #f1f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const countBadgeStyle = { backgroundColor: '#fa5252', color: '#fff', fontSize: '9px', padding: '1px 5px', borderRadius: '10px', fontWeight: 'bold' };
const filterTabStyle = { display: 'flex', gap: '5px', padding: '8px 16px', borderBottom: '1px solid #f1f3f5', backgroundColor: '#fcfcfc', flexWrap: 'wrap' };
const filterBtnStyle = (active) => ({ padding: '4px 10px', borderRadius: '20px', border: 'none', fontSize: window.innerWidth < 500 ? '11px' : '12px', cursor: 'pointer', backgroundColor: active ? '#16A87A' : '#e9ecef', color: active ? '#fff' : '#495057', fontWeight: active ? 'bold' : '500' });

const listScrollStyle = { maxHeight: '60vh', overflowY: 'auto' };
const dateHeaderStyle = { padding: '8px 16px 4px', fontSize: '10px', fontWeight: 'bold', color: '#adb5bd', backgroundColor: '#f8f9fa' };
const itemStyle = (isRead) => ({ padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', backgroundColor: isRead ? '#fff' : '#f0faf5' });
const contentWrapperStyle = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' };
const messageStyle = (isRead) => ({ fontSize: window.innerWidth < 500 ? '10px' : '12px', fontWeight: isRead ? '400' : '600', color: isRead ? '#868e96' : '#212529', lineHeight: '1.3', overflowWrap: 'break-word' });

const timeStyle = { fontSize: '9px', color: '#adb5bd', marginTop: '2px' };
const dotStyle = { width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#16A87A', flexShrink: 0 };
const textBtnStyle = (active) => ({ background: 'none', border: 'none', color: active ? '#16A87A' : '#adb5bd', fontSize: '11px', fontWeight: 'bold' });
const closeBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', color: '#adb5bd', fontSize: '16px' };

export default NotificationPanel;