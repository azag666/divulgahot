import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginMode, setLoginMode] = useState('user');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // --- NAVEGAÇÃO ---
  const [tab, setTab] = useState('dashboard'); 
  
  // --- DADOS DO SISTEMA ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  
  // --- DISPARO & CRM ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState('');
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [useRandom, setUseRandom] = useState(true); // Flag de Aleatoriedade
  const stopCampaignRef = useRef(false);

  // --- GOD MODE (ESPIÃO) ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [filterNumber, setFilterNumber] = useState('');
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const stopHarvestRef = useRef(false);

  // --- FERRAMENTAS ---
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INBOX (NOVO) ---
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        setIsAdmin(payload.isAdmin === true || payload.type === 'admin');
      } catch (e) { setIsAdmin(false); }
    }
    const savedGroups = localStorage.getItem('godModeGroups');
    const savedChannels = localStorage.getItem('godModeChannels');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
    if (savedChannels) setAllChannels(JSON.parse(savedChannels));
  }, []);

  useEffect(() => {
    if (isAuthenticated && authToken) fetchData();
  }, [isAuthenticated, authToken]);

  const authenticatedFetch = async (url, options = {}) => {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, ...options.headers };
    return fetch(url, { ...options, headers });
  };

  const fetchData = async () => {
    try {
      const sRes = await authenticatedFetch('/api/list-sessions');
      const sData = await sRes.json();
      setSessions(prev => {
          const newSessions = sData.sessions || [];
          return newSessions.map(ns => {
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      const stRes = await authenticatedFetch('/api/stats');
      if (stRes.ok) setStats(await stRes.json());
      const hRes = await authenticatedFetch('/api/get-harvested');
      const hData = await hRes.json();
      if(hData.harvestedIds) setHarvestedIds(new Set(hData.harvestedIds));
    } catch (error) { console.error(error); }
  };

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  // --- LOGIN HANDLERS ---
  const handleUserLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: usernameInput, password: passwordInput }) });
      const data = await res.json();
      if(data.success) { setAuthToken(data.token); setIsAdmin(false); setIsAuthenticated(true); localStorage.setItem('authToken', data.token); } 
      else alert(data.error);
    } catch (e) { alert('Erro conexão'); }
  };
  const handleAdminTokenLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password: adminTokenInput }) });
      const data = await res.json();
      if(data.success) { setAuthToken(data.token); setIsAdmin(true); setIsAuthenticated(true); localStorage.setItem('authToken', data.token); } 
      else alert(data.error);
    } catch (e) { alert('Erro conexão'); }
  };
  const handleLogout = () => { setIsAuthenticated(false); setAuthToken(''); localStorage.removeItem('authToken'); };

  // --- GESTÃO SESSÕES ---
  const checkAllStatus = async () => {
      setCheckingStatus(true);
      addLog('🔍 Checando status em lotes...');
      // Faz em lotes de 5 para não travar
      const chunk = 5;
      const all = [...sessions];
      for (let i = 0; i < all.length; i += chunk) {
          await Promise.all(all.slice(i, i + chunk).map(async (s) => {
              try {
                  const res = await authenticatedFetch('/api/check-status', { method: 'POST', body: JSON.stringify({ phone: s.phone_number }) });
                  const data = await res.json();
                  s.is_active = (data.status === 'alive');
              } catch(e){}
          }));
          setSessions([...all]); // Atualiza UI progressivamente
      }
      setCheckingStatus(false);
      addLog('✅ Status verificado.');
  };
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    newSet.has(phone) ? newSet.delete(phone) : newSet.add(phone);
    setSelectedPhones(newSet);
  };
  const selectAllActive = () => {
      const newSet = new Set();
      sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
      setSelectedPhones(newSet);
      addLog(`✅ ${newSet.size} contas online selecionadas.`);
  };

  // ==============================================================================
  // MOTOR DE DISPARO OTIMIZADO (SEM TRAVAR LOGS)
  // ==============================================================================
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     setProcessing(true);
     stopCampaignRef.current = false;
     setProgress(0);
     
     // Configuração Otimizada para Navegador
     const MAX_CONCURRENT = 6; // Máximo que navegadores aguentam bem por domínio
     const BATCH_SIZE = Math.min(selectedPhones.size * 2, 50); // Ajusta carga dinâmica
     
     addLog(`🚀 Iniciando Motor (Random: ${useRandom ? 'ON' : 'OFF'})...`);
     
     let senders = Array.from(selectedPhones);
     let totalSent = 0;

     try {
         while (!stopCampaignRef.current) {
             // 1. Busca Leads
             const res = await authenticatedFetch(`/api/get-campaign-leads?limit=${BATCH_SIZE}&random=${useRandom}`);
             const data = await res.json();
             const leads = data.leads || [];

             if (leads.length === 0) {
                 addLog('✅ Sem mais leads pendentes.');
                 break;
             }

             // 2. Processa com limite de concorrência (Janela Deslizante)
             // Isso impede que o React trave e os logs não apareçam
             for (let i = 0; i < leads.length; i += MAX_CONCURRENT) {
                 if (stopCampaignRef.current) break;
                 
                 const chunk = leads.slice(i, i + MAX_CONCURRENT);
                 // Embaralha remetentes a cada micro-lote
                 senders.sort(() => Math.random() - 0.5);

                 await Promise.all(chunk.map(async (lead, idx) => {
                     const sender = senders[idx % senders.length];
                     try {
                         const dRes = await authenticatedFetch('/api/dispatch', {
                             method: 'POST',
                             body: JSON.stringify({
                                 senderPhone: sender,
                                 target: lead.user_id,
                                 username: lead.username,
                                 originChatId: lead.chat_id,
                                 message: msg,
                                 imageUrl: imgUrl,
                                 leadDbId: lead.id
                             })
                         });
                         const d = await dRes.json();
                         if(dRes.status === 429) addLog(`⏳ Flood em ${sender}`);
                         else if(d.success) addLog(`✅ Enviado de ${sender} -> ${lead.username || lead.user_id}`);
                     } catch(e) { /* fail silent */ }
                 }));
                 
                 totalSent += chunk.length;
                 // Pequeno delay para respirar a thread do navegador
                 await new Promise(r => setTimeout(r, 800));
             }
         }
         fetchData();
     } catch (e) { addLog(`⛔ Erro: ${e.message}`); }
     setProcessing(false);
  };

  // ==============================================================================
  // INBOX OTIMIZADO (CARREGAMENTO EM BLOCOS)
  // ==============================================================================
  const loadInbox = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      addLog(`📩 Baixando mensagens de ${phones.length} contas (Lote de 3)...`);

      let allReplies = [];
      const CHUNK_SIZE = 3; // Baixo para garantir velocidade e feedback visual

      for (let i = 0; i < phones.length; i += CHUNK_SIZE) {
          const batch = phones.slice(i, i + CHUNK_SIZE);
          
          const results = await Promise.all(batch.map(p => 
              authenticatedFetch('/api/spy/check-replies', { method: 'POST', body: JSON.stringify({ phone: p }) })
              .then(r => r.json())
              .catch(() => ({ replies: [] }))
          ));

          results.forEach(r => {
              if (r.replies && r.replies.length > 0) {
                  allReplies = [...allReplies, ...r.replies];
              }
          });
          
          // Ordena e atualiza a cada lote para o usuário ver chegando
          setReplies(allReplies.sort((a,b) => b.timestamp - a.timestamp));
      }
      
      setLoadingReplies(false);
      if(allReplies.length > 0) addLog(`📬 ${allReplies.length} mensagens encontradas.`);
      else addLog('📭 Nenhuma mensagem nova.');
  };

  const openChat = async (reply) => {
      setSelectedChat(reply);
      setLoadingHistory(true);
      setChatHistory([]);
      try {
          const res = await authenticatedFetch('/api/spy/get-history', { 
              method: 'POST', 
              body: JSON.stringify({ phone: reply.fromPhone, chatId: reply.chatId }) 
          });
          const data = await res.json();
          setChatHistory(data.history || []);
      } catch (e) { alert('Erro ao carregar chat'); }
      setLoadingHistory(false);
  };

  // ==============================================================================
  // RESTAURAÇÃO: SPY & TOOLS
  // ==============================================================================
  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta.");
      setIsScanning(true);
      addLog('📡 Escaneando grupos...');
      let groups = [], channels = [];
      
      for(const s of sessions) {
          try {
              const res = await authenticatedFetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone: s.phone_number }) });
              const data = await res.json();
              if(data.chats) {
                  data.chats.forEach(c => {
                      const obj = { ...c, ownerPhone: s.phone_number };
                      c.type.includes('Canal') ? channels.push(obj) : groups.push(obj);
                  });
              }
          } catch(e){}
      }
      // Filtra duplicados e salva
      const uGroups = [...new Map(groups.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);
      const uChannels = [...new Map(channels.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);
      
      setAllGroups(uGroups);
      setAllChannels(uChannels);
      localStorage.setItem('godModeGroups', JSON.stringify(uGroups));
      localStorage.setItem('godModeChannels', JSON.stringify(uChannels));
      setIsScanning(false);
      addLog(`📡 Scan OK: ${uGroups.length} grupos.`);
  };

  const startMassHarvest = async () => {
      const targets = [...allGroups, ...allChannels].filter(c => !harvestedIds.has(c.id));
      if (targets.length === 0) return alert("Nada novo para colher.");
      if (!confirm(`Aspirar ${targets.length} grupos?`)) return;

      setIsHarvestingAll(true);
      stopHarvestRef.current = false;
      addLog('🕷️ Aspirando...');

      for (let i = 0; i < targets.length; i++) {
          if (stopHarvestRef.current) break;
          const t = targets[i];
          try {
              const res = await authenticatedFetch('/api/spy/harvest', { 
                  method: 'POST', 
                  body: JSON.stringify({ phone: t.ownerPhone, chatId: t.id, chatName: t.title, isChannel: t.type.includes('Canal') })
              });
              const d = await res.json();
              if(d.success) {
                  addLog(`✅ +${d.count} leads de ${t.title}`);
                  setHarvestedIds(prev => new Set(prev).add(t.id));
              }
          } catch(e){}
          await new Promise(r => setTimeout(r, 2000));
      }
      setIsHarvestingAll(false);
      fetchData();
  };

  const handleMassUpdateProfile = async () => {
    if (selectedPhones.size === 0) return alert('Selecione contas!');
    setProcessing(true);
    addLog('🎭 Atualizando perfis...');
    for (const phone of Array.from(selectedPhones)) {
        await authenticatedFetch('/api/update-profile', { method: 'POST', body: JSON.stringify({ phone, newName, photoUrl }) });
        addLog(`🎭 Atualizado: ${phone}`);
    }
    setProcessing(false); 
  };

  const handleMassPostStory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      addLog('📸 Postando stories...');
      for (const phone of Array.from(selectedPhones)) {
          await authenticatedFetch('/api/post-story', { method: 'POST', body: JSON.stringify({ phone, mediaUrl: storyUrl, caption: storyCaption }) });
          addLog(`📸 Story: ${phone}`);
      }
      setProcessing(false); 
  };

  // --- RENDER ---
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'20px'}}>
          <div style={{display:'flex', gap:'10px'}}>
              <button onClick={()=>setLoginMode('user')} style={{padding:'10px 20px', background:loginMode==='user'?'#3390ec':'transparent', color:'white', border:'1px solid #3390ec', borderRadius:'6px'}}>Usuário</button>
              <button onClick={()=>setLoginMode('admin')} style={{padding:'10px 20px', background:loginMode==='admin'?'#8957e5':'transparent', color:'white', border:'1px solid #8957e5', borderRadius:'6px'}}>Admin</button>
          </div>
          {loginMode==='user' ? 
            <form onSubmit={handleUserLogin} style={{background:'#1c242f', padding:'40px', borderRadius:'15px', border:'1px solid #3390ec'}}>
                <input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} placeholder="User" style={{display:'block', marginBottom:'10px', padding:'10px', width:'200px'}}/>
                <input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Pass" style={{display:'block', marginBottom:'10px', padding:'10px', width:'200px'}}/>
                <button type="submit" style={{width:'100%', padding:'10px', background:'#3390ec', color:'white', border:'none', borderRadius:'5px'}}>Entrar</button>
            </form>
          :
            <form onSubmit={handleAdminTokenLogin} style={{background:'#1c242f', padding:'40px', borderRadius:'15px', border:'1px solid #8957e5'}}>
                <input type="password" value={adminTokenInput} onChange={e=>setAdminTokenInput(e.target.value)} placeholder="Token" style={{display:'block', marginBottom:'10px', padding:'10px', width:'200px'}}/>
                <button type="submit" style={{width:'100%', padding:'10px', background:'#8957e5', color:'white', border:'none', borderRadius:'5px'}}>Acessar</button>
            </form>
          }
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: '-apple-system, sans-serif' }}>
        
        {/* MENU */}
        <div style={{marginBottom:'25px', display:'flex', gap:'10px', borderBottom:'1px solid #30363d', paddingBottom:'15px', alignItems:'center'}}>
            <h2 style={{margin:0, marginRight:'20px', color:'white'}}>HOTTRACK <span style={{fontSize:'12px', color:'#3390ec'}}>V9</span></h2>
            <button onClick={()=>setTab('dashboard')} style={{padding:'10px 20px', background: tab==='dashboard'?'#238636':'transparent', color:'white', border:'1px solid #238636', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>🚀 DISPARO</button>
            <button onClick={()=>setTab('inbox')} style={{padding:'10px 20px', background: tab==='inbox'?'#e3b341':'transparent', color:'white', border:'1px solid #e3b341', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>📬 INBOX ({replies.length})</button>
            <button onClick={()=>setTab('spy')} style={{padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', color:'white', border:'1px solid #8957e5', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>👁️ SPY</button>
            <button onClick={()=>setTab('tools')} style={{padding:'10px 20px', background: tab==='tools'?'#1f6feb':'transparent', color:'white', border:'1px solid #1f6feb', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>🛠️ TOOLS</button>
            <button onClick={handleLogout} style={{marginLeft:'auto', padding:'8px 15px', background:'#f85149', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>SAIR</button>
        </div>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
             <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:'25px'}}>
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                    <div style={{display:'flex', gap:'20px', marginBottom:'25px'}}>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #d29922', padding:'20px', textAlign:'center', borderRadius:'10px'}}>
                            <h2 style={{margin:0, color:'#d29922'}}>{stats.pending?.toLocaleString()}</h2><small>PENDENTES</small>
                        </div>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #238636', padding:'20px', textAlign:'center', borderRadius:'10px'}}>
                            <h2 style={{margin:0, color:'#238636'}}>{stats.sent?.toLocaleString()}</h2><small>ENVIADOS</small>
                        </div>
                    </div>
                    
                    <h3 style={{color:'#3390ec'}}>Configurar Campanha</h3>
                    <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                        <input type="text" placeholder="URL Imagem (Opcional)" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{flex:1, padding:'14px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px'}} />
                        <label style={{display:'flex', alignItems:'center', background:'#0d1117', padding:'0 15px', borderRadius:'8px', border:'1px solid #30363d', cursor:'pointer'}}>
                            <input type="checkbox" checked={useRandom} onChange={e=>setUseRandom(e.target.checked)} style={{marginRight:'8px'}}/> Aleatório
                        </label>
                    </div>
                    
                    <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Mensagem..." style={{width:'100%', height:'120px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'14px', borderRadius:'8px', marginBottom:'20px'}}/>
                    
                    <div style={{display:'flex', gap:'15px', marginBottom:'20px'}}>
                        {!processing ? (
                            <button onClick={startRealCampaign} style={{flex:1, padding:'20px', background:'#238636', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer'}}>INICIAR (MOTOR V9)</button>
                        ) : (
                            <button onClick={()=>stopCampaignRef.current=true} style={{flex:1, padding:'20px', background:'#f85149', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer'}}>PARAR</button>
                        )}
                    </div>
                    
                    <div style={{height:'200px', overflowY:'auto', background:'#000', padding:'15px', fontSize:'12px', borderRadius:'8px', border:'1px solid #30363d', color:'#00ff00', fontFamily:'monospace'}}>
                        {logs.map((l,i)=><div key={i}>{l}</div>)}
                    </div>
                </div>

                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}>
                        <h3 style={{margin:0}}>Contas ({sessions.length})</h3>
                        <button onClick={checkAllStatus} style={{background:'#1f6feb', color:'white', border:'none', borderRadius:'6px', padding:'5px 10px', cursor:'pointer'}}>Check</button>
                    </div>
                    <button onClick={selectAllActive} style={{width:'100%', padding:'10px', background:'#30363d', color:'white', border:'none', borderRadius:'6px', marginBottom:'10px', cursor:'pointer'}}>Selecionar Online</button>
                    <div style={{flex:1, maxHeight:'500px', overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={()=>toggleSelect(s.phone_number)} style={{padding:'10px', marginBottom:'5px', borderRadius:'6px', display:'flex', alignItems:'center', gap:'10px', background: selectedPhones.has(s.phone_number) ? '#1f293a' : 'transparent', cursor:'pointer'}}>
                                <div style={{width:'10px', height:'10px', borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149'}}></div>
                                <div>{s.phone_number}</div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

        {/* INBOX */}
        {tab === 'inbox' && (
            <div style={{display:'grid', gridTemplateColumns:'350px 1fr', height:'calc(100vh - 120px)', border:'1px solid #30363d', borderRadius:'12px', overflow:'hidden', background:'#161b22'}}>
                <div style={{borderRight:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{padding:'15px', borderBottom:'1px solid #30363d'}}>
                        <button onClick={loadInbox} disabled={loadingReplies} style={{width:'100%', padding:'12px', background:'#e3b341', color:'black', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>
                            {loadingReplies ? 'Baixando...' : '🔄 Atualizar Inbox'}
                        </button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {replies.map((r,i) => (
                            <div key={i} onClick={()=>openChat(r)} style={{padding:'15px', borderBottom:'1px solid #21262d', cursor:'pointer', background: selectedChat?.chatId===r.chatId ? '#21262d' : 'transparent'}}>
                                <div style={{fontWeight:'bold', color:'white', display:'flex', justifyContent:'space-between'}}>
                                    <span>{r.name}</span>
                                    <span style={{fontSize:'10px', color:'#8b949e'}}>{r.date}</span>
                                </div>
                                <div style={{fontSize:'12px', color:'#8b949e', marginTop:'5px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.lastMessage}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', background:'#0d1117'}}>
                    {selectedChat ? (
                        <>
                            <div style={{padding:'15px', background:'#161b22', borderBottom:'1px solid #30363d', color:'white', fontWeight:'bold'}}>{selectedChat.name} <small>({selectedChat.fromPhone})</small></div>
                            <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'15px'}}>
                                {loadingHistory && <div style={{textAlign:'center', color:'#3390ec'}}>Carregando...</div>}
                                {chatHistory.map((m,i) => (
                                    <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#238636' : '#21262d', padding:'10px', borderRadius:'10px', maxWidth:'70%', color:'white'}}>
                                        {m.media && m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'8px', marginBottom:'5px'}}/>}
                                        {m.media && m.mediaType === 'audio' && <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{width:'100%'}}/>}
                                        {m.media && (m.mediaType === 'video' || m.mediaType.includes('document')) && <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'8px'}}/>}
                                        <div>{m.text}</div>
                                        <div style={{fontSize:'10px', opacity:0.6, textAlign:'right', marginTop:'5px'}}>{new Date(m.date * 1000).toLocaleTimeString()}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e'}}>Selecione uma conversa</div>
                    )}
                </div>
            </div>
        )}

        {/* SPY / GOD MODE */}
        {tab === 'spy' && (
            <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
                     <h2 style={{margin:0}}>Radar Global</h2>
                     <div style={{display:'flex', gap:'10px'}}>
                         <button onClick={scanNetwork} disabled={isScanning} style={{padding:'10px 20px', background:'#8957e5', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>1. Escanear ({allGroups.length})</button>
                         <button onClick={startMassHarvest} style={{padding:'10px 20px', background:'#238636', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>2. Aspirar Todos</button>
                     </div>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                    <div style={{background:'#0d1117', padding:'15px', borderRadius:'8px'}}>
                        <h4>Grupos Encontrados</h4>
                        <div style={{maxHeight:'500px', overflowY:'auto'}}>
                            {allGroups.map(g=>(
                                <div key={g.id} style={{padding:'10px', borderBottom:'1px solid #21262d', display:'flex', justifyContent:'space-between'}}>
                                    <span>{g.title} ({g.participantsCount})</span>
                                    {harvestedIds.has(g.id) && <span>✅</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* TOOLS */}
        {tab === 'tools' && (
             <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px' }}>
                <div style={{ backgroundColor: '#161b22', padding: '30px', borderRadius:'12px', border:'1px solid #30363d' }}>
                    <h3 style={{marginTop:0, color:'#8957e5'}}>🎭 Camuflagem</h3>
                    <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    <input type="text" placeholder="Foto URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    <button onClick={handleMassUpdateProfile} disabled={processing} style={{ width: '100%', padding: '15px', background: '#8957e5', color: 'white', border: 'none', borderRadius:'8px', cursor:'pointer' }}>ATUALIZAR</button>
                </div>
                <div style={{ backgroundColor: '#161b22', padding: '30px', borderRadius:'12px', border:'1px solid #30363d' }}>
                    <h3 style={{marginTop:0, color:'#3390ec'}}>📸 Stories</h3>
                    <input type="text" placeholder="Mídia URL" value={storyUrl} onChange={e => setStoryUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    <input type="text" placeholder="Legenda" value={storyCaption} onChange={e => setStoryCaption(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    <button onClick={handleMassPostStory} disabled={processing} style={{ width: '100%', padding: '15px', background: '#1f6feb', color: 'white', border: 'none', borderRadius:'8px', cursor:'pointer' }}>POSTAR</button>
                </div>
            </div>
        )}
    </div>
  );
}
