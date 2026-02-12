import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V28 - PAINEL DE CONTROLE FINAL
// - Supabase Integrado
// - Todas as Funções: Disparo, Fábrica, Spy, Inbox, Tools
// ============================================================================

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [credentials, setCredentials] = useState({ token: '' });

  // TABS
  const [activeTab, setActiveTab] = useState('dashboard');
  const [factoryTab, setFactoryTab] = useState('groups');

  // DADOS
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const stopProcessRef = useRef(false);

  // CONFIGURAÇÕES
  const [dispatchConfig, setDispatchConfig] = useState({ msg: '', imgUrl: '', useRandom: true });
  const [groupDispatchConfig, setGroupDispatchConfig] = useState({ msg: '', imgUrl: '' });
  const [groupFactory, setGroupFactory] = useState({ baseName: 'Grupo VIP', amountToCreate: 1, leadsPerGroup: 50, initialMessage: '', mediaUrl: '', promoteBots: true });
  const [createdGroups, setCreatedGroups] = useState([]);
  const [botFactory, setBotFactory] = useState({ baseName: 'Atendimento', amount: 1, photoUrl: '' });
  const [createdBots, setCreatedBots] = useState([]);
  const [toolsConfig, setToolsConfig] = useState({ newName: '', newPhoto: '', storyMedia: '', storyCaption: '' });

  // INBOX & SPY
  const [replies, setReplies] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatListRef = useRef(null);
  const [spyGroups, setSpyGroups] = useState([]);
  const [isHarvesting, setIsHarvesting] = useState(false);

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { setAuthToken(token); setIsAuthenticated(true); }
      const savedG = localStorage.getItem('ht_groups_v28');
      if(savedG) setCreatedGroups(JSON.parse(savedG));
      const savedB = localStorage.getItem('ht_bots_v28');
      if(savedB) setCreatedBots(JSON.parse(savedB));
  }, []);

  useEffect(() => { localStorage.setItem('ht_groups_v28', JSON.stringify(createdGroups)); }, [createdGroups]);
  useEffect(() => { localStorage.setItem('ht_bots_v28', JSON.stringify(createdBots)); }, [createdBots]);

  useEffect(() => {
      if (isAuthenticated) {
          fetchData();
          const interval = setInterval(fetchData, 5000);
          return () => clearInterval(interval);
      }
  }, [isAuthenticated]);

  const fetchData = async () => {
      try {
          const t = Date.now();
          const sRes = await apiCall(`/api/list-sessions?t=${t}`);
          if (sRes?.ok) setSessions((await sRes.json()).sessions || []);
          const stRes = await apiCall(`/api/stats?t=${t}`);
          if (stRes?.ok) setStats(await stRes.json());
      } catch (e) {}
  };

  const apiCall = async (endpoint, body) => {
      try {
          const res = await fetch(endpoint, {
              method: body ? 'POST' : 'GET',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
              body: body ? JSON.stringify(body) : null
          });
          if(res.status === 401) setIsAuthenticated(false);
          return res;
      } catch(e) { return { ok: false }; }
  };

  const addLog = (msg) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 100));

  // --- FUNÇÕES DE AÇÃO ---

  const startDispatch = async () => {
      if(selectedPhones.size===0) return alert('Selecione contas!');
      setIsProcessing(true); stopProcessRef.current = false;
      addLog('🚀 Disparo PV Iniciado');
      const senders = Array.from(selectedPhones);
      while(!stopProcessRef.current) {
          const r = await apiCall(`/api/get-campaign-leads?limit=10&random=${dispatchConfig.useRandom}`);
          const leads = (await r.json()).leads || [];
          if(leads.length===0) { addLog('✅ Fim dos leads.'); break; }
          for(const lead of leads) {
              if(stopProcessRef.current) break;
              const sender = senders[Math.floor(Math.random()*senders.length)];
              const target = lead.username ? `@${lead.username}` : lead.user_id;
              try {
                  const res = await apiCall('/api/dispatch', { senderPhone: sender, target, message: dispatchConfig.msg, imageUrl: dispatchConfig.imgUrl, leadDbId: lead.id });
                  const d = await res.json();
                  if(d.success) { addLog(`✅ Enviado: ${target}`); setStats(p=>({...p, sent: p.sent+1})); }
                  else if(d.wait) addLog(`⛔ Flood ${sender}: ${d.wait}s`);
              } catch(e){}
              await new Promise(r => setTimeout(r, 1500));
          }
      }
      setIsProcessing(false);
  };

  const startGroupDispatch = async () => {
      if(createdGroups.length===0) return alert('Sem grupos.');
      setIsProcessing(true); stopProcessRef.current = false;
      addLog('📢 Disparo em Grupos Iniciado');
      for(const g of createdGroups) {
          if(stopProcessRef.current) break;
          try {
              const res = await apiCall('/api/dispatch', { senderPhone: g.creator, target: g.link, isGroup: true, message: groupDispatchConfig.msg, imageUrl: groupDispatchConfig.imgUrl });
              if((await res.json()).success) addLog(`✅ Grupo ${g.name}: OK`);
          } catch(e){}
          await new Promise(r => setTimeout(r, 3000));
      }
      setIsProcessing(false);
  };

  const runGroupFactory = async () => {
      if(selectedPhones.size===0) return alert('Selecione contas!');
      setIsProcessing(true); stopProcessRef.current = false;
      const creators = Array.from(selectedPhones);
      let count = 0;
      while(count < groupFactory.amountToCreate && !stopProcessRef.current) {
          const creator = creators[count%creators.length];
          const name = `${groupFactory.baseName} ${Math.floor(Math.random()*999)}`;
          addLog(`🏗️ Criando ${name}...`);
          const rLeads = await apiCall(`/api/get-campaign-leads?limit=${groupFactory.leadsPerGroup}`);
          const leads = (await rLeads.json()).leads || [];
          if(leads.length<2) { addLog('⚠️ Leads insuficientes.'); break; }
          try {
              const bots = groupFactory.promoteBots ? createdBots.map(b=>b.username) : [];
              const res = await apiCall('/api/factory/create-group-blast', {
                  phone: creator, title: name, leads: leads.map(l=>l.user_id),
                  initialMessage: groupFactory.initialMessage, mediaUrl: groupFactory.mediaUrl, adminBots: bots
              });
              const d = await res.json();
              if(d.success) {
                  addLog(`✅ Grupo Criado: ${d.inviteLink}`);
                  setCreatedGroups(p=>[{name, link:d.inviteLink, members:leads.length, creator},...p]);
              } else { addLog(`❌ Erro: ${d.error}`); await new Promise(r=>setTimeout(r,10000)); }
          } catch(e){}
          count++; await new Promise(r=>setTimeout(r,15000));
      }
      setIsProcessing(false);
  };

  const runBotFactory = async () => {
      if(selectedPhones.size===0) return alert('Selecione uma conta!');
      setIsProcessing(true);
      const creator = Array.from(selectedPhones)[0];
      for(let i=0; i<botFactory.amount; i++) {
          const suffix = Math.floor(Math.random()*99999);
          const username = `${botFactory.baseName.replace(/\s+/g,'')}_${suffix}_bot`;
          addLog(`🤖 Criando @${username}...`);
          try {
              const res = await apiCall('/api/factory/create-bot', { phone: creator, name: `${botFactory.baseName} ${suffix}`, username, photoUrl: botFactory.photoUrl });
              const d = await res.json();
              if(d.success) { addLog(`✅ Bot Criado!`); setCreatedBots(p=>[{username, token:d.token},...p]); }
              else addLog(`❌ Erro BotFather: ${d.error}`);
          } catch(e){}
          await new Promise(r=>setTimeout(r,5000));
      }
      setIsProcessing(false);
  };

  const loadInbox = async () => {
      if(selectedPhones.size===0 && sessions.length>0) setSelectedPhones(new Set(sessions.filter(s=>s.is_active).map(s=>s.phone_number)));
      const phones = Array.from(selectedPhones.size>0?selectedPhones:sessions.map(s=>s.phone_number));
      let all = [];
      for(let i=0; i<phones.length; i+=5) {
          const batch = phones.slice(i, i+5);
          const results = await Promise.all(batch.map(p=>apiCall('/api/spy/check-replies', {phone:p}).then(r=>r.json()).catch(()=>({}))));
          results.forEach(r=>r.replies && all.push(...r.replies));
      }
      setReplies(all.sort((a,b)=>b.timestamp-a.timestamp));
  };

  const openChat = async (r) => {
      setSelectedChat(r);
      const d = await (await apiCall('/api/spy/get-history', {phone:r.fromPhone, chatId:r.chatId, limit:30})).json();
      setChatHistory(d.history ? d.history.reverse() : []);
      setTimeout(()=>chatListRef.current?.scrollTo({top:chatListRef.current.scrollHeight, behavior:'smooth'}), 100);
  };

  const scanSpyGroups = async () => {
      if(selectedPhones.size===0) return alert('Selecione contas!');
      setIsHarvesting(true); addLog('📡 Escaneando...');
      const phones = Array.from(selectedPhones);
      let found = [];
      for(const p of phones) {
          try {
              const d = await (await apiCall('/api/spy/list-chats', {phone:p})).json();
              if(d.chats) d.chats.forEach(c=>!c.type.includes('Canal') && found.push({...c, owner:p}));
          } catch(e){}
      }
      setSpyGroups([...new Map(found.map(i=>[i.id,i])).values()]);
      setIsHarvesting(false); addLog(`📡 ${found.length} grupos.`);
  };

  const runHarvest = async () => {
      if(spyGroups.length===0) return alert('Escaneie primeiro.');
      setIsHarvesting(true); addLog('🕷️ Aspirando leads...');
      for(const g of spyGroups) {
          try {
              const d = await (await apiCall('/api/spy/harvest', {phone:g.owner, chatId:g.id, chatName:g.title})).json();
              if(d.success) { addLog(`✅ +${d.count} leads: ${g.title}`); setStats(p=>({...p, total:p.total+d.count})); }
          } catch(e){}
          await new Promise(r=>setTimeout(r,2000));
      }
      setIsHarvesting(false); addLog('🏁 Fim.');
  };

  const runTools = async (type) => {
      if(selectedPhones.size===0) return alert('Selecione contas!');
      addLog(`⚙️ Executando ${type}...`);
      const phones = Array.from(selectedPhones);
      for(const p of phones) {
          try {
              let endpoint = type==='profile'?'/api/update-profile':'/api/post-story';
              let body = type==='profile' ? {phone:p, newName:toolsConfig.newName, photoUrl:toolsConfig.newPhoto} : {phone:p, mediaUrl:toolsConfig.storyMedia, caption:toolsConfig.storyCaption};
              await apiCall(endpoint, body);
              addLog(`✅ ${type} OK: ${p}`);
          } catch(e){ addLog(`❌ Erro: ${p}`); }
      }
  };

  // --- RENDER ---
  if(!isAuthenticated) return (
      <div style={styles.loginContainer}><div style={styles.loginBox}>
          <h2 style={{color:'white',textAlign:'center'}}>HOTTRACK V28</h2>
          <input type="password" placeholder="Token" onChange={e=>setCredentials({token:e.target.value})} style={styles.input}/>
          <button onClick={()=>{if(credentials.token){setAuthToken(credentials.token); setIsAuthenticated(true); localStorage.setItem('authToken',credentials.token);}}} style={styles.btn}>ENTRAR</button>
      </div></div>
  );

  return (
    <div style={styles.main}>
        <div style={styles.header}>
            <h2 style={{margin:0, color:'white'}}>HOTTRACK <span style={styles.badge}>V28 FINAL</span></h2>
            <div style={{display:'flex', gap:10}}>
                {['dashboard','dispatch','groups','factory','inbox','spy','tools'].map(t=>(
                    <button key={t} onClick={()=>{setActiveTab(t); if(t==='inbox') loadInbox();}} style={{...styles.navBtn, background:activeTab===t?'#1f6feb':'transparent'}}>{t.toUpperCase()}</button>
                ))}
            </div>
            <button onClick={()=>setIsAuthenticated(false)} style={styles.logoutBtn}>SAIR</button>
        </div>

        <div style={{flex:1, display:'flex', overflow:'hidden'}}>
            <div style={styles.sidebar}>
                <h4 style={{marginTop:0, color:'white'}}>Contas ({sessions.length})</h4>
                <button onClick={()=>setSelectedPhones(new Set(sessions.filter(s=>s.is_active).map(s=>s.phone_number)))} style={styles.link}>Selecionar Todos</button>
                <div style={{flex:1, overflowY:'auto'}}>
                    {sessions.map(s=>(
                        <div key={s.phone_number} onClick={()=>{const n=new Set(selectedPhones); n.has(s.phone_number)?n.delete(s.phone_number):n.add(s.phone_number); setSelectedPhones(n);}} style={{...styles.row, background:selectedPhones.has(s.phone_number)?'#1f6feb22':'transparent'}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:s.is_active?'#238636':'#f85149'}}/> {s.phone_number}
                        </div>
                    ))}
                </div>
            </div>

            <div style={styles.content}>
                {activeTab === 'dashboard' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={{display:'flex', gap:20}}>
                            <StatCard label="LEADS PENDENTES" val={stats.pending} color="#d29922" />
                            <StatCard label="ENVIADOS" val={stats.sent} color="#238636" />
                            <StatCard label="TOTAL" val={stats.total} color="#8957e5" />
                        </div>
                        <div style={styles.card}><h3>Logs</h3><div style={styles.logBox}>{logs.map((l,i)=><div key={i}>{l}</div>)}</div></div>
                    </div>
                )}

                {activeTab === 'dispatch' && (
                    <div style={styles.card}>
                        <h3>Disparo em Massa</h3>
                        <input placeholder="URL Mídia" value={dispatchConfig.imgUrl} onChange={e=>setDispatchConfig({...dispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                        <textarea placeholder="Mensagem..." value={dispatchConfig.msg} onChange={e=>setDispatchConfig({...dispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        {!isProcessing ? <button onClick={startDispatch} style={styles.btn}>🚀 INICIAR</button> : <button onClick={()=>stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                    </div>
                )}

                {activeTab === 'groups' && (
                    <div style={styles.card}>
                        <h3>Disparo em Grupos Criados ({createdGroups.length})</h3>
                        <input placeholder="URL Mídia" value={groupDispatchConfig.imgUrl} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                        <textarea placeholder="Mensagem..." value={groupDispatchConfig.msg} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        {!isProcessing ? <button onClick={startGroupDispatch} style={styles.btn}>📢 DISPARAR</button> : <button onClick={()=>stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                    </div>
                )}

                {activeTab === 'factory' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={{display:'flex', gap:10}}>
                            <button onClick={()=>setFactoryTab('groups')} style={subTabBtn(factoryTab==='groups')}>GRUPOS</button>
                            <button onClick={()=>setFactoryTab('bots')} style={subTabBtn(factoryTab==='bots')}>BOTS</button>
                        </div>
                        {factoryTab==='groups' && <div style={styles.card}>
                            <h3>Fábrica de Grupos</h3>
                            <input placeholder="Nome" value={groupFactory.baseName} onChange={e=>setGroupFactory({...groupFactory, baseName:e.target.value})} style={styles.input} />
                            <input type="number" placeholder="Qtd" value={groupFactory.amountToCreate} onChange={e=>setGroupFactory({...groupFactory, amountToCreate:e.target.value})} style={styles.input} />
                            <input placeholder="URL Mídia" value={groupFactory.mediaUrl} onChange={e=>setGroupFactory({...groupFactory, mediaUrl:e.target.value})} style={styles.input} />
                            <textarea placeholder="Msg Inicial..." value={groupFactory.initialMessage} onChange={e=>setGroupFactory({...groupFactory, initialMessage:e.target.value})} style={{...styles.input, height:80}} />
                            <label style={{color:'white',marginBottom:10,display:'block'}}><input type="checkbox" checked={groupFactory.promoteBots} onChange={e=>setGroupFactory({...groupFactory, promoteBots:e.target.checked})} /> Bots Admin</label>
                            {!isProcessing ? <button onClick={runGroupFactory} style={styles.btn}>CRIAR</button> : <button onClick={()=>stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                            <div style={styles.list}>{createdGroups.map((g,i)=><div key={i} style={styles.listItem}><span>{g.name}</span><a href={g.link} style={{color:'#58a6ff'}} target="_blank">Link</a></div>)}</div>
                        </div>}
                        {factoryTab==='bots' && <div style={styles.card}>
                            <h3>Fábrica de Bots</h3>
                            <input placeholder="Nome" value={botFactory.baseName} onChange={e=>setBotFactory({...botFactory, baseName:e.target.value})} style={styles.input} />
                            <input type="number" placeholder="Qtd" value={botFactory.amount} onChange={e=>setBotFactory({...botFactory, amount:e.target.value})} style={styles.input} />
                            <input placeholder="Foto URL" value={botFactory.photoUrl} onChange={e=>setBotFactory({...botFactory, photoUrl:e.target.value})} style={styles.input} />
                            <button onClick={runBotFactory} style={{...styles.btn, background:'#8957e5'}}>CRIAR</button>
                            <textarea readOnly value={createdBots.map(b=>`${b.token} | @${b.username}`).join('\n')} style={{...styles.input, height:150, color:'#58a6ff'}} />
                        </div>}
                    </div>
                )}

                {activeTab === 'inbox' && (
                    <div style={{display:'grid', gridTemplateColumns:'300px 1fr', height:'100%', gap:20}}>
                        <div style={{...styles.card, padding:0, overflow:'hidden'}}>
                            <div style={{overflowY:'auto', height:'100%'}}>
                                {replies.map(r=>(<div key={r.chatId} onClick={()=>openChat(r)} style={{padding:15, borderBottom:'1px solid #30363d', cursor:'pointer', background:selectedChat?.chatId===r.chatId?'#1f6feb22':'transparent'}}><b>{r.name}</b><br/>{r.lastMessage}</div>))}
                            </div>
                        </div>
                        <div style={{...styles.card, display:'flex', flexDirection:'column'}}>
                            {selectedChat ? (<><div style={{padding:10, borderBottom:'1px solid #30363d'}}><b>{selectedChat.name}</b></div><div ref={chatListRef} style={{flex:1, overflowY:'auto', padding:10}}>{chatHistory.map((m,i)=>(<div key={i} style={{padding:10, background:m.isOut?'#005c4b':'#21262d', borderRadius:8, marginBottom:5, alignSelf:m.isOut?'flex-end':'flex-start', maxWidth:'80%', marginLeft:m.isOut?'auto':0}}>{m.mediaType==='video'&&<video src={`data:video/mp4;base64,${m.media}`} controls style={{maxWidth:'100%'}}/>}{m.mediaType==='image'&&<img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%'}}/>}<div>{m.text}</div></div>))}</div></>) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>Selecione</div>}
                        </div>
                    </div>
                )}

                {activeTab === 'spy' && (
                    <div style={styles.card}>
                        <h3>Espião (Roubar Leads)</h3>
                        <div style={{display:'flex', gap:10, marginBottom:10}}>
                            <button onClick={scanSpyGroups} style={styles.btn}>Escanear</button>
                            <button onClick={runHarvest} style={{...styles.btn, background:'#8957e5'}}>Roubar</button>
                        </div>
                        <div style={styles.list}>{spyGroups.map((g,i)=><div key={i} style={styles.listItem}>{g.title} ({g.participantsCount})</div>)}</div>
                    </div>
                )}

                {activeTab === 'tools' && (
                    <div style={{display:'grid', gap:20, gridTemplateColumns:'1fr 1fr'}}>
                        <div style={styles.card}><h3>Perfil</h3><input placeholder="Nome" onChange={e=>setToolsConfig({...toolsConfig, newName:e.target.value})} style={styles.input}/><button onClick={()=>runTools('profile')} style={styles.btn}>Atualizar</button></div>
                        <div style={styles.card}><h3>Stories</h3><input placeholder="Mídia" onChange={e=>setToolsConfig({...toolsConfig, storyMedia:e.target.value})} style={styles.input}/><button onClick={()=>runTools('story')} style={styles.btn}>Postar</button></div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}

// ESTILOS
const styles = {
    main: {height:'100vh', background:'#0d1117', color:'#c9d1d9', display:'flex', flexDirection:'column', fontFamily:'sans-serif'},
    header: {padding:'15px', background:'#161b22', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', alignItems:'center'},
    badge: {fontSize:10, background:'#238636', padding:'2px 5px', borderRadius:4, color:'white'},
    loginContainer: {height:'100vh', background:'#0d1117', display:'flex', justifyContent:'center', alignItems:'center'},
    loginBox: {background:'#161b22', padding:40, borderRadius:12, border:'1px solid #30363d', width:350},
    card: {background:'#161b22', padding:20, borderRadius:8, border:'1px solid #30363d'},
    input: {width:'100%', padding:10, background:'#010409', border:'1px solid #30363d', color:'white', borderRadius:5, marginBottom:10, boxSizing:'border-box'},
    btn: {width:'100%', padding:12, background:'#238636', color:'white', border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold'},
    navBtn: {background:'transparent', border:'1px solid #30363d', color:'white', padding:'8px 10px', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:'bold'},
    logoutBtn: {background:'#f85149', border:'none', color:'white', padding:'8px 15px', borderRadius:5, cursor:'pointer'},
    sidebar: {width:250, background:'#161b22', borderRight:'1px solid #30363d', padding:15, display:'flex', flexDirection:'column'},
    content: {flex:1, padding:20, overflowY:'auto'},
    row: {padding:10, display:'flex', alignItems:'center', gap:10, cursor:'pointer', borderBottom:'1px solid #21262d', fontSize:13},
    link: {background:'none', border:'none', color:'#58a6ff', cursor:'pointer', textDecoration:'underline', marginBottom:10},
    logBox: {height:150, overflowY:'auto', background:'#010409', padding:10, borderRadius:5, fontSize:12, fontFamily:'monospace'},
    list: {maxHeight:200, overflowY:'auto', background:'#010409', padding:5, borderRadius:5, marginTop:10},
    listItem: {padding:8, borderBottom:'1px solid #30363d', fontSize:13, display:'flex', justifyContent:'space-between'}
};
const subTabBtn = (active) => ({flex:1, padding:10, background:active?'#1f6feb22':'transparent', border:active?'1px solid #1f6feb':'1px solid #30363d', color:'white', borderRadius:5, cursor:'pointer'});
const StatCard = ({label, val, color}) => (<div style={{flex:1, background:'#161b22', padding:20, borderRadius:8, borderLeft:`5px solid ${color}`}}><h2 style={{margin:0, fontSize:24, color:'white'}}>{val}</h2><small style={{color:'#8b949e'}}>{label}</small></div>);
