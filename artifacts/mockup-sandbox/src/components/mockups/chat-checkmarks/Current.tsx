import './_group.css';

function Check({ delivered }: { delivered?: boolean }) {
  return (
    <span className={`chat-checkmarks__check ${delivered ? 'chat-checkmarks__check--delivered' : 'chat-checkmarks__check--muted'}`}>
      ✓
    </span>
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