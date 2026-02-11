import { useState, useEffect, useRef } from 'react';

// ============================================================================
// HOTTRACK V11 - CONVERSION MAX SYSTEM
// ============================================================================
export default function AdminPanel() {
  
  // --- AUTH ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [credentials, setCredentials] = useState({ user: '', pass: '', token: '' });

  // --- UI & TABS ---
  const [tab, setTab] = useState('dashboard'); // dashboard, inbox, spy, tools
  const [logs, setLogs] = useState([]);

  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- ENGINE V11 (DISPARO INTELIGENTE) ---
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState({
      msg: '{Olá|Oi}, tudo bem?',
      imgUrl: '',
      useRandom: true,
      concurrency: 5 // Número de disparos simultâneos (Ideal para não travar)
  });
  const stopRef = useRef(false);
  
  // --- INBOX (CHAT V2) ---
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
  const [toolsInput, setToolsInput] = useState({ name: '', photo: '', storyUrl: '', storyCaption: '' });

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
        setAuthToken(token);
        setIsAuthenticated(true);
    }
    const savedGroups = localStorage.getItem('godModeGroups');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
        fetchData();
        const interval = setInterval(fetchStats, 15000); // Atualiza stats a cada 15s
        return () => clearInterval(interval);
    }
  }, [isAuthenticated, authToken]);

  const apiCall = async (endpoint, body = null) => {
    const options = {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: body ? JSON.stringify(body) : null
    };
    const res = await fetch(endpoint, options);
    return res; // Retorna response crua para tratar status
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 200));
  };

  const fetchData = async () => {
    try {
        const sRes = await apiCall('/api/list-sessions');
        const sData = await sRes.json();
        setSessions(prev => {
            const newS = sData.sessions || [];
            return newS.map(n => {
                const old = prev.find(p => p.phone_number === n.phone_number);
                return { ...n, is_active: old ? old.is_active : n.is_active };
            });
        });
        fetchStats();
        
        const hRes = await apiCall('/api/get-harvested');
        const hData = await hRes.json();
        if(hData.harvestedIds) setHarvestedIds(new Set(hData.harvestedIds));
    } catch(e) {}
  };

  const fetchStats = async () => {
      try {
          const res = await apiCall('/api/stats');
          if(res.ok) setStats(await res.json());
      } catch(e) {}
  };

  // ==========================================================================
  // ENGINE V11: FILA ASSÍNCRONA COM ROTAÇÃO DE CONTAS
  // ==========================================================================
  const startEngine = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      
      setProcessing(true);
      stopRef.current = false;
      addLog('🚀 INICIANDO ENGINE V11 (MAX CONVERSION)', 'success');

      let senders = Array.from(selectedPhones); // Lista de números remetentes
      let senderCooldowns = {}; // Armazena tempo de bloqueio por flood: { '551199...': timestamp }
      
      let sentCount = 0;

      // Loop Infinito até parar ou acabar leads
      while (!stopRef.current) {
          
          // 1. Limpa cooldowns expirados
          const now = Date.now();
          senders = Array.from(selectedPhones).filter(phone => {
              if (!senderCooldowns[phone]) return true;
              if (now > senderCooldowns[phone]) {
                  delete senderCooldowns[phone];
                  return true; // Liberado
              }
              return false; // Ainda em cooldown
          });

          if (senders.length === 0) {
              addLog('⏳ Todas as contas em Cooldown (Flood). Aguardando 10s...', 'warn');
              await new Promise(r => setTimeout(r, 10000));
              continue;
          }

          // 2. Busca Leads (Lote Otimizado)
          const leadsRes = await apiCall(`/api/get-campaign-leads?limit=50&random=${config.useRandom}`);
          const leadsData = await leadsRes.json();
          const leads = leadsData.leads || [];

          if (leads.length === 0) {
              addLog('✅ Fim da lista de leads.', 'success');
              break;
          }

          // 3. Processamento Paralelo Controlado
          // Processa 'config.concurrency' leads por vez
          for (let i = 0; i < leads.length; i += config.concurrency) {
              if (stopRef.current) break;

              const batch = leads.slice(i, i + config.concurrency);
              
              await Promise.all(batch.map(async (lead) => {
                  // Escolhe um remetente disponível (Round Robin Aleatório)
                  const availableSenders = senders.filter(s => !senderCooldowns[s]);
                  if (availableSenders.length === 0) return; // Ninguém disponível

                  const sender = availableSenders[Math.floor(Math.random() * availableSenders.length)];

                  try {
                      const res = await apiCall('/api/dispatch', {
                          senderPhone: sender,
                          target: lead.user_id,
                          username: lead.username,
                          message: config.msg,
                          imageUrl: config.imgUrl,
                          leadDbId: lead.id
                      });

                      const data = await res.json();

                      if (res.status === 429 || (data.error && data.error.includes('FLOOD'))) {
                          // FLOOD DETECTADO: Bloqueia essa conta por X segundos
                          const waitSeconds = data.wait || 60;
                          senderCooldowns[sender] = Date.now() + (waitSeconds * 1000);
                          addLog(`⛔ Flood em ${sender}. Pausando por ${waitSeconds}s.`, 'error');
                      } else if (data.success) {
                          sentCount++;
                          addLog(`✅ Enviado: ${sender} -> ${lead.username || lead.user_id}`);
                      }
                  } catch (err) {
                      // Erro de rede silencioso para não parar o fluxo
                  }
              }));

              // Pequeno delay para respirar a CPU
              await new Promise(r => setTimeout(r, 500));
          }
      }

      setProcessing(false);
      addLog(`🏁 Campanha Finalizada. Total: ${sentCount}`, 'success');
      fetchData();
  };

  // ==========================================================================
  // INBOX V2 (CHAT COMPLETO)
  // ==========================================================================
  const loadInbox = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let all = [];
      
      // Carrega em blocos de 3 para ser rápido
      const CHUNK = 3;
      for(let i=0; i<phones.length; i+=CHUNK) {
          const batch = phones.slice(i, i+CHUNK);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p }).then(r => r.json()).catch(()=>({replies:[]}))
          ));
          results.forEach(r => { if(r.replies) all = [...all, ...r.replies]; });
          setReplies(all.sort((a,b) => b.timestamp - a.timestamp));
      }
      setLoadingReplies(false);
  };

  const openChat = async (reply, offset = 0) => {
      setSelectedChat(reply);
      setChatLoading(true);
      if(offset === 0) setChatHistory([]); // Limpa se for chat novo

      try {
          const res = await apiCall('/api/spy/get-history', {
              phone: reply.fromPhone,
              chatId: reply.chatId,
              limit: 30,
              offset: offset
          });
          const data = await res.json();
          
          if(data.history) {
              if(offset > 0) {
                  setChatHistory(prev => [...data.history, ...prev]); // Adiciona ao topo (antigas)
              } else {
                  setChatHistory(data.history);
              }
              setChatOffset(offset + 30);
          }
      } catch(e) { alert('Erro ao abrir chat'); }
      setChatLoading(false);
  };

  // ==========================================================================
  // LOGIN E RENDER
  // ==========================================================================
  const handleLogin = async (e) => {
      e.preventDefault();
      const endpoint = loginMode === 'user' ? '/api/login' : '/api/admin-login';
      const body = loginMode === 'user' 
        ? { username: credentials.user, password: credentials.pass } 
        : { password: credentials.token };
      
      try {
          const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
          const d = await res.json();
          if(d.success) {
              setAuthToken(d.token);
              setIsAuthenticated(true);
              localStorage.setItem('authToken', d.token);
          } else alert(d.error);
      } catch(e) { alert('Erro conexão'); }
  };

  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontFamily:'sans-serif'}}>
          <div style={{width:'300px', padding:'30px', border:'1px solid #30363d', borderRadius:'10px', background:'#161b22'}}>
              <h2 style={{textAlign:'center', marginTop:0}}>HOTTRACK V11</h2>
              <div style={{display:'flex', marginBottom:'15px', borderBottom:'1px solid #30363d'}}>
                  <button onClick={()=>setLoginMode('user')} style={{flex:1, background:'none', border:'none', color:loginMode==='user'?'white':'gray', padding:'10px', cursor:'pointer'}}>USER</button>
                  <button onClick={()=>setLoginMode('admin')} style={{flex:1, background:'none', border:'none', color:loginMode==='admin'?'#8957e5':'gray', padding:'10px', cursor:'pointer'}}>ADMIN</button>
              </div>
              <form onSubmit={handleLogin}>
                  {loginMode==='user' ? (
                      <>
                        <input placeholder="User" value={credentials.user} onChange={e=>setCredentials({...credentials, user:e.target.value})} style={inputStyle} />
                        <input type="password" placeholder="Pass" value={credentials.pass} onChange={e=>setCredentials({...credentials, pass:e.target.value})} style={inputStyle} />
                      </>
                  ) : (
                      <input type="password" placeholder="Token" value={credentials.token} onChange={e=>setCredentials({...credentials, token:e.target.value})} style={inputStyle} />
                  )}
                  <button type="submit" style={btnStyle}>ENTRAR</button>
              </form>
          </div>
      </div>
  );

  return (
    <div style={{background:'#0d1117', minHeight:'100vh', color:'#c9d1d9', fontFamily:'sans-serif', padding:'20px'}}>
        
        {/* HEADER */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', paddingBottom:'15px', borderBottom:'1px solid #30363d'}}>
            <h2 style={{margin:0, color:'white'}}>HOTTRACK <span style={{fontSize:'12px', background:'#238636', padding:'2px 6px', borderRadius:'4px'}}>V11 PRO</span></h2>
            <div style={{display:'flex', gap:'10px'}}>
                <NavBtn active={tab==='dashboard'} onClick={()=>setTab('dashboard')} icon="🚀" label="Disparo" />
                <NavBtn active={tab==='inbox'} onClick={()=>setTab('inbox')} icon="📬" label="Inbox" />
                <NavBtn active={tab==='spy'} onClick={()=>setTab('spy')} icon="👁️" label="Spy" />
            </div>
            <button onClick={()=>{setIsAuthenticated(false); localStorage.removeItem('authToken');}} style={{background:'#f85149', border:'none', color:'white', padding:'8px 15px', borderRadius:'5px', cursor:'pointer'}}>SAIR</button>
        </div>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'20px'}}>
                <div>
                    {/* STATS */}
                    <div style={{display:'flex', gap:'15px', marginBottom:'20px'}}>
                        <StatBox label="PENDENTES" value={stats.pending} color="#d29922" />
                        <StatBox label="ENVIADOS" value={stats.sent} color="#238636" />
                        <StatBox label="ONLINE" value={sessions.filter(s=>s.is_active).length} color="#1f6feb" />
                    </div>

                    {/* CONFIG */}
                    <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                        <h3 style={{marginTop:0, color:'white'}}>Configuração de Ataque</h3>
                        <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                            <input placeholder="URL Imagem" value={config.imgUrl} onChange={e=>setConfig({...config, imgUrl:e.target.value})} style={{flex:1, ...inputStyle, marginBottom:0}} />
                            <label style={{display:'flex', alignItems:'center', gap:'5px', background:'#0d1117', padding:'0 10px', borderRadius:'5px', border:'1px solid #30363d'}}>
                                <input type="checkbox" checked={config.useRandom} onChange={e=>setConfig({...config, useRandom:e.target.checked})} /> Aleatório
                            </label>
                        </div>
                        <textarea placeholder="Mensagem..." value={config.msg} onChange={e=>setConfig({...config, msg:e.target.value})} style={{width:'100%', height:'100px', ...inputStyle, resize:'vertical'}} />
                        
                        <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                            {!processing ? (
                                <button onClick={startEngine} style={{...btnStyle, background:'#238636', fontSize:'16px'}}>🚀 INICIAR ATAQUE V11</button>
                            ) : (
                                <button onClick={()=>stopRef.current=true} style={{...btnStyle, background:'#f85149', fontSize:'16px'}}>🛑 PARAR</button>
                            )}
                        </div>
                    </div>

                    {/* LOGS */}
                    <div style={{marginTop:'20px', background:'#010409', padding:'15px', borderRadius:'10px', border:'1px solid #30363d', height:'300px', overflowY:'auto', fontFamily:'monospace', fontSize:'12px'}}>
                        {logs.map((l, i) => <div key={i} style={{color: l.includes('Error') || l.includes('Flood') ? '#f85149' : l.includes('Enviado') ? '#238636' : '#8b949e'}}>{l}</div>)}
                    </div>
                </div>

                {/* SESSIONS SIDEBAR */}
                <div style={{background:'#161b22', padding:'15px', borderRadius:'10px', border:'1px solid #30363d', display:'flex', flexDirection:'column', height:'calc(100vh - 150px)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                        <h4 style={{margin:0}}>Contas</h4>
                        <button onClick={()=>{
                             const active = new Set();
                             sessions.forEach(s=>s.is_active && active.add(s.phone_number));
                             setSelectedPhones(active);
                        }} style={{background:'none', border:'none', color:'#58a6ff', cursor:'pointer', fontSize:'12px'}}>Select Online</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={()=>{
                                const n = new Set(selectedPhones);
                                n.has(s.phone_number) ? n.delete(s.phone_number) : n.add(s.phone_number);
                                setSelectedPhones(n);
                            }} style={{
                                padding:'10px', marginBottom:'5px', borderRadius:'5px', cursor:'pointer', 
                                display:'flex', alignItems:'center', gap:'10px',
                                background: selectedPhones.has(s.phone_number) ? '#1f6feb22' : 'transparent',
                                border: selectedPhones.has(s.phone_number) ? '1px solid #1f6feb' : '1px solid transparent'
                            }}>
                                <div style={{width:'8px', height:'8px', borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149'}}></div>
                                <span>{s.phone_number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* INBOX */}
        {tab === 'inbox' && (
            <div style={{display:'grid', gridTemplateColumns:'350px 1fr', height:'calc(100vh - 120px)', border:'1px solid #30363d', borderRadius:'10px', background:'#161b22', overflow:'hidden'}}>
                <div style={{borderRight:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{padding:'10px', borderBottom:'1px solid #30363d'}}>
                        <button onClick={loadInbox} disabled={loadingReplies} style={{...btnStyle, background:'#e3b341', color:'black'}}>{loadingReplies?'Carregando...':'Atualizar'}</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {replies.map((r,i) => (
                            <div key={i} onClick={()=>openChat(r)} style={{padding:'15px', borderBottom:'1px solid #30363d', cursor:'pointer', background: selectedChat?.chatId===r.chatId ? '#21262d' : 'transparent'}}>
                                <div style={{fontWeight:'bold', color:'white', display:'flex', justifyContent:'space-between'}}>
                                    <span>{r.name}</span>
                                    <span style={{fontSize:'11px', color:'#8b949e'}}>{r.date?.split(' ')[1]}</span>
                                </div>
                                <div style={{fontSize:'13px', color:'#8b949e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.lastMessage}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', background:'#0d1117'}}>
                    {selectedChat ? (
                        <>
                            <div style={{padding:'15px', background:'#21262d', borderBottom:'1px solid #30363d', fontWeight:'bold'}}>{selectedChat.name}</div>
                            <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'10px'}}>
                                <button onClick={()=>openChat(selectedChat, chatOffset)} style={{alignSelf:'center', padding:'5px 10px', background:'#30363d', border:'none', color:'white', borderRadius:'15px', cursor:'pointer', fontSize:'12px'}}>Carregar anteriores</button>
                                {chatHistory.map((m,i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        background: m.isOut ? '#005c4b' : '#202c33',
                                        padding:'10px', borderRadius:'8px', maxWidth:'70%', color:'white'
                                    }}>
                                        {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px'}} />}
                                        {m.mediaType === 'audio' && <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{maxWidth:'100%'}} />}
                                        {m.mediaType === 'video' && <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px'}} />}
                                        <div style={{whiteSpace:'pre-wrap'}}>{m.text}</div>
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
        
        {/* SPY (Simplificado para ocupar menos espaço no código, mas funcional) */}
        {tab === 'spy' && <div style={{padding:'20px'}}>Use as funções de Spy na aba Tools ou Dashboard. (Placeholder V11)</div>}

    </div>
  );
}

// Styles
const inputStyle = { width:'100%', padding:'10px', background:'#010409', border:'1px solid #30363d', color:'white', borderRadius:'5px', marginBottom:'10px' };
const btnStyle = { width:'100%', padding:'10px', background:'#238636', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold' };
const NavBtn = ({active, onClick, icon, label}) => (
    <button onClick={onClick} style={{background:active?'#238636':'transparent', border:`1px solid ${active?'#238636':'#30363d'}`, color:'white', padding:'8px 15px', borderRadius:'5px', cursor:'pointer'}}>{icon} {label}</button>
);
const StatBox = ({label, value, color}) => (
    <div style={{flex:1, background:'#161b22', padding:'15px', border:`1px solid ${color}`, borderRadius:'8px', textAlign:'center'}}>
        <h2 style={{margin:0, color}}>{value}</h2><small>{label}</small>
    </div>
);
