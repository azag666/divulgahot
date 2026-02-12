import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [credentials, setCredentials] = useState({ token: '' });
  
  // Tabs e Estados
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sessions, setSessions] = useState([]);
  const [filterActive, setFilterActive] = useState(true); // NOVO: Filtro
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const stopRef = useRef(false);

  // Configs
  const [groupConfig, setGroupConfig] = useState({ baseName: 'VIP', amount: 1, leads: 50, msg: '', botsAdmin: true });
  const [createdGroups, setCreatedGroups] = useState([]);
  const [spyGroups, setSpyGroups] = useState([]);

  // Inicialização
  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { setAuthToken(token); setIsAuthenticated(true); }
      const g = localStorage.getItem('ht_groups_v29');
      if(g) setCreatedGroups(JSON.parse(g));
  }, []);

  useEffect(() => { localStorage.setItem('ht_groups_v29', JSON.stringify(createdGroups)); }, [createdGroups]);

  useEffect(() => {
      if(isAuthenticated) {
          fetchData();
          const i = setInterval(fetchData, 5000);
          return () => clearInterval(i);
      }
  }, [isAuthenticated]);

  const fetchData = async () => {
      try {
          const t = Date.now();
          const r = await fetch(`/api/list-sessions?t=${t}`);
          const d = await r.json();
          setSessions(d.sessions || []);
      } catch(e){}
  };

  const addLog = (m) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${m}`, ...p].slice(0, 100));

  // --- AÇÃO: VALIDAR SESSÕES (Filtro) ---
  const checkHealth = async () => {
      addLog("🔍 Verificando status de todas as contas...");
      setIsProcessing(true);
      try {
          const res = await fetch('/api/system/validate-sessions');
          const d = await res.json();
          addLog(`📊 Relatório: ${d.active} Online | ${d.inactive} Offline`);
          d.details.forEach(det => addLog(`${det.phone}: ${det.status}`));
          fetchData(); // Recarrega lista
      } catch(e) { addLog("Erro na verificação."); }
      setIsProcessing(false);
  };

  // --- AÇÃO: FÁBRICA DE GRUPOS ---
  const runGroupFactory = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setIsProcessing(true); stopRef.current = false;
      const creators = Array.from(selectedPhones);
      let i = 0;

      while(i < groupConfig.amount && !stopRef.current) {
          const creator = creators[i % creators.length];
          const name = `${groupConfig.baseName} #${Math.floor(Math.random()*999)}`;
          addLog(`🏗️ Criando ${name} com ${creator}...`);

          const rLeads = await fetch(`/api/get-campaign-leads?limit=${groupConfig.leads}`);
          const leads = (await rLeads.json()).leads || [];
          
          if(leads.length === 0) { addLog('⚠️ Sem leads no banco.'); break; }

          try {
              const res = await fetch('/api/factory/create-group-blast', {
                  method: 'POST',
                  headers: {'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}`},
                  body: JSON.stringify({
                      phone: creator, title: name, leads: leads.map(l=>l.user_id),
                      initialMessage: groupConfig.msg, adminBots: [] // Adicione bots aqui se tiver
                  })
              });
              const d = await res.json();
              if(d.success) {
                  addLog(`✅ Grupo Criado: ${d.inviteLink}`);
                  setCreatedGroups(p => [{name, link: d.inviteLink, creator}, ...p]);
              } else {
                  addLog(`❌ Erro: ${d.error}`);
              }
          } catch(e) { console.log(e); addLog("Erro fatal na criação."); }
          
          i++;
          await new Promise(r => setTimeout(r, 10000));
      }
      setIsProcessing(false);
  };

  // --- AÇÃO: ESPIÃO ---
  const scanGroups = async () => {
      if(selectedPhones.size===0) return alert('Selecione contas!');
      setIsProcessing(true); addLog('📡 Escaneando...');
      const phones = Array.from(selectedPhones);
      let found = [];
      for(const p of phones) {
          try {
              const res = await fetch('/api/spy/list-chats', {
                  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({phone:p})
              });
              const d = await res.json();
              if(d.chats) d.chats.forEach(c => found.push({...c, owner:p}));
          } catch(e){}
      }
      setSpyGroups(found);
      addLog(`📡 ${found.length} grupos encontrados.`);
      setIsProcessing(false);
  };

  // RENDER
  if(!isAuthenticated) return <div style={styles.center}><input placeholder="Token" onChange={e=>setCredentials({token:e.target.value})}/><button onClick={()=>{setAuthToken(credentials.token); setIsAuthenticated(true);}}>Entrar</button></div>;

  // Filtra sessões para exibir
  const displayedSessions = filterActive ? sessions.filter(s => s.is_active) : sessions;

  return (
    <div style={styles.main}>
        <div style={styles.header}>
            <h2 style={{color:'white'}}>HOTTRACK V29</h2>
            <div>
                <button onClick={()=>setActiveTab('dashboard')} style={styles.nav}>DASHBOARD</button>
                <button onClick={()=>setActiveTab('factory')} style={styles.nav}>FÁBRICA</button>
                <button onClick={()=>setActiveTab('spy')} style={styles.nav}>ESPIÃO</button>
            </div>
        </div>

        <div style={{flex:1, display:'flex'}}>
            <div style={styles.sidebar}>
                <h4 style={{color:'white'}}>Contas ({displayedSessions.length})</h4>
                <div style={{display:'flex', gap:5, marginBottom:10}}>
                    <button onClick={checkHealth} style={{...styles.smallBtn, background:'#8957e5'}}>🔄 Check Status</button>
                    <button onClick={()=>setFilterActive(!filterActive)} style={styles.smallBtn}>
                        {filterActive ? 'Ver Todos' : 'Só Ativos'}
                    </button>
                </div>
                <button onClick={()=>setSelectedPhones(new Set(displayedSessions.map(s=>s.phone_number)))} style={styles.link}>Selecionar Lista</button>
                <div style={{overflowY:'auto', flex:1}}>
                    {displayedSessions.map(s=>(
                        <div key={s.phone_number} onClick={()=>{const n=new Set(selectedPhones); n.has(s.phone_number)?n.delete(s.phone_number):n.add(s.phone_number); setSelectedPhones(n);}} style={{...styles.row, background:selectedPhones.has(s.phone_number)?'#1f6feb22':'transparent', opacity: s.is_active?1:0.5}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:s.is_active?'#238636':'#f85149'}}/> {s.phone_number}
                        </div>
                    ))}
                </div>
            </div>

            <div style={styles.content}>
                {activeTab==='dashboard' && <div style={styles.card}><h3>Logs</h3><div style={styles.logBox}>{logs.map((l,i)=><div key={i}>{l}</div>)}</div></div>}
                
                {activeTab==='factory' && (
                    <div style={styles.card}>
                        <h3>Fábrica de Grupos</h3>
                        <input placeholder="Nome Base" onChange={e=>setGroupConfig({...groupConfig, baseName:e.target.value})} style={styles.input}/>
                        <textarea placeholder="Mensagem Inicial" onChange={e=>setGroupConfig({...groupConfig, msg:e.target.value})} style={styles.input}/>
                        {!isProcessing ? <button onClick={runGroupFactory} style={styles.btn}>CRIAR GRUPOS</button> : <button onClick={()=>stopRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                        <div style={styles.list}>{createdGroups.map((g,i)=><div key={i} style={styles.item}>{g.name} - <a href={g.link} target="_blank" style={{color:'#58a6ff'}}>Link</a></div>)}</div>
                    </div>
                )}

                {activeTab==='spy' && (
                    <div style={styles.card}>
                        <h3>Espião de Grupos</h3>
                        <button onClick={scanGroups} style={styles.btn}>ESCANEAR GRUPOS</button>
                        <div style={styles.list}>{spyGroups.map((g,i)=><div key={i} style={styles.item}>{g.title} ({g.participantsCount})</div>)}</div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}

const styles = {
    main: {height:'100vh', background:'#0d1117', color:'#c9d1d9', display:'flex', flexDirection:'column', fontFamily:'sans-serif'},
    header: {padding:'15px', background:'#161b22', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', alignItems:'center'},
    center: {height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', background:'#0d1117'},
    sidebar: {width:250, background:'#161b22', borderRight:'1px solid #30363d', padding:15, display:'flex', flexDirection:'column'},
    content: {flex:1, padding:20, overflowY:'auto'},
    card: {background:'#161b22', padding:20, borderRadius:8, border:'1px solid #30363d', marginBottom:20},
    input: {width:'100%', padding:10, background:'#010409', border:'1px solid #30363d', color:'white', borderRadius:5, marginBottom:10, boxSizing:'border-box'},
    btn: {width:'100%', padding:12, background:'#238636', color:'white', border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold'},
    smallBtn: {padding:'5px 10px', background:'#21262d', color:'white', border:'1px solid #30363d', borderRadius:4, cursor:'pointer', fontSize:11},
    nav: {background:'transparent', border:'none', color:'white', padding:'8px 15px', cursor:'pointer', fontWeight:'bold'},
    row: {padding:10, display:'flex', alignItems:'center', gap:10, cursor:'pointer', borderBottom:'1px solid #21262d', fontSize:13},
    link: {background:'none', border:'none', color:'#58a6ff', cursor:'pointer', textDecoration:'underline', marginBottom:10, fontSize:12},
    logBox: {height:200, overflowY:'auto', background:'#010409', padding:10, borderRadius:5, fontSize:12, fontFamily:'monospace'},
    list: {marginTop:15, maxHeight:300, overflowY:'auto', background:'#010409', borderRadius:5},
    item: {padding:10, borderBottom:'1px solid #30363d', fontSize:13}
};
