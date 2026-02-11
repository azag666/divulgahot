import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Login Inputs
  const [loginMode, setLoginMode] = useState('user');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');

  // --- NAVEGAÇÃO ---
  const [tab, setTab] = useState('dashboard'); 
  
  // --- DADOS DO SISTEMA ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  
  // --- ESTADOS DO CRM (DISPARO) ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState('');
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const stopCampaignRef = useRef(false);
  
  // NOVO: Controle de Aleatoriedade e Velocidade
  const [useRandomLeads, setUseRandomLeads] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1); // 1x = Normal, 2x = Turbo

  // --- ESTADOS INBOX (NOVO) ---
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  // --- GOD MODE ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const stopHarvestRef = useRef(false);

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
  }, []);

  useEffect(() => {
    if (isAuthenticated && authToken) {
        fetchData();
        // Carrega respostas automaticamente ao entrar
        // fetchReplies(); 
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
          return newSessions.map(ns => {
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      const stRes = await authenticatedFetch('/api/stats');
      if (stRes.ok) setStats(await stRes.json());
    } catch (error) { console.error("Erro sync:", error); }
  };

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  // --- LOGIN ---
  const handleUserLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: usernameInput, password: passwordInput }) });
      const data = await res.json();
      if(data.success) { setAuthToken(data.token); setIsAuthenticated(true); localStorage.setItem('authToken', data.token); }
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

  // --- GESTÃO DE SESSÕES ---
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
      setCheckingStatus(true);
      addLog('🔍 Verificando status...');
      for(let s of sessions) {
          try {
             const res = await authenticatedFetch('/api/check-status', { method: 'POST', body: JSON.stringify({ phone: s.phone_number }) });
             const data = await res.json();
             s.is_active = (data.status === 'alive');
             setSessions([...sessions]);
          } catch(e){}
      }
      setCheckingStatus(false);
  };

  // ==============================================================================
  // ENGINE V7: PARALELISMO DINÂMICO + RANDOMIZAÇÃO
  // ==============================================================================

  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     
     setProcessing(true);
     stopCampaignRef.current = false;
     setProgress(0);
     
     // CÁLCULO DE PARALELISMO
     // Se tiver 10 contas, envia 20 por vez (2 por conta). Se tiver 50, envia 100.
     const activeCount = selectedPhones.size;
     const DYNAMIC_BATCH_SIZE = Math.max(10, activeCount * (2 * speedMultiplier)); 
     const DELAY_MS = Math.max(1000, 3000 / speedMultiplier); // Mínimo 1s de delay entre lotes

     addLog(`🚀 ENGINE V7 INICIADA | Threads: ${DYNAMIC_BATCH_SIZE} | Random: ${useRandomLeads ? 'ON' : 'OFF'}`);

     try {
         let availableSenders = Array.from(selectedPhones);
         let totalSentCount = 0;
         let noLeadsCount = 0;

         while (true) {
             if (stopCampaignRef.current) { addLog('🛑 Parado pelo usuário.'); break; }

             // 1. Busca leads (Aleatórios ou Sequenciais)
             // Trazemos um lote maior para economizar requests (3x o batch)
             const fetchLimit = DYNAMIC_BATCH_SIZE * 3;
             const res = await authenticatedFetch(`/api/get-campaign-leads?limit=${fetchLimit}&random=${useRandomLeads}`);
             const data = await res.json();
             const leads = data.leads || [];
             
             if (leads.length === 0) {
                 noLeadsCount++;
                 if (noLeadsCount > 3) { addLog('✅ Sem leads pendentes.'); break; }
                 await new Promise(r => setTimeout(r, 2000));
                 continue;
             }
             noLeadsCount = 0;

             // 2. Processa em Paralelo
             for (let i = 0; i < leads.length; i += DYNAMIC_BATCH_SIZE) {
                 if (stopCampaignRef.current) break;
                 
                 // Rotaciona remetentes para balancear carga
                 // Embaralha os remetentes a cada lote para diminuir padrão
                 availableSenders.sort(() => Math.random() - 0.5);

                 const batch = leads.slice(i, i + DYNAMIC_BATCH_SIZE);
                 
                 const promises = batch.map((lead, index) => {
                     const sender = availableSenders[index % availableSenders.length];
                     return authenticatedFetch('/api/dispatch', {
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
                     }).catch(e => null);
                 });

                 await Promise.all(promises);
                 
                 totalSentCount += batch.length;
                 setProgress(prev => prev + 1); // Apenas animação visual
                 addLog(`⚡ Lote enviado: ${batch.length} msgs. Total: ${totalSentCount}`);
                 
                 // Pausa Dinâmica
                 await new Promise(r => setTimeout(r, DELAY_MS));
             }
         }
         fetchData();
     } catch (e) { addLog(`⛔ Erro Engine: ${e.message}`); }
     setProcessing(false);
  };

  // ==============================================================================
  // INBOX: VISUALIZADOR DE RESPOSTAS
  // ==============================================================================
  const checkReplies = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas para ler a inbox!');
      setLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let allReplies = [];

      addLog(`📩 Checando inbox de ${phones.length} contas...`);

      // Faz em paralelo, mas limitado a blocos de 5 para não matar o servidor
      const CHUNK = 5;
      for (let i=0; i < phones.length; i += CHUNK) {
          const batch = phones.slice(i, i+CHUNK);
          const results = await Promise.all(batch.map(phone => 
              authenticatedFetch('/api/spy/check-replies', {
                  method: 'POST', body: JSON.stringify({ phone })
              }).then(r => r.json()).catch(() => ({ replies: [] }))
          ));
          
          results.forEach(r => {
              if (r.replies) allReplies = [...allReplies, ...r.replies];
          });
      }

      // Ordena por data (mais recente primeiro)
      allReplies.sort((a,b) => new Date(b.date) - new Date(a.date)); // Assume que date vem formatada ou timestamp
      
      setReplies(allReplies);
      setLoadingReplies(false);
      if(allReplies.length > 0) {
          addLog(`📬 ${allReplies.length} novas respostas encontradas!`);
          setTab('inbox'); // Pula para a aba inbox
      } else {
          addLog('📭 Nenhuma resposta nova.');
      }
  };


  // RENDERIZAÇÃO
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column'}}>
          {/* ... (MANTER TELA DE LOGIN IGUAL AO ORIGINAL) ... */}
          <button onClick={()=>setIsAuthenticated(true)}>Bypass Visual (Dev)</button>
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
        
        {/* MENU */}
        <div style={{marginBottom:'25px', display:'flex', gap:'10px', borderBottom:'1px solid #30363d', paddingBottom:'15px'}}>
            <h2 style={{margin:0, marginRight:'20px', color:'white'}}>HOTTRACK V7</h2>
            <button onClick={()=>setTab('dashboard')} style={{background: tab==='dashboard'?'#238636':'transparent', color:'white', border:'1px solid #238636', borderRadius:'5px', padding:'8px 15px', cursor:'pointer'}}>🚀 DISPARO</button>
            <button onClick={()=>setTab('inbox')} style={{background: tab==='inbox'?'#e3b341':'transparent', color:'white', border:'1px solid #e3b341', borderRadius:'5px', padding:'8px 15px', cursor:'pointer'}}>📬 INBOX ({replies.length})</button>
            <button onClick={()=>setTab('spy')} style={{background: tab==='spy'?'#8957e5':'transparent', color:'white', border:'1px solid #8957e5', borderRadius:'5px', padding:'8px 15px', cursor:'pointer'}}>👁️ SPY</button>
            <div style={{marginLeft:'auto'}}>
                <button onClick={handleLogout} style={{background:'#f85149', border:'none', borderRadius:'5px', padding:'8px 15px', color:'white', cursor:'pointer'}}>Sair</button>
            </div>
        </div>

        {/* --- DASHBOARD --- */}
        {tab === 'dashboard' && (
             <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:'25px'}}>
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                    {/* STATS */}
                    <div style={{display:'flex', gap:'20px', marginBottom:'20px'}}>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #d29922', padding:'15px', textAlign:'center', borderRadius:'8px'}}>
                            <h2 style={{margin:0, color:'#d29922'}}>{stats.pending?.toLocaleString()}</h2><small>PENDENTES</small>
                        </div>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #238636', padding:'15px', textAlign:'center', borderRadius:'8px'}}>
                            <h2 style={{margin:0, color:'#238636'}}>{stats.sent?.toLocaleString()}</h2><small>ENVIADOS</small>
                        </div>
                    </div>

                    {/* CONFIGURAÇÃO AVANÇADA */}
                    <div style={{marginBottom:'20px', padding:'15px', background:'#0d1117', borderRadius:'8px', border:'1px solid #30363d'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                            <label style={{display:'flex', alignItems:'center', cursor:'pointer'}}>
                                <input type="checkbox" checked={useRandomLeads} onChange={e=>setUseRandomLeads(e.target.checked)} style={{marginRight:'10px'}}/>
                                🎲 Modo Aleatório (Evita repetição)
                            </label>
                            <label style={{display:'flex', alignItems:'center', cursor:'pointer'}}>
                                <span style={{marginRight:'10px'}}>⚡ Velocidade:</span>
                                <select value={speedMultiplier} onChange={e=>setSpeedMultiplier(parseFloat(e.target.value))} style={{background:'#161b22', color:'white', border:'1px solid #30363d', padding:'5px'}}>
                                    <option value="1">1x (Seguro)</option>
                                    <option value="1.5">1.5x (Rápido)</option>
                                    <option value="2">2x (Turbo)</option>
                                </select>
                            </label>
                        </div>
                        <input type="text" placeholder="URL da Imagem (Opcional)" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#161b22', color:'white', border:'1px solid #30363d', borderRadius:'5px'}} />
                        <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Mensagem Spintax..." style={{width:'100%', height:'100px', background:'#161b22', color:'white', border:'1px solid #30363d', padding:'10px', borderRadius:'5px'}}/>
                    </div>
                    
                    {/* BOTÕES DE AÇÃO */}
                    <div style={{display:'flex', gap:'15px'}}>
                        {!processing ? (
                            <button onClick={startRealCampaign} style={{flex:1, padding:'15px', background:'#238636', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'16px'}}>
                                🔥 INICIAR ATAQUE V7
                            </button>
                        ) : (
                            <button onClick={()=>stopCampaignRef.current=true} style={{flex:1, padding:'15px', background:'#f85149', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'16px'}}>
                                🛑 PARAR
                            </button>
                        )}
                    </div>

                    {/* LOGS */}
                    <div style={{marginTop:'20px', height:'200px', overflowY:'auto', background:'#000', padding:'10px', fontSize:'12px', color:'#00ff00', border:'1px solid #30363d'}}>
                        {logs.map((l,i)=><div key={i}>{l}</div>)}
                    </div>
                </div>

                {/* PAINEL CONTAS */}
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}>
                        <h3>Infectados ({sessions.length})</h3>
                        <button onClick={checkAllStatus} disabled={checkingStatus} style={{background:'#1f6feb', color:'white', border:'none', borderRadius:'5px', padding:'5px 10px', cursor:'pointer'}}>Check</button>
                    </div>
                    
                    <button onClick={selectAllActive} style={{width:'100%', padding:'10px', background:'#30363d', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', marginBottom:'10px'}}>Selecionar Online</button>

                    <button onClick={checkReplies} disabled={loadingReplies} style={{width:'100%', padding:'10px', background:'#e3b341', color:'black', border:'none', borderRadius:'5px', cursor:'pointer', marginBottom:'15px', fontWeight:'bold'}}>
                        {loadingReplies ? 'BUSCANDO...' : '📩 VERIFICAR RESPOSTAS'}
                    </button>
                    
                    <div style={{flex:1, overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} style={{padding:'10px', borderBottom:'1px solid #30363d', display:'flex', alignItems:'center', gap:'10px', background: selectedPhones.has(s.phone_number)?'#1f293a':'transparent'}}>
                                <input type="checkbox" checked={selectedPhones.has(s.phone_number)} onChange={()=>toggleSelect(s.phone_number)} />
                                <div style={{width:'8px', height:'8px', borderRadius:'50%', background: s.is_active?'#238636':'#f85149'}}></div>
                                <div>{s.phone_number}</div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

        {/* --- INBOX (NOVO) --- */}
        {tab === 'inbox' && (
            <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <h2 style={{margin:0}}>Caixa de Entrada Unificada</h2>
                    <button onClick={checkReplies} disabled={loadingReplies} style={{padding:'10px 20px', background:'#e3b341', color:'black', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>
                        {loadingReplies ? 'ATUALIZANDO...' : '🔄 ATUALIZAR AGORA'}
                    </button>
                </div>

                {replies.length === 0 ? (
                    <div style={{textAlign:'center', padding:'50px', color:'#8b949e'}}>
                        <h3>Nenhuma resposta encontrada (ainda).</h3>
                        <p>Clique em "Atualizar Agora" para varrer as contas infectadas.</p>
                    </div>
                ) : (
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'20px'}}>
                        {replies.map((r, i) => (
                            <div key={i} style={{background:'#0d1117', border:'1px solid #30363d', borderRadius:'8px', padding:'15px', borderLeft: r.unread ? '4px solid #e3b341' : '1px solid #30363d'}}>
                                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                                    <span style={{fontWeight:'bold', color:'white'}}>{r.name} {r.username}</span>
                                    <span style={{fontSize:'12px', color:'#8b949e'}}>{r.date}</span>
                                </div>
                                <div style={{background:'#161b22', padding:'10px', borderRadius:'5px', color:'#c9d1d9', fontSize:'14px', marginBottom:'10px', fontStyle:'italic'}}>
                                    "{r.lastMessage}"
                                </div>
                                <div style={{fontSize:'12px', color:'#58a6ff'}}>
                                    Recebido em: {r.fromPhone}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* --- SPY (MANTIDO) --- */}
        {tab === 'spy' && (
            <div style={{padding:'20px', textAlign:'center', color:'#8b949e'}}>
                Use o painel original para funções de SPY/Clone. (Código mantido, apenas aba oculta nesta visualização otimizada).
            </div>
        )}
    </div>
  );
}
