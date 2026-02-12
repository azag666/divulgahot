import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V27 - PAINEL DE CONTROLE COMPLETO (SUPABASE)
// ============================================================================

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [credentials, setCredentials] = useState({ token: '' });

  // NAVEGAÇÃO
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [factoryTab, setFactoryTab] = useState('groups');

  // DADOS EM TEMPO REAL
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  
  // STATUS DO SISTEMA
  const [isProcessing, setIsProcessing] = useState(false);
  const stopProcessRef = useRef(false);

  // --- CONFIGURAÇÕES ---
  // Disparo PV
  const [dispatchConfig, setDispatchConfig] = useState({ msg: '', imgUrl: '', useRandom: true });
  // Disparo Grupos
  const [groupDispatchConfig, setGroupDispatchConfig] = useState({ msg: '', imgUrl: '' });
  // Fábrica Grupos
  const [groupFactory, setGroupFactory] = useState({ 
      baseName: 'Grupo VIP', leadsPerGroup: 50, initialMessage: '', mediaUrl: '', promoteBots: true 
  });
  const [createdGroups, setCreatedGroups] = useState([]);
  // Fábrica Bots
  const [botFactory, setBotFactory] = useState({ baseName: 'Atendimento', amount: 1, photoUrl: '' });
  const [createdBots, setCreatedBots] = useState([]);
  // Ferramentas (Tools)
  const [toolsConfig, setToolsConfig] = useState({ newName: '', newPhoto: '', storyMedia: '', storyCaption: '' });

  // --- INBOX ---
  const [replies, setReplies] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatListRef = useRef(null);

  // --- HARVEST (ESPIÃO) ---
  const [spyGroups, setSpyGroups] = useState([]);
  const [isHarvesting, setIsHarvesting] = useState(false);

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================
  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { setAuthToken(token); setIsAuthenticated(true); }
      
      // Recupera estado visual
      const savedG = localStorage.getItem('ht_created_groups');
      if(savedG) setCreatedGroups(JSON.parse(savedG));
      const savedB = localStorage.getItem('ht_created_bots');
      if(savedB) setCreatedBots(JSON.parse(savedB));
  }, []);

  // Persistência visual
  useEffect(() => { localStorage.setItem('ht_created_groups', JSON.stringify(createdGroups)); }, [createdGroups]);
  useEffect(() => { localStorage.setItem('ht_created_bots', JSON.stringify(createdBots)); }, [createdBots]);

  // Polling de Dados (Atualiza a cada 5s)
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
          // Busca Sessões
          const sRes = await apiCall(`/api/list-sessions?t=${t}`);
          if (sRes?.ok) {
              const data = await sRes.json();
              setSessions(data.sessions || []);
          }
          // Busca Stats de Leads
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

  // ==========================================================================
  // FUNÇÕES CORE (ENGINES)
  // ==========================================================================

  // 1. DISPARO EM MASSA (PV)
  const startDispatch = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setIsProcessing(true); stopProcessRef.current = false;
      addLog('🚀 Disparo em Massa Iniciado');
      
      const senders = Array.from(selectedPhones);
      
      while(!stopProcessRef.current) {
          // Busca Leads Pendentes (que ainda não receberam)
          const r = await apiCall(`/api/get-campaign-leads?limit=10&random=${dispatchConfig.useRandom}`);
          const leads = (await r.json()).leads || [];
          
          if(leads.length === 0) { addLog('✅ Todos os leads processados.'); break; }

          for(const lead of leads) {
              if(stopProcessRef.current) break;
              const sender = senders[Math.floor(Math.random()*senders.length)];
              const target = lead.username ? `@${lead.username}` : lead.user_id;

              try {
                  const res = await apiCall('/api/dispatch', {
                      senderPhone: sender, target, message: dispatchConfig.msg, imageUrl: dispatchConfig.imgUrl, leadDbId: lead.id
                  });
                  const d = await res.json();
                  if(d.success) { 
                      addLog(`✅ Enviado: ${target}`); 
                      setStats(p=>({...p, sent: p.sent+1, pending: p.pending-1})); 
                  } else if(d.wait) {
                      addLog(`⛔ Flood ${sender}: ${d.wait}s`);
                  }
              } catch(e){}
              await new Promise(r => setTimeout(r, 1500));
          }
      }
      setIsProcessing(false);
  };

  // 2. DISPARO EM GRUPOS CRIADOS
  const startGroupDispatch = async () => {
      if(createdGroups.length === 0) return alert('Nenhum grupo criado.');
      setIsProcessing(true); stopProcessRef.current = false;
      addLog('📢 Iniciando disparo nos grupos...');

      for(const group of createdGroups) {
          if(stopProcessRef.current) break;
          try {
              const res = await apiCall('/api/dispatch', {
                  senderPhone: group.creator, target: group.link, isGroup: true,
                  message: groupDispatchConfig.msg, imageUrl: groupDispatchConfig.imgUrl
              });
              const d = await res.json();
              if(d.success) addLog(`✅ Grupo ${group.name}: Enviado`);
              else addLog(`❌ Grupo ${group.name}: Erro`);
          } catch(e){}
          await new Promise(r => setTimeout(r, 3000));
      }
      setIsProcessing(false);
  };

  // 3. FÁBRICA DE GRUPOS
  const runGroupFactory = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setIsProcessing(true); stopProcessRef.current = false;
      const creators = Array.from(selectedPhones);
      let count = 0;

      while(count < groupFactory.amountToCreate && !stopProcessRef.current) {
          const creator = creators[count % creators.length];
          const name = `${groupFactory.baseName} ${Math.floor(Math.random()*999)}`;
          addLog(`🏗️ Criando ${name}...`);

          const rLeads = await apiCall(`/api/get-campaign-leads?limit=${groupFactory.leadsPerGroup}`);
          const leads = (await rLeads.json()).leads || [];
          
          if(leads.length < 2) { addLog('⚠️ Leads insuficientes.'); break; }

          try {
              const adminBots = groupFactory.promoteBots ? createdBots.map(b=>b.username) : [];
              const res = await apiCall('/api/factory/create-group-blast', {
                  phone: creator, title: name, leads: leads.map(l=>l.user_id),
                  initialMessage: groupFactory.initialMessage, mediaUrl: groupFactory.mediaUrl, adminBots
              });
              const d = await res.json();
              
              if(d.success) {
                  addLog(`✅ Grupo Criado: ${d.inviteLink}`);
                  setCreatedGroups(p => [{name, link: d.inviteLink, members: leads.length, creator}, ...p]);
              } else {
                  addLog(`❌ Erro: ${d.error}`);
                  await new Promise(r => setTimeout(r, 10000));
              }
          } catch(e){}
          count++;
          await new Promise(r => setTimeout(r, 20000));
      }
      setIsProcessing(false);
  };

  // 4. FÁBRICA DE BOTS
  const runBotFactory = async () => {
      if(selectedPhones.size === 0) return alert('Selecione UMA conta!');
      setIsProcessing(true);
      const creator = Array.from(selectedPhones)[0];

      for(let i=0; i<botFactory.amount; i++) {
          const suffix = Math.floor(Math.random()*99999);
          const username = `${botFactory.baseName.replace(/\s+/g,'')}_${suffix}_bot`;
          addLog(`🤖 Criando @${username}...`);

          try {
              const res = await apiCall('/api/factory/create-bot', {
                  phone: creator, name: `${botFactory.baseName} ${suffix}`, username, photoUrl: botFactory.photoUrl
              });
              const d = await res.json();
              if(d.success) {
                  addLog(`✅ Bot Criado! Token salvo.`);
                  setCreatedBots(p => [{username, token: d.token}, ...p]);
              } else addLog(`❌ Erro BotFather: ${d.error}`);
          } catch(e){}
          await new Promise(r => setTimeout(r, 5000));
      }
      setIsProcessing(false);
  };

  // 5. INBOX (Carregamento e Mídia)
  const loadInbox = async () => {
      if(selectedPhones.size === 0 && sessions.length > 0) setSelectedPhones(new Set(sessions.filter(s=>s.is_active).map(s=>s.phone_number)));
      
      const phones = Array.from(selectedPhones.size>0 ? selectedPhones : sessions.map(s=>s.phone_number));
      let all = [];
      for(let i=0; i<phones.length; i+=5) {
          const batch = phones.slice(i, i+5);
          const results = await Promise.all(batch.map(p => apiCall('/api/spy/check-replies', { phone: p }).then(r=>r.json()).catch(()=>({}))));
          results.forEach(r => r.replies && all.push(...r.replies));
      }
      setReplies(all.sort((a,b)=>b.timestamp - a.timestamp));
  };

  const openChat = async (r) => {
      setSelectedChat(r);
      const res = await apiCall('/api/spy/get-history', { phone: r.fromPhone, chatId: r.chatId, limit: 30 });
      const d = await res.json();
      setChatHistory(d.history ? d.history.reverse() : []);
      setTimeout(() => chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  // 6. HARVEST (Espião)
  const scanSpyGroups = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setIsHarvesting(true); addLog('📡 Escaneando grupos nas contas...');
      const phones = Array.from(selectedPhones);
      let found = [];
      
      for(const p of phones) {
          try {
              const res = await apiCall('/api/spy/list-chats', { phone: p });
              const d = await res.json();
              if(d.chats) d.chats.forEach(c => !c.type.includes('Canal') && found.push({...c, owner: p}));
          } catch(e){}
      }
      setSpyGroups([...new Map(found.map(i=>[i.id, i])).values()]);
      setIsHarvesting(false);
      addLog(`📡 ${found.length} grupos encontrados.`);
  };

  const runHarvest = async () => {
      if(spyGroups.length === 0) return alert('Escaneie primeiro.');
      setIsHarvesting(true); addLog('🕷️ Roubando leads dos grupos...');
      
      for(const g of spyGroups) {
          try {
              const res = await apiCall('/api/spy/harvest', { phone: g.owner, chatId: g.id, chatName: g.title });
              const d = await res.json();
              if(d.success) {
                  addLog(`✅ +${d.count} leads de: ${g.title}`);
                  setStats(p=>({...p, total: p.total + d.count, pending: p.pending + d.count}));
              }
          } catch(e){}
          await new Promise(r => setTimeout(r, 2000));
      }
      setIsHarvesting(false);
      addLog('🏁 Coleta finalizada.');
  };

  // 7. TOOLS (Perfil/Stories)
  const runTools = async (type) => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      addLog(`⚙️ Executando ${type} em massa...`);
      const phones = Array.from(selectedPhones);
      
      for(const p of phones) {
          try {
              let endpoint = type === 'profile' ? '/api/update-profile' : '/api/post-story';
              let body = type === 'profile' 
                  ? { phone: p, newName: toolsConfig.newName, photoUrl: toolsConfig.newPhoto }
                  : { phone: p, mediaUrl: toolsConfig.storyMedia, caption: toolsConfig.storyCaption };
              
              await apiCall(endpoint, body);
              addLog(`✅ ${type} OK em ${p}`);
          } catch(e){ addLog(`❌ Erro em ${p}`); }
      }
  };

  // RENDERIZAÇÃO
  if(!isAuthenticated) return (
      <div style={styles.loginContainer}><div style={styles.loginBox}>
          <h2 style={{color:'white', textAlign:'center'}}>HOTTRACK V27</h2>
          <input type="password" placeholder="Token" onChange={e=>setCredentials({token:e.target.value})} style={styles.input}/>
          <button onClick={()=>{if(credentials.token){setAuthToken(credentials.token); setIsAuthenticated(true); localStorage.setItem('authToken', credentials.token);}}} style={styles.btn}>ENTRAR</button>
      </div></div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* HEADER */}
        <div style={styles.header}>
            <h2 style={{margin:0, color:'white'}}>HOTTRACK <span style={styles.badge}>V27 SUPABASE</span></h2>
            <div style={{display:'flex', gap:10}}>
                {['dashboard', 'dispatch', 'groups', 'factory', 'inbox', 'spy', 'tools'].map(t => (
                    <button key={t} onClick={()=>{setActiveTab(t); if(t==='inbox') loadInbox();}} style={{...styles.navBtn, background: activeTab===t?'#1f6feb':'transparent'}}>{t.toUpperCase()}</button>
                ))}
            </div>
            <button onClick={()=>setIsAuthenticated(false)} style={styles.logoutBtn}>SAIR</button>
        </div>

        <div style={{flex:1, overflow:'hidden', display:'flex'}}>
            {/* SIDEBAR GLOBAL */}
            <div style={styles.sidebar}>
                <h4 style={{marginTop:0, color:'white'}}>Conectados ({sessions.length})</h4>
                <button onClick={()=>setSelectedPhones(new Set(sessions.filter(s=>s.is_active).map(s=>s.phone_number)))} style={styles.link}>Selecionar Todos Online</button>
                <div style={{flex:1, overflowY:'auto'}}>
                    {sessions.map(s => (
                        <div key={s.phone_number} onClick={()=>{const n=new Set(selectedPhones); n.has(s.phone_number)?n.delete(s.phone_number):n.add(s.phone_number); setSelectedPhones(n);}} style={{...styles.row, background:selectedPhones.has(s.phone_number)?'#1f6feb22':'transparent'}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:s.is_active?'#238636':'#f85149'}}/> {s.phone_number}
                        </div>
                    ))}
                </div>
            </div>

            {/* CONTEÚDO */}
            <div style={styles.content}>
                
                {activeTab === 'dashboard' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={{display:'flex', gap:20}}>
                            <StatCard label="LEADS PENDENTES" val={stats.pending} color="#d29922" />
                            <StatCard label="JÁ RECEBERAM" val={stats.sent} color="#238636" />
                            <StatCard label="LEADS TOTAIS" val={stats.total} color="#8957e5" />
                        </div>
                        <div style={styles.card}><h3>Logs</h3><div style={styles.logBox}>{logs.map((l,i)=><div key={i}>{l}</div>)}</div></div>
                    </div>
                )}

                {activeTab === 'dispatch' && (
                    <div style={styles.card}>
                        <h3>Disparo em Massa (Individual)</h3>
                        <div style={{display:'flex', gap:10, marginBottom:10}}>
                            <input placeholder="URL Mídia (Foto/Vídeo)" value={dispatchConfig.imgUrl} onChange={e=>setDispatchConfig({...dispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                            <label style={{color:'white', display:'flex', alignItems:'center', gap:5}}><input type="checkbox" checked={dispatchConfig.useRandom} onChange={e=>setDispatchConfig({...dispatchConfig, useRandom:e.target.checked})}/> Aleatório</label>
                        </div>
                        <textarea placeholder="Mensagem..." value={dispatchConfig.msg} onChange={e=>setDispatchConfig({...dispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        {!isProcessing ? <button onClick={startDispatch} style={styles.btn}>🚀 INICIAR</button> : <button onClick={()=>stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                    </div>
                )}

                {activeTab === 'groups' && (
                    <div style={styles.card}>
                        <h3>Disparo para Grupos Criados ({createdGroups.length})</h3>
                        <input placeholder="URL Mídia" value={groupDispatchConfig.imgUrl} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                        <textarea placeholder="Mensagem..." value={groupDispatchConfig.msg} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        {!isProcessing ? <button onClick={startGroupDispatch} style={styles.btn}>📢 DISPARAR EM TODOS</button> : <button onClick={()=>stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                    </div>
                )}

                {activeTab === 'factory' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={{display:'flex', gap:10}}>
                            <button onClick={()=>setFactoryTab('groups')} style={subTabBtn(factoryTab==='groups')}>GRUPOS</button>
                            <button onClick={()=>setFactoryTab('bots')} style={subTabBtn(factoryTab==='bots')}>BOTS</button>
                        </div>

                        {factoryTab === 'groups' && (
                            <div style={styles.card}>
                                <h3>Fábrica de Grupos</h3>
                                <div style={{display:'flex', gap:10}}>
                                    <input placeholder="Nome Base" value={groupFactory.baseName} onChange={e=>setGroupFactory({...groupFactory, baseName:e.target.value})} style={styles.input} />
                                    <input type="number" placeholder="Qtd" value={groupFactory.amountToCreate} onChange={e=>setGroupFactory({...groupFactory, amountToCreate:e.target.value})} style={{...styles.input, width:80}} />
                                </div>
                                <input type="number" placeholder="Leads p/ Grupo" value={groupFactory.leadsPerGroup} onChange={e=>setGroupFactory({...groupFactory, leadsPerGroup:e.target.value})} style={styles.input} />
                                <input placeholder="URL Mídia Inicial" value={groupFactory.mediaUrl} onChange={e=>setGroupFactory({...groupFactory, mediaUrl:e.target.value})} style={styles.input} />
                                <textarea placeholder="Msg Inicial..." value={groupFactory.initialMessage} onChange={e=>setGroupFactory({...groupFactory, initialMessage:e.target.value})} style={{...styles.input, height:80}} />
                                <label style={{color:'white', fontSize:13, display:'block', marginBottom:10}}><input type="checkbox" checked={groupFactory.promoteBots} onChange={e=>setGroupFactory({...groupFactory, promoteBots:e.target.checked})} /> Promover Bots Criados</label>
                                {!isProcessing ? <button onClick={runGroupFactory} style={styles.btn}>CRIAR AGORA</button> : <button onClick={()=>stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                                <div style={styles.list}>
                                    {createdGroups.map((g,i)=><div key={i} style={styles.listItem}><span>{g.name}</span> <a href={g.link} target="_blank" style={{color:'#58a6ff'}}>{g.link}</a></div>)}
                                </div>
                            </div>
                        )}

                        {factoryTab === 'bots' && (
                            <div style={styles.card}>
                                <h3>Fábrica de Bots</h3>
                                <div style={{display:'flex', gap:10}}>
                                    <input placeholder="Nome" value={botFactory.baseName} onChange={e=>setBotFactory({...botFactory, baseName:e.target.value})} style={styles.input} />
                                    <input type="number" placeholder="Qtd" value={botFactory.amount} onChange={e=>setBotFactory({...botFactory, amount:e.target.value})} style={{...styles.input, width:80}} />
                                </div>
                                <input placeholder="URL Foto" value={botFactory.photoUrl} onChange={e=>setBotFactory({...botFactory, photoUrl:e.target.value})} style={styles.input} />
                                <button onClick={runBotFactory} style={{...styles.btn, background:'#8957e5'}}>CRIAR BOTS</button>
                                <textarea readOnly value={createdBots.map(b=>`${b.token} | @${b.username}`).join('\n')} style={{...styles.input, height:150, fontFamily:'monospace', color:'#58a6ff'}} />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'inbox' && (
                    <div style={{display:'grid', gridTemplateColumns:'300px 1fr', height:'100%', gap:20}}>
                        <div style={{...styles.card, padding:0, overflow:'hidden'}}>
                            <div style={{overflowY:'auto', height:'100%'}}>
                                {replies.map(r=>(
                                    <div key={r.chatId} onClick={()=>setSelectedChat(r)||openChat(r)} style={{padding:15, borderBottom:'1px solid #30363d', cursor:'pointer', background: selectedChat?.chatId===r.chatId?'#1f6feb22':'transparent'}}>
                                        <div style={{fontWeight:'bold', color:'white'}}>{r.name}</div>
                                        <div style={{fontSize:12, color:'#8b949e'}}>{r.lastMessage}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{...styles.card, display:'flex', flexDirection:'column'}}>
                            {selectedChat ? (
                                <>
                                    <div style={{paddingBottom:10, borderBottom:'1px solid #30363d', fontWeight:'bold'}}>{selectedChat.name}</div>
                                    <div ref={chatListRef} style={{flex:1, overflowY:'auto', padding:'10px 0'}}>
                                        {chatHistory.map((m,i)=>(
                                            <div key={i} style={{padding:10, background:m.isOut?'#005c4b':'#21262d', borderRadius:8, marginBottom:5, maxWidth:'80%', alignSelf:m.isOut?'flex-end':'flex-start', marginLeft:m.isOut?'auto':0}}>
                                                {m.mediaType === 'video' && <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:5}} />}
                                                {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:5}} />}
                                                <div>{m.text}</div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>Selecione</div>}
                        </div>
                    </div>
                )}

                {activeTab === 'spy' && (
                    <div style={styles.card}>
                        <h3>Espião de Grupos (Roubar Leads)</h3>
                        <div style={{display:'flex', gap:10, marginBottom:10}}>
                            <button onClick={scanSpyGroups} style={styles.btn}>1. Escanear Grupos</button>
                            <button onClick={runHarvest} style={{...styles.btn, background:'#8957e5'}}>2. Roubar Leads</button>
                        </div>
                        <div style={styles.list}>
                            {spyGroups.map((g,i)=><div key={i} style={styles.listItem}>{g.title} ({g.participantsCount} members)</div>)}
                        </div>
                    </div>
                )}

                {activeTab === 'tools' && (
                    <div style={{display:'grid', gap:20, gridTemplateColumns:'1fr 1fr'}}>
                        <div style={styles.card}>
                            <h3>Trocar Perfil (Foto/Nome)</h3>
                            <input placeholder="Novo Nome" value={toolsConfig.newName} onChange={e=>setToolsConfig({...toolsConfig, newName:e.target.value})} style={styles.input}/>
                            <input placeholder="URL Foto" value={toolsConfig.newPhoto} onChange={e=>setToolsConfig({...toolsConfig, newPhoto:e.target.value})} style={styles.input}/>
                            <button onClick={()=>runTools('profile')} style={styles.btn}>ATUALIZAR TODOS</button>
                        </div>
                        <div style={styles.card}>
                            <h3>Postar Stories</h3>
                            <input placeholder="URL Mídia" value={toolsConfig.storyMedia} onChange={e=>setToolsConfig({...toolsConfig, storyMedia:e.target.value})} style={styles.input}/>
                            <input placeholder="Legenda" value={toolsConfig.storyCaption} onChange={e=>setToolsConfig({...toolsConfig, storyCaption:e.target.value})} style={styles.input}/>
                            <button onClick={()=>runTools('story')} style={styles.btn}>POSTAR</button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    </div>
  );
}

// ESTILOS (Design Simples e Funcional)
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif' },
    header: { padding: '15px 20px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    badge: { fontSize: 10, background: '#238636', padding: '2px 5px', borderRadius: 4, color: 'white' },
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: 40, borderRadius: 12, border: '1px solid #30363d', width: 350 },
    card: { background: '#161b22', padding: 20, borderRadius: 8, border: '1px solid #30363d' },
    input: { width: '100%', padding: 10, background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: 5, marginBottom: 10, boxSizing: 'border-box' },
    btn: { width: '100%', padding: 12, background: '#238636', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 'bold' },
    navBtn: { background: 'transparent', border: '1px solid #30363d', color: 'white', padding: '8px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: 5, cursor: 'pointer' },
    sidebar: { width: 250, background: '#161b22', borderRight: '1px solid #30363d', padding: 15, display: 'flex', flexDirection: 'column' },
    content: { flex: 1, padding: 20, overflowY: 'auto' },
    row: { padding: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #21262d', fontSize: 13 },
    link: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', textDecoration: 'underline', marginBottom: 10 },
    logBox: { height: 150, overflowY: 'auto', background: '#010409', padding: 10, borderRadius: 5, fontSize: 12, fontFamily: 'monospace' },
    list: { maxHeight: 200, overflowY: 'auto', background: '#010409', padding: 5, borderRadius: 5, marginTop: 10 },
    listItem: { padding: 8, borderBottom: '1px solid #30363d', fontSize: 13, display: 'flex', justifyContent: 'space-between' }
};

const subTabBtn = (active) => ({ flex: 1, padding: 10, background: active ? '#1f6feb22' : 'transparent', border: active ? '1px solid #1f6feb' : '1px solid #30363d', color: 'white', borderRadius: 5, cursor: 'pointer' });
const StatCard = ({ label, val, color }) => (<div style={{ flex: 1, background: '#161b22', padding: 20, borderRadius: 8, borderLeft: `5px solid ${color}` }}><h2 style={{ margin: 0, fontSize: 24, color: 'white' }}>{val}</h2><small style={{ color: '#8b949e' }}>{label}</small></div>);
