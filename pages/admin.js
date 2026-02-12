import { useState, useEffect, useRef } from 'react';

// ============================================================================
// HOTTRACK V14 - PAINEL CORRIGIDO E OTIMIZADO
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [credentials, setCredentials] = useState({ user: '', pass: '', token: '' });

  // --- INTERFACE (UI) ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  
  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- DISPARO & MODELOS ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState({ msg: '{Olá|Oi}, tudo bem?', imgUrl: '', useRandom: true });
  const [templates, setTemplates] = useState([]); 
  const [templateName, setTemplateName] = useState('');
  const stopProcessRef = useRef(false);

  // --- INBOX (CHAT) ---
  const [replies, setReplies] = useState([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatOffset, setChatOffset] = useState(0);
  const messagesEndRef = useRef(null); 

  // --- SPY & TOOLS ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [toolsInput, setToolsInput] = useState({ name: '', photo: '', storyUrl: '', storyCaption: '' });

  // ==========================================================================
  // INICIALIZAÇÃO E EFEITOS
  // ==========================================================================

  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { 
          setAuthToken(token); 
          setIsAuthenticated(true); 
      }
      
      const savedGroups = localStorage.getItem('godModeGroups');
      if (savedGroups) {
          setAllGroups(JSON.parse(savedGroups));
      }

      const savedTemplates = localStorage.getItem('ht_templates');
      if (savedTemplates) {
          setTemplates(JSON.parse(savedTemplates));
      }
  }, []);

  // Polling de dados (Atualização Automática)
  useEffect(() => {
      if (isAuthenticated) {
          fetchData(); // Carrega inicial
          
          // Atualiza status e estatísticas a cada 5 segundos
          const intervalId = setInterval(() => {
              if (!isProcessing) { // Evita conflito se estiver disparando muito rápido
                  fetchSessionsOnly();
                  fetchStats();
              }
          }, 5000);

          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated, isProcessing]);

  // Scroll automático no chat
  useEffect(() => {
      if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [chatHistory, selectedChat]);

  // ==========================================================================
  // FUNÇÕES DE DADOS (API)
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
          return { ok: false, json: async () => ({ error: 'Erro de Conexão' }) }; 
      }
  };

  const addLog = (message) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prevLogs => [`[${time}] ${message}`, ...prevLogs].slice(0, 300));
  };

  const formatTime = (timestamp) => {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Carrega tudo (Pesado)
  const fetchData = async () => {
      await fetchSessionsOnly();
      await fetchStats();
      
      // Carrega grupos aspirados apenas uma vez ou sob demanda
      const harvestedResponse = await apiCall('/api/get-harvested');
      if (harvestedResponse?.ok) {
          const data = await harvestedResponse.json();
          if (data.harvestedIds) {
              setHarvestedIds(new Set(data.harvestedIds));
          }
      }
  };

  // Carrega apenas sessões (Leve) - CORRIGIDO O BUG DE STATUS
  const fetchSessionsOnly = async () => {
      const sessionResponse = await apiCall('/api/list-sessions');
      if (sessionResponse?.ok) {
          const data = await sessionResponse.json();
          // CORREÇÃO: Sobrescreve o estado anterior com o novo do servidor para garantir status real
          setSessions(data.sessions || []);
      }
  };

  // Carrega estatísticas
  const fetchStats = async () => {
      const response = await apiCall('/api/stats');
      if (response?.ok) {
          setStats(await response.json());
      }
  };

  // ==========================================================================
  // GESTÃO DE MODELOS
  // ==========================================================================
  
  const saveTemplate = () => {
      if (!templateName) return alert('Digite um nome para o modelo.');
      const newTemplates = [...templates, { id: Date.now(), name: templateName, msg: config.msg, img: config.imgUrl }];
      setTemplates(newTemplates);
      localStorage.setItem('ht_templates', JSON.stringify(newTemplates));
      setTemplateName('');
      alert('Modelo salvo!');
  };

  const loadTemplate = (id) => {
      const template = templates.find(x => x.id == id);
      if (template) {
          setConfig({ ...config, msg: template.msg, imgUrl: template.img });
      }
  };

  const deleteTemplate = (id) => {
      if (!confirm('Excluir modelo?')) return;
      const newTemplates = templates.filter(x => x.id !== id);
      setTemplates(newTemplates);
      localStorage.setItem('ht_templates', JSON.stringify(newTemplates));
  };

  // ==========================================================================
  // ENGINE V14 (SISTEMA DE DISPARO)
  // ==========================================================================
  
  const startEngine = async () => {
      if (selectedPhones.size === 0) return alert('Selecione pelo menos uma conta!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 ENGINE INICIADA');

      let senders = Array.from(selectedPhones);
      let cooldowns = {}; 

      while (!stopProcessRef.current) {
          const now = Date.now();
          const activeSenders = senders.filter(p => !cooldowns[p] || now > cooldowns[p]);

          if (activeSenders.length === 0) {
              addLog('⏳ Todas as contas em Flood Wait. Aguardando 10s...');
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue;
          }

          // Busca Leads
          const leadsResponse = await apiCall(`/api/get-campaign-leads?limit=20&random=${config.useRandom}`);
          const leadsData = await leadsResponse?.json();
          const leads = leadsData?.leads || [];

          if (leads.length === 0) { 
              addLog('✅ Lista de leads finalizada.'); 
              break; 
          }

          // Disparo em Paralelo Controlado
          const promises = leads.map(async (lead) => {
               if (stopProcessRef.current) return;
               
               // Seleciona remetente livre
               const currentSenders = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
               if (currentSenders.length === 0) return;
               const sender = currentSenders[Math.floor(Math.random() * currentSenders.length)];

               try {
                  const response = await apiCall('/api/dispatch', {
                      senderPhone: sender, 
                      target: lead.user_id, 
                      username: lead.username,
                      message: config.msg, 
                      imageUrl: config.imgUrl, 
                      leadDbId: lead.id
                  });
                  const data = await response.json();

                  if (response.status === 429 || (data.error && data.error.includes('FLOOD'))) {
                      const waitSeconds = data.wait || 60;
                      cooldowns[sender] = Date.now() + (waitSeconds * 1000);
                      addLog(`⛔ Flood ${sender}. Pausa ${waitSeconds}s.`);
                  } else if (data.success) {
                      addLog(`✅ Enviado: ${sender} -> ${lead.username || lead.user_id}`);
                      // Atualiza stats localmente para feedback instantâneo
                      setStats(prev => ({ ...prev, sent: prev.sent + 1, pending: prev.pending - 1 }));
                  } else {
                      addLog(`❌ Erro ${sender}: ${data.error}`);
                  }
               } catch (e) { console.error(e); }
          });

          await Promise.all(promises);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Delay entre lotes
          fetchStats(); // Sincroniza stats real com backend
      }
      setIsProcessing(false);
      addLog('🏁 Engine Parada.');
      fetchData();
  };

  // ==========================================================================
  // INBOX MELHORADO
  // ==========================================================================
  
  const loadInbox = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas na Dashboard primeiro!');
      setIsLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let allReplies = [];

      // Processa em lotes para não travar a UI
      const CHUNK_SIZE = 5;
      for (let i = 0; i < phones.length; i += CHUNK_SIZE) {
          const batch = phones.slice(i, i + CHUNK_SIZE);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p })
                  .then(r => r.json())
                  .catch(() => ({ replies: [] }))
          ));
          results.forEach(result => { 
              if (result.replies) allReplies = [...allReplies, ...result.replies]; 
          });
      }
      setReplies(allReplies.sort((a, b) => b.timestamp - a.timestamp));
      setIsLoadingReplies(false);
  };

  const openChat = async (reply, offset = 0) => {
      if (offset === 0) {
          setSelectedChat(reply);
          setChatHistory([]);
      }
      setIsChatLoading(true);

      try {
          const response = await apiCall('/api/spy/get-history', {
              phone: reply.fromPhone,
              chatId: reply.chatId,
              limit: 20,
              offset: offset
          });
          
          if (response.ok) {
              const data = await response.json();
              if (data.history) {
                  const sortedHistory = data.history.reverse(); // Garante ordem cronológica
                  setChatHistory(prev => offset === 0 ? sortedHistory : [...sortedHistory, ...prev]);
                  setChatOffset(offset + 20);
              }
          }
      } catch (error) { console.error(error); }
      setIsChatLoading(false);
  };

  // ==========================================================================
  // SPY & TOOLS
  // ==========================================================================

  const scanGroups = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsScanning(true);
      addLog('📡 Escaneando grupos...');
      let foundGroups = [];
      const phones = Array.from(selectedPhones);
      
      for (const p of phones) {
          try {
              const response = await apiCall('/api/spy/list-chats', { phone: p });
              const data = await response.json();
              if (data.chats) {
                  data.chats.forEach(c => {
                      if (!c.type.includes('Canal')) foundGroups.push({ ...c, ownerPhone: p });
                  });
              }
          } catch (e) { }
      }
      const uniqueGroups = [...new Map(foundGroups.map(item => [item.id, item])).values()];
      setAllGroups(uniqueGroups);
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      setIsScanning(false);
      addLog(`📡 ${uniqueGroups.length} grupos encontrados.`);
  };

  const harvestAll = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if (targets.length === 0) return alert('Nada novo para aspirar.');
      if (!confirm(`Aspirar ${targets.length} grupos?`)) return;
      
      setIsHarvesting(true);
      addLog('🕷️ Iniciando aspiração...');
      
      for (const t of targets) {
          try {
             const res = await apiCall('/api/spy/harvest', { phone: t.ownerPhone, chatId: t.id, chatName: t.title });
             const data = await res.json();
             if (data.success) {
                 addLog(`✅ +${data.count} leads: ${t.title}`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch (e) { }
          await new Promise(r => setTimeout(r, 1000));
      }
      setIsHarvesting(false);
      addLog('🏁 Aspiração finalizada.');
      fetchData();
  };

  const runTool = async (endpoint, payload) => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsProcessing(true);
      addLog('⚙️ Executando em massa...');
      const phones = Array.from(selectedPhones);
      for (const p of phones) {
          try {
              await apiCall(endpoint, { phone: p, ...payload });
              addLog(`✅ OK: ${p}`);
          } catch (e) { addLog(`❌ Erro: ${p}`); }
      }
      setIsProcessing(false);
  };

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================

  const handleLogin = async (e) => {
      e.preventDefault();
      const endpoint = loginMode === 'user' ? '/api/login' : '/api/admin-login';
      const body = loginMode === 'user' ? { username: credentials.user, password: credentials.pass } : { password: credentials.token };
      
      try {
          const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
          });
          const data = await response.json();
          if (data.success) { 
              setAuthToken(data.token); 
              setIsAuthenticated(true); 
              localStorage.setItem('authToken', data.token); 
          } else { alert(data.error || 'Erro login'); }
      } catch (e) { alert('Erro conexão'); }
  };

  if (!isAuthenticated) return (
      <div style={styles.loginContainer}>
          <form onSubmit={handleLogin} style={styles.loginBox}>
              <h2 style={{ textAlign: 'center', margin: '0 0 20px 0' }}>HOTTRACK ADMIN</h2>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button type="button" onClick={() => setLoginMode('user')} style={{...styles.toggleBtn, background: loginMode === 'user' ? '#238636' : '#21262d'}}>User</button>
                  <button type="button" onClick={() => setLoginMode('admin')} style={{...styles.toggleBtn, background: loginMode === 'admin' ? '#8957e5' : '#21262d'}}>Admin</button>
              </div>
              {loginMode === 'user' ? (
                  <>
                      <input placeholder="Usuário" value={credentials.user} onChange={e => setCredentials({ ...credentials, user: e.target.value })} style={styles.input} />
                      <input type="password" placeholder="Senha" value={credentials.pass} onChange={e => setCredentials({ ...credentials, pass: e.target.value })} style={styles.input} />
                  </>
              ) : (
                  <input type="password" placeholder="Token Admin" value={credentials.token} onChange={e => setCredentials({ ...credentials, token: e.target.value })} style={styles.input} />
              )}
              <button type="submit" style={styles.btn}>ENTRAR</button>
          </form>
      </div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* HEADER */}
        <div style={styles.header}>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <h2 style={{ margin: 0, color: 'white' }}>HOTTRACK</h2>
                <span style={styles.versionBadge}>V14.2 LIVE</span>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
                {['dashboard', 'inbox', 'spy', 'tools'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        ...styles.navBtn,
                        background: activeTab === tab ? '#1f6feb' : 'transparent', 
                        borderColor: activeTab === tab ? '#1f6feb' : '#30363d'
                    }}>{tab.toUpperCase()}</button>
                ))}
            </div>
            <button onClick={() => { setIsAuthenticated(false); localStorage.removeItem('authToken'); }} style={styles.logoutBtn}>SAIR</button>
        </div>

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
            <div style={styles.dashboardGrid}>
                {/* Coluna Esquerda: Stats e Controle */}
                <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <StatBox label="LEADS PENDENTES" val={stats.pending} color="#d29922" />
                        <StatBox label="ENVIADOS HOJE" val={stats.sent} color="#238636" />
                        <StatBox label="CONTAS ONLINE" val={sessions.filter(s => s.is_active).length} color="#1f6feb" />
                    </div>
                    
                    <div style={styles.card}>
                        <div style={styles.cardHeader}>
                            <h3>Configuração de Envio</h3>
                            <select onChange={(e) => loadTemplate(e.target.value)} style={styles.select}>
                                <option value="">📂 Carregar Modelo...</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input placeholder="URL Imagem (Opcional)" value={config.imgUrl} onChange={e => setConfig({ ...config, imgUrl: e.target.value })} style={{ flex: 1, ...styles.input, marginBottom: 0 }} />
                            <label style={styles.checkboxLabel}>
                                <input type="checkbox" checked={config.useRandom} onChange={e => setConfig({ ...config, useRandom: e.target.checked })} /> Aleatório
                            </label>
                        </div>
                        <textarea 
                            placeholder="Mensagem (Spintax suportado: {Oi|Olá})..." 
                            value={config.msg} 
                            onChange={e => setConfig({ ...config, msg: e.target.value })} 
                            style={{ ...styles.input, height: '100px', fontFamily: 'monospace' }} 
                        />
                        
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <input placeholder="Nome do Modelo" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ flex: 1, ...styles.input, marginBottom: 0 }} />
                            <button onClick={saveTemplate} style={{...styles.btn, background: '#1f6feb', width: 'auto'}}>Salvar</button>
                            {templateName && <button onClick={() => setTemplateName('')} style={{...styles.btn, background: '#f85149', width: 'auto'}}>X</button>}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!isProcessing ? (
                                <button onClick={startEngine} style={{ ...styles.btn, background: '#238636' }}>🚀 INICIAR</button>
                            ) : (
                                <button onClick={() => stopProcessRef.current = true} style={{ ...styles.btn, background: '#f85149' }}>🛑 PARAR</button>
                            )}
                        </div>
                    </div>
                    
                    <div style={styles.logBox}>
                        {logs.map((l, i) => (
                            <div key={i} style={{ 
                                color: l.includes('Erro') || l.includes('Flood') ? '#ff7b72' : l.includes('Enviado') ? '#7ee787' : '#8b949e',
                                padding: '2px 0',
                                fontSize: '12px'
                            }}>
                                {l}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Coluna Direita: Contas */}
                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <h4>Minhas Contas</h4>
                        <button onClick={() => {
                            const active = new Set();
                            sessions.forEach(s => s.is_active && active.add(s.phone_number));
                            setSelectedPhones(active);
                        }} style={styles.linkBtn}>Selecionar Online</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => {
                                const newSelection = new Set(selectedPhones);
                                newSelection.has(s.phone_number) ? newSelection.delete(s.phone_number) : newSelection.add(s.phone_number);
                                setSelectedPhones(newSelection);
                            }} style={{
                                ...styles.accountRow,
                                background: selectedPhones.has(s.phone_number) ? 'rgba(31, 111, 235, 0.2)' : 'transparent',
                                borderColor: selectedPhones.has(s.phone_number) ? '#1f6feb' : 'transparent'
                            }}>
                                <div style={{ 
                                    width: '10px', height: '10px', borderRadius: '50%', 
                                    background: s.is_active ? '#238636' : '#f85149',
                                    boxShadow: s.is_active ? '0 0 5px #238636' : 'none'
                                }}></div>
                                <span style={{fontWeight: '500'}}>{s.phone_number}</span>
                                {s.is_active && <span style={{fontSize:'10px', background:'#238636', padding:'2px 4px', borderRadius:'3px'}}>ON</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* INBOX (CHAT MELHORADO) */}
        {activeTab === 'inbox' && (
            <div style={styles.chatContainer}>
                {/* Lista Lateral */}
                <div style={styles.chatSidebar}>
                    <div style={{ padding: '15px', borderBottom: '1px solid #30363d', background: '#161b22' }}>
                        <button 
                            onClick={loadInbox} 
                            disabled={isLoadingReplies} 
                            style={{...styles.btn, background: isLoadingReplies ? '#21262d' : '#1f6feb'}}
                        >
                            {isLoadingReplies ? 'Buscando...' : '🔄 Atualizar Inbox'}
                        </button>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {replies.length === 0 && !isLoadingReplies && (
                            <div style={{padding: 20, textAlign: 'center', color: '#8b949e', fontSize:'13px'}}>
                                Nenhuma mensagem encontrada.<br/>Selecione contas na Dashboard.
                            </div>
                        )}
                        {replies.map((r, i) => (
                            <div key={i} onClick={() => openChat(r)} style={{
                                padding: '12px 15px', 
                                borderBottom: '1px solid #21262d', 
                                cursor: 'pointer',
                                background: selectedChat?.chatId === r.chatId ? 'rgba(31, 111, 235, 0.15)' : 'transparent',
                                borderLeft: selectedChat?.chatId === r.chatId ? '4px solid #1f6feb' : '4px solid transparent',
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: '600', color: '#e6edf3', fontSize: '14px' }}>{r.name || 'Desconhecido'}</span>
                                    <span style={{ fontSize: '11px', color: '#8b949e' }}>{formatTime(r.timestamp)}</span>
                                </div>
                                <div style={{ fontSize: '13px', color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{color:'#7ee787', fontSize:'11px', marginRight:'5px'}}>[{r.fromPhone.slice(-4)}]</span>
                                    {r.lastMessage}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Área de Mensagens */}
                <div style={styles.chatArea}>
                    {selectedChat ? (
                        <>
                            <div style={styles.chatHeader}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{selectedChat.name}</div>
                                    <div style={{ fontSize: '12px', color: '#8b949e' }}>
                                        Via: {selectedChat.fromPhone}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => navigator.clipboard.writeText(selectedChat.lastMessage)}
                                    style={{background: 'transparent', border:'1px solid #30363d', color:'#c9d1d9', padding:'5px 10px', borderRadius:'5px', cursor:'pointer', fontSize:'12px'}}
                                >
                                    Copiar Última
                                </button>
                            </div>

                            <div style={styles.messagesList}>
                                <div style={{textAlign: 'center', marginBottom: '15px'}}>
                                    <button 
                                        onClick={() => openChat(selectedChat, chatOffset)} 
                                        style={styles.loadMoreBtn}
                                    >
                                        {isChatLoading ? 'Carregando...' : '⬆ Carregar Mais Antigas'}
                                    </button>
                                </div>

                                {chatHistory.map((m, i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        maxWidth: '65%',
                                        marginBottom: '10px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: m.isOut ? 'flex-end' : 'flex-start'
                                    }}>
                                        <div style={{
                                            background: m.isOut ? '#005c4b' : '#202c33',
                                            padding: '8px 12px', 
                                            borderRadius: '10px',
                                            borderTopLeftRadius: !m.isOut ? '0' : '10px',
                                            borderTopRightRadius: m.isOut ? '0' : '10px',
                                            color: 'white',
                                            fontSize: '14px',
                                            boxShadow: '0 1px 1px rgba(0,0,0,0.2)',
                                            position: 'relative'
                                        }}>
                                            {m.mediaType === 'image' && m.media && (
                                                <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth: '100%', borderRadius: '6px', marginBottom: '8px', display:'block'}} />
                                            )}
                                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.4' }}>{m.text}</div>
                                            <div style={{ 
                                                fontSize: '10px', 
                                                color: 'rgba(255,255,255,0.6)', 
                                                textAlign: 'right', 
                                                marginTop: '4px',
                                                display: 'flex',
                                                justifyContent: 'flex-end',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}>
                                                {formatTime(m.date * 1000)}
                                                {m.isOut && <span>✓</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div style={styles.chatInputArea}>
                                <input placeholder="Digite para responder..." style={{...styles.input, marginBottom: 0, borderRadius: '20px'}} />
                                <button style={{...styles.btn, width: '50px', borderRadius: '50%', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>➤</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                            <div style={{fontSize: '60px', opacity: 0.2}}>💬</div>
                            <p>Selecione uma conversa para ver o histórico</p>
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* SPY & TOOLS - (Mantido igual, apenas com estilos atualizados) */}
        {(activeTab === 'spy' || activeTab === 'tools') && (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {activeTab === 'spy' ? (
                     <>
                        <div style={styles.card}>
                            <h3>Scanner de Grupos</h3>
                            <div style={{ display: 'flex', gap: '10px', margin: '15px 0' }}>
                                 <button onClick={scanGroups} disabled={isScanning} style={{ ...styles.btn, background: '#238636' }}>
                                     {isScanning ? 'Escaneando...' : '1. Escanear'}
                                 </button>
                                 <button onClick={harvestAll} disabled={isHarvesting} style={{ ...styles.btn, background: '#8957e5' }}>
                                     {isHarvesting ? 'Aspirando...' : '2. Aspirar'}
                                 </button>
                            </div>
                            <div style={styles.listArea}>
                                {allGroups.map((g, i) => (
                                    <div key={i} style={styles.listItem}>
                                        {harvestedIds.has(g.id) ? '✅ ' : '⬜ '} 
                                        <b>{g.title}</b> <span style={{color:'#8b949e', fontSize:'12px'}}>({g.participantsCount})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{...styles.card, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e'}}>
                             EM BREVE: CLONADOR DE OFERTAS
                        </div>
                     </>
                ) : (
                    <>
                        <div style={styles.card}>
                            <h3>Atualizar Perfil</h3>
                            <input placeholder="Novo Nome" value={toolsInput.name} onChange={e => setToolsInput({ ...toolsInput, name: e.target.value })} style={styles.input} />
                            <input placeholder="URL Foto" value={toolsInput.photo} onChange={e => setToolsInput({ ...toolsInput, photo: e.target.value })} style={styles.input} />
                            <button onClick={() => runTool('/api/update-profile', { newName: toolsInput.name, photoUrl: toolsInput.photo })} style={styles.btn}>Aplicar</button>
                        </div>
                        <div style={styles.card}>
                            <h3>Postar Story</h3>
                            <input placeholder="URL Mídia" value={toolsInput.storyUrl} onChange={e => setToolsInput({ ...toolsInput, storyUrl: e.target.value })} style={styles.input} />
                            <input placeholder="Legenda" value={toolsInput.storyCaption} onChange={e => setToolsInput({ ...toolsInput, storyCaption: e.target.value })} style={styles.input} />
                            <button onClick={() => runTool('/api/post-story', { mediaUrl: toolsInput.storyUrl, caption: toolsInput.storyCaption })} style={styles.btn}>Postar</button>
                        </div>
                    </>
                )}
            </div>
        )}
    </div>
  );
}

// ============================================================================
// ESTILOS CSS-IN-JS (Organizados)
// ============================================================================

const styles = {
    mainContainer: { background: '#0d1117', minHeight: '100vh', color: '#c9d1d9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', padding: '20px' },
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontFamily: 'sans-serif' },
    loginBox: { background: '#161b22', padding: '30px', borderRadius: '10px', border: '1px solid #30363d', width: '320px', display: 'flex', flexDirection: 'column', gap: '10px' },
    
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #30363d', paddingBottom: '15px' },
    versionBadge: { fontSize: '11px', background: '#238636', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold', color: 'white' },
    navBtn: { color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', border: '1px solid transparent', transition: 'all 0.2s', fontSize: '13px' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
    
    dashboardGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' },
    card: { background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center', borderBottom: '1px solid #21262d', paddingBottom: '10px' },
    
    input: { width: '100%', padding: '12px', background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: '6px', marginBottom: '10px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' },
    select: { background: '#21262d', color: 'white', border: '1px solid #30363d', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', outline: 'none' },
    btn: { width: '100%', padding: '12px', background: '#238636', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'filter 0.2s' },
    toggleBtn: { flex: 1, border: 'none', color: 'white', padding: '10px', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' },
    linkBtn: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', background: '#0d1117', padding: '0 15px', borderRadius: '6px', border: '1px solid #30363d', fontSize: '13px', cursor: 'pointer' },
    
    logBox: { marginTop: '20px', height: '180px', overflowY: 'auto', background: '#010409', padding: '15px', borderRadius: '10px', border: '1px solid #30363d', fontFamily: 'monospace' },
    accountRow: { padding: '10px', marginBottom: '5px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid transparent', transition: 'background 0.2s' },
    
    chatContainer: { display: 'grid', gridTemplateColumns: '350px 1fr', height: 'calc(100vh - 100px)', background: '#0b141a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #30363d' },
    chatSidebar: { borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', background: '#111b21' },
    chatArea: { display: 'flex', flexDirection: 'column', background: '#0b141a', position: 'relative', backgroundImage: 'linear-gradient(#0b141a 2px, transparent 2px), linear-gradient(90deg, #0b141a 2px, transparent 2px)', backgroundSize: '20px 20px', backgroundColor: '#0b141a' }, // Fundo sutil
    chatHeader: { padding: '15px', background: '#202c33', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
    messagesList: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' },
    chatInputArea: { padding: '10px 15px', background: '#202c33', display: 'flex', gap: '10px', alignItems: 'center' },
    loadMoreBtn: { background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px' },
    
    listArea: { height: '300px', overflowY: 'auto', background: '#0d1117', padding: '10px', borderRadius: '6px', textAlign: 'left' },
    listItem: { padding: '8px', borderBottom: '1px solid #21262d', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }
};

const StatBox = ({ label, val, color }) => (
    <div style={{ flex: 1, background: '#161b22', padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${color}`, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: 0, color: 'white', fontSize: '24px' }}>{val}</h2>
        <small style={{ color: '#8b949e', fontWeight: 'bold', fontSize: '11px' }}>{label}</small>
    </div>
);
