import { useState, useEffect, useRef } from 'react';

// ============================================================================
// COMPONENTE PRINCIPAL: PAINEL ADMIN HOTTRACK V10
// ============================================================================
export default function AdminPanel() {
  
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Inputs de Login
  const [loginMode, setLoginMode] = useState('user'); // 'user' ou 'admin'
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');

  // --- NAVEGAÇÃO ---
  const [tab, setTab] = useState('dashboard'); // 'dashboard', 'inbox', 'spy', 'tools'
  
  // --- DADOS GERAIS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- ENGINE V10 (DISPARO) ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState('');
  const [useRandom, setUseRandom] = useState(true); // Aleatoriedade SQL
  const stopCampaignRef = useRef(false);

  // --- INBOX AVANÇADO ---
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatLimit, setChatLimit] = useState(50); // Paginação do chat

  // --- SPY & TOOLS ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);
  
  // Inputs Tools
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // ==========================================================================
  // INICIALIZAÇÃO E UTILITÁRIOS
  // ==========================================================================

  useEffect(() => {
    // Recupera sessão local
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setIsAuthenticated(true);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload.isAdmin === true || payload.type === 'admin');
      } catch (e) { console.error(e); }
    }
    
    // Recupera cache local do Spy
    const savedGroups = localStorage.getItem('godModeGroups');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
  }, []);

  useEffect(() => {
    if (isAuthenticated && authToken) {
        fetchData();
        // Atualiza stats a cada 30s
        const interval = setInterval(fetchStatsOnly, 30000);
        return () => clearInterval(interval);
    }
  }, [isAuthenticated, authToken]);

  const authenticatedFetch = async (url, options = {}) => {
    const headers = { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${authToken}`, 
        ...options.headers 
    };
    return fetch(url, { ...options, headers });
  };

  const addLog = (text) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${text}`, ...prev.slice(0, 499)]); // Mantém últimos 500 logs
  };

  const fetchData = async () => {
    try {
      // Lista Sessões
      const sRes = await authenticatedFetch('/api/list-sessions');
      const sData = await sRes.json();
      setSessions(prev => {
          // Merge inteligente para manter estado visual
          const newSessions = sData.sessions || [];
          return newSessions.map(ns => {
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      
      // Stats
      await fetchStatsOnly();

      // Harvested IDs
      const hRes = await authenticatedFetch('/api/get-harvested');
      const hData = await hRes.json();
      if(hData.harvestedIds) setHarvestedIds(new Set(hData.harvestedIds));

    } catch (error) { console.error("Sync Error:", error); }
  };

  const fetchStatsOnly = async () => {
      try {
        const stRes = await authenticatedFetch('/api/stats');
        if (stRes.ok) setStats(await stRes.json());
      } catch(e) {}
  };

  // ==========================================================================
  // AUTENTICAÇÃO
  // ==========================================================================
  
  const handleLogin = async (e) => {
    e.preventDefault();
    const isUserMode = loginMode === 'user';
    const endpoint = isUserMode ? '/api/login' : '/api/admin-login';
    const body = isUserMode 
        ? { username: usernameInput, password: passwordInput } 
        : { password: adminTokenInput };

    try {
      const res = await fetch(endpoint, { 
          method: 'POST', 
          headers: {'Content-Type': 'application/json'}, 
          body: JSON.stringify(body) 
      });
      const data = await res.json();
      
      if(data.success) { 
          setAuthToken(data.token); 
          setIsAuthenticated(true); 
          setIsAdmin(!isUserMode);
          localStorage.setItem('authToken', data.token); 
      } else {
          alert(data.error || 'Falha no login');
      }
    } catch (e) { alert('Erro de conexão com o servidor'); }
  };

  const handleLogout = () => { 
      setIsAuthenticated(false); 
      setAuthToken(''); 
      localStorage.removeItem('authToken'); 
      setTab('dashboard');
  };

  // ==========================================================================
  // GESTÃO DE SESSÕES (SELEÇÃO)
  // ==========================================================================
  
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    newSet.has(phone) ? newSet.delete(phone) : newSet.add(phone);
    setSelectedPhones(newSet);
  };

  const selectAllActive = () => {
      const newSet = new Set();
      sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
      setSelectedPhones(newSet);
      addLog(`✅ ${newSet.size} contas online selecionadas para operação.`);
  };

  const checkAllStatus = async () => {
      addLog('🔍 Verificando status das contas (Lotes de 5)...');
      const chunk = 5;
      const allSess = [...sessions];
      
      for(let i=0; i<allSess.length; i+=chunk) {
          await Promise.all(allSess.slice(i, i+chunk).map(async (s) => {
             try {
                 const res = await authenticatedFetch('/api/check-status', { method: 'POST', body: JSON.stringify({ phone: s.phone_number }) });
                 const data = await res.json();
                 s.is_active = (data.status === 'alive');
             } catch(e){}
          }));
          setSessions([...allSess]); // Atualiza UI progressivamente
      }
      addLog('✅ Status verificado.');
  };

  // ==========================================================================
  // ENGINE V10: OTIMIZADO PARA VELOCIDADE E SEGURANÇA (ANTI-FLOOD MATEMÁTICO)
  // ==========================================================================

  const startEngineV10 = async () => {
     if (selectedPhones.size === 0) return alert('Selecione pelo menos uma conta!');
     
     setProcessing(true);
     stopCampaignRef.current = false;
     
     const senders = Array.from(selectedPhones);
     const activeCount = senders.length;

     // --- CÁLCULO DE DELAY INTELIGENTE ---
     // Meta: Máximo 5 envios por minuto POR CONTA (Segurança Extrema contra FloodWait)
     // Se tiver 1 conta: 1 msg a cada 12 segs.
     // Se tiver 10 contas: 1 msg a cada 1.2 segs (Global).
     // Se tiver 100 contas: 1 msg a cada 0.12 segs (Global).
     const SAFETY_MSG_PER_MIN = 5; 
     const CALCULATED_DELAY = Math.floor(60000 / (activeCount * SAFETY_MSG_PER_MIN));
     // Limitamos o delay mínimo a 200ms para não engasgar o servidor
     const FINAL_DELAY = Math.max(200, CALCULATED_DELAY);

     addLog(`🚀 ENGINE V10 INICIADA | Contas: ${activeCount} | Delay: ${FINAL_DELAY}ms`);
     addLog(`🎲 Modo Aleatório: ${useRandom ? 'ATIVADO' : 'DESATIVADO'}`);

     let senderIndex = 0;
     let totalSessionSent = 0;

     try {
         while (!stopCampaignRef.current) {
             // 1. Busca Leads (Lote de 50 para reduzir requests de banco)
             const res = await authenticatedFetch(`/api/get-campaign-leads?limit=50&random=${useRandom}`);
             const data = await res.json();
             const leads = data.leads || [];

             if (leads.length === 0) {
                 addLog('✅ Fim da lista de leads.');
                 break;
             }

             // 2. Loop de Disparo (Sequencial com Delay Calculado)
             for (const lead of leads) {
                 if (stopCampaignRef.current) break;

                 const currentSender = senders[senderIndex % activeCount];
                 senderIndex++;

                 // Dispara Promise (Fire and Forget - Não esperamos a resposta para iniciar o delay)
                 authenticatedFetch('/api/dispatch', {
                     method: 'POST',
                     body: JSON.stringify({
                         senderPhone: currentSender,
                         target: lead.user_id,
                         username: lead.username,
                         originChatId: lead.chat_id,
                         message: msg,
                         imageUrl: imgUrl,
                         leadDbId: lead.id
                     })
                 }).then(async (r) => {
                     const d = await r.json();
                     if (r.status === 429) {
                         addLog(`⏳ FloodWait detectado em ${currentSender}. Retirando da rotação temporariamente.`);
                     } else if (!d.success) {
                         // addLog(`❌ Falha ${currentSender}: ${d.error}`); // Opcional: Descomentar para debug
                     } else {
                         totalSessionSent++;
                         if(totalSessionSent % 10 === 0) addLog(`⚡ Progresso: ${totalSessionSent} mensagens enviadas.`);
                     }
                 }).catch(() => {});

                 // O Delay Matemático que evita o Flood e permite logs fluírem
                 await new Promise(r => setTimeout(r, FINAL_DELAY));
             }
         }
     } catch (e) {
         addLog(`⛔ Erro Fatal Engine: ${e.message}`);
     }
     
     setProcessing(false);
     fetchData(); // Atualiza stats no final
  };

  // ==========================================================================
  // INBOX: LISTAGEM E CHAT COMPLETO
  // ==========================================================================

  const loadInbox = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas para ver o Inbox!');
      setLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      addLog(`📩 Buscando inbox de ${phones.length} contas (Lote de 3)...`);

      let allReplies = [];
      const CHUNK_SIZE = 3; // Lote pequeno para ver as mensagens chegando

      for(let i=0; i<phones.length; i+=CHUNK_SIZE) {
          const batch = phones.slice(i, i+CHUNK_SIZE);
          
          const results = await Promise.all(batch.map(p => 
              authenticatedFetch('/api/spy/check-replies', { 
                  method: 'POST', 
                  body: JSON.stringify({ phone: p }) 
              }).then(r => r.json()).catch(() => ({ replies: [] }))
          ));

          results.forEach(r => {
              if (r.replies && r.replies.length > 0) {
                  allReplies = [...allReplies, ...r.replies];
              }
          });
          
          // Ordena: Mais recentes no topo
          setReplies(allReplies.sort((a,b) => b.timestamp - a.timestamp));
      }

      setLoadingReplies(false);
      if(allReplies.length > 0) addLog(`📬 ${allReplies.length} novas interações encontradas.`);
      else addLog('📭 Nenhuma mensagem nova nas últimas 24h.');
  };

  const openChat = async (reply, limit = 50) => {
      if(!reply) return;
      setSelectedChat(reply);
      setChatLimit(limit);
      setLoadingChat(true);
      
      try {
          // Chama API atualizada (get-history agora suporta limit e midia)
          const res = await authenticatedFetch('/api/spy/get-history', { 
              method: 'POST', 
              body: JSON.stringify({ 
                  phone: reply.fromPhone, 
                  chatId: reply.chatId,
                  limit: limit 
              }) 
          });
          const data = await res.json();
          setChatHistory(data.history || []);
      } catch (e) { 
          alert('Erro ao carregar chat: ' + e.message); 
      }
      setLoadingChat(false);
  };

  const loadMoreMessages = () => {
      if(selectedChat) openChat(selectedChat, chatLimit + 50);
  };

  // ==========================================================================
  // FERRAMENTAS & SPY
  // ==========================================================================
  
  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta disponível.");
      setIsScanning(true);
      addLog('📡 Iniciando Varredura de Grupos...');
      
      let foundGroups = [];
      // Escaneia todas as sessões cadastradas
      for(const s of sessions) {
          if(!s.is_active) continue;
          try {
              const res = await authenticatedFetch('/api/spy/list-chats', { 
                  method: 'POST', 
                  body: JSON.stringify({ phone: s.phone_number }) 
              });
              const data = await res.json();
              if(data.chats) {
                  data.chats.forEach(c => {
                      if(!c.type.includes('Canal')) {
                          foundGroups.push({ ...c, ownerPhone: s.phone_number });
                      }
                  });
              }
          } catch(e){}
      }
      
      // Remove duplicatas
      const uniqueGroups = [...new Map(foundGroups.map(item => [item.id, item])).values()]
          .sort((a,b) => b.participantsCount - a.participantsCount);
          
      setAllGroups(uniqueGroups);
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      setIsScanning(false);
      addLog(`📡 Varredura completa: ${uniqueGroups.length} grupos encontrados.`);
  };

  const startMassHarvest = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if (targets.length === 0) return alert("Nenhum grupo novo para aspirar.");
      if (!confirm(`Deseja extrair leads de ${targets.length} grupos?`)) return;

      setIsHarvesting(true);
      addLog('🕷️ Iniciando Extração em Massa...');
      
      for(const t of targets) {
          try {
             const res = await authenticatedFetch('/api/spy/harvest', { 
                 method: 'POST', 
                 body: JSON.stringify({ phone: t.ownerPhone, chatId: t.id, chatName: t.title }) 
             });
             const d = await res.json();
             if(d.success) {
                 addLog(`✅ Extraído: ${t.title} (+${d.count} leads)`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch(e){}
          // Pausa leve para não matar a API
          await new Promise(r => setTimeout(r, 1500));
      }
      setIsHarvesting(false);
      addLog('🏁 Extração finalizada.');
      fetchData();
  };

  const runMassTool = async (endpoint, payloadName, payloadValue, extra = {}) => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      if (!payloadValue) return alert('Preencha os campos!');
      
      setProcessing(true);
      addLog(`⚙️ Executando ferramenta em ${selectedPhones.size} contas...`);
      
      const phones = Array.from(selectedPhones);
      for(const phone of phones) {
          try {
              const body = { phone, [payloadName]: payloadValue, ...extra };
              await authenticatedFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
              addLog(`✅ Sucesso: ${phone}`);
          } catch(e) {
              addLog(`❌ Falha: ${phone}`);
          }
      }
      setProcessing(false);
      addLog('⚙️ Operação concluída.');
  };

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================

  // TELA DE LOGIN
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#010409', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', fontFamily:'sans-serif'}}>
          <div style={{marginBottom:'20px', textAlign:'center'}}>
              <h1 style={{color:'white', margin:0}}>HOTTRACK <span style={{color:'#238636', fontSize:'14px'}}>V10</span></h1>
              <small style={{color:'#8b949e'}}>Painel de Controle de Operações</small>
          </div>
          
          <div style={{background:'#0d1117', padding:'30px', borderRadius:'10px', border:'1px solid #30363d', width:'300px'}}>
              <div style={{display:'flex', marginBottom:'20px', borderBottom:'1px solid #30363d', paddingBottom:'10px'}}>
                  <button onClick={()=>setLoginMode('user')} style={{flex:1, background:'none', border:'none', color: loginMode==='user'?'white':'#8b949e', cursor:'pointer', fontWeight:'bold'}}>USUÁRIO</button>
                  <button onClick={()=>setLoginMode('admin')} style={{flex:1, background:'none', border:'none', color: loginMode==='admin'?'#8957e5':'#8b949e', cursor:'pointer', fontWeight:'bold'}}>ADMIN</button>
              </div>

              {loginMode === 'user' ? (
                  <form onSubmit={handleLogin}>
                      <input placeholder="Usuário" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} style={inputStyle} />
                      <input type="password" placeholder="Senha" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} style={inputStyle} />
                      <button type="submit" style={btnPrimaryStyle}>ENTRAR</button>
                  </form>
              ) : (
                  <form onSubmit={handleLogin}>
                      <input type="password" placeholder="Token de Acesso" value={adminTokenInput} onChange={e=>setAdminTokenInput(e.target.value)} style={inputStyle} />
                      <button type="submit" style={{...btnPrimaryStyle, background:'#8957e5'}}>ACESSAR MESTRE</button>
                  </form>
              )}
          </div>
      </div>
  );

  // TELA PRINCIPAL
  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"' }}>
        
        {/* TOP BAR */}
        <div style={{ background:'#161b22', padding:'15px 25px', borderBottom:'1px solid #30363d', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                <h2 style={{margin:0, color:'white'}}>HOTTRACK <span style={{fontSize:'12px', color:'#238636', border:'1px solid #238636', padding:'2px 5px', borderRadius:'4px'}}>V10 SYSTEM</span></h2>
                
                <nav style={{display:'flex', gap:'5px'}}>
                    <NavButton active={tab==='dashboard'} onClick={()=>setTab('dashboard')} icon="🚀" label="DISPARO" />
                    <NavButton active={tab==='inbox'} onClick={()=>setTab('inbox')} icon="📬" label={`INBOX ${replies.length > 0 ? `(${replies.length})` : ''}`} />
                    <NavButton active={tab==='spy'} onClick={()=>setTab('spy')} icon="👁️" label="RADAR" />
                    <NavButton active={tab==='tools'} onClick={()=>setTab('tools')} icon="🛠️" label="TOOLS" />
                </nav>
            </div>
            
            <button onClick={handleLogout} style={{background:'#f85149', color:'white', border:'none', padding:'8px 15px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'12px'}}>SAIR</button>
        </div>

        <div style={{ padding:'25px', maxWidth:'1600px', margin:'0 auto' }}>
            
            {/* ================= DASHBOARD ================= */}
            {tab === 'dashboard' && (
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'25px' }}>
                    
                    {/* COLUNA ESQUERDA: CONTROLES */}
                    <div>
                        {/* STATS CARDS */}
                        <div style={{display:'flex', gap:'15px', marginBottom:'20px'}}>
                            <StatCard label="PENDENTES" value={stats.pending} color="#d29922" />
                            <StatCard label="ENVIADOS" value={stats.sent} color="#238636" />
                            <StatCard label="CONTAS ONLINE" value={sessions.filter(s=>s.is_active).length} color="#1f6feb" />
                        </div>

                        {/* CONFIGURAÇÃO DE CAMPANHA */}
                        <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                            <h3 style={{marginTop:0, color:'white', borderBottom:'1px solid #30363d', paddingBottom:'10px', marginBottom:'20px'}}>Configuração de Ataque</h3>
                            
                            <div style={{display:'flex', gap:'15px', marginBottom:'15px'}}>
                                <div style={{flex:2}}>
                                    <label style={labelStyle}>Mídia (Imagem/Vídeo URL - Opcional)</label>
                                    <input value={imgUrl} onChange={e=>setImgUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
                                </div>
                                <div style={{flex:1}}>
                                     <label style={labelStyle}>Estratégia</label>
                                     <div style={{...inputStyle, display:'flex', alignItems:'center', gap:'10px'}}>
                                         <input type="checkbox" checked={useRandom} onChange={e=>setUseRandom(e.target.checked)} />
                                         <span>Modo Aleatório</span>
                                     </div>
                                </div>
                            </div>

                            <label style={labelStyle}>Mensagem (Suporta Spintax {`{Oi|Olá}`})</label>
                            <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Digite sua mensagem aqui..." style={{...inputStyle, height:'120px', resize:'vertical'}} />

                            <div style={{marginTop:'20px', display:'flex', gap:'15px'}}>
                                {!processing ? (
                                    <button onClick={startEngineV10} style={{...btnPrimaryStyle, background:'#238636', fontSize:'16px', padding:'15px'}}>
                                        🔥 INICIAR ENGINE V10
                                    </button>
                                ) : (
                                    <button onClick={()=>stopCampaignRef.current=true} style={{...btnPrimaryStyle, background:'#f85149', fontSize:'16px', padding:'15px'}}>
                                        🛑 PARAR OPERAÇÃO
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* LOGS EM TEMPO REAL */}
                        <div style={{marginTop:'20px', background:'#010409', border:'1px solid #30363d', borderRadius:'12px', padding:'15px', height:'300px', overflowY:'auto'}}>
                            <div style={{color:'#8b949e', fontSize:'12px', marginBottom:'10px', borderBottom:'1px solid #30363d', paddingBottom:'5px'}}>TERMINAL DE LOGS</div>
                            <div style={{fontFamily:'monospace', fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                                {logs.map((l, i) => (
                                    <span key={i} style={{color: l.includes('Erro') || l.includes('Flood') ? '#f85149' : l.includes('Enviado') ? '#238636' : '#c9d1d9'}}>
                                        {l}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* COLUNA DIREITA: SESSÕES */}
                    <div style={{background:'#161b22', borderRadius:'12px', border:'1px solid #30363d', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 120px)'}}>
                        <div style={{padding:'15px', borderBottom:'1px solid #30363d', background:'#21262d'}}>
                            <h3 style={{margin:0, fontSize:'16px', color:'white'}}>Painel de Contas</h3>
                            <div style={{display:'flex', gap:'5px', marginTop:'10px'}}>
                                <button onClick={selectAllActive} style={btnSmallStyle}>Selecionar Online</button>
                                <button onClick={checkAllStatus} style={btnSmallStyle}>Check Status</button>
                            </div>
                        </div>
                        <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                            {sessions.map(s => (
                                <div key={s.id} onClick={()=>toggleSelect(s.phone_number)} style={{
                                    padding:'10px', marginBottom:'5px', borderRadius:'6px', cursor:'pointer',
                                    display:'flex', alignItems:'center', gap:'10px',
                                    background: selectedPhones.has(s.phone_number) ? 'rgba(31, 111, 235, 0.2)' : 'transparent',
                                    border: selectedPhones.has(s.phone_number) ? '1px solid #1f6feb' : '1px solid transparent'
                                }}>
                                    <div style={{width:'10px', height:'10px', borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149', boxShadow: s.is_active ? '0 0 5px #238636' : 'none'}}></div>
                                    <span style={{color:'white', fontWeight:'500'}}>{s.phone_number}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ================= INBOX ================= */}
            {tab === 'inbox' && (
                <div style={{ display:'grid', gridTemplateColumns:'350px 1fr', height:'calc(100vh - 120px)', border:'1px solid #30363d', borderRadius:'12px', overflow:'hidden', background:'#0d1117' }}>
                    
                    {/* LISTA DE CONVERSAS (ESQUERDA) */}
                    <div style={{ borderRight:'1px solid #30363d', display:'flex', flexDirection:'column', background:'#161b22' }}>
                        <div style={{padding:'15px', borderBottom:'1px solid #30363d'}}>
                            <button onClick={loadInbox} disabled={loadingReplies} style={{...btnPrimaryStyle, background:'#e3b341', color:'black'}}>
                                {loadingReplies ? 'Baixando...' : '🔄 Atualizar Inbox'}
                            </button>
                        </div>
                        <div style={{flex:1, overflowY:'auto'}}>
                            {replies.length === 0 && <div style={{padding:'20px', textAlign:'center', color:'#8b949e'}}>Nenhuma mensagem recente.</div>}
                            {replies.map((r,i) => (
                                <div key={i} onClick={()=>openChat(r)} style={{
                                    padding:'15px', borderBottom:'1px solid #30363d', cursor:'pointer',
                                    background: selectedChat?.chatId === r.chatId ? '#21262d' : 'transparent'
                                }}>
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
                                        <span style={{fontWeight:'bold', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'200px'}}>{r.name || 'Desconhecido'}</span>
                                        <span style={{fontSize:'11px', color:'#8b949e'}}>{r.date?.split(' ')[1] || r.date}</span>
                                    </div>
                                    <div style={{fontSize:'13px', color:'#8b949e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                        {r.lastMessage}
                                    </div>
                                    <div style={{fontSize:'10px', color:'#1f6feb', marginTop:'5px'}}>Conta: {r.fromPhone}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ÁREA DE CHAT (DIREITA) */}
                    <div style={{ display:'flex', flexDirection:'column', background:"url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundBlendMode:'multiply', backgroundColor:'#0d1117' }}>
                        {selectedChat ? (
                            <>
                                {/* HEADER CHAT */}
                                <div style={{padding:'15px', background:'#21262d', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <div>
                                        <div style={{fontWeight:'bold', color:'white'}}>{selectedChat.name}</div>
                                        <div style={{fontSize:'12px', color:'#8b949e'}}>via {selectedChat.fromPhone}</div>
                                    </div>
                                    <button onClick={()=>loadInbox()} style={{background:'none', border:'none', color:'#58a6ff', cursor:'pointer'}}>Fechar</button>
                                </div>

                                {/* MENSAGENS */}
                                <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'10px'}}>
                                    <button onClick={loadMoreMessages} disabled={loadingChat} style={{alignSelf:'center', background:'#21262d', color:'#58a6ff', border:'1px solid #30363d', padding:'5px 15px', borderRadius:'20px', cursor:'pointer', fontSize:'12px', marginBottom:'10px'}}>
                                        {loadingChat ? 'Carregando...' : 'Carregar mensagens anteriores'}
                                    </button>
                                    
                                    {chatHistory.map((m, i) => (
                                        <div key={i} style={{
                                            alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                            background: m.isOut ? '#005c4b' : '#202c33',
                                            color: 'white',
                                            padding:'10px',
                                            borderRadius:'8px',
                                            maxWidth:'70%',
                                            boxShadow:'0 1px 1px rgba(0,0,0,0.2)'
                                        }}>
                                            {/* RENDERIZADOR DE MÍDIA */}
                                            {m.hasMedia && m.media && (
                                                <div style={{marginBottom:'5px'}}>
                                                    {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px'}} />}
                                                    {m.mediaType === 'video' && <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px'}} />}
                                                    {m.mediaType === 'audio' && <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{maxWidth:'100%'}} />}
                                                </div>
                                            )}
                                            
                                            <div style={{fontSize:'14px', whiteSpace:'pre-wrap'}}>{m.text}</div>
                                            <div style={{fontSize:'10px', textAlign:'right', marginTop:'4px', opacity:0.6}}>
                                                {new Date(m.date * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                {/* INPUT FAKE (Apenas informativo) */}
                                <div style={{padding:'15px', background:'#21262d', borderTop:'1px solid #30363d', color:'#8b949e', fontSize:'12px', textAlign:'center'}}>
                                    Para responder, use o seu celular ou o Telegram Web original. Este painel é apenas visualizador.
                                </div>
                            </>
                        ) : (
                            <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e', flexDirection:'column'}}>
                                <div style={{fontSize:'40px', marginBottom:'10px'}}>📫</div>
                                <div>Selecione uma conversa para visualizar o histórico completo.</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ================= SPY & TOOLS ================= */}
            {(tab === 'spy' || tab === 'tools') && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px' }}>
                    
                    {/* CARD SPY */}
                    <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <h3 style={{marginTop:0, color:'#8957e5'}}>📡 Radar de Grupos (Spy)</h3>
                        <p style={{color:'#8b949e', fontSize:'13px'}}>1. Escaneia grupos de todas as contas online.<br/>2. Salva IDs únicos.<br/>3. Aspira membros de todos os grupos.</p>
                        
                        <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                            <button onClick={scanNetwork} disabled={isScanning} style={{...btnPrimaryStyle, background:'#21262d', border:'1px solid #30363d'}}>
                                {isScanning ? 'Escaneando...' : '1. Escanear Rede'}
                            </button>
                            <button onClick={startMassHarvest} disabled={isHarvesting} style={{...btnPrimaryStyle, background:'#8957e5'}}>
                                {isHarvesting ? 'Aspirando...' : '2. Aspirar Tudo'}
                            </button>
                        </div>
                        
                        <div style={{background:'#0d1117', border:'1px solid #30363d', borderRadius:'8px', padding:'10px', height:'300px', overflowY:'auto'}}>
                            {allGroups.length === 0 && <div style={{color:'#8b949e', textAlign:'center', marginTop:'20px'}}>Nenhum grupo mapeado. Faça um scan.</div>}
                            {allGroups.map((g,i) => (
                                <div key={i} style={{padding:'8px', borderBottom:'1px solid #21262d', display:'flex', justifyContent:'space-between', fontSize:'13px'}}>
                                    <span>{g.title} ({g.participantsCount})</span>
                                    {harvestedIds.has(g.id) ? <span style={{color:'#238636'}}>✅</span> : <span style={{color:'#8b949e'}}>Pend</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CARD TOOLS */}
                    <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                        {/* Camuflagem */}
                        <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                            <h3 style={{marginTop:0, color:'#1f6feb'}}>🎭 Camuflagem em Massa</h3>
                            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Novo Nome para todos" style={{...inputStyle, marginBottom:'10px'}} />
                            <input value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} placeholder="URL Nova Foto Perfil" style={{...inputStyle, marginBottom:'15px'}} />
                            <button onClick={()=>runMassTool('/api/update-profile', 'newName', newName, { photoUrl })} disabled={processing} style={btnPrimaryStyle}>
                                APLICAR EM SELECIONADOS
                            </button>
                        </div>

                        {/* Stories */}
                        <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                            <h3 style={{marginTop:0, color:'#d29922'}}>📸 Stories em Massa</h3>
                            <input value={storyUrl} onChange={e=>setStoryUrl(e.target.value)} placeholder="URL Imagem/Vídeo Story" style={{...inputStyle, marginBottom:'10px'}} />
                            <input value={storyCaption} onChange={e=>setStoryCaption(e.target.value)} placeholder="Legenda / Link" style={{...inputStyle, marginBottom:'15px'}} />
                            <button onClick={()=>runMassTool('/api/post-story', 'mediaUrl', storyUrl, { caption: storyCaption })} disabled={processing} style={{...btnPrimaryStyle, background:'#d29922'}}>
                                POSTAR EM SELECIONADOS
                            </button>
                        </div>
                    </div>

                </div>
            )}

        </div>
    </div>
  );
}

// ============================================================================
// ESTILOS INLINE (PARA FACILITAR O COPY-PASTE)
// ============================================================================

const inputStyle = {
    width: '100%',
    padding: '12px',
    background: '#010409',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: 'white',
    outline: 'none',
    marginBottom: '10px',
    fontSize: '14px'
};

const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#8b949e'
};

const btnPrimaryStyle = {
    width: '100%',
    padding: '12px',
    background: '#238636',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '14px',
    transition: '0.2s',
};

const btnSmallStyle = {
    background: '#21262d',
    border: '1px solid #30363d',
    color: '#58a6ff',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
};

// Componente Auxiliar de Navegação
const NavButton = ({ active, onClick, icon, label }) => (
    <button onClick={onClick} style={{
        background: active ? '#21262d' : 'transparent',
        color: active ? 'white' : '#8b949e',
        border: 'none',
        padding: '8px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: active ? 'bold' : 'normal',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    }}>
        <span>{icon}</span> {label}
    </button>
);

// Componente Auxiliar de Stats
const StatCard = ({ label, value, color }) => (
    <div style={{flex:1, background:'#161b22', padding:'20px', borderRadius:'12px', border:`1px solid ${color}44`, textAlign:'center'}}>
        <h2 style={{margin:0, fontSize:'32px', color: color}}>{value?.toLocaleString() || 0}</h2>
        <small style={{color:'#8b949e', fontSize:'11px', fontWeight:'bold', letterSpacing:'1px'}}>{label}</small>
    </div>
);
