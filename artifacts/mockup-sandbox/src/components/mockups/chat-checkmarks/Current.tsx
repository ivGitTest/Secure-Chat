import './_group.css';

// Точное отражение текущей реализации:
// Ionicons checkmark-sharp, size=18
// Отправлено: rgba(255,255,255,0.85) — белая на голубом
// Доставлено: #059669 — зелёная
function Check({ delivered }: { delivered?: boolean }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 512 512"
      fill={delivered ? '#059669' : 'rgba(255,255,255,0.85)'}
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      {/* Ionicons checkmark-sharp path */}
      <path d="M480 128L198.4 428l-2.4 2.4L64 288" stroke={delivered ? '#059669' : 'rgba(255,255,255,0.85)'} strokeWidth="60" strokeLinecap="square" strokeLinejoin="miter" fill="none"/>
    </svg>
  );
}

export function Current() {
  return (
    <div className="chat-checkmarks">
      <div className="chat-checkmarks__phone">
        <header className="chat-checkmarks__header">
          <span className="chat-checkmarks__back">‹</span>
          <span className="chat-checkmarks__avatar">А</span>
          <div className="chat-checkmarks__person">
            <strong className="chat-checkmarks__name">Алексей</strong>
            <span className="chat-checkmarks__status">в сети</span>
          </div>
        </header>
        <main className="chat-checkmarks__messages">
          <div className="chat-checkmarks__row chat-checkmarks__row--incoming">
            <div className="chat-checkmarks__bubble chat-checkmarks__bubble--incoming">
              Привет! Как дела?
              <div className="chat-checkmarks__footer">18:42</div>
            </div>
          </div>
          <div className="chat-checkmarks__row chat-checkmarks__row--outgoing">
            <div className="chat-checkmarks__bubble chat-checkmarks__bubble--outgoing">
              Всё хорошо, спасибо!
              <div className="chat-checkmarks__footer">
                18:43
                <Check />
              </div>
            </div>
          </div>
          <div className="chat-checkmarks__row chat-checkmarks__row--outgoing">
            <div className="chat-checkmarks__bubble chat-checkmarks__bubble--outgoing">
              Уже выезжаю
              <div className="chat-checkmarks__footer">
                18:44
                <Check delivered />
              </div>
            </div>
          </div>
        </main>
        <div className="chat-checkmarks__legend">
          <span className="chat-checkmarks__legend-item"><Check /> Отправлено</span>
          <span className="chat-checkmarks__legend-item"><Check delivered /> Доставлено</span>
        </div>
      </div>
    </div>
  );
}
