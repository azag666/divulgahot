import { useState, useEffect, useRef } from 'react';

// ============================================================================
// HOTTRACK V12 ULTIMATE - ADMIN PANEL
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTH ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [creds, setCreds] = useState({ user:'', pass:'', token:'' });

  // --- UI STATE ---
  const [tab, setTab] = useState('dashboard'); // dashboard, inbox, spy, tools
  const [logs, setLogs] = useState([]);
  
  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- ENGINE V12 (DISPARO) ---
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState({ 
      msg: '{Olá|Oi}, tudo bem?', 
      imgUrl: '', 
      useRandom: true,
      delay: 0 // Delay extra opcional
  });
  const stopRef = useRef(false);

  // --- MODELOS (TEMPLATES) ---
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');

  // --- INBOX (CHAT) ---
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOffset, setChatOffset] = useState(0);

  // --- SPY & TOOLS ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [harvesting, setHarvesting] = useState(false);
  const [toolsInput, setToolsInput] = useState({ name:'', photo:'', storyUrl:'', storyCaption:'' });

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================

  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if(token) { setAuthToken(token); setIsAuthenticated(true); }
      
      const savedGroups = localStorage.getItem('godModeGroups');
      if(savedGroups) setAllGroups(JSON.parse(savedGroups));

      const savedTemplates = localStorage.getItem('msgTemplates');
      if(savedTemplates) setTemplates(JSON.parse(savedTemplates));
  }, []);

  useEffect(() => {
      if(isAuthenticated) {
          fetchData();
          const i = setInterval(fetchStats, 20000);
          return () => clearInterval(i);
      }
  }, [isAuthenticated]);

  // --- API HELPER ---
  const apiCall = async (endpoint, body) => {
      try {
          const res = await fetch(endpoint, {
              method: body ? 'POST' : 'GET',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
              body: body ? JSON.stringify(body) : null
          });
          if(res.status === 401) { setIsAuthenticated(false); return null; }
          return res;
      } catch(e) { return { ok: false, json: async ()=>({error: 'Erro Conexão'}) }; }
  };

  const addLog = (msg, type='info') => {
      const time = new Date().toLocaleTimeString();
      setLogs(p => [`[${time}] ${msg}`, ...p].slice(0, 300));
  };

  // --- SYNC DATA ---
  const fetchData = async () => {
      const sRes = await apiCall('/api/list-sessions');
      if(sRes?.ok) {
          const data = await sRes.json();
          setSessions(prev => {
              const novo = data.sessions || [];
              return novo.map(n => {
                  const old = prev.find(p => p.phone_number === n.phone_number);
                  return { ...n, is_active: old ? old.is_active : n.is_active };
              });
          });
      }
      fetchStats();
      
      const hRes = await apiCall('/api/get-harvested');
      if(hRes?.ok) {
          const d = await hRes.json();
          if(d.harvestedIds) setHarvestedIds(new Set(d.harvestedIds));
      }
  };

  const fetchStats = async () => {
      const res = await apiCall('/api/stats');
      if(res?.ok) setStats(await res.json());
  };

  // ==========================================================================
  // 1. ENGINE V12 (DISPARO COM FILA INTELIGENTE)
  // ==========================================================================
  
  const startEngine = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      stopRef.current = false;
      addLog('🚀 ENGINE V12 INICIADA', 'success');

      let senders = Array.from(selectedPhones);
      let cooldowns = {}; // { phone: timestamp_liberacao }
      let sentCount = 0;

      while(!stopRef.current) {
          // 1. Filtra contas aptas (sem cooldown)
          const now = Date.now();
          const activeSenders = senders.filter(p => !cooldowns[p] || now > cooldowns[p]);

          if(activeSenders.length === 0) {
              addLog('⏳ Todas as contas em pausa (Flood). Aguardando 5s...', 'warn');
              await new Promise(r => setTimeout(r, 5000));
              continue;
          }

          // 2. Busca Leads (Batch pequeno para fluidez)
          const lRes = await apiCall(`/api/get-campaign-leads?limit=20&random=${config.useRandom}`);
          const lData = await lRes?.json();
          const leads = lData?.leads || [];

          if(leads.length === 0) { addLog('✅ Lista de leads finalizada.', 'success'); break; }

          // 3. Disparo Paralelo Controlado (Max 5 simultâneos)
          const BATCH_SIZE = 5;
          for(let i=0; i<leads.length; i+=BATCH_SIZE) {
              if(stopRef.current) break;
              
              const chunk = leads.slice(i, i+BATCH_SIZE);
              
              await Promise.all(chunk.map(async (lead) => {
                  // Seleciona sender aleatório disponível
                  const validSenders = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
                  if(validSenders.length === 0) return;
                  
                  const sender = validSenders[Math.floor(Math.random() * validSenders.length)];

                  try {
                      const res = await apiCall('/api/dispatch', {
                          senderPhone: sender,
                          target: lead.user_id,
                          username: lead.username,
                          message: config.msg,
                          imageUrl: config.imgUrl,
                          leadDbId: lead.id
                      });
                      const d = await res.json();

                      if(res.status === 429 || (d.error && d.error.includes('FLOOD'))) {
                          const wait = d.wait || 60;
                          cooldowns[sender] = Date.now() + (wait * 1000);
                          addLog(`⛔ Flood em ${sender}. Pausa ${wait}s.`, 'error');
                      } else if(d.success) {
                          sentCount++;
                          addLog(`✅ Enviado: ${sender} -> ${lead.username||lead.user_id}`);
                      }
                  } catch(e) {}
              }));

              // Delay configurável + segurança
              await new Promise(r => setTimeout(r, 1000 + (config.delay * 1000)));
          }
      }
      setProcessing(false);
      addLog(`🏁 Operação finalizada. Envios: ${sentCount}`, 'success');
      fetchData();
  };

  // --- GESTÃO DE TEMPLATES ---
  const saveTemplate = () => {
      if(!templateName) return alert('Dê um nome ao modelo!');
      const newT = [...templates, { id: Date.now(), name: templateName, msg: config.msg, img: config.imgUrl }];
      setTemplates(newT);
      localStorage.setItem('msgTemplates', JSON.stringify(newT));
      setTemplateName('');
      alert('Modelo salvo!');
  };

  const loadTemplate = (t) => {
      setConfig({ ...config, msg: t.msg, imgUrl: t.img });
  };

  const deleteTemplate = (id) => {
      const newT = templates.filter(t => t.id !== id);
      setTemplates(newT);
      localStorage.setItem('msgTemplates', JSON.stringify(newT));
  };

  // ==========================================================================
  // 2. INBOX V2 (CHAT FIX)
  // ==========================================================================
  
  const loadInbox = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let all = [];
      const CHUNK = 3;

      for(let i=0; i<phones.length; i+=CHUNK) {
          const batch = phones.slice(i, i+CHUNK);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p }).then(r=>r.json()).catch(()=>({replies:[]}))
          ));
          results.forEach(r => { if(r.replies) all = [...all, ...r.replies]; });
      }
      setReplies(all.sort((a,b) => b.timestamp - a.timestamp));
      setLoadingReplies(false);
  };

  const openChat = async (reply, offset = 0) => {
      setSelectedChat(reply);
      setChatLoading(true);
      if(offset === 0) setChatHistory([]);

      try {
          const res = await apiCall('/api/spy/get-history', {
              phone: reply.fromPhone,
              chatId: reply.chatId,
              limit: 20,
              offset: offset
          });
          
          if(res.ok) {
              const data = await res.json();
              if(data.history) {
                  setChatHistory(prev => offset===0 ? data.history : [...data.history, ...prev]);
                  setChatOffset(offset + 20);
              }
          } else {
              addLog('Erro ao carregar chat.', 'error');
          }
      } catch(e) { console.error(e); }
      setChatLoading(false);
  };

  // ==========================================================================
  // 3. SPY & TOOLS (RESTAURADO)
  // ==========================================================================

  const scanGroups = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setScanning(true);
      addLog('📡 Escaneando grupos...');
      
      let found = [];
      const phones = Array.from(selectedPhones);

      for(const p of phones) {
          try {
              const res = await apiCall('/api/spy/list-chats', { phone: p });
              const d = await res.json();
              if(d.chats) {
                  d.chats.forEach(c => {
                      if(!c.type.includes('Canal')) found.push({ ...c, ownerPhone: p });
                  });
              }
          } catch(e){}
      }
      
      const unique = [...new Map(found.map(i => [i.id, i])).values()];
      setAllGroups(unique);
      localStorage.setItem('godModeGroups', JSON.stringify(unique));
      setScanning(false);
      addLog(`📡 ${unique.length} grupos encontrados.`);
  };

  const harvestAll = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if(targets.length === 0) return alert('Nada novo para aspirar.');
      if(!confirm(`Aspirar ${targets.length} grupos?`)) return;

      setHarvesting(true);
      addLog('🕷️ Iniciando Aspiração...');

      for(const t of targets) {
          try {
             const res = await apiCall('/api/spy/harvest', { phone: t.ownerPhone, chatId: t.id, chatName: t.title });
             const d = await res.json();
             if(d.success) {
                 addLog(`✅ +${d.count} leads de ${t.title}`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch(e){}
          await new Promise(r => setTimeout(r, 1000));
      }
      setHarvesting(false);
      addLog('🏁 Aspiração concluída.');
      fetchData();
  };

  const runTool = async (endpoint, payload) => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      addLog('⚙️ Executando ferramenta...');
      const phones = Array.from(selectedPhones);
      
      for(const p of phones) {
          try {
              await apiCall(endpoint, { phone: p, ...payload });
              addLog(`✅ Sucesso: ${p}`);
          } catch(e) { addLog(`❌ Falha: ${p}`, 'error'); }
      }
      setProcessing(false);
  };

  // ==========================================================================
  // UI COMPONENTS
  // ==========================================================================

  const handleLogin = async (e) => {
      e.preventDefault();
      const ep = loginMode==='user'?'/api/login':'/api/admin-login';
      const bd = loginMode==='user'?{username:creds.user, password:creds.pass}:{password:creds.token};
      try {
          const r = await fetch(ep, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bd)});
          const d = await r.json();
          if(d.success) {
              setAuthToken(d.token); setIsAuthenticated(true); localStorage.setItem('authToken', d.token);
          } else alert(d.error);
      } catch(e){ alert('Erro conexão'); }
  };

  if(!isAuthenticated) return (
      <div style={{height:'100vh',background:'#0d1117',display:'flex',justifyContent:'center',alignItems:'center',color:'white',fontFamily:'sans-serif'}}>
          <form onSubmit={handleLogin} style={{background:'#161b22',padding:'30px',borderRadius:'10px',border:'1px solid #30363d',width:'300px',display:'flex',flexDirection:'column',gap:'10px'}}>
              <h2 style={{textAlign:'center',margin:0}}>HOTTRACK V12</h2>
              <div style={{display:'flex',gap:'10px'}}>
                  <button type="button" onClick={()=>setLoginMode('user')} style={{flex:1,background:loginMode==='user'?'#238636':'#21262d',border:'none',color:'white',padding:'8px',cursor:'pointer'}}>User</button>
                  <button type="button" onClick={()=>setLoginMode('admin')} style={{flex:1,background:loginMode==='admin'?'#8957e5':'#21262d',border:'none',color:'white',padding:'8px',cursor:'pointer'}}>Admin</button>
              </div>
              {loginMode==='user' ? (
                  <>
                      <input placeholder="User" value={creds.user} onChange={e=>setCreds({...creds,user:e.target.value})} style={inputStyle} />
                      <input type="password" placeholder="Pass" value={creds.pass} onChange={e=>setCreds({...creds,pass:e.target.value})} style={inputStyle} />
                  </>
              ) : (
                  <input type="password" placeholder="Token" value={creds.token} onChange={e=>setCreds({...creds,token:e.target.value})} style={inputStyle} />
              )}
              <button type="submit" style={btnStyle}>ENTRAR</button>
          </form>
      </div>
  );

  return (
    <div style={{background:'#0d1117',minHeight:'100vh',color:'#c9d1d9',fontFamily:'sans-serif',padding:'20px'}}>
        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px',borderBottom:'1px solid #30363d',paddingBottom:'15px'}}>
            <h2 style={{margin:0,color:'white'}}>HOTTRACK <span style={{fontSize:'12px',background:'#238636',padding:'2px 6px',borderRadius:'4px'}}>V12 ULTIMATE</span></h2>
            <div style={{display:'flex',gap:'10px'}}>
                {['dashboard','inbox','spy','tools'].map(t => (
                    <button key={t} onClick={()=>setTab(t)} style={{
                        background:tab===t?'#1f6feb':'transparent', border:`1px solid ${tab===t?'#1f6feb':'#30363d'}`,
                        color:'white', padding:'8px 15px', borderRadius:'6px', cursor:'pointer', textTransform:'capitalize'
                    }}>{t}</button>
                ))}
            </div>
            <button onClick={()=>{setIsAuthenticated(false);localStorage.removeItem('authToken');}} style={{background:'#f85149',border:'none',color:'white',padding:'8px',borderRadius:'6px',cursor:'pointer'}}>Sair</button>
        </div>

        {/* --- DASHBOARD --- */}
        {tab === 'dashboard' && (
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'20px'}}>
                <div>
                    {/* STATS */}
                    <div style={{display:'flex', gap:'15px', marginBottom:'20px'}}>
                        <StatBox label="PENDENTES" val={stats.pending} color="#d29922"/>
                        <StatBox label="ENVIADOS" val={stats.sent} color="#238636"/>
                        <StatBox label="ONLINE" val={sessions.filter(s=>s.is_active).length} color="#1f6feb"/>
                    </div>
                    
                    {/* CONFIG AREA */}
                    <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                            <h3 style={{margin:0}}>Configuração de Disparo</h3>
                            
                            {/* Templates Dropdown */}
                            <select onChange={(e) => {
                                const t = templates.find(temp => temp.id === parseInt(e.target.value));
                                if(t) loadTemplate(t);
                            }} style={{background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'5px'}}>
                                <option value="">Carregar Modelo...</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>

                        <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                            <input placeholder="URL Imagem" value={config.imgUrl} onChange={e=>setConfig({...config, imgUrl:e.target.value})} style={{flex:1,...inputStyle, marginBottom:0}} />
                            <label style={{display:'flex', alignItems:'center', gap:'5px', background:'#0d1117', padding:'0 10px', borderRadius:'5px', border:'1px solid #30363d'}}>
                                <input type="checkbox" checked={config.useRandom} onChange={e=>setConfig({...config, useRandom:e.target.checked})} /> Aleatório
                            </label>
                        </div>
                        
                        <textarea placeholder="Mensagem Spintax {Oi|Olá}..." value={config.msg} onChange={e=>setConfig({...config, msg:e.target.value})} style={{width:'100%', height:'100px', ...inputStyle}} />
                        
                        {/* Save Template */}
                        <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                            <input placeholder="Nome do modelo para salvar" value={templateName} onChange={e=>setTemplateName(e.target.value)} style={{flex:1,...inputStyle, marginBottom:0}} />
                            <button onClick={saveTemplate} style={{background:'#1f6feb', border:'none', color:'white', padding:'10px', borderRadius:'5px', cursor:'pointer'}}>Salvar Modelo</button>
                        </div>

                        {/* Actions */}
                        <div style={{display:'flex', gap:'10px'}}>
                            {!processing ? (
                                <button onClick={startEngine} style={{...btnStyle, background:'#238636'}}>🚀 INICIAR</button>
                            ) : (
                                <button onClick={()=>stopRef.current=true} style={{...btnStyle, background:'#f85149'}}>🛑 PARAR</button>
                            )}
                        </div>
                    </div>
                    
                    {/* LOGS */}
                    <div style={{marginTop:'20px', height:'250px', overflowY:'auto', background:'#010409', padding:'10px', borderRadius:'10px', border:'1px solid #30363d', fontFamily:'monospace', fontSize:'12px'}}>
                        {logs.map((l,i) => <div key={i} style={{color: l.includes('Erro')?'#f85149':l.includes('Enviado')?'#238636':'#8b949e'}}>{l}</div>)}
                    </div>
                </div>

                {/* SESSIONS LIST */}
                <div style={{background:'#161b22', padding:'15px', borderRadius:'10px', border:'1px solid #30363d', display:'flex', flexDirection:'column', height:'calc(100vh - 150px)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                        <h4>Contas ({sessions.length})</h4>
                        <button onClick={()=>{
                            const active = new Set();
                            sessions.forEach(s=>s.is_active && active.add(s.phone_number));
                            setSelectedPhones(active);
                        }} style={{background:'none', border:'none', color:'#58a6ff', cursor:'pointer'}}>Select Online</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={()=>{
                                const n = new Set(selectedPhones);
                                n.has(s.phone_number)?n.delete(s.phone_number):n.add(s.phone_number);
                                setSelectedPhones(n);
                            }} style={{
                                padding:'8px', marginBottom:'5px', borderRadius:'5px', cursor:'pointer', display:'flex', alignItems:'center', gap:'10px',
                                background: selectedPhones.has(s.phone_number)?'#1f6feb22':'transparent', border:selectedPhones.has(s.phone_number)?'1px solid #1f6feb':'1px solid transparent'
                            }}>
                                <div style={{width:'8px', height:'8px', borderRadius:'50%', background:s.is_active?'#238636':'#f85149'}}></div>
                                <span>{s.phone_number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* --- INBOX (CHAT CORRIGIDO) --- */}
        {tab === 'inbox' && (
            <div style={{display:'grid', gridTemplateColumns:'300px 1fr', height:'calc(100vh - 120px)', border:'1px solid #30363d', borderRadius:'10px', background:'#161b22', overflow:'hidden'}}>
                <div style={{borderRight:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{padding:'10px', borderBottom:'1px solid #30363d'}}>
                        <button onClick={loadInbox} disabled={loadingReplies} style={{...btnStyle, background:'#e3b341', color:'black'}}>{loadingReplies?'Baixando...':'Atualizar Lista'}</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {replies.map((r,i) => (
                            <div key={i} onClick={()=>openChat(r)} style={{
                                padding:'15px', borderBottom:'1px solid #30363d', cursor:'pointer',
                                background: selectedChat?.chatId===r.chatId ? '#21262d' : 'transparent'
                            }}>
                                <div style={{fontWeight:'bold', display:'flex', justifyContent:'space-between'}}>
                                    <span>{r.name}</span>
                                    <span style={{fontSize:'11px', color:'#8b949e'}}>{r.date?.split(' ')[1]}</span>
                                </div>
                                <div style={{fontSize:'12px', color:'#8b949e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.lastMessage}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', background:'#0d1117'}}>
                    {selectedChat ? (
                        <>
                            <div style={{padding:'15px', background:'#21262d', borderBottom:'1px solid #30363d', fontWeight:'bold'}}>{selectedChat.name}</div>
                            <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'10px'}}>
                                <button onClick={()=>openChat(selectedChat, chatOffset)} style={{alignSelf:'center', padding:'5px 15px', borderRadius:'20px', background:'#30363d', border:'none', color:'white', cursor:'pointer', marginBottom:'10px'}}>
                                    {chatLoading ? 'Carregando...' : 'Carregar Mensagens Anteriores'}
                                </button>
                                {chatHistory.map((m,i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        background: m.isOut ? '#005c4b' : '#202c33',
                                        padding:'10px', borderRadius:'8px', maxWidth:'70%', color:'white', boxShadow:'0 1px 1px rgba(0,0,0,0.2)'
                                    }}>
                                        {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px', marginBottom:'5px'}} />}
                                        {m.mediaType === 'audio' && <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{maxWidth:'100%', marginBottom:'5px'}} />}
                                        {m.mediaType === 'video' && <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px', marginBottom:'5px'}} />}
                                        
                                        <div style={{whiteSpace:'pre-wrap', fontSize:'14px'}}>{m.text}</div>
                                        {m.hasMedia && !m.media && <div style={{fontSize:'10px', color:'#f85149'}}>[Erro ao baixar mídia]</div>}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e'}}>Selecione uma conversa</div>}
                </div>
            </div>
        )}

        {/* --- SPY (SCAN & HARVEST) --- */}
        {tab === 'spy' && (
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                    <h3 style={{marginTop:0}}>Radar de Grupos</h3>
                    <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                        <button onClick={scanGroups} disabled={scanning} style={{...btnStyle, background:'#238636'}}>{scanning?'Escaneando...':'1. Escanear Rede'}</button>
                        <button onClick={harvestAll} disabled={harvesting} style={{...btnStyle, background:'#8957e5'}}>{harvesting?'Aspirando...':'2. Aspirar Leads'}</button>
                    </div>
                    <div style={{background:'#0d1117', padding:'10px', borderRadius:'5px', height:'400px', overflowY:'auto'}}>
                        {allGroups.map((g,i) => (
                            <div key={i} style={{padding:'8px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', fontSize:'13px'}}>
                                <span>{g.title} ({g.participantsCount})</span>
                                {harvestedIds.has(g.id) ? <span>✅</span> : <span style={{color:'#8b949e'}}>Pend</span>}
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                    <h3>Instruções</h3>
                    <p style={{fontSize:'14px', color:'#8b949e'}}>1. Selecione as contas no Dashboard.</p>
                    <p style={{fontSize:'14px', color:'#8b949e'}}>2. Clique em "Escanear Rede" para encontrar grupos onde suas contas estão.</p>
                    <p style={{fontSize:'14px', color:'#8b949e'}}>3. Clique em "Aspirar Leads" para extrair membros desses grupos para o banco de dados.</p>
                </div>
            </div>
        )}

        {/* --- TOOLS (PERFIL & STORY) --- */}
        {tab === 'tools' && (
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                    <h3 style={{marginTop:0, color:'#1f6feb'}}>Troca de Identidade</h3>
                    <input placeholder="Novo Nome" value={toolsInput.name} onChange={e=>setToolsInput({...toolsInput, name:e.target.value})} style={inputStyle} />
                    <input placeholder="URL Foto Perfil" value={toolsInput.photo} onChange={e=>setToolsInput({...toolsInput, photo:e.target.value})} style={inputStyle} />
                    <button onClick={()=>runTool('/api/update-profile', {newName:toolsInput.name, photoUrl:toolsInput.photo})} disabled={processing} style={btnStyle}>ATUALIZAR PERFIS</button>
                </div>

                <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                    <h3 style={{marginTop:0, color:'#d29922'}}>Postador de Stories</h3>
                    <input placeholder="URL Mídia (JPG/MP4)" value={toolsInput.storyUrl} onChange={e=>setToolsInput({...toolsInput, storyUrl:e.target.value})} style={inputStyle} />
                    <input placeholder="Legenda / Link" value={toolsInput.storyCaption} onChange={e=>setToolsInput({...toolsInput, storyCaption:e.target.value})} style={inputStyle} />
                    <button onClick={()=>runTool('/api/post-story', {mediaUrl:toolsInput.storyUrl, caption:toolsInput.storyCaption})} disabled={processing} style={{...btnStyle, background:'#d29922'}}>POSTAR EM MASSA</button>
                </div>
            </div>
        )}

    </div>
  );
}

// STYLES
const inputStyle = { width:'100%', padding:'10px', background:'#010409', border:'1px solid #30363d', color:'white', borderRadius:'5px', marginBottom:'10px' };
const btnStyle = { width:'100%', padding:'10px', background:'#238636', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold' };
const StatBox = ({label, val, color}) => (
    <div style={{flex:1, background:'#161b22', padding:'15px', borderRadius:'8px', border:`1px solid ${color}`, textAlign:'center'}}>
        <h2 style={{margin:0, color}}>{val}</h2><small>{label}</small>
    </div>
);
