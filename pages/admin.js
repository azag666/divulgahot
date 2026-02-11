import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  // --- AUTH ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginMode, setLoginMode] = useState('user');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');

  // --- UI ---
  const [tab, setTab] = useState('dashboard'); // dashboard, inbox, spy, tools
  const [logs, setLogs] = useState([]);

  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- ENGINE V8 (DISPARO) ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState('');
  const [useRandomLeads, setUseRandomLeads] = useState(true);
  const stopCampaignRef = useRef(false);

  // --- INBOX 2.0 ---
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);

  // --- SPY & TOOLS ---
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [allGroups, setAllGroups] = useState([]); // Cache local do scan
  
  // Inputs Tools
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INIT ---
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        setIsAdmin(payload.isAdmin === true || payload.type === 'admin');
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && authToken) {
        fetchData();
        // Tenta carregar cache de grupos
        const savedG = localStorage.getItem('godModeGroups');
        if(savedG) setAllGroups(JSON.parse(savedG));
    }
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
          // Preserva status visual
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

    } catch (error) { console.error("Erro sync:", error); }
  };

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  // --- AUTH HANDLERS (Igual ao anterior) ---
  const handleUserLogin = async (e) => { e.preventDefault(); /* ... lógica login user ... */ try { const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: usernameInput, password: passwordInput }) }); const data = await res.json(); if(data.success) { setAuthToken(data.token); setIsAuthenticated(true); localStorage.setItem('authToken', data.token); } else alert(data.error); } catch (e) {} };
  const handleAdminTokenLogin = async (e) => { e.preventDefault(); /* ... lógica login admin ... */ try { const res = await fetch('/api/admin-login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password: adminTokenInput }) }); const data = await res.json(); if(data.success) { setAuthToken(data.token); setIsAdmin(true); setIsAuthenticated(true); localStorage.setItem('authToken', data.token); } else alert(data.error); } catch (e) {} };
  const handleLogout = () => { setIsAuthenticated(false); setAuthToken(''); localStorage.removeItem('authToken'); };

  // --- SELEÇÃO ---
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    newSet.has(phone) ? newSet.delete(phone) : newSet.add(phone);
    setSelectedPhones(newSet);
  };
  const selectAllActive = () => {
      const newSet = new Set();
      sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
      setSelectedPhones(newSet);
  };
  const checkAllStatus = async () => {
      addLog('🔍 Check Status iniciado...');
      for(let s of sessions) {
          try {
             const res = await authenticatedFetch('/api/check-status', { method: 'POST', body: JSON.stringify({ phone: s.phone_number }) });
             const data = await res.json();
             s.is_active = (data.status === 'alive');
             setSessions([...sessions]);
          } catch(e){}
      }
      addLog('✅ Check Status finalizado.');
  };

  // ==============================================================================
  // ENGINE V8: WORKER POOL (NÃO TRAVA O NAVEGADOR)
  // ==============================================================================

  const startEngineV8 = async () => {
    if (selectedPhones.size === 0) return alert('Selecione contas!');
    
    setProcessing(true);
    stopCampaignRef.current = false;
    addLog(`🚀 ENGINE V8 (Worker Pool) INICIADA - Random: ${useRandomLeads}`);

    // CONFIGURAÇÃO DO WORKER
    const MAX_CONCURRENT_WORKERS = 6; // Limite seguro do navegador
    let activeWorkers = 0;
    let leadsBuffer = [];
    let totalSent = 0;
    
    // Lista de remetentes rotativa
    let senders = Array.from(selectedPhones);

    // Função para buscar leads
    const fetchMoreLeads = async () => {
        try {
            const res = await authenticatedFetch(`/api/get-campaign-leads?limit=100&random=${useRandomLeads}`);
            const data = await res.json();
            return data.leads || [];
        } catch (e) { return []; }
    };

    // Loop principal (Gerenciador de fila)
    while (!stopCampaignRef.current) {
        // 1. Reabastece buffer se estiver baixo
        if (leadsBuffer.length < 10) {
            addLog('📥 Buscando mais leads no banco...');
            const newLeads = await fetchMoreLeads();
            if (newLeads.length === 0) {
                if (activeWorkers === 0) { addLog('✅ Sem mais leads. Fim.'); break; }
                await new Promise(r => setTimeout(r, 2000)); // Espera workers terminarem
                continue;
            }
            leadsBuffer = [...leadsBuffer, ...newLeads];
            addLog(`📦 Buffer reabastecido: ${leadsBuffer.length} leads.`);
        }

        // 2. Se tiver espaço para workers e leads disponíveis, despacha
        while (activeWorkers < MAX_CONCURRENT_WORKERS && leadsBuffer.length > 0 && !stopCampaignRef.current) {
            const lead = leadsBuffer.shift();
            const sender = senders[totalSent % senders.length]; // Round-robin simples
            
            activeWorkers++;
            
            // Dispara sem 'await' aqui (Fire and Forget controlado)
            dispatchWorker(sender, lead).then(() => {
                activeWorkers--;
                totalSent++;
            });
        }

        // Pequena pausa para não fritar a CPU do navegador no loop while
        await new Promise(r => setTimeout(r, 100));
    }
    
    setProcessing(false);
  };

  const dispatchWorker = async (sender, lead) => {
      try {
          const res = await authenticatedFetch('/api/dispatch', {
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
          const d = await res.json();
          if(d.success) addLog(`✅ Enviado de ${sender} para ${lead.username || lead.user_id}`);
          else if(res.status === 429) addLog(`⏳ FloodWait em ${sender}`);
          else addLog(`❌ Falha ${sender}: ${d.error}`);
      } catch (e) {
          addLog(`💀 Erro Req: ${e.message}`);
      }
  };


  // ==============================================================================
  // INBOX 2.0 (MÍDIA E LAYOUT)
  // ==============================================================================
  
  const loadInbox = async () => {
      setLoadingReplies(true);
      setReplies([]);
      const phones = Array.from(selectedPhones);
      if(phones.length === 0) return alert('Selecione contas para ler o inbox!');
      
      addLog(`📩 Lendo inbox de ${phones.length} contas...`);
      
      let all = [];
      // Batch loading
      for (let i=0; i < phones.length; i += 5) {
          const batch = phones.slice(i, i+5);
          const results = await Promise.all(batch.map(p => 
              authenticatedFetch('/api/spy/check-replies', { method: 'POST', body: JSON.stringify({ phone: p }) })
              .then(r => r.json()).catch(() => ({ replies: [] }))
          ));
          results.forEach(r => { if(r.replies) all = [...all, ...r.replies]; });
      }
      
      setReplies(all.sort((a,b) => new Date(b.date) - new Date(a.date))); // Mais recentes primeiro
      setLoadingReplies(false);
      setTab('inbox');
  };

  const openChat = async (reply) => {
      setSelectedChat(reply);
      setLoadingChat(true);
      setChatHistory([]);
      try {
          const res = await authenticatedFetch('/api/spy/get-history', { 
              method: 'POST', 
              body: JSON.stringify({ phone: reply.fromPhone, chatId: reply.chatId }) 
          });
          const data = await res.json();
          setChatHistory(data.history || []);
      } catch (e) { alert('Erro ao abrir chat'); }
      setLoadingChat(false);
  };

  // ==============================================================================
  // HARVEST & TOOLS (RESTAURADOS)
  // ==============================================================================
  
  const scanGroups = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setIsScanning(true);
      addLog('📡 Escaneando grupos nas contas selecionadas...');
      
      let found = [];
      for(const phone of Array.from(selectedPhones)) {
          try {
              const res = await authenticatedFetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone }) });
              const data = await res.json();
              if(data.chats) {
                  data.chats.forEach(c => {
                      if(!c.type.includes('Canal')) found.push({ ...c, ownerPhone: phone });
                  });
              }
          } catch(e) {}
      }
      // Remove duplicatas por ID
      found = [...new Map(found.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);
      setAllGroups(found);
      localStorage.setItem('godModeGroups', JSON.stringify(found));
      setIsScanning(false);
      addLog(`📡 Scan concluído. ${found.length} grupos encontrados.`);
  };

  const autoHarvestAll = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if(targets.length === 0) return alert('Nenhum grupo novo para aspirar. Faça SCAN.');
      if(!confirm(`Aspirar ${targets.length} grupos?`)) return;

      addLog('🕷️ Iniciando Aspiração em Massa...');
      for(const t of targets) {
          addLog(`🕷️ Aspirando: ${t.title}...`);
          try {
             const res = await authenticatedFetch('/api/spy/harvest', { 
                 method: 'POST', 
                 body: JSON.stringify({ phone: t.ownerPhone, chatId: t.id, chatName: t.title }) 
             });
             const d = await res.json();
             if(d.success) {
                 addLog(`✅ +${d.count} leads.`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch(e) {}
          await new Promise(r => setTimeout(r, 2000)); // Delay segurança
      }
      addLog('🏁 Aspiração finalizada.');
      fetchData();
  };

  const massUpdateProfile = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      if(!newName && !photoUrl) return alert('Preencha nome ou foto');
      addLog('🎭 Atualizando perfis...');
      for(const p of Array.from(selectedPhones)) {
          await authenticatedFetch('/api/update-profile', { method: 'POST', body: JSON.stringify({ phone: p, newName, photoUrl }) });
          addLog(`🎭 Perfil atualizado: ${p}`);
      }
  };

  const massPostStory = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      if(!storyUrl) return alert('Preencha URL da mídia');
      addLog('📸 Postando Stories...');
      for(const p of Array.from(selectedPhones)) {
          await authenticatedFetch('/api/post-story', { method: 'POST', body: JSON.stringify({ phone: p, mediaUrl: storyUrl, caption: storyCaption }) });
          addLog(`📸 Story postado: ${p}`);
      }
  };

  // --- RENDER LOGIN ---
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'10px'}}>
           <div style={{display:'flex', gap:'10px'}}>
              <button onClick={()=>setLoginMode('user')} style={{padding:'10px', background:loginMode==='user'?'#3390ec':'#222', color:'white', border:'none'}}>User</button>
              <button onClick={()=>setLoginMode('admin')} style={{padding:'10px', background:loginMode==='admin'?'#8957e5':'#222', color:'white', border:'none'}}>Admin</button>
           </div>
           {loginMode==='user' ? 
             <form onSubmit={handleUserLogin} style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                 <input placeholder="User" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} style={{padding:'10px'}}/>
                 <input type="password" placeholder="Pass" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} style={{padding:'10px'}}/>
                 <button type="submit" style={{padding:'10px', background:'#3390ec', color:'white', border:'none'}}>Login</button>
             </form>
           :
             <form onSubmit={handleAdminTokenLogin} style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                 <input type="password" placeholder="Token" value={adminTokenInput} onChange={e=>setAdminTokenInput(e.target.value)} style={{padding:'10px'}}/>
                 <button type="submit" style={{padding:'10px', background:'#8957e5', color:'white', border:'none'}}>Access</button>
             </form>
           }
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', display:'flex', flexDirection:'column', fontFamily: 'sans-serif' }}>
        
        {/* TOP BAR */}
        <div style={{background:'#161b22', padding:'15px 25px', borderBottom:'1px solid #30363d', display:'flex', alignItems:'center', gap:'20px'}}>
            <h2 style={{margin:0, color:'white'}}>HOTTRACK <span style={{fontSize:'12px', color:'#3390ec'}}>V8 ENGINE</span></h2>
            
            <button onClick={()=>setTab('dashboard')} style={{background:tab==='dashboard'?'#21262d':'transparent', color:tab==='dashboard'?'white':'#8b949e', border:'none', padding:'10px 15px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>🚀 DASHBOARD</button>
            <button onClick={()=>setTab('inbox')} style={{background:tab==='inbox'?'#21262d':'transparent', color:tab==='inbox'?'white':'#8b949e', border:'none', padding:'10px 15px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>📬 INBOX</button>
            <button onClick={()=>setTab('tools')} style={{background:tab==='tools'?'#21262d':'transparent', color:tab==='tools'?'white':'#8b949e', border:'none', padding:'10px 15px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>🛠️ FERRAMENTAS & SPY</button>

            <div style={{marginLeft:'auto', display:'flex', gap:'10px'}}>
                <button onClick={handleLogout} style={{background:'#f85149', color:'white', border:'none', padding:'8px 15px', borderRadius:'6px', cursor:'pointer'}}>SAIR</button>
            </div>
        </div>

        <div style={{flex:1, padding:'25px', overflowY:'auto'}}>
            
            {/* ================= DASHBOARD ================= */}
            {tab === 'dashboard' && (
                <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'25px'}}>
                    <div>
                        {/* CARD DISPARO */}
                        <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d', marginBottom:'20px'}}>
                            <h3 style={{marginTop:0, color:'white'}}>Configuração de Disparo</h3>
                            
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px', marginBottom:'20px'}}>
                                <input type="text" placeholder="URL da Imagem (Opcional)" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{background:'#0d1117', border:'1px solid #30363d', color:'white', padding:'12px', borderRadius:'6px'}} />
                                <div style={{display:'flex', alignItems:'center', gap:'10px', background:'#0d1117', padding:'0 15px', borderRadius:'6px', border:'1px solid #30363d'}}>
                                    <input type="checkbox" checked={useRandomLeads} onChange={e=>setUseRandomLeads(e.target.checked)} />
                                    <span>Aleatorizar Leads (Anti-Padrão)</span>
                                </div>
                            </div>

                            <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Mensagem..." style={{width:'100%', height:'100px', background:'#0d1117', border:'1px solid #30363d', color:'white', padding:'12px', borderRadius:'6px', marginBottom:'20px'}} />

                            <div style={{display:'flex', gap:'15px'}}>
                                {!processing ? 
                                    <button onClick={startEngineV8} style={{flex:1, padding:'15px', background:'#238636', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', fontSize:'16px', cursor:'pointer'}}>INICIAR DISPARO (V8)</button>
                                :
                                    <button onClick={()=>stopCampaignRef.current=true} style={{flex:1, padding:'15px', background:'#f85149', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', fontSize:'16px', cursor:'pointer'}}>PARAR DISPARO</button>
                                }
                            </div>
                        </div>

                        {/* LOGS */}
                        <div style={{background:'#0d1117', height:'300px', overflowY:'auto', padding:'15px', border:'1px solid #30363d', borderRadius:'12px', fontFamily:'monospace', fontSize:'12px'}}>
                            {logs.length===0 && <div style={{color:'#8b949e', textAlign:'center', marginTop:'100px'}}>Logs aparecerão aqui...</div>}
                            {logs.map((l,i)=><div key={i} style={{marginBottom:'5px', color:'#3fb950'}}>{l}</div>)}
                        </div>
                    </div>

                    {/* SIDEBAR SESSIONS */}
                    <div style={{background:'#161b22', padding:'20px', borderRadius:'12px', border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}>
                            <h3 style={{margin:0, color:'white'}}>Contas ({sessions.length})</h3>
                            <button onClick={checkAllStatus} style={{background:'none', border:'1px solid #30363d', color:'#58a6ff', borderRadius:'4px', cursor:'pointer'}}>Check</button>
                        </div>
                        <button onClick={selectAllActive} style={{width:'100%', padding:'10px', background:'#21262d', color:'white', border:'none', borderRadius:'6px', marginBottom:'10px', cursor:'pointer'}}>Selecionar Online</button>
                        
                        <div style={{flex:1, overflowY:'auto'}}>
                            {sessions.map(s => (
                                <div key={s.id} onClick={()=>toggleSelect(s.phone_number)} style={{padding:'10px', display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', background: selectedPhones.has(s.phone_number) ? 'rgba(88, 166, 255, 0.1)' : 'transparent', borderBottom:'1px solid #21262d'}}>
                                    <div style={{width:'10px', height:'10px', borderRadius:'50%', background: s.is_active?'#238636':'#f85149'}}></div>
                                    <span style={{color: s.is_active?'white':'#8b949e'}}>{s.phone_number}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ================= INBOX ================= */}
            {tab === 'inbox' && (
                <div style={{display:'grid', gridTemplateColumns:'350px 1fr', gap:'0', height:'calc(100vh - 120px)', border:'1px solid #30363d', borderRadius:'12px', overflow:'hidden'}}>
                    
                    {/* LISTA DE CONVERSAS */}
                    <div style={{background:'#161b22', borderRight:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                        <div style={{padding:'15px', borderBottom:'1px solid #30363d', display:'flex', gap:'10px'}}>
                            <button onClick={loadInbox} disabled={loadingReplies} style={{flex:1, padding:'10px', background:'#1f6feb', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>
                                {loadingReplies ? 'Atualizando...' : '🔄 Atualizar Inbox'}
                            </button>
                        </div>
                        <div style={{flex:1, overflowY:'auto'}}>
                            {replies.map((r,i) => (
                                <div key={i} onClick={()=>openChat(r)} style={{padding:'15px', borderBottom:'1px solid #21262d', cursor:'pointer', background: selectedChat?.chatId === r.chatId ? '#21262d' : 'transparent'}}>
                                    <div style={{fontWeight:'bold', color:'white', marginBottom:'5px'}}>{r.name}</div>
                                    <div style={{fontSize:'12px', color:'#8b949e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.lastMessage || '[Mídia]'}</div>
                                    <div style={{fontSize:'10px', color:'#58a6ff', marginTop:'5px', textAlign:'right'}}>{r.date}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* JANELA DE CHAT */}
                    <div style={{background:'#0d1117', display:'flex', flexDirection:'column'}}>
                        {!selectedChat ? (
                            <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e'}}>Selecione uma conversa</div>
                        ) : (
                            <>
                                <div style={{padding:'15px', background:'#161b22', borderBottom:'1px solid #30363d', color:'white', fontWeight:'bold'}}>
                                    {selectedChat.name} <span style={{fontSize:'12px', fontWeight:'normal', color:'#8b949e'}}>({selectedChat.fromPhone})</span>
                                </div>
                                <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'15px'}}>
                                    {loadingChat && <div style={{textAlign:'center', color:'#58a6ff'}}>Carregando histórico...</div>}
                                    {chatHistory.map((m,i) => (
                                        <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#238636' : '#21262d', padding:'10px 15px', borderRadius:'12px', maxWidth:'70%', color:'white'}}>
                                            {m.sender && !m.isOut && <div style={{fontSize:'11px', color:'#58a6ff', marginBottom:'5px'}}>{m.sender}</div>}
                                            
                                            {/* RENDERIZAÇÃO DE MÍDIA */}
                                            {m.mediaType === 'image' && m.media && (
                                                <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'8px', marginBottom:'5px'}} />
                                            )}
                                            {m.mediaType === 'audio' && m.media && (
                                                <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{width:'100%', marginBottom:'5px'}} />
                                            )}
                                            {m.mediaType === 'video' && m.media && (
                                                <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'8px', marginBottom:'5px'}} />
                                            )}

                                            <div>{m.text}</div>
                                            <div style={{fontSize:'10px', opacity:0.6, textAlign:'right', marginTop:'5px'}}>{new Date(m.date * 1000).toLocaleTimeString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ================= TOOLS & SPY ================= */}
            {tab === 'tools' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px'}}>
                    
                    {/* SPY / HARVEST */}
                    <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <h3 style={{marginTop:0, color:'#e3b341'}}>📡 Aspirador de Leads (Spy)</h3>
                        <p style={{fontSize:'13px', color:'#8b949e'}}>1. Escaneie grupos das contas selecionadas. 2. Aspire todos os contatos.</p>
                        
                        <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                            <button onClick={scanGroups} disabled={isScanning} style={{padding:'10px', background:'#21262d', color:'white', border:'1px solid #30363d', borderRadius:'6px', cursor:'pointer'}}>
                                {isScanning ? 'Escaneando...' : '1. Escanear Grupos'}
                            </button>
                            <button onClick={autoHarvestAll} style={{padding:'10px', background:'#e3b341', color:'black', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>
                                2. ASPIRAR TUDO ({allGroups.length} grupos)
                            </button>
                        </div>
                        
                        <div style={{maxHeight:'300px', overflowY:'auto', background:'#0d1117', padding:'10px', borderRadius:'6px'}}>
                            {allGroups.map((g,i) => (
                                <div key={i} style={{padding:'8px', borderBottom:'1px solid #21262d', display:'flex', justifyContent:'space-between'}}>
                                    <span>{g.title} ({g.participantsCount})</span>
                                    {harvestedIds.has(g.id) && <span style={{color:'#238636'}}>✅</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* IDENTIDADE & STORIES */}
                    <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                        {/* Identidade */}
                        <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                            <h3 style={{marginTop:0, color:'#8957e5'}}>🎭 Troca de Identidade</h3>
                            <input placeholder="Novo Nome" value={newName} onChange={e=>setNewName(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#0d1117', border:'1px solid #30363d', color:'white', borderRadius:'6px'}}/>
                            <input placeholder="URL Foto" value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#0d1117', border:'1px solid #30363d', color:'white', borderRadius:'6px'}}/>
                            <button onClick={massUpdateProfile} style={{width:'100%', padding:'10px', background:'#8957e5', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>Atualizar Selecionados</button>
                        </div>

                        {/* Stories */}
                        <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                            <h3 style={{marginTop:0, color:'#d29922'}}>📸 Postar Story</h3>
                            <input placeholder="URL Mídia (JPG/MP4)" value={storyUrl} onChange={e=>setStoryUrl(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#0d1117', border:'1px solid #30363d', color:'white', borderRadius:'6px'}}/>
                            <input placeholder="Legenda" value={storyCaption} onChange={e=>setStoryCaption(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#0d1117', border:'1px solid #30363d', color:'white', borderRadius:'6px'}}/>
                            <button onClick={massPostStory} style={{width:'100%', padding:'10px', background:'#d29922', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>Postar em Selecionados</button>
                        </div>
                    </div>

                </div>
            )}

        </div>
    </div>
  );
}
