import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [ownerId, setOwnerId] = useState(''); 
  
  const [tab, setTab] = useState('dashboard'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState(''); 
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const stopCampaignRef = useRef(false);

  // --- OUTROS ESTADOS (God Mode, Tools) MANTIDOS IGUAIS ---
  // (Copie os estados do arquivo anterior para allGroups, allChannels, etc...)
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterNumber, setFilterNumber] = useState('');
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const [totalHarvestedSession, setTotalHarvestedSession] = useState(0);
  const stopHarvestRef = useRef(false);
  const [viewingChat, setViewingChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    const savedOwner = localStorage.getItem('hottrack_owner');
    if (savedOwner) {
        setOwnerId(savedOwner);
        setIsAuthenticated(true);
        fetchData(savedOwner);
    }
    // ... Recuperar God Mode local storage ...
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
          setOwnerId(data.ownerId);
          localStorage.setItem('hottrack_owner', data.ownerId);
          fetchData(data.ownerId);
      } else { alert('Senha incorreta'); }
    } catch (e) { alert('Erro de conexão'); }
  };

  const logout = () => { localStorage.removeItem('hottrack_owner'); window.location.reload(); };

  const fetchData = async (currentOwner = ownerId) => {
    if (!currentOwner) return;
    try {
      const sRes = await fetch(`/api/list-sessions?ownerId=${currentOwner}`);
      const sData = await sRes.json();
      setSessions(prev => {
          const newSessions = sData.sessions || [];
          return newSessions.map(ns => {
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      const stRes = await fetch(`/api/stats?ownerId=${currentOwner}`);
      if (stRes.ok) setStats(await stRes.json());
    } catch (e) {}
  };

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  // ==============================================================================
  // MOTOR BOLA DE NEVE (INFINITO E INTELIGENTE)
  // ==============================================================================
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     if(!confirm(`⚠️ INICIAR MODO BOLA DE NEVE?\n\nO sistema vai disparar continuamente.\nSe os leads acabarem, ele espera novos infectados trazerem mais.\n\nFila atual: ${stats.pending}`)) return;

     setProcessing(true);
     stopCampaignRef.current = false;
     addLog('❄️ BOLA DE NEVE INICIADA: Disparando e aguardando novos leads...');
     
     try {
         let availableSenders = Array.from(selectedPhones);
         const floodCoolDown = new Map(); 
         const BATCH_SIZE = 10; 
         const DELAY_MS = 4000; 
         let totalSentSession = 0;

         // LOOP INFINITO (Até clicar em Parar)
         while (true) {
             if (stopCampaignRef.current) { addLog('🛑 Parada manual.'); break; }

             // 1. Gestão de Contas (Geladeira)
             const now = Date.now();
             for (const [phone, unlockTime] of floodCoolDown.entries()) {
                 if (now > unlockTime) {
                     availableSenders.push(phone);
                     floodCoolDown.delete(phone);
                     addLog(`🔥 Conta ${phone} retornou à ativa.`);
                 }
             }

             if (availableSenders.length === 0) {
                 addLog('⏳ Todas contas em pausa. Aguardando 1 min...');
                 await new Promise(r => setTimeout(r, 60000));
                 continue;
             }

             // 2. Busca Leads PENDENTES
             // O backend garante que 'sent' nunca vem aqui.
             // O backend prioriza Usernames.
             const res = await fetch(`/api/get-campaign-leads?limit=200&ownerId=${ownerId}`);
             const data = await res.json();
             const leads = data.leads || [];
             
             // 3. SE ACABARAM OS LEADS: Modo Espera (Bola de Neve)
             if (leads.length === 0) {
                 addLog('❄️ Fila zerada. Aguardando novos infectados trazerem leads... (30s)');
                 await new Promise(r => setTimeout(r, 30000)); 
                 fetchData(ownerId); // Atualiza stats para ver se entrou algo
                 continue; // Volta pro início do loop
             }

             // 4. Processa os Leads encontrados
             for (let i = 0; i < leads.length; i += BATCH_SIZE) {
                 if (stopCampaignRef.current) break;

                 const batch = leads.slice(i, i + BATCH_SIZE);
                 const promises = batch.map(async (lead, idx) => {
                     if (availableSenders.length === 0) return;
                     
                     // Roda contas aleatoriamente para parecer mais natural
                     const sender = availableSenders[Math.floor(Math.random() * availableSenders.length)];

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
                                 ownerId: ownerId
                             })
                         });
                         
                         if (resp.status === 429) {
                             addLog(`🥶 ${sender} Flood. Pausa 5 min.`);
                             availableSenders = availableSenders.filter(p => p !== sender);
                             floodCoolDown.set(sender, Date.now() + 300000);
                         }
                     } catch (err) {}
                 });
                 
                 await Promise.all(promises);
                 totalSentSession += batch.length;
                 setProgress(Math.min(100, Math.round((totalSentSession / (stats.total || 1)) * 100)));
                 
                 await new Promise(r => setTimeout(r, DELAY_MS));
             }
             
             // Atualiza contadores visuais a cada lote de 200
             fetchData(ownerId);
         }
     } catch (e) { addLog(`⛔ Erro: ${e.message}`); }
     setProcessing(false);
  };

  const stopCampaign = () => { stopCampaignRef.current = true; };

  // ... (RESTANTE DAS FUNÇÕES IGUAIS AO ANTERIOR: checkAllStatus, selectAll, etc) ...
  // [MANTENHA TODO O RESTO DO CÓDIGO DO ADMIN QUE ENVIEI ANTES]
  // Apenas a função startRealCampaign mudou drasticamente.
  
  // FUNÇÕES AUXILIARES PARA NÃO QUEBRAR O COMPONENTE COMPLETO
  const checkAllStatus = async () => { /* ... código anterior ... */ };
  const toggleSelect = (phone) => { 
      const newSet = new Set(selectedPhones);
      if(newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
      setSelectedPhones(newSet);
  };
  const selectAll = () => { 
      const newSet = new Set();
      sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
      setSelectedPhones(newSet);
  };
  const handleDeleteSession = async (p) => { /* ... */ };
  const startMassHarvest = async () => { /* ... */ };
  const stopHarvest = () => { stopHarvestRef.current = true; };
  const scanNetwork = async () => { /* ... */ };
  const handleMassUpdateProfile = async () => { /* ... */ };
  const handleMassPostStory = async () => { /* ... */ };
  const openChatViewer = async (c) => { /* ... */ };
  const stealLeadsManual = async (c) => { /* ... */ };
  const cloneGroup = async (c) => { /* ... */ };

  const filteredGroups = filterNumber ? allGroups.filter(g => g.ownerPhone.includes(filterNumber)) : allGroups;
  const filteredChannels = filterNumber ? allChannels.filter(c => c.ownerPhone.includes(filterNumber)) : allChannels;
  const activeCount = sessions.filter(s => s.is_active).length;
  const deadCount = sessions.length - activeCount;

  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <form onSubmit={handleLogin} style={{background:'#1c242f', padding:'40px', borderRadius:'15px', border:'1px solid #3390ec'}}>
              <h2 style={{color:'white', textAlign:'center'}}>HOTTRACK ADMIN</h2>
              <input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Senha" style={{padding:'10px', width:'200px'}} />
          </form>
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
        <div style={{marginBottom:'20px', borderBottom:'1px solid #30363d', paddingBottom:'10px', display:'flex', justifyContent:'space-between'}}>
            <div>
                <button onClick={()=>setTab('dashboard')} style={{marginRight:'10px', padding:'10px', background: tab==='dashboard'?'#238636':'#0d1117', color:'white', border:'1px solid #30363d'}}>🚀 CRM</button>
                <button onClick={()=>setTab('spy')} style={{marginRight:'10px', padding:'10px', background: tab==='spy'?'#8957e5':'#0d1117', color:'white', border:'1px solid #30363d'}}>👁️ SPY</button>
                <button onClick={()=>setTab('tools')} style={{padding:'10px', background: tab==='tools'?'#1f6feb':'#0d1117', color:'white', border:'1px solid #30363d'}}>🛠️ TOOLS</button>
            </div>
            <div>
               Usuario: <b>{ownerId}</b> <button onClick={logout} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>Sair</button>
            </div>
        </div>

        {tab === 'dashboard' && (
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'20px'}}>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                    <div style={{display:'flex', gap:'20px', marginBottom:'20px'}}>
                        <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #d29922'}}><h2>{stats.pending}</h2><small>Fila Pendente</small></div>
                        <div style={{flex:1, background:'#0d1117', padding:'15px', textAlign:'center', border:'1px solid #238636'}}><h2>{stats.sent}</h2><small>Já Enviados</small></div>
                    </div>
                    <input type="text" placeholder="URL Imagem" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px', background:'#0d1117', color:'white', border:'1px solid #30363d'}} />
                    <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Mensagem..." style={{width:'100%', height:'100px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'10px'}}/>
                    
                    <div style={{marginTop:'15px'}}>
                        {!processing ? (
                            <button onClick={startRealCampaign} style={{width:'100%', padding:'20px', background:'#238636', color:'white', border:'none', cursor:'pointer', fontWeight:'bold'}}>INICIAR BOLA DE NEVE ❄️</button>
                        ) : (
                            <button onClick={stopCampaign} style={{width:'100%', padding:'20px', background:'#f85149', color:'white', border:'none', cursor:'pointer', fontWeight:'bold'}}>🛑 PARAR TUDO</button>
                        )}
                    </div>
                    <div style={{marginTop:'20px', height:'200px', overflowY:'auto', background:'#000', padding:'10px', fontSize:'12px', color:'#00ff00'}}>
                        {logs.map((l,i)=><div key={i}>{l}</div>)}
                    </div>
                </div>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'8px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><h3>Contas ({sessions.length})</h3><button onClick={checkAllStatus}>Check</button></div>
                    <button onClick={selectAll} style={{width:'100%', padding:'10px', background:'#30363d', color:'white', marginBottom:'10px', border:'none'}}>Selecionar Online</button>
                    <div style={{maxHeight:'500px', overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} style={{padding:'10px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between'}}>
                                <span style={{color: s.is_active?'#00ff00':'#ff0000'}}>{s.phone_number}</span>
                                <input type="checkbox" checked={selectedPhones.has(s.phone_number)} onChange={()=>toggleSelect(s.phone_number)} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        {/* OUTRAS ABAS IGUAIS AO ANTERIOR */}
    </div>
  );
}
