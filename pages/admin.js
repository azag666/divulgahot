import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V24 - ULTIMATE FACTORY SUITE
// - Persistência de Dados (Não perde nada no F5)
// - Disparo em Grupos Criados
// - Fábrica de Bots com Auto-Admin
// - Inbox e Disparo em Massa Integrados
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTH ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [credentials, setCredentials] = useState({ token: '' });

  // --- NAVEGAÇÃO ---
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, dispatch, groups_dispatch, factory, inbox
  const [factoryTab, setFactoryTab] = useState('groups'); // groups, bots
  
  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const stopProcessRef = useRef(false);

  // --- FACTORY: GRUPOS ---
  const [groupConfig, setGroupConfig] = useState({
      baseName: 'Promo VIP',
      amountToCreate: 1,
      leadsPerGroup: 50,
      initialMessage: '',
      mediaUrl: '',
      mediaType: 'text',
      promoteBots: true
  });
  const [createdGroups, setCreatedGroups] = useState([]);

  // --- FACTORY: BOTS ---
  const [botConfig, setBotConfig] = useState({ baseName: 'Atendimento', amount: 1, photoUrl: '' });
  const [createdBots, setCreatedBots] = useState([]);

  // --- DISPARO EM MASSA (PV) ---
  const [dispatchConfig, setDispatchConfig] = useState({ msg: '', imgUrl: '', useRandom: true });

  // --- DISPARO EM GRUPOS ---
  const [groupDispatchConfig, setGroupDispatchConfig] = useState({ msg: '', imgUrl: '' });

  // --- INBOX ---
  const [replies, setReplies] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatListRef = useRef(null);

  // ==========================================================================
  // INICIALIZAÇÃO E PERSISTÊNCIA
  // ==========================================================================
  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { setAuthToken(token); setIsAuthenticated(true); }
      
      // Carregar dados salvos
      const savedGroups = localStorage.getItem('ht_created_groups');
      if (savedGroups) setCreatedGroups(JSON.parse(savedGroups));
      
      const savedBots = localStorage.getItem('ht_created_bots');
      if (savedBots) setCreatedBots(JSON.parse(savedBots));
  }, []);

  // Salvar sempre que mudar
  useEffect(() => { localStorage.setItem('ht_created_groups', JSON.stringify(createdGroups)); }, [createdGroups]);
  useEffect(() => { localStorage.setItem('ht_created_bots', JSON.stringify(createdBots)); }, [createdBots]);

  useEffect(() => {
      if (isAuthenticated) {
          fetchData();
          const interval = setInterval(fetchData, 5000);
          return () => clearInterval(interval);
      }
  }, [isAuthenticated]);

  const fetchData = async () => {
      const t = Date.now();
      try {
          const sRes = await fetch(`/api/list-sessions?t=${t}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
          const sData = await sRes.json();
          if (sData.sessions) setSessions(sData.sessions);

          const stRes = await fetch(`/api/stats?t=${t}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
          const stData = await stRes.json();
          setStats(stData);
      } catch (e) {}
  };

  const addLog = (msg) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 200));
  };

  // ==========================================================================
  // 1. FÁBRICA DE GRUPOS (ENGINE)
  // ==========================================================================
  const runGroupFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas criadoras!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 INICIANDO CRIAÇÃO DE GRUPOS...');

      const creators = Array.from(selectedPhones);
      let count = 0;

      while (count < groupConfig.amountToCreate && !stopProcessRef.current) {
          const creator = creators[count % creators.length];
          const name = `${groupConfig.baseName} #${Math.floor(Math.random() * 9999)}`;
          addLog(`🏗️ Criando: ${name} via ${creator}...`);

          // 1. Buscar Leads
          let leads = [];
          try {
              const leadRes = await fetch(`/api/get-campaign-leads?limit=${groupConfig.leadsPerGroup}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
              const leadData = await leadRes.json();
              leads = leadData.leads || [];
          } catch (e) { addLog('❌ Erro ao buscar leads.'); }

          if (leads.length === 0) { addLog('⚠️ Sem leads disponíveis.'); break; }

          // 2. Criar Grupo
          try {
              const adminBots = groupConfig.promoteBots ? createdBots.map(b => b.username) : [];

              const res = await fetch('/api/factory/create-group-blast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                  body: JSON.stringify({
                      phone: creator,
                      title: name,
                      leads: leads.map(l => l.user_id),
                      initialMessage: groupConfig.initialMessage,
                      mediaUrl: groupConfig.mediaUrl,
                      mediaType: groupConfig.mediaType,
                      adminBots: adminBots
                  })
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Grupo Criado: ${data.inviteLink}`);
                  setCreatedGroups(prev => [{
                      id: data.chatId,
                      name: name,
                      link: data.inviteLink,
                      members: leads.length,
                      creator: creator,
                      date: new Date().toLocaleString()
                  }, ...prev]);
                  
                  setStats(prev => ({ ...prev, sent: prev.sent + leads.length }));
              } else {
                  addLog(`❌ Erro: ${data.error}`);
                  await new Promise(r => setTimeout(r, 10000));
              }
          } catch (e) { console.error(e); }

          count++;
          await new Promise(r => setTimeout(r, 15000)); // Delay seguro
      }
      setIsProcessing(false);
      addLog('🏁 Fábrica finalizada.');
  };

  // ==========================================================================
  // 2. FÁBRICA DE BOTS (ENGINE)
  // ==========================================================================
  const runBotFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione uma conta!');
      const creator = Array.from(selectedPhones)[0];
      setIsProcessing(true);
      addLog('🤖 Iniciando BotFather...');

      for (let i = 0; i < botConfig.amount; i++) {
          const suffix = Math.floor(Math.random() * 99999);
          const name = `${botConfig.baseName} ${suffix}`;
          const username = `${botConfig.baseName.replace(/\s+/g,'')}_${suffix}_bot`;

          try {
              const res = await fetch('/api/factory/create-bot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                  body: JSON.stringify({
                      phone: creator,
                      name: name,
                      username: username,
                      photoUrl: botConfig.photoUrl
                  })
              });
              const data = await res.json();
              if (data.success) {
                  addLog(`✅ Bot Criado: @${username}`);
                  setCreatedBots(prev => [{ username, token: data.token, date: new Date().toLocaleString() }, ...prev]);
              } else {
                  addLog(`❌ Erro BotFather: ${data.error}`);
              }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 5000));
      }
      setIsProcessing(false);
      addLog('🏁 Bots criados.');
  };

  // ==========================================================================
  // 3. DISPARO EM GRUPOS CRIADOS (NOVO)
  // ==========================================================================
  const sendToGroups = async () => {
      if (createdGroups.length === 0) return alert('Nenhum grupo criado para disparar.');
      if (!confirm(`Disparar para ${createdGroups.length} grupos?`)) return;
      
      setIsProcessing(true);
      addLog('📢 Iniciando disparo nos grupos...');

      for (const group of createdGroups) {
          try {
              // Usa o criador do grupo para enviar
              const res = await fetch('/api/dispatch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                  body: JSON.stringify({
                      senderPhone: group.creator,
                      target: group.id || group.link, // Tenta usar ID ou Link
                      isGroup: true,
                      message: groupDispatchConfig.msg,
                      imageUrl: groupDispatchConfig.imgUrl
                  })
              });
              const data = await res.json();
              if (data.success) addLog(`✅ Enviado para ${group.name}`);
              else addLog(`❌ Falha ${group.name}: ${data.error}`);
          } catch (e) {}
          await new Promise(r => setTimeout(r, 2000));
      }
      setIsProcessing(false);
      addLog('🏁 Disparo em grupos concluído.');
  };

  // ==========================================================================
  // 4. DISPARO EM MASSA (PV)
  // ==========================================================================
  const startDispatch = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 Disparo PV Iniciado...');

      const senders = Array.from(selectedPhones);
      
      while (!stopProcessRef.current) {
          const leadRes = await fetch(`/api/get-campaign-leads?limit=10&random=true`, { headers: { 'Authorization': `Bearer ${authToken}` } });
          const leads = (await leadRes.json()).leads || [];
          if (leads.length === 0) { addLog('✅ Sem leads.'); break; }

          for (const lead of leads) {
              if (stopProcessRef.current) break;
              const sender = senders[Math.floor(Math.random() * senders.length)];
              const target = lead.username && lead.username !== 'null' ? `@${lead.username}` : lead.user_id;

              try {
                  const res = await fetch('/api/dispatch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                      body: JSON.stringify({ senderPhone: sender, target, message: dispatchConfig.msg, imageUrl: dispatchConfig.imgUrl, leadDbId: lead.id })
                  });
                  const data = await res.json();
                  if (data.success) {
                      addLog(`✅ Enviado: ${target}`);
                      setStats(prev => ({ ...prev, sent: prev.sent + 1 }));
                  } else if (data.wait) {
                      addLog(`⛔ Flood ${sender}: ${data.wait}s`);
                  }
              } catch (e) {}
              await new Promise(r => setTimeout(r, 1500));
          }
      }
      setIsProcessing(false);
  };

  // ==========================================================================
  // 5. INBOX
  // ==========================================================================
  const loadInbox = async () => {
      if (selectedPhones.size === 0) {
           const online = sessions.filter(s => s.is_active).map(s => s.phone_number);
           if (online.length > 0) setSelectedPhones(new Set(online));
      }
      const phones = Array.from(selectedPhones.size > 0 ? selectedPhones : sessions.map(s=>s.phone_number));
      let all = [];
      for (let i = 0; i < phones.length; i += 5) {
          const batch = phones.slice(i, i + 5);
          const results = await Promise.all(batch.map(p => fetch('/api/spy/check-replies', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ phone: p }) }).then(r => r.json()).catch(() => ({}))));
          results.forEach(r => r.replies && all.push(...r.replies));
      }
      setReplies(all.sort((a, b) => b.timestamp - a.timestamp));
  };

  const openChat = async (r) => {
      setSelectedChat(r);
      const res = await fetch('/api/spy/get-history', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ phone: r.fromPhone, chatId: r.chatId, limit: 20 }) });
      const d = await res.json();
      setChatHistory(d.history ? d.history.reverse() : []);
      setTimeout(() => { if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight; }, 100);
  };

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================
  if (!isAuthenticated) return (
      <div style={styles.loginContainer}><div style={styles.loginBox}>
          <h2 style={{color:'white', textAlign:'center'}}>HOTTRACK V24</h2>
          <input type="password" placeholder="Token" onChange={e => setCredentials({...credentials, token: e.target.value})} style={styles.input} />
          <button onClick={() => { if(credentials.token) { setAuthToken(credentials.token); setIsAuthenticated(true); localStorage.setItem('authToken', credentials.token); }}} style={styles.btn}>ENTRAR</button>
      </div></div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* HEADER */}
        <div style={styles.header}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
                <h2 style={{margin:0, color:'white'}}>HOTTRACK</h2>
                <span style={styles.badge}>V24 ULTIMATE</span>
            </div>
            <div style={{display:'flex', gap:10}}>
                <button onClick={() => setActiveTab('dashboard')} style={navBtn(activeTab==='dashboard')}>DASHBOARD</button>
                <button onClick={() => setActiveTab('dispatch')} style={navBtn(activeTab==='dispatch')}>DISPARO (PV)</button>
                <button onClick={() => setActiveTab('groups_dispatch')} style={navBtn(activeTab==='groups_dispatch')}>DISPARO (GRUPOS)</button>
                <button onClick={() => setActiveTab('factory')} style={navBtn(activeTab==='factory')}>FÁBRICA</button>
                <button onClick={() => {setActiveTab('inbox'); loadInbox();}} style={navBtn(activeTab==='inbox')}>INBOX</button>
            </div>
            <button onClick={() => setIsAuthenticated(false)} style={styles.logoutBtn}>SAIR</button>
        </div>

        <div style={{flex:1, overflow:'hidden', display:'flex'}}>
            {/* SIDEBAR GLOBAL */}
            <div style={{width:280, background:'#161b22', borderRight:'1px solid #30363d', padding:15, display:'flex', flexDirection:'column'}}>
                <h4 style={{marginTop:0, color:'white'}}>Contas Online ({sessions.length})</h4>
                <button onClick={() => setSelectedPhones(new Set(sessions.filter(s => s.is_active).map(s => s.phone_number)))} style={styles.linkBtn}>Selecionar Todas Online</button>
                <div style={{flex:1, overflowY:'auto'}}>
                    {sessions.map(s => (
                        <div key={s.phone_number} onClick={() => {
                            const n = new Set(selectedPhones);
                            n.has(s.phone_number) ? n.delete(s.phone_number) : n.add(s.phone_number);
                            setSelectedPhones(n);
                        }} style={{...styles.accountRow, background: selectedPhones.has(s.phone_number) ? '#1f6feb22' : 'transparent'}}>
                            <div style={{width:8, height:8, borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149'}}/>
                            {s.phone_number}
                        </div>
                    ))}
                </div>
            </div>

            {/* CONTEÚDO */}
            <div style={{flex:1, overflowY:'auto', background:'#0d1117', padding:20}}>
                
                {/* 1. DASHBOARD */}
                {activeTab === 'dashboard' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20}}>
                            <StatBox label="LEADS TOTAIS" val={stats.total} color="#8957e5" />
                            <StatBox label="ENVIADOS" val={stats.sent} color="#238636" />
                            <StatBox label="GRUPOS FEITOS" val={createdGroups.length} color="#d29922" />
                        </div>
                        <div style={styles.card}><h3>Logs</h3><div style={styles.logBox}>{logs.map((l, i) => <div key={i}>{l}</div>)}</div></div>
                    </div>
                )}

                {/* 2. DISPARO EM MASSA (PV) */}
                {activeTab === 'dispatch' && (
                    <div style={styles.card}>
                        <h3>Disparo em Massa (Privado)</h3>
                        <input placeholder="URL Mídia" value={dispatchConfig.imgUrl} onChange={e=>setDispatchConfig({...dispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                        <textarea placeholder="Mensagem..." value={dispatchConfig.msg} onChange={e=>setDispatchConfig({...dispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        {!isProcessing ? <button onClick={startDispatch} style={styles.btn}>🚀 INICIAR</button> : <button onClick={() => stopProcessRef.current = true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                    </div>
                )}

                {/* 3. DISPARO EM GRUPOS */}
                {activeTab === 'groups_dispatch' && (
                    <div style={styles.card}>
                        <h3>Disparo nos Grupos Criados ({createdGroups.length})</h3>
                        <p style={{fontSize:12, color:'#8b949e'}}>Envia mensagem para todos os grupos listados na Fábrica.</p>
                        <input placeholder="URL Mídia" value={groupDispatchConfig.imgUrl} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                        <textarea placeholder="Mensagem..." value={groupDispatchConfig.msg} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        {!isProcessing ? <button onClick={sendToGroups} style={styles.btn}>📢 DISPARAR EM TODOS OS GRUPOS</button> : <button onClick={() => stopProcessRef.current = true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                    </div>
                )}

                {/* 4. FÁBRICA */}
                {activeTab === 'factory' && (
                    <div>
                        <div style={{display:'flex', gap:10, marginBottom:20}}>
                            <button onClick={() => setFactoryTab('groups')} style={subTabBtn(factoryTab==='groups')}>GRUPOS</button>
                            <button onClick={() => setFactoryTab('bots')} style={subTabBtn(factoryTab==='bots')}>BOTS</button>
                        </div>

                        {factoryTab === 'groups' && (
                            <div style={{display:'grid', gap:20}}>
                                <div style={styles.card}>
                                    <h3>Fábrica de Grupos</h3>
                                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                                        <input placeholder="Nome Base" value={groupConfig.baseName} onChange={e=>setGroupConfig({...groupConfig, baseName:e.target.value})} style={styles.input} />
                                        <input type="number" placeholder="Qtd" value={groupConfig.amountToCreate} onChange={e=>setGroupConfig({...groupConfig, amountToCreate:e.target.value})} style={styles.input} />
                                    </div>
                                    <input type="number" placeholder="Leads por Grupo" value={groupConfig.leadsPerGroup} onChange={e=>setGroupConfig({...groupConfig, leadsPerGroup:e.target.value})} style={styles.input} />
                                    <textarea placeholder="Msg Inicial..." value={groupConfig.initialMessage} onChange={e=>setGroupConfig({...groupConfig, initialMessage:e.target.value})} style={{...styles.input, height:80}} />
                                    <label style={{color:'white', fontSize:13, display:'flex', alignItems:'center', gap:5, marginBottom:10}}>
                                        <input type="checkbox" checked={groupConfig.promoteBots} onChange={e=>setGroupConfig({...groupConfig, promoteBots:e.target.checked})} /> Promover Bots Criados a Admin
                                    </label>
                                    {!isProcessing ? <button onClick={runGroupFactory} style={styles.btn}>INICIAR CICLO</button> : <button onClick={() => stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                                </div>
                                <div style={styles.card}>
                                    <div style={{display:'flex', justifyContent:'space-between'}}><h3>Grupos Criados</h3><button onClick={()=>{setCreatedGroups([]); localStorage.removeItem('ht_created_groups');}} style={{color:'#f85149', background:'none', border:'none', cursor:'pointer'}}>Limpar</button></div>
                                    <div style={{maxHeight:300, overflowY:'auto'}}>
                                        {createdGroups.map((g, i) => (
                                            <div key={i} style={{padding:10, borderBottom:'1px solid #30363d', fontSize:13, display:'flex', justifyContent:'space-between'}}>
                                                <span>{g.name}</span> <a href={g.link} target="_blank" style={{color:'#58a6ff'}}>{g.link}</a> <span>{g.members} leads</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {factoryTab === 'bots' && (
                            <div style={{display:'grid', gap:20}}>
                                <div style={styles.card}>
                                    <h3>Fábrica de Bots</h3>
                                    <input placeholder="Nome" value={botConfig.baseName} onChange={e=>setBotConfig({...botConfig, baseName:e.target.value})} style={styles.input} />
                                    <input type="number" placeholder="Qtd" value={botConfig.amount} onChange={e=>setBotConfig({...botConfig, amount:e.target.value})} style={styles.input} />
                                    <input placeholder="URL Foto" value={botConfig.photoUrl} onChange={e=>setBotConfig({...botConfig, photoUrl:e.target.value})} style={styles.input} />
                                    <button onClick={runBotFactory} style={{...styles.btn, background:'#8957e5'}}>CRIAR BOTS</button>
                                </div>
                                <div style={styles.card}>
                                    <h3>Tokens</h3>
                                    <textarea readOnly value={createdBots.map(b => `${b.token} | @${b.username}`).join('\n')} style={{...styles.input, height:200, fontFamily:'monospace', color:'#58a6ff'}} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 5. INBOX */}
                {activeTab === 'inbox' && (
                     <div style={{display:'grid', gridTemplateColumns:'300px 1fr', height:'100%', gap:20}}>
                         <div style={{background:'#161b22', borderRadius:10, border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                             <div style={{flex:1, overflowY:'auto'}}>
                                 {replies.map(r => (
                                     <div key={r.chatId} onClick={() => {setSelectedChat(r);}} style={{padding:15, borderBottom:'1px solid #21262d', background:selectedChat?.chatId===r.chatId?'#1f6feb22':'transparent', cursor:'pointer'}}>
                                         <b>{r.name}</b><br/><span style={{fontSize:12, color:'#8b949e'}}>{r.lastMessage}</span>
                                     </div>
                                 ))}
                             </div>
                         </div>
                         <div style={{background:'#010409', borderRadius:10, border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                             {selectedChat ? (
                                 <div ref={chatListRef} style={{flex:1, overflowY:'auto', padding:20}}>
                                     {chatHistory.map((m, i) => (
                                         <div key={i} style={{background: m.isOut?'#005c4b':'#21262d', padding:10, borderRadius:8, marginBottom:10, alignSelf: m.isOut?'flex-end':'flex-start', maxWidth:'70%', marginLeft: m.isOut?'auto':'0'}}>
                                             {m.text}
                                         </div>
                                     ))}
                                 </div>
                             ) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>Selecione</div>}
                         </div>
                     </div>
                )}
            </div>
        </div>
    </div>
  );
}

// ESTILOS
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif' },
    header: { padding: '15px 25px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    badge: { fontSize: 10, background: '#238636', padding: '3px 7px', borderRadius: 4, color: 'white', fontWeight: 'bold' },
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: 40, borderRadius: 12, border: '1px solid #30363d', width: 350 },
    card: { background: '#161b22', padding: 20, borderRadius: 10, border: '1px solid #30363d' },
    input: { width: '100%', padding: 12, background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: 8, marginBottom: 15, boxSizing: 'border-box' },
    btn: { width: '100%', padding: 14, background: '#238636', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' },
    linkBtn: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', marginBottom: 10 },
    logBox: { height: 150, overflowY: 'auto', background: '#010409', padding: 10, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: '#8b949e' },
    accountRow: { padding: '10px', borderBottom: '1px solid #21262d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: 13 }
};
const navBtn = (active) => ({ background: active ? '#1f6feb' : 'transparent', border: '1px solid #30363d', color: 'white', padding: '8px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' });
const subTabBtn = (active) => ({ flex: 1, padding: 10, background: active ? '#1f6feb22' : 'transparent', border: active ? '1px solid #1f6feb' : '1px solid #30363d', color: 'white', borderRadius: 6, cursor: 'pointer' });
const StatBox = ({ label, val, color }) => (<div style={{ flex: 1, background: '#161b22', padding: 20, borderRadius: 10, borderLeft: `5px solid ${color}` }}><h2 style={{ margin: 0, fontSize: 28, color: 'white' }}>{val}</h2><small style={{ color: '#8b949e', fontWeight: 'bold' }}>{label}</small></div>);
