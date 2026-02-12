import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V20 - FACTORY EDITION
// - Mass Group Launcher: Cria grupos, lota com leads e dispara.
// - Bot Factory: Automação do @BotFather para criar bots e extrair tokens.
// - Smart Engine: Disparo otimizado.
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [credentials, setCredentials] = useState({ user: '', pass: '', token: '' });

  // --- UI & NAVEGAÇÃO ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  
  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- DISPARO & MODELOS ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState({ msg: '', imgUrl: '', useRandom: true });
  const stopProcessRef = useRef(false);

  // --- INBOX ---
  const [replies, setReplies] = useState([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatListRef = useRef(null); 
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // --- FACTORY & SPY ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);
  
  // Inputs da Fábrica
  const [groupFactory, setGroupFactory] = useState({ baseName: 'Grupo VIP', leadsPerGroup: 50, message: '' });
  const [botFactory, setBotFactory] = useState({ baseName: 'Atendimento', amount: 5, createdBots: [] });
  const [botEditor, setBotEditor] = useState({ tokenList: '', newName: '', newPhoto: '' });

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================

  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { 
          setAuthToken(token); 
          setIsAuthenticated(true); 
      }
      const savedGroups = localStorage.getItem('godModeGroups');
      if (savedGroups) setAllGroups(JSON.parse(savedGroups));
  }, []);

  useEffect(() => {
      if (isAuthenticated) {
          fetchData(); 
          const intervalId = setInterval(() => {
              const t = Date.now();
              apiCall(`/api/list-sessions?t=${t}`).then(r => r?.ok && r.json().then(d => setSessions(d.sessions || [])));
              apiCall(`/api/stats?t=${t}`).then(r => r?.ok && r.json().then(d => setStats(d)));
          }, 5000);
          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated]);

  useLayoutEffect(() => {
      if (chatListRef.current && shouldScrollToBottom) {
          chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      }
  }, [chatHistory, shouldScrollToBottom, selectedChat]);

  // ==========================================================================
  // API HELPER
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
          if (response.status === 401) { setIsAuthenticated(false); return null; }
          return response;
      } catch (error) { return { ok: false }; }
  };

  const addLog = (message) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 300));
  };

  const fetchData = async () => {
      const t = Date.now();
      const sRes = await apiCall(`/api/list-sessions?t=${t}`);
      if (sRes?.ok) {
          const data = await sRes.json();
          setSessions(data.sessions || []);
      }
      const stRes = await apiCall(`/api/stats?t=${t}`);
      if (stRes?.ok) setStats(await stRes.json());
      const hRes = await apiCall('/api/get-harvested');
      if (hRes?.ok) {
          const data = await hRes.json();
          if (data.harvestedIds) setHarvestedIds(new Set(data.harvestedIds));
      }
  };

  // ==========================================================================
  // 🏭 BOT FACTORY (CRIAÇÃO DE BOTS)
  // ==========================================================================

  const runBotFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione uma conta "Mãe" para falar com o BotFather!');
      if (!botFactory.baseName) return alert('Defina um nome base.');
      
      const creatorPhone = Array.from(selectedPhones)[0]; // Usa a primeira conta selecionada
      setIsProcessing(true);
      addLog(`🤖 Iniciando Fábrica de Bots com a conta: ${creatorPhone}`);

      let newBots = [...botFactory.createdBots];

      for (let i = 0; i < botFactory.amount; i++) {
          const randomSuffix = Math.floor(Math.random() * 9999);
          const botName = `${botFactory.baseName} ${randomSuffix}`;
          const botUser = `${botFactory.baseName.replace(/\s+/g, '')}_${randomSuffix}_bot`;

          addLog(`⚙️ Criando bot ${i+1}/${botFactory.amount}: ${botUser}...`);

          try {
              // Chama endpoint que automatiza a conversa com BotFather
              const res = await apiCall('/api/factory/create-bot', {
                  phone: creatorPhone,
                  name: botName,
                  username: botUser
              });
              const data = await res.json();

              if (data.success && data.token) {
                  addLog(`✅ Bot Criado! Token: ${data.token}`);
                  newBots.push({ token: data.token, username: botUser, status: 'Created' });
                  setBotFactory(prev => ({ ...prev, createdBots: newBots }));
              } else {
                  addLog(`❌ Falha ao criar ${botUser}: ${data.error}`);
              }
          } catch (e) {
              addLog(`❌ Erro de conexão.`);
          }
          
          // Delay natural para não tomar flood do BotFather
          await new Promise(r => setTimeout(r, 5000));
      }
      setIsProcessing(false);
      addLog('🏁 Fábrica finalizada.');
  };

  const updateBotsProfile = async () => {
      const tokens = botEditor.tokenList.split('\n').filter(t => t.trim().length > 10);
      if (tokens.length === 0) return alert('Cole os tokens dos bots (um por linha).');
      
      setIsProcessing(true);
      addLog(`🎨 Atualizando perfil de ${tokens.length} bots...`);

      for (const token of tokens) {
          try {
              const res = await apiCall('/api/factory/update-bot', {
                  botToken: token.trim(),
                  name: botEditor.newName,
                  photoUrl: botEditor.newPhoto
              });
              const data = await res.json();
              if (data.success) addLog(`✅ Atualizado: ${token.slice(0,10)}...`);
              else addLog(`❌ Erro no token ${token.slice(0,10)}...`);
          } catch (e) {}
          await new Promise(r => setTimeout(r, 1000));
      }
      setIsProcessing(false);
      addLog('🏁 Atualização de bots concluída.');
  };

  // ==========================================================================
  // 📢 GROUP LAUNCHER (CRIAÇÃO DE GRUPOS EM MASSA)
  // ==========================================================================

  const startGroupLauncher = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas criadoras!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 INICIANDO GROUP LAUNCHER');

      const creators = Array.from(selectedPhones);
      
      // Loop infinito até o usuário parar ou acabarem os leads
      while (!stopProcessRef.current) {
          // 1. Busca leads do banco
          const leadsRes = await apiCall(`/api/get-campaign-leads?limit=${groupFactory.leadsPerGroup}&t=${Date.now()}`);
          const leadsData = await leadsRes?.json();
          const leads = leadsData?.leads || [];

          if (leads.length === 0) {
              addLog('✅ Sem mais leads para adicionar.');
              break;
          }

          // 2. Escolhe um criador disponível
          const creator = creators[Math.floor(Math.random() * creators.length)];
          const groupName = `${groupFactory.baseName} #${Math.floor(Math.random()*1000)}`;

          addLog(`🏗️ Conta ${creator} criando grupo: ${groupName}`);

          try {
              // Cria grupo e adiciona leads (Backend deve lidar com a lógica de "Create & Add")
              const res = await apiCall('/api/factory/create-group-blast', {
                  phone: creator,
                  title: groupName,
                  leads: leads.map(l => l.user_id), // Passa array de IDs
                  message: groupFactory.message
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Grupo criado com sucesso! Link: ${data.inviteLink}`);
                  addLog(`📨 Mensagem enviada para ${leads.length} membros.`);
                  // Marca leads como "processados" localmente nas stats
                  setStats(prev => ({ ...prev, sent: prev.sent + leads.length, pending: prev.pending - leads.length }));
              } else {
                  addLog(`❌ Erro ao criar grupo: ${data.error}`);
                  // Se deu erro (ex: flood), espera mais tempo
                  await new Promise(r => setTimeout(r, 10000));
              }

          } catch (e) { console.error(e); }

          // Delay entre criações de grupo (Segurança)
          await new Promise(r => setTimeout(r, 15000));
      }

      setIsProcessing(false);
      addLog('🏁 Launcher finalizado.');
  };


  // ==========================================================================
  // FUNÇÕES DE INBOX E ENGINE (MANTIDAS DA V18)
  // ==========================================================================

  const startEngine = async () => { /* ...Código da Engine V18... */ 
      // (Mantido simples aqui para focar na Factory, mas na prática usa a lógica V18)
      alert("Use a aba Factory para a nova estratégia de grupos!");
  };
  
  const coletarOferta = (msg) => {
      setConfig({ ...config, msg: msg.text || '' });
      setGroupFactory({ ...groupFactory, message: msg.text || '' }); // Copia para o Group Launcher também
      alert("♻️ Oferta copiada para Dashboard e Factory!");
  };

  const loadInbox = async () => {
      // ... Lógica de load inbox V18 ...
      if (selectedPhones.size === 0) {
          const online = sessions.filter(s => s.is_active).map(s => s.phone_number);
          if (online.length > 0) setSelectedPhones(new Set(online));
      }
      setIsLoadingReplies(true);
      setReplies([]);
      const phones = Array.from(selectedPhones.size > 0 ? selectedPhones : sessions.map(s=>s.phone_number));
      let all = [];
      for (let i = 0; i < phones.length; i += 5) {
          const batch = phones.slice(i, i + 5);
          const results = await Promise.all(batch.map(p => apiCall('/api/spy/check-replies', { phone: p }).then(r => r.json()).catch(() => ({}))));
          results.forEach(r => r.replies && all.push(...r.replies));
      }
      setReplies(all.sort((a, b) => b.timestamp - a.timestamp));
      setIsLoadingReplies(false);
  };

  const openChat = async (r, offset = 0) => {
      setSelectedChat(r);
      const res = await apiCall('/api/spy/get-history', { phone: r.fromPhone, chatId: r.chatId, limit: 20, offset });
      const d = await res.json();
      setChatHistory(d.history ? d.history.reverse() : []);
  };

  // ==========================================================================
  // RENDERIZAÇÃO
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
      } catch (e) {}
  };

  if (!isAuthenticated) return (
      <div style={styles.loginContainer}><form onSubmit={handleLogin} style={styles.loginBox}>
          <h2 style={{textAlign:'center',color:'white'}}>HOTTRACK V20</h2>
          <input type="password" placeholder="Token" onChange={e=>setCredentials({...credentials, token:e.target.value})} style={styles.input}/>
          <button style={styles.btn}>ENTRAR</button>
      </form></div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* HEADER */}
        <div style={styles.header}>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <h2 style={{ margin: 0, color: 'white' }}>HOTTRACK</h2>
                <span style={styles.versionBadge}>V20 FACTORY</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
                {['dashboard', 'inbox', 'factory', 'spy'].map(tab => (
                    <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'inbox') loadInbox(); }} style={{
                        ...styles.navBtn,
                        background: activeTab === tab ? '#1f6feb' : 'transparent', 
                        borderColor: activeTab === tab ? '#1f6feb' : '#30363d'
                    }}>{tab.toUpperCase()}</button>
                ))}
            </div>
            <button onClick={() => setIsAuthenticated(false)} style={styles.logoutBtn}>SAIR</button>
        </div>

        {/* FACTORY TAB (NOVA) */}
        {activeTab === 'factory' && (
            <div style={{ padding: 25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 25, flex: 1, overflowY: 'auto' }}>
                
                {/* GROUP LAUNCHER */}
                <div style={styles.card}>
                    <h3 style={{borderBottom:'1px solid #30363d', paddingBottom:10, marginTop:0}}>🚀 Mass Group Launcher</h3>
                    <p style={{fontSize:12, color:'#8b949e'}}>Cria grupos usando suas contas, adiciona leads do banco e dispara a oferta lá dentro.</p>
                    
                    <input placeholder="Nome Base do Grupo (ex: Ofertas VIP)" value={groupFactory.baseName} onChange={e => setGroupFactory({...groupFactory, baseName: e.target.value})} style={styles.input} />
                    <input type="number" placeholder="Leads por Grupo (Rec: 50)" value={groupFactory.leadsPerGroup} onChange={e => setGroupFactory({...groupFactory, leadsPerGroup: e.target.value})} style={styles.input} />
                    <textarea placeholder="Mensagem para enviar no grupo..." value={groupFactory.message} onChange={e => setGroupFactory({...groupFactory, message: e.target.value})} style={{...styles.input, height:100}} />
                    
                    <div style={{display:'flex', gap:10}}>
                        {!isProcessing ? 
                            <button onClick={startGroupLauncher} style={styles.btn}>INICIAR CICLO DE GRUPOS</button> :
                            <button onClick={() => stopProcessRef.current = true} style={{...styles.btn, background:'#f85149'}}>PARAR CICLO</button>
                        }
                    </div>
                </div>

                {/* BOT FACTORY */}
                <div style={styles.card}>
                    <h3 style={{borderBottom:'1px solid #30363d', paddingBottom:10, marginTop:0}}>🤖 Bot Father Automator</h3>
                    
                    <div style={{marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #30363d'}}>
                        <label style={{fontSize:12, color:'#8b949e', display:'block', marginBottom:5}}>1. GERADOR DE BOTS</label>
                        <div style={{display:'flex', gap:10}}>
                            <input placeholder="Nome (ex: Atendimento)" value={botFactory.baseName} onChange={e=>setBotFactory({...botFactory, baseName:e.target.value})} style={{...styles.input, marginBottom:0}} />
                            <input type="number" placeholder="Qtd" value={botFactory.amount} onChange={e=>setBotFactory({...botFactory, amount:e.target.value})} style={{...styles.input, width:80, marginBottom:0}} />
                        </div>
                        <button onClick={runBotFactory} style={{...styles.btn, marginTop:10, background:'#8957e5'}}>GERAR BOTS COM @BOTFATHER</button>
                    </div>

                    <div>
                        <label style={{fontSize:12, color:'#8b949e', display:'block', marginBottom:5}}>2. EDITOR EM MASSA (Use os tokens gerados)</label>
                        <textarea placeholder="Cole os Tokens aqui (um por linha)..." value={botEditor.tokenList} onChange={e=>setBotEditor({...botEditor, tokenList:e.target.value})} style={{...styles.input, height:60}} />
                        <input placeholder="Novo Nome dos Bots" value={botEditor.newName} onChange={e=>setBotEditor({...botEditor, newName:e.target.value})} style={styles.input} />
                        <input placeholder="URL da Nova Foto" value={botEditor.newPhoto} onChange={e=>setBotEditor({...botEditor, newPhoto:e.target.value})} style={styles.input} />
                        <button onClick={updateBotsProfile} style={{...styles.btn, background:'#1f6feb'}}>ATUALIZAR PERFIL DOS BOTS</button>
                    </div>
                </div>

                {/* LOGS DA FÁBRICA */}
                <div style={{...styles.card, gridColumn: 'span 2'}}>
                    <h4>Logs da Operação</h4>
                    <div style={styles.logBox}>
                        {logs.map((l, i) => <div key={i} style={{fontSize:12, color: l.includes('Erro') ? '#f85149' : '#8b949e'}}>{l}</div>)}
                    </div>
                    {botFactory.createdBots.length > 0 && (
                        <div style={{marginTop:15, padding:10, background:'#010409', borderRadius:8}}>
                            <h5 style={{margin:'0 0 10px 0'}}>Bots Criados Recentemente:</h5>
                            <textarea readOnly value={botFactory.createdBots.map(b => `${b.token} | @${b.username}`).join('\n')} style={{width:'100%', height:100, background:'transparent', color:'#58a6ff', border:'none'}} />
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* DASHBOARD (MANTIDO) */}
        {activeTab === 'dashboard' && (
            <div style={styles.dashboardGrid}>
                {/* ... Conteúdo Dashboard (Similar ao V18/V19) mas focado em visualização ... */}
                 <div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom:'20px' }}>
                        <StatBox label="PENDENTES" val={stats.pending} color="#d29922" />
                        <StatBox label="ENVIADOS" val={stats.sent} color="#238636" />
                        <StatBox label="ONLINE" val={sessions.filter(s => s.is_active).length} color="#1f6feb" />
                    </div>
                    <div style={styles.card}>
                        <h3>Disparo Direto (Legado)</h3>
                        <p style={{fontSize:12, color:'#8b949e'}}>Para alta performance, use a aba Factory.</p>
                        <textarea value={config.msg} onChange={e=>setConfig({...config, msg:e.target.value})} style={{...styles.input, height:150}} placeholder="Mensagem..."/>
                        <button onClick={() => alert('Use a aba Factory para melhor resultado!')} style={{...styles.btn, background:'#21262d'}}>DISPARO DIRETO (NÃO RECOMENDADO)</button>
                    </div>
                     <div style={styles.logBox}>
                        {logs.map((l, i) => <div key={i} style={{fontSize:12, color:'#8b949e'}}>{l}</div>)}
                    </div>
                </div>
                <div style={styles.card}>
                    <h4>Contas</h4>
                    <button onClick={() => setSelectedPhones(new Set(sessions.filter(s => s.is_active).map(s => s.phone_number)))} style={styles.linkBtn}>Selecionar Online</button>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => {
                                const newS = new Set(selectedPhones);
                                newS.has(s.phone_number) ? newS.delete(s.phone_number) : newS.add(s.phone_number);
                                setSelectedPhones(newS);
                            }} style={{...styles.accountRow, background: selectedPhones.has(s.phone_number) ? '#1f6feb22' : 'transparent'}}>
                                <div style={{width:'8px', height:'8px', borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149'}}></div>
                                <span>{s.phone_number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* INBOX (MANTIDO) */}
        {activeTab === 'inbox' && (
             <div style={styles.chatContainer}>
                <div style={styles.chatSidebar}>
                    <button onClick={() => loadInbox()} style={{...styles.btn, margin:10, width:'auto', fontSize:12}}>{isLoadingReplies ? '...' : 'Atualizar'}</button>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {replies.map(r => (
                            <div key={r.chatId} onClick={() => openChat(r)} style={{padding:15, borderBottom:'1px solid #21262d', cursor:'pointer', background: selectedChat?.chatId===r.chatId ? '#1f6feb15':'transparent'}}>
                                <b>{r.name}</b><br/><span style={{fontSize:12, color:'#8b949e'}}>{r.lastMessage}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={styles.chatArea}>
                    {selectedChat ? (
                        <>
                            <div style={styles.chatHeader}><b>{selectedChat.name}</b></div>
                            <div ref={chatListRef} style={styles.messagesList}>
                                {chatHistory.map((m,i) => (
                                    <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#005c4b' : '#202c33', padding:10, borderRadius:8, marginBottom:10, maxWidth:'70%'}}>
                                        {m.media && <div style={{fontSize:10, color:'#58a6ff'}}>Mídia Recebida (Ver no App)</div>}
                                        {m.text}
                                        {!m.isOut && <button onClick={()=>coletarOferta(m)} style={styles.cloneBtn}>COPIAR</button>}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>Selecione uma conversa</div>}
                </div>
             </div>
        )}

        {/* SPY (MANTIDO) */}
        {activeTab === 'spy' && (
             <div style={{padding:20}}>
                 <div style={styles.card}>
                     <h3>Spy Tools</h3>
                     <p>Use a aba Factory para criar grupos a partir dos dados coletados aqui.</p>
                     <div style={styles.listArea}>
                         {allGroups.map((g,i)=><div key={i} style={styles.listItem}>{g.title} ({g.participantsCount})</div>)}
                     </div>
                 </div>
             </div>
        )}

    </div>
  );
}

// ============================================================================
// ESTILOS
// ============================================================================
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif', overflow: 'hidden' },
    header: { padding: '15px 25px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    versionBadge: { fontSize: '10px', background: '#238636', padding: '3px 7px', borderRadius: '4px', color: 'white', fontWeight: 'bold' },
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: '40px', borderRadius: '12px', border: '1px solid #30363d', width: '350px' },
    dashboardGrid: { padding: '25px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '25px', flex: 1, overflowY: 'auto' },
    card: { background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' },
    logBox: { height: '200px', overflowY: 'auto', background: '#010409', padding: '15px', borderRadius: '10px', border: '1px solid #30363d', fontFamily: 'monospace', marginTop: '10px' },
    accountRow: { padding: '12px', borderBottom: '1px solid #21262d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' },
    chatContainer: { flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden', background: '#0b141a' },
    chatSidebar: { borderRight: '1px solid #30363d', background: '#111b21', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    chatArea: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
    chatHeader: { padding: '15px 25px', background: '#202c33', borderBottom: '1px solid #30363d' },
    messagesList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '25px', minHeight: 0 },
    input: { width: '100%', padding: '12px', background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: '8px', marginBottom: '12px', outline: 'none', boxSizing: 'border-box', fontSize: '14px' },
    btn: { width: '100%', padding: '14px', background: '#238636', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
    navBtn: { color: 'white', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', border: '1px solid transparent', fontSize: '13px', fontWeight: 'bold' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
    linkBtn: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' },
    cloneBtn: { background: 'rgba(31, 111, 235, 0.2)', color: '#58a6ff', border: '1px solid #1f6feb', fontSize: '10px', padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginTop: 5 },
    listArea: { height: '350px', overflowY: 'auto', background: '#0d1117', padding: '15px', borderRadius: '10px' },
    listItem: { padding: '10px', borderBottom: '1px solid #21262d', fontSize: '14px' }
};

const StatBox = ({ label, val, color }) => (
    <div style={{ flex: 1, background: '#161b22', padding: '20px', borderRadius: '10px', borderLeft: `5px solid ${color}` }}>
        <h2 style={{ margin: 0, color: 'white', fontSize: '26px' }}>{val}</h2>
        <small style={{ color: '#8b949e', fontSize: '11px', fontWeight: 'bold' }}>{label}</small>
    </div>
);
