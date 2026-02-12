import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V25 - SISTEMA OPERACIONAL COMPLETO
// Arquivo: pages/admin.js
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [credentials, setCredentials] = useState({ user: '', pass: '', token: '' });

  // --- NAVEGAÇÃO ---
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, dispatch, groups_dispatch, factory, inbox, spy
  const [factoryTab, setFactoryTab] = useState('groups'); // groups, bots
  
  // --- DADOS DO SISTEMA ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const stopProcessRef = useRef(false);

  // --- CONFIGURAÇÃO: DISPARO EM MASSA (PV) ---
  const [dispatchConfig, setDispatchConfig] = useState({ 
      msg: '', 
      imgUrl: '', 
      useRandom: true 
  });

  // --- CONFIGURAÇÃO: DISPARO EM GRUPOS ---
  const [groupDispatchConfig, setGroupDispatchConfig] = useState({ 
      msg: '', 
      imgUrl: '' 
  });

  // --- CONFIGURAÇÃO: FÁBRICA DE GRUPOS ---
  const [groupFactoryConfig, setGroupFactoryConfig] = useState({
      baseName: 'Grupo Promo VIP',
      amountToCreate: 1,
      leadsPerGroup: 50,
      initialMessage: '',
      mediaUrl: '',
      mediaType: 'text', // text, image, video
      promoteBots: true
  });
  // Armazena visualmente os grupos criados (Persistente)
  const [createdGroupsList, setCreatedGroupsList] = useState([]); 

  // --- CONFIGURAÇÃO: FÁBRICA DE BOTS ---
  const [botFactoryConfig, setBotFactoryConfig] = useState({
      baseName: 'Atendimento',
      amount: 1,
      photoUrl: ''
  });
  // Armazena visualmente os bots criados (Persistente)
  const [createdBotsList, setCreatedBotsList] = useState([]);

  // --- INBOX & CHAT ---
  const [replies, setReplies] = useState([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatListRef = useRef(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // --- SPY (FERRAMENTAS) ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);

  // ==========================================================================
  // 1. INICIALIZAÇÃO, POLLING E PERSISTÊNCIA
  // ==========================================================================

  useEffect(() => {
      // 1. Verificar Login
      const token = localStorage.getItem('authToken');
      if (token) { 
          setAuthToken(token); 
          setIsAuthenticated(true); 
      }
      
      // 2. Carregar Dados Salvos (Grupos e Bots criados anteriormente)
      const savedGroups = localStorage.getItem('ht_created_groups');
      if (savedGroups) setCreatedGroupsList(JSON.parse(savedGroups));
      
      const savedBots = localStorage.getItem('ht_created_bots');
      if (savedBots) setCreatedBotsList(JSON.parse(savedBots));

      // 3. Carregar Grupos do Spy
      const savedSpyGroups = localStorage.getItem('godModeGroups');
      if (savedSpyGroups) setAllGroups(JSON.parse(savedSpyGroups));
  }, []);

  // Salvar automaticamente sempre que a lista de grupos/bots mudar
  useEffect(() => {
      localStorage.setItem('ht_created_groups', JSON.stringify(createdGroupsList));
  }, [createdGroupsList]);

  useEffect(() => {
      localStorage.setItem('ht_created_bots', JSON.stringify(createdBotsList));
  }, [createdBotsList]);

  // Polling de Dados (Atualiza status a cada 5s)
  useEffect(() => {
      if (isAuthenticated) {
          fetchData();
          const intervalId = setInterval(fetchData, 5000);
          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated]);

  // Controle de Scroll do Chat
  useLayoutEffect(() => {
      if (chatListRef.current && shouldScrollToBottom) {
          chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      }
  }, [chatHistory, shouldScrollToBottom, selectedChat]);

  // ==========================================================================
  // 2. FUNÇÕES AUXILIARES E API
  // ==========================================================================

  const apiCall = async (endpoint, body) => {
      try {
          const response = await fetch(endpoint, {
              method: body ? 'POST' : 'GET',
              headers: { 
                  'Content-Type': 'application/json', 
                  'Authorization': `Bearer ${authToken}` 
              },
              body: body ? JSON.stringify(body) : null
          });
          
          if (response.status === 401) { 
              setIsAuthenticated(false); 
              return null; 
          }
          return response;
      } catch (error) { 
          return { ok: false }; 
      }
  };

  const addLog = (message) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 200));
  };

  const fetchData = async () => {
      const t = Date.now();
      // Busca Sessões
      const sRes = await apiCall(`/api/list-sessions?t=${t}`);
      if (sRes?.ok) {
          const data = await sRes.json();
          setSessions(data.sessions || []);
      }
      // Busca Estatísticas
      const stRes = await apiCall(`/api/stats?t=${t}`);
      if (stRes?.ok) setStats(await stRes.json());
      
      // Busca IDs já aspirados
      const hRes = await apiCall('/api/get-harvested');
      if (hRes?.ok) {
          const data = await hRes.json();
          if (data.harvestedIds) setHarvestedIds(new Set(data.harvestedIds));
      }
  };

  // ==========================================================================
  // 3. FÁBRICA DE GRUPOS (ENGINE)
  // ==========================================================================

  const startGroupFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas criadoras na lista ao lado!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 INICIANDO FÁBRICA DE GRUPOS...');

      const creators = Array.from(selectedPhones);
      let createdCount = 0;

      while (createdCount < groupFactoryConfig.amountToCreate && !stopProcessRef.current) {
          // 1. Define o Criador (Rodízio)
          const creator = creators[createdCount % creators.length];
          const groupName = `${groupFactoryConfig.baseName} #${Math.floor(Math.random() * 9999)}`;

          addLog(`🏗️ (${createdCount + 1}/${groupFactoryConfig.amountToCreate}) Criando: ${groupName} via ${creator}...`);

          // 2. Busca Leads Frescos
          let leads = [];
          try {
              const leadsRes = await apiCall(`/api/get-campaign-leads?limit=${groupFactoryConfig.leadsPerGroup}&t=${Date.now()}`);
              const leadsData = await leadsRes?.json();
              leads = leadsData?.leads || [];
          } catch (e) { addLog('❌ Erro ao buscar leads no banco.'); }

          if (leads.length === 0) {
              addLog('⚠️ Banco de leads vazio ou esgotado.');
              break;
          }

          // 3. Cria Grupo, Adiciona Leads, Promove Bots e Envia Oferta
          try {
              // Prepara lista de bots para promover (pega os usernames dos bots criados)
              const adminBots = groupFactoryConfig.promoteBots ? createdBotsList.map(b => b.username) : [];

              const res = await apiCall('/api/factory/create-group-blast', {
                  phone: creator,
                  title: groupName,
                  leads: leads.map(l => l.user_id),
                  initialMessage: groupFactoryConfig.initialMessage,
                  mediaUrl: groupFactoryConfig.mediaUrl,
                  mediaType: groupFactoryConfig.mediaType,
                  adminBots: adminBots
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Grupo Criado com Sucesso! Link: ${data.inviteLink}`);
                  
                  // Salva na lista visual
                  const newGroupData = {
                      id: data.chatId,
                      name: groupName,
                      link: data.inviteLink,
                      members: leads.length,
                      creator: creator,
                      date: new Date().toLocaleString()
                  };
                  
                  setCreatedGroupsList(prev => [newGroupData, ...prev]);
                  
                  // Atualiza contadores
                  setStats(prev => ({ ...prev, sent: prev.sent + leads.length }));
              } else {
                  addLog(`❌ Falha ao criar grupo: ${data.error}`);
                  // Se falhar (ex: flood), espera mais tempo
                  await new Promise(r => setTimeout(r, 10000));
              }

          } catch (e) { 
              console.error(e);
              addLog('❌ Erro crítico na requisição de criação.');
          }

          createdCount++;
          // Delay de segurança entre criações de grupo para evitar banimento da conta criadora
          await new Promise(r => setTimeout(r, 20000)); 
      }

      setIsProcessing(false);
      addLog('🏁 Ciclo da Fábrica de Grupos finalizado.');
  };

  // ==========================================================================
  // 4. FÁBRICA DE BOTS (ENGINE)
  // ==========================================================================

  const startBotFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione UMA conta para falar com o BotFather!');
      const creator = Array.from(selectedPhones)[0];
      
      setIsProcessing(true);
      addLog(`🤖 Iniciando criação de ${botFactoryConfig.amount} bots...`);

      for (let i = 0; i < botFactoryConfig.amount; i++) {
          const suffix = Math.floor(Math.random() * 99999);
          const name = `${botFactoryConfig.baseName} ${suffix}`;
          const username = `${botFactoryConfig.baseName.replace(/\s+/g,'')}_${suffix}_bot`;

          addLog(`⚙️ Configurando @${username}...`);

          try {
              const res = await apiCall('/api/factory/create-bot', {
                  phone: creator,
                  name: name,
                  username: username,
                  photoUrl: botFactoryConfig.photoUrl
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Bot Criado! Token capturado.`);
                  const newBot = {
                      username: username,
                      token: data.token,
                      date: new Date().toLocaleString()
                  };
                  setCreatedBotsList(prev => [newBot, ...prev]);
              } else {
                  addLog(`❌ Erro no BotFather: ${data.error}`);
              }
          } catch (e) {
              addLog(`❌ Erro de conexão.`);
          }

          // Delay necessário para o BotFather não bloquear
          await new Promise(r => setTimeout(r, 8000));
      }

      setIsProcessing(false);
      addLog('🏁 Criação de bots finalizada.');
  };

  // ==========================================================================
  // 5. DISPARO EM GRUPOS (ENGINE)
  // ==========================================================================

  const startGroupsDispatch = async () => {
      if (createdGroupsList.length === 0) return alert('Nenhum grupo criado disponível para disparo.');
      if (!confirm(`Deseja disparar para ${createdGroupsList.length} grupos?`)) return;

      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('📢 Iniciando disparo nos grupos criados...');

      for (const group of createdGroupsList) {
          if (stopProcessRef.current) break;

          try {
              // Tenta disparar usando o criador do grupo
              const res = await apiCall('/api/dispatch', {
                  senderPhone: group.creator,
                  target: group.id || group.link, // Prioriza ID, usa Link como fallback
                  isGroup: true, // Flag para o backend saber que é grupo
                  message: groupDispatchConfig.msg,
                  imageUrl: groupDispatchConfig.imgUrl
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Enviado para grupo: ${group.name}`);
              } else {
                  addLog(`❌ Falha no grupo ${group.name}: ${data.error}`);
              }
          } catch (e) {
              addLog(`❌ Erro de conexão no grupo ${group.name}`);
          }

          // Delay entre grupos
          await new Promise(r => setTimeout(r, 3000));
      }

      setIsProcessing(false);
      addLog('🏁 Disparo em grupos concluído.');
  };

  // ==========================================================================
  // 6. DISPARO EM MASSA PV (ENGINE)
  // ==========================================================================

  const startMassDispatch = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas para disparo!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 INICIANDO DISPARO EM MASSA (PV)...');

      const senders = Array.from(selectedPhones);
      let cooldowns = {};

      while (!stopProcessRef.current) {
          // Filtra contas ativas
          const activeSenders = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
          if (activeSenders.length === 0) {
              addLog('⏳ Todas as contas em Flood Wait. Aguardando 5s...');
              await new Promise(r => setTimeout(r, 5000));
              continue;
          }

          // Busca Leads
          const leadRes = await apiCall(`/api/get-campaign-leads?limit=10&random=${dispatchConfig.useRandom}`);
          const leadData = await leadRes?.json();
          const leads = leadData?.leads || [];

          if (leads.length === 0) { 
              addLog('✅ Lista de leads finalizada.'); 
              break; 
          }

          // Dispara
          for (const lead of leads) {
              if (stopProcessRef.current) break;
              
              const sender = activeSenders[Math.floor(Math.random() * activeSenders.length)];
              // Smart Target: username > id
              const target = (lead.username && lead.username !== 'null') 
                  ? (lead.username.startsWith('@') ? lead.username : `@${lead.username}`) 
                  : lead.user_id;

              try {
                  const res = await apiCall('/api/dispatch', {
                      senderPhone: sender,
                      target: target,
                      message: dispatchConfig.msg,
                      imageUrl: dispatchConfig.imgUrl,
                      leadDbId: lead.id
                  });
                  const data = await res.json();

                  if (data.success) {
                      addLog(`✅ Enviado: ${sender} -> ${target}`);
                      setStats(prev => ({ ...prev, sent: prev.sent + 1 }));
                  } else if (data.wait) {
                      addLog(`⛔ Flood em ${sender}: ${data.wait}s`);
                      cooldowns[sender] = Date.now() + (data.wait * 1000);
                  } else {
                      addLog(`❌ Erro: ${data.error}`);
                  }
              } catch (e) {}

              await new Promise(r => setTimeout(r, 1500));
          }
      }
      setIsProcessing(false);
      addLog('🏁 Disparo finalizado.');
  };

  // ==========================================================================
  // 7. INBOX & CHAT
  // ==========================================================================

  const loadInbox = async () => {
      if (selectedPhones.size === 0) {
           const online = sessions.filter(s => s.is_active).map(s => s.phone_number);
           if (online.length > 0) setSelectedPhones(new Set(online));
           else return alert('Nenhuma conta online para carregar inbox.');
      }
      
      setIsLoadingReplies(true);
      setReplies([]);
      const phones = Array.from(selectedPhones.size > 0 ? selectedPhones : sessions.map(s=>s.phone_number));
      let all = [];
      
      for (let i = 0; i < phones.length; i += 5) {
          const batch = phones.slice(i, i + 5);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p }).then(r => r.json()).catch(() => ({}))
          ));
          results.forEach(r => { if (r.replies) all.push(...r.replies); });
      }
      
      setReplies(all.sort((a, b) => b.timestamp - a.timestamp));
      setIsLoadingReplies(false);
  };

  const openChat = async (r, offset = 0) => {
      if (offset === 0) {
          setSelectedChat(r);
          setChatHistory([]);
          setShouldScrollToBottom(true);
      } else {
          setShouldScrollToBottom(false);
      }

      const res = await apiCall('/api/spy/get-history', { 
          phone: r.fromPhone, 
          chatId: r.chatId, 
          limit: 20, 
          offset 
      });
      const d = await res.json();
      
      if (d.history) {
          const newMsgs = d.history.reverse();
          setChatHistory(prev => offset === 0 ? newMsgs : [...newMsgs, ...prev]);
      }
  };

  const coletarOferta = (msg) => {
      // Clona para todas as configs possíveis
      const text = msg.text || '';
      setDispatchConfig(p => ({...p, msg: text}));
      setGroupFactoryConfig(p => ({...p, initialMessage: text}));
      setGroupDispatchConfig(p => ({...p, msg: text}));
      alert("♻️ Oferta copiada para todas as áreas de disparo!");
  };

  // ==========================================================================
  // 8. SPY TOOLS (HARVEST)
  // ==========================================================================

  const scanGroups = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsScanning(true);
      addLog('📡 Escaneando grupos...');
      let found = [];
      const phones = Array.from(selectedPhones);
      for (const p of phones) {
          try {
              const res = await apiCall('/api/spy/list-chats', { phone: p });
              const data = await res.json();
              if (data.chats) data.chats.forEach(c => !c.type.includes('Canal') && found.push({ ...c, ownerPhone: p }));
          } catch (e) {}
      }
      const unique = [...new Map(found.map(i => [i.id, i])).values()];
      setAllGroups(unique);
      localStorage.setItem('godModeGroups', JSON.stringify(unique));
      setIsScanning(false);
      addLog(`📡 ${unique.length} grupos encontrados.`);
  };

  const harvestAll = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if (targets.length === 0) return alert('Nada novo.');
      setIsHarvesting(true);
      addLog('🕷️ Aspirando...');
      for (const t of targets) {
          try {
             const res = await apiCall('/api/spy/harvest', { phone: t.ownerPhone, chatId: t.id, chatName: t.title });
             const data = await res.json();
             if (data.success) {
                 addLog(`✅ +${data.count} leads: ${t.title}`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 1000));
      }
      setIsHarvesting(false);
      addLog('🏁 Fim da aspiração.');
  };

  // ==========================================================================
  // RENDERIZAÇÃO E LOGIN
  // ==========================================================================

  const handleLogin = async (e) => {
      e.preventDefault();
      const endpoint = loginMode === 'user' ? '/api/login' : '/api/admin-login';
      const body = loginMode === 'user' ? { username: credentials.user, password: credentials.pass } : { password: credentials.token };
      try {
          const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
          const data = await res.json();
          if (data.success) { setAuthToken(data.token); setIsAuthenticated(true); localStorage.setItem('authToken', data.token); }
          else alert(data.error);
      } catch (e) { alert('Erro conexão'); }
  };

  if (!isAuthenticated) return (
      <div style={styles.loginContainer}><div style={styles.loginBox}>
          <h2 style={{color:'white', textAlign:'center'}}>HOTTRACK V25</h2>
          <div style={{display:'flex', gap:10, marginBottom:10}}>
              <button onClick={()=>setLoginMode('user')} style={{...styles.btn, background: loginMode==='user'?'#238636':'#21262d'}}>User</button>
              <button onClick={()=>setLoginMode('admin')} style={{...styles.btn, background: loginMode==='admin'?'#8957e5':'#21262d'}}>Admin</button>
          </div>
          {loginMode === 'user' ? (
              <>
                  <input placeholder="Usuário" onChange={e=>setCredentials({...credentials, user:e.target.value})} style={styles.input}/>
                  <input type="password" placeholder="Senha" onChange={e=>setCredentials({...credentials, pass:e.target.value})} style={styles.input}/>
              </>
          ) : (
              <input type="password" placeholder="Token" onChange={e=>setCredentials({...credentials, token:e.target.value})} style={styles.input}/>
          )}
          <button onClick={handleLogin} style={styles.btn}>ENTRAR</button>
      </div></div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* HEADER */}
        <div style={styles.header}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
                <h2 style={{margin:0, color:'white'}}>HOTTRACK</h2>
                <span style={styles.badge}>V25 FINAL</span>
            </div>
            <div style={{display:'flex', gap:10}}>
                {['dashboard', 'dispatch', 'groups_dispatch', 'factory', 'inbox', 'spy'].map(tab => (
                    <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'inbox') loadInbox(); }} style={{
                        ...styles.navBtn,
                        background: activeTab === tab ? '#1f6feb' : 'transparent', 
                        borderColor: activeTab === tab ? '#1f6feb' : '#30363d'
                    }}>{tab.replace('_', ' ').toUpperCase()}</button>
                ))}
            </div>
            <button onClick={() => setIsAuthenticated(false)} style={styles.logoutBtn}>SAIR</button>
        </div>

        <div style={{flex:1, overflow:'hidden', display:'flex'}}>
            {/* SIDEBAR DE CONTAS */}
            <div style={{width:280, background:'#161b22', borderRight:'1px solid #30363d', padding:15, display:'flex', flexDirection:'column'}}>
                <h4 style={{marginTop:0, color:'white'}}>Contas ({sessions.length})</h4>
                <button onClick={() => setSelectedPhones(new Set(sessions.filter(s => s.is_active).map(s => s.phone_number)))} style={styles.linkBtn}>Selecionar Online</button>
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

            {/* CONTEÚDO PRINCIPAL */}
            <div style={{flex:1, overflowY:'auto', background:'#0d1117', padding:20}}>
                
                {/* 1. DASHBOARD */}
                {activeTab === 'dashboard' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20}}>
                            <StatBox label="LEADS TOTAIS" val={stats.total} color="#8957e5" />
                            <StatBox label="ENVIADOS" val={stats.sent} color="#238636" />
                            <StatBox label="GRUPOS CRIADOS" val={createdGroupsList.length} color="#d29922" />
                        </div>
                        <div style={styles.card}>
                            <h3>Logs do Sistema</h3>
                            <div style={styles.logBox}>
                                {logs.map((l, i) => <div key={i} style={{color: l.includes('Erro') ? '#f85149' : '#8b949e'}}>{l}</div>)}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. DISPARO EM MASSA (PV) */}
                {activeTab === 'dispatch' && (
                    <div style={styles.card}>
                        <h3>Disparo em Massa (Privado)</h3>
                        <div style={{display:'flex', gap:10, marginBottom:10}}>
                            <input placeholder="URL da Mídia (Opcional)" value={dispatchConfig.imgUrl} onChange={e=>setDispatchConfig({...dispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                            <label style={{color:'white', display:'flex', alignItems:'center', gap:5}}><input type="checkbox" checked={dispatchConfig.useRandom} onChange={e=>setDispatchConfig({...dispatchConfig, useRandom:e.target.checked})} /> Aleatório</label>
                        </div>
                        <textarea placeholder="Mensagem..." value={dispatchConfig.msg} onChange={e=>setDispatchConfig({...dispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        
                        {!isProcessing ? (
                            <button onClick={startMassDispatch} style={styles.btn}>🚀 INICIAR DISPARO</button>
                        ) : (
                            <button onClick={() => stopProcessRef.current = true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>
                        )}
                    </div>
                )}

                {/* 3. DISPARO EM GRUPOS */}
                {activeTab === 'groups_dispatch' && (
                    <div style={styles.card}>
                        <h3>Disparo nos Grupos Criados ({createdGroupsList.length})</h3>
                        <p style={{fontSize:12, color:'#8b949e', marginBottom:15}}>Envia para todos os grupos listados na Fábrica.</p>
                        <input placeholder="URL Mídia" value={groupDispatchConfig.imgUrl} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, imgUrl:e.target.value})} style={styles.input} />
                        <textarea placeholder="Mensagem..." value={groupDispatchConfig.msg} onChange={e=>setGroupDispatchConfig({...groupDispatchConfig, msg:e.target.value})} style={{...styles.input, height:150}} />
                        
                        {!isProcessing ? (
                            <button onClick={startGroupsDispatch} style={styles.btn}>📢 DISPARAR EM TODOS OS GRUPOS</button>
                        ) : (
                            <button onClick={() => stopProcessRef.current = true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>
                        )}
                    </div>
                )}

                {/* 4. FÁBRICA (FACTORY) */}
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
                                        <input placeholder="Nome Base" value={groupFactoryConfig.baseName} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, baseName:e.target.value})} style={styles.input} />
                                        <input type="number" placeholder="Qtd Grupos" value={groupFactoryConfig.amountToCreate} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, amountToCreate:e.target.value})} style={styles.input} />
                                    </div>
                                    <input type="number" placeholder="Leads por Grupo" value={groupFactoryConfig.leadsPerGroup} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, leadsPerGroup:e.target.value})} style={styles.input} />
                                    
                                    <label style={styles.label}>Configuração de Envio Inicial</label>
                                    <div style={{display:'flex', gap:10}}>
                                        <select value={groupFactoryConfig.mediaType} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, mediaType:e.target.value})} style={{...styles.select, width:100}}>
                                            <option value="text">Texto</option>
                                            <option value="image">Imagem</option>
                                            <option value="video">Vídeo</option>
                                        </select>
                                        <input placeholder="URL Mídia" value={groupFactoryConfig.mediaUrl} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, mediaUrl:e.target.value})} style={{...styles.input, marginBottom:0}} />
                                    </div>
                                    <textarea placeholder="Mensagem Inicial..." value={groupFactoryConfig.initialMessage} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, initialMessage:e.target.value})} style={{...styles.input, height:80, marginTop:10}} />
                                    
                                    <label style={{color:'white', fontSize:13, display:'flex', alignItems:'center', gap:5, marginBottom:10}}>
                                        <input type="checkbox" checked={groupFactoryConfig.promoteBots} onChange={e=>setGroupFactoryConfig({...groupFactoryConfig, promoteBots:e.target.checked})} /> Promover Bots Criados a Admin
                                    </label>

                                    {!isProcessing ? <button onClick={startGroupFactory} style={styles.btn}>INICIAR CICLO</button> : <button onClick={() => stopProcessRef.current=true} style={{...styles.btn, background:'#f85149'}}>PARAR</button>}
                                </div>

                                <div style={styles.card}>
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:10}}>
                                        <h3>Grupos Criados ({createdGroupsList.length})</h3>
                                        <button onClick={()=>{setCreatedGroupsList([]); localStorage.removeItem('ht_created_groups');}} style={{color:'#f85149', background:'none', border:'none', cursor:'pointer'}}>Limpar</button>
                                    </div>
                                    <div style={{maxHeight:300, overflowY:'auto', background:'#010409', borderRadius:8}}>
                                        {createdGroupsList.map((g, i) => (
                                            <div key={i} style={{padding:10, borderBottom:'1px solid #30363d', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                                <div>
                                                    <span style={{fontWeight:'bold', display:'block'}}>{g.name}</span>
                                                    <span style={{fontSize:11, color:'#8b949e'}}>{g.date} | {g.members} leads</span>
                                                </div>
                                                <a href={g.link} target="_blank" style={{color:'#58a6ff', textDecoration:'none', border:'1px solid #30363d', padding:'5px 10px', borderRadius:5}}>Entrar</a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {factoryTab === 'bots' && (
                            <div style={{display:'grid', gap:20}}>
                                <div style={styles.card}>
                                    <h3>Fábrica de Bots (@BotFather)</h3>
                                    <input placeholder="Nome Base" value={botFactoryConfig.baseName} onChange={e=>setBotFactoryConfig({...botFactoryConfig, baseName:e.target.value})} style={styles.input} />
                                    <div style={{display:'flex', gap:10}}>
                                        <input type="number" placeholder="Qtd" value={botFactoryConfig.amount} onChange={e=>setBotFactoryConfig({...botFactoryConfig, amount:e.target.value})} style={{...styles.input, width:100}} />
                                        <input placeholder="URL Foto (Opcional)" value={botFactoryConfig.photoUrl} onChange={e=>setBotFactoryConfig({...botFactoryConfig, photoUrl:e.target.value})} style={styles.input} />
                                    </div>
                                    <button onClick={startBotFactory} style={{...styles.btn, background:'#8957e5'}}>CRIAR BOTS</button>
                                </div>
                                <div style={styles.card}>
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:10}}>
                                        <h3>Bots Criados ({createdBotsList.length})</h3>
                                        <button onClick={()=>{setCreatedBotsList([]); localStorage.removeItem('ht_created_bots');}} style={{color:'#f85149', background:'none', border:'none', cursor:'pointer'}}>Limpar</button>
                                    </div>
                                    <textarea readOnly value={createdBotsList.map(b => `${b.token} | @${b.username}`).join('\n')} style={{...styles.input, height:200, fontFamily:'monospace', color:'#58a6ff'}} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 5. INBOX */}
                {activeTab === 'inbox' && (
                     <div style={{display:'grid', gridTemplateColumns:'300px 1fr', height:'100%', gap:20}}>
                         <div style={{background:'#161b22', borderRadius:10, border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                             <button onClick={loadInbox} style={{...styles.btn, margin:10}}>{isLoadingReplies ? 'Carregando...' : 'Atualizar Inbox'}</button>
                             <div style={{flex:1, overflowY:'auto'}}>
                                 {replies.map(r => (
                                     <div key={r.chatId} onClick={() => openChat(r)} style={{padding:15, borderBottom:'1px solid #21262d', background:selectedChat?.chatId===r.chatId?'#1f6feb22':'transparent', cursor:'pointer'}}>
                                         <b>{r.name}</b><br/><span style={{fontSize:12, color:'#8b949e'}}>{r.lastMessage}</span>
                                     </div>
                                 ))}
                             </div>
                         </div>
                         <div style={{background:'#010409', borderRadius:10, border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                             {selectedChat ? (
                                 <>
                                     <div style={{padding:15, borderBottom:'1px solid #30363d'}}><b>{selectedChat.name}</b></div>
                                     <div ref={chatListRef} style={{flex:1, overflowY:'auto', padding:20}}>
                                         {chatHistory.map((m, i) => (
                                             <div key={i} style={{background: m.isOut?'#005c4b':'#21262d', padding:10, borderRadius:8, marginBottom:10, alignSelf: m.isOut?'flex-end':'flex-start', maxWidth:'80%', marginLeft: m.isOut?'auto':'0'}}>
                                                 {m.mediaType === 'video' && <video controls src={`data:video/mp4;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:5, marginBottom:5}} />}
                                                 {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:5, marginBottom:5}} />}
                                                 <div style={{whiteSpace:'pre-wrap'}}>{m.text}</div>
                                                 {!m.isOut && <button onClick={()=>coletarOferta(m)} style={styles.cloneBtn}>♻️ COPIAR</button>}
                                             </div>
                                         ))}
                                     </div>
                                 </>
                             ) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>Selecione uma conversa</div>}
                         </div>
                     </div>
                )}

                {/* 6. SPY (HARVEST) */}
                {activeTab === 'spy' && (
                    <div style={{display:'grid', gap:20}}>
                        <div style={styles.card}>
                            <h3>Extrator de Leads (Grupos)</h3>
                            <div style={{display:'flex', gap:10}}>
                                <button onClick={scanGroups} disabled={isScanning} style={styles.btn}>{isScanning ? 'Escaneando...' : '1. Escanear Grupos'}</button>
                                <button onClick={harvestAll} disabled={isHarvesting} style={{...styles.btn, background:'#8957e5'}}>{isHarvesting ? 'Aspirando...' : '2. Aspirar Leads'}</button>
                            </div>
                            <div style={{marginTop:15, height:300, overflowY:'auto', background:'#010409', borderRadius:8}}>
                                {allGroups.map((g,i)=>(
                                    <div key={i} style={{padding:10, borderBottom:'1px solid #21262d', fontSize:13}}>{g.title} ({g.participantsCount}) {harvestedIds.has(g.id)?'✅':''}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    </div>
  );
}

// ESTILOS (CSS-IN-JS)
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif' },
    header: { padding: '15px 25px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    badge: { fontSize: 10, background: '#238636', padding: '3px 7px', borderRadius: 4, color: 'white', fontWeight: 'bold' },
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: 40, borderRadius: 12, border: '1px solid #30363d', width: 350 },
    card: { background: '#161b22', padding: 20, borderRadius: 10, border: '1px solid #30363d' },
    input: { width: '100%', padding: 12, background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: 8, marginBottom: 15, boxSizing: 'border-box' },
    select: { background: '#010409', color: 'white', border: '1px solid #30363d', padding: 12, borderRadius: 8 },
    btn: { width: '100%', padding: 14, background: '#238636', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' },
    linkBtn: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', marginBottom: 10 },
    logBox: { height: 150, overflowY: 'auto', background: '#010409', padding: 10, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: '#8b949e' },
    accountRow: { padding: '10px', borderBottom: '1px solid #21262d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: 13 },
    navBtn: { background: 'transparent', border: '1px solid #30363d', color: 'white', padding: '8px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' },
    label: { display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 5, fontWeight: 'bold' },
    cloneBtn: { background: 'rgba(31, 111, 235, 0.2)', color: '#58a6ff', border: '1px solid #1f6feb', fontSize: '10px', padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontWeight: 'bold', marginTop: 5 }
};

const subTabBtn = (active) => ({ flex: 1, padding: 10, background: active ? '#1f6feb22' : 'transparent', border: active ? '1px solid #1f6feb' : '1px solid #30363d', color: 'white', borderRadius: 6, cursor: 'pointer' });
const StatBox = ({ label, val, color }) => (<div style={{ flex: 1, background: '#161b22', padding: 20, borderRadius: 10, borderLeft: `5px solid ${color}` }}><h2 style={{ margin: 0, fontSize: 28, color: 'white' }}>{val}</h2><small style={{ color: '#8b949e', fontWeight: 'bold' }}>{label}</small></div>);
