import { useState, useEffect, useRef } from 'react';

// ============================================================================
// HOTTRACK V13 PRO - PAINEL DE CONTROLE OTIMIZADO
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
  const messagesEndRef = useRef(null); // Referência para scroll automático

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

      // Carregar Modelos Salvos
      const savedTemplates = localStorage.getItem('ht_templates');
      if (savedTemplates) {
          setTemplates(JSON.parse(savedTemplates));
      }
  }, []);

  useEffect(() => {
      if (isAuthenticated) {
          fetchData();
          const intervalId = setInterval(fetchStats, 15000);
          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated]);

  // Scroll automático para o fim do chat quando o histórico muda
  useEffect(() => {
      if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [chatHistory, selectedChat]);

  // ==========================================================================
  // FUNÇÕES AUXILIARES
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
          return { ok: false, json: async () => ({ error: 'Erro de Conexão com o Servidor' }) }; 
      }
  };

  const addLog = (message, type = 'info') => {
      const time = new Date().toLocaleTimeString();
      setLogs(prevLogs => [`[${time}] ${message}`, ...prevLogs].slice(0, 300));
  };

  const formatTime = (timestamp) => {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const fetchData = async () => {
      const sessionResponse = await apiCall('/api/list-sessions');
      if (sessionResponse?.ok) {
          const data = await sessionResponse.json();
          setSessions(prevSessions => {
              const newSessions = data.sessions || [];
              // Preserva o estado local se necessário, mas atualiza a lista
              return newSessions.map(newSession => {
                  const oldSession = prevSessions.find(p => p.phone_number === newSession.phone_number);
                  return { ...newSession, is_active: oldSession ? oldSession.is_active : newSession.is_active };
              });
          });
      }
      fetchStats();
      const harvestedResponse = await apiCall('/api/get-harvested');
      if (harvestedResponse?.ok) {
          const data = await harvestedResponse.json();
          if (data.harvestedIds) {
              setHarvestedIds(new Set(data.harvestedIds));
          }
      }
  };

  const fetchStats = async () => {
      const response = await apiCall('/api/stats');
      if (response?.ok) {
          setStats(await response.json());
      }
  };

  // ==========================================================================
  // GESTÃO DE MODELOS (TEMPLATES)
  // ==========================================================================
  
  const saveTemplate = () => {
      if (!templateName) return alert('Digite um nome para o modelo.');
      const newTemplates = [...templates, { id: Date.now(), name: templateName, msg: config.msg, img: config.imgUrl }];
      setTemplates(newTemplates);
      localStorage.setItem('ht_templates', JSON.stringify(newTemplates));
      setTemplateName('');
      alert('Modelo salvo com sucesso!');
  };

  const loadTemplate = (id) => {
      const template = templates.find(x => x.id == id);
      if (template) {
          setConfig({ ...config, msg: template.msg, imgUrl: template.img });
      }
  };

  const deleteTemplate = (id) => {
      if (!confirm('Tem certeza que deseja excluir este modelo?')) return;
      const newTemplates = templates.filter(x => x.id !== id);
      setTemplates(newTemplates);
      localStorage.setItem('ht_templates', JSON.stringify(newTemplates));
  };

  // ==========================================================================
  // ENGINE V13 (SISTEMA DE DISPARO)
  // ==========================================================================
  
  const startEngine = async () => {
      if (selectedPhones.size === 0) return alert('Selecione pelo menos uma conta para disparo!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 ENGINE V13 INICIADA');

      let senders = Array.from(selectedPhones);
      let cooldowns = {}; // Armazena { phone: timestamp_de_liberacao }

      while (!stopProcessRef.current) {
          // 1. Filtra contas ativas (que não estão em cooldown)
          const now = Date.now();
          const activeSenders = senders.filter(p => !cooldowns[p] || now > cooldowns[p]);

          if (activeSenders.length === 0) {
              addLog('⏳ Todas as contas em pausa (Flood Wait). Aguardando 5 segundos...', 'warn');
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
          }

          // 2. Busca Leads Pendentes
          const leadsResponse = await apiCall(`/api/get-campaign-leads?limit=30&random=${config.useRandom}`);
          const leadsData = await leadsResponse?.json();
          const leads = leadsData?.leads || [];

          if (leads.length === 0) { 
              addLog('✅ Fim da lista de leads pendentes.', 'success'); 
              break; 
          }

          // 3. Disparo em Lotes (Batching) para evitar sobrecarga local
          const BATCH_SIZE = 5; 
          for (let i = 0; i < leads.length; i += BATCH_SIZE) {
              if (stopProcessRef.current) break;
              
              const chunk = leads.slice(i, i + BATCH_SIZE);
              
              await Promise.all(chunk.map(async (lead) => {
                  // Seleciona um remetente disponível aleatoriamente
                  const availableSenders = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
                  if (availableSenders.length === 0) return;
                  
                  const sender = availableSenders[Math.floor(Math.random() * availableSenders.length)];

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
                          addLog(`⛔ Flood em ${sender}. Pausa de ${waitSeconds}s.`);
                      } else if (data.success) {
                          addLog(`✅ Enviado: ${sender} -> ${lead.username || lead.user_id}`);
                      } else {
                          addLog(`❌ Erro ${sender}: ${data.error}`);
                      }
                  } catch (e) {
                      console.error(e);
                  }
              }));
              
              // Pequeno delay de segurança entre lotes
              await new Promise(resolve => setTimeout(resolve, 1000)); 
          }
      }
      setIsProcessing(false);
      addLog('🏁 Disparo finalizado ou interrompido.');
      fetchData();
  };

  // ==========================================================================
  // INBOX OTIMIZADO (CHAT)
  // ==========================================================================
  
  const loadInbox = async () => {
      if (selectedPhones.size === 0) return alert('Selecione as contas na aba Dashboard para ver as mensagens!');
      setIsLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let allReplies = [];
      const CHUNK_SIZE = 3; // Verifica 3 contas por vez

      for (let i = 0; i < phones.length; i += CHUNK_SIZE) {
          const batch = phones.slice(i, i + CHUNK_SIZE);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p })
                  .then(r => r.json())
                  .catch(() => ({ replies: [] }))
          ));
          results.forEach(result => { 
              if (result.replies) {
                  allReplies = [...allReplies, ...result.replies]; 
              }
          });
      }
      // Ordena por mensagem mais recente
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
                  setChatHistory(prev => offset === 0 ? data.history : [...data.history, ...prev]);
                  setChatOffset(offset + 20);
              }
          } else {
              addLog('Erro ao abrir chat. Tente novamente.', 'error');
          }
      } catch (error) { 
          console.error(error); 
      }
      setIsChatLoading(false);
  };

  // ==========================================================================
  // SPY & TOOLS
  // ==========================================================================

  const scanGroups = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsScanning(true);
      addLog('📡 Escaneando grupos nas contas selecionadas...');
      let foundGroups = [];
      const phones = Array.from(selectedPhones);
      
      for (const p of phones) {
          try {
              const response = await apiCall('/api/spy/list-chats', { phone: p });
              const data = await response.json();
              if (data.chats) {
                  data.chats.forEach(c => {
                      if (!c.type.includes('Canal')) {
                          foundGroups.push({ ...c, ownerPhone: p });
                      }
                  });
              }
          } catch (e) { console.error(e); }
      }
      
      // Remove duplicados baseados no ID do grupo
      const uniqueGroups = [...new Map(foundGroups.map(item => [item.id, item])).values()];
      setAllGroups(uniqueGroups);
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      setIsScanning(false);
      addLog(`📡 ${uniqueGroups.length} grupos encontrados.`);
  };

  const harvestAll = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if (targets.length === 0) return alert('Nenhum grupo novo para aspirar.');
      if (!confirm(`Deseja aspirar ${targets.length} grupos? Isso pode levar tempo.`)) return;
      
      setIsHarvesting(true);
      addLog('🕷️ Iniciando aspiração em massa...');
      
      for (const t of targets) {
          try {
             const response = await apiCall('/api/spy/harvest', { 
                 phone: t.ownerPhone, 
                 chatId: t.id, 
                 chatName: t.title 
             });
             const data = await response.json();
             
             if (data.success) {
                 addLog(`✅ +${data.count} leads extraídos de: ${t.title}`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch (e) { console.error(e); }
          
          // Delay para evitar flood
          await new Promise(resolve => setTimeout(resolve, 1500));
      }
      setIsHarvesting(false);
      addLog('🏁 Aspiração finalizada.');
      fetchData();
  };

  const runTool = async (endpoint, payload) => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsProcessing(true);
      addLog('⚙️ Executando ferramenta em massa...');
      const phones = Array.from(selectedPhones);
      
      for (const p of phones) {
          try {
              await apiCall(endpoint, { phone: p, ...payload });
              addLog(`✅ Sucesso: ${p}`);
          } catch (e) { 
              addLog(`❌ Falha: ${p}`); 
          }
      }
      setIsProcessing(false);
  };

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================

  const handleLogin = async (e) => {
      e.preventDefault();
      const endpoint = loginMode === 'user' ? '/api/login' : '/api/admin-login';
      const body = loginMode === 'user' 
          ? { username: credentials.user, password: credentials.pass } 
          : { password: credentials.token };
      
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
          } else {
              alert(data.error || 'Falha no login');
          }
      } catch (e) { 
          alert('Erro de conexão'); 
      }
  };

  // TELA DE LOGIN
  if (!isAuthenticated) return (
      <div style={{
          height: '100vh', 
          background: '#0d1117', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          color: 'white', 
          fontFamily: 'sans-serif'
      }}>
          <form onSubmit={handleLogin} style={{
              background: '#161b22', 
              padding: '30px', 
              borderRadius: '10px', 
              border: '1px solid #30363d', 
              width: '300px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px'
          }}>
              <h2 style={{ textAlign: 'center', margin: 0 }}>HOTTRACK V13</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setLoginMode('user')} style={{
                      flex: 1, 
                      background: loginMode === 'user' ? '#238636' : '#21262d', 
                      border: 'none', 
                      color: 'white', 
                      padding: '8px', 
                      cursor: 'pointer',
                      borderRadius: '4px'
                  }}>User</button>
                  <button type="button" onClick={() => setLoginMode('admin')} style={{
                      flex: 1, 
                      background: loginMode === 'admin' ? '#8957e5' : '#21262d', 
                      border: 'none', 
                      color: 'white', 
                      padding: '8px', 
                      cursor: 'pointer',
                      borderRadius: '4px'
                  }}>Admin</button>
              </div>
              {loginMode === 'user' ? (
                  <>
                      <input 
                          placeholder="Usuário" 
                          value={credentials.user} 
                          onChange={e => setCredentials({ ...credentials, user: e.target.value })} 
                          style={inputStyle} 
                      />
                      <input 
                          type="password" 
                          placeholder="Senha" 
                          value={credentials.pass} 
                          onChange={e => setCredentials({ ...credentials, pass: e.target.value })} 
                          style={inputStyle} 
                      />
                  </>
              ) : (
                  <input 
                      type="password" 
                      placeholder="Token Admin" 
                      value={credentials.token} 
                      onChange={e => setCredentials({ ...credentials, token: e.target.value })} 
                      style={inputStyle} 
                  />
              )}
              <button type="submit" style={btnStyle}>ENTRAR</button>
          </form>
      </div>
  );

  // PAINEL PRINCIPAL
  return (
    <div style={{ background: '#0d1117', minHeight: '100vh', color: '#c9d1d9', fontFamily: 'sans-serif', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #30363d', paddingBottom: '15px' }}>
            <h2 style={{ margin: 0, color: 'white' }}>HOTTRACK <span style={{ fontSize: '12px', background: '#238636', padding: '2px 6px', borderRadius: '4px' }}>V13 PRO</span></h2>
            <div style={{ display: 'flex', gap: '10px' }}>
                {['dashboard', 'inbox', 'spy', 'tools'].map(tabName => (
                    <button key={tabName} onClick={() => setActiveTab(tabName)} style={{
                        background: activeTab === tabName ? '#1f6feb' : 'transparent', 
                        border: `1px solid ${activeTab === tabName ? '#1f6feb' : '#30363d'}`,
                        color: 'white', 
                        padding: '8px 15px', 
                        borderRadius: '6px', 
                        cursor: 'pointer', 
                        textTransform: 'capitalize', 
                        fontWeight: 'bold'
                    }}>{tabName}</button>
                ))}
            </div>
            <button onClick={() => { setIsAuthenticated(false); localStorage.removeItem('authToken'); }} style={{ background: '#f85149', border: 'none', color: 'white', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>Sair</button>
        </div>

        {/* ================= ABA DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                <div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                        <StatBox label="PENDENTES" val={stats.pending} color="#d29922" />
                        <StatBox label="ENVIADOS" val={stats.sent} color="#238636" />
                        <StatBox label="ONLINE" val={sessions.filter(s => s.is_active).length} color="#1f6feb" />
                    </div>
                    
                    <div style={{ background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                            <h3>Configuração de Disparo</h3>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <select onChange={(e) => loadTemplate(e.target.value)} style={{ background: '#010409', color: 'white', border: '1px solid #30363d', padding: '5px', borderRadius: '4px' }}>
                                    <option value="">Carregar Modelo...</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input placeholder="URL Imagem (Opcional)" value={config.imgUrl} onChange={e => setConfig({ ...config, imgUrl: e.target.value })} style={{ flex: 1, ...inputStyle, marginBottom: 0 }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#0d1117', padding: '0 10px', borderRadius: '5px', border: '1px solid #30363d' }}>
                                <input type="checkbox" checked={config.useRandom} onChange={e => setConfig({ ...config, useRandom: e.target.checked })} /> Aleatório
                            </label>
                        </div>
                        <textarea 
                            placeholder="Mensagem com Spintax. Ex: {Oi|Olá|Tudo bem?}, veja esta oferta..." 
                            value={config.msg} 
                            onChange={e => setConfig({ ...config, msg: e.target.value })} 
                            style={{ width: '100%', height: '100px', ...inputStyle }} 
                        />
                        
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <input placeholder="Nome para Salvar Modelo" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ flex: 1, ...inputStyle, marginBottom: 0 }} />
                            <button onClick={saveTemplate} style={{ background: '#1f6feb', color: 'white', border: 'none', padding: '0 15px', borderRadius: '5px', cursor: 'pointer' }}>Salvar</button>
                            {templateName && <button onClick={() => setTemplateName('')} style={{ background: '#f85149', color: 'white', border: 'none', padding: '0 15px', borderRadius: '5px', cursor: 'pointer' }}>X</button>}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!isProcessing ? (
                                <button onClick={startEngine} style={{ ...btnStyle, background: '#238636' }}>🚀 INICIAR DISPAROS</button>
                            ) : (
                                <button onClick={() => stopProcessRef.current = true} style={{ ...btnStyle, background: '#f85149' }}>🛑 PARAR SISTEMA</button>
                            )}
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '20px', height: '200px', overflowY: 'auto', background: '#010409', padding: '10px', borderRadius: '10px', border: '1px solid #30363d', fontFamily: 'monospace', fontSize: '12px' }}>
                        {logs.map((l, i) => (
                            <div key={i} style={{ color: l.includes('Erro') || l.includes('Flood') ? '#f85149' : l.includes('Enviado') ? '#238636' : '#8b949e' }}>
                                {l}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ background: '#161b22', padding: '15px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <h4>Contas ({sessions.length})</h4>
                        <button onClick={() => {
                            const active = new Set();
                            sessions.forEach(s => s.is_active && active.add(s.phone_number));
                            setSelectedPhones(active);
                        }} style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer' }}>Selecionar Online</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => {
                                const newSelection = new Set(selectedPhones);
                                newSelection.has(s.phone_number) ? newSelection.delete(s.phone_number) : newSelection.add(s.phone_number);
                                setSelectedPhones(newSelection);
                            }} style={{
                                padding: '8px', marginBottom: '5px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                background: selectedPhones.has(s.phone_number) ? '#1f6feb22' : 'transparent', border: selectedPhones.has(s.phone_number) ? '1px solid #1f6feb' : '1px solid transparent'
                            }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.is_active ? '#238636' : '#f85149' }}></div>
                                <span>{s.phone_number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* ================= ABA INBOX (OTIMIZADA) ================= */}
        {activeTab === 'inbox' && (
            <div style={{
                display: 'grid', 
                gridTemplateColumns: '320px 1fr', 
                height: 'calc(100vh - 100px)', 
                background: '#161b22', 
                borderRadius: '12px', 
                overflow: 'hidden', 
                border: '1px solid #30363d'
            }}>
                {/* BARRA LATERAL (LISTA DE CONVERSAS) */}
                <div style={{
                    borderRight: '1px solid #30363d', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    background: '#0d1117'
                }}>
                    <div style={{ padding: '15px', borderBottom: '1px solid #30363d', background: '#161b22' }}>
                        <button 
                            onClick={loadInbox} 
                            disabled={isLoadingReplies} 
                            style={{...btnStyle, background: isLoadingReplies ? '#21262d' : '#1f6feb'}}
                        >
                            {isLoadingReplies ? 'Atualizando...' : '🔄 Atualizar Inbox'}
                        </button>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {replies.length === 0 && !isLoadingReplies && (
                            <div style={{padding: 20, textAlign: 'center', color: '#8b949e'}}>Nenhuma conversa recente encontrada nas contas selecionadas.</div>
                        )}
                        {replies.map((r, i) => (
                            <div key={i} onClick={() => openChat(r)} style={{
                                padding: '12px 15px', 
                                borderBottom: '1px solid #21262d', 
                                cursor: 'pointer',
                                background: selectedChat?.chatId === r.chatId ? '#1f6feb22' : 'transparent',
                                borderLeft: selectedChat?.chatId === r.chatId ? '3px solid #1f6feb' : '3px solid transparent',
                                transition: 'background 0.2s'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: '600', color: '#e6edf3', fontSize: '14px' }}>
                                        {r.name || 'Desconhecido'}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#8b949e' }}>
                                        {formatTime(r.timestamp)}
                                    </span>
                                </div>
                                <div style={{ 
                                    fontSize: '13px', 
                                    color: '#8b949e', 
                                    whiteSpace: 'nowrap', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis' 
                                }}>
                                    {r.fromPhone && <span style={{color:'#238636', fontSize:'10px', marginRight:'5px'}}>({r.fromPhone.slice(-4)})</span>}
                                    {r.lastMessage}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ÁREA DO CHAT */}
                <div style={{ display: 'flex', flexDirection: 'column', background: '#0d1117', position: 'relative' }}>
                    {selectedChat ? (
                        <>
                            {/* Header do Chat */}
                            <div style={{
                                padding: '15px', 
                                background: '#161b22', 
                                borderBottom: '1px solid #30363d', 
                                display: 'flex', 
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{selectedChat.name}</div>
                                    <div style={{ fontSize: '12px', color: '#8b949e' }}>
                                        Conta Receptora: {selectedChat.fromPhone} {selectedChat.username ? `| ${selectedChat.username}` : ''}
                                    </div>
                                </div>
                            </div>

                            {/* Lista de Mensagens */}
                            <div style={{ 
                                flex: 1, 
                                overflowY: 'auto', 
                                padding: '20px', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '8px'
                            }}>
                                {/* Botão carregar mais */}
                                <div style={{textAlign: 'center', marginBottom: '10px'}}>
                                    <button 
                                        onClick={() => openChat(selectedChat, chatOffset)} 
                                        style={{
                                            background: 'transparent', 
                                            border: '1px solid #30363d', 
                                            color: '#58a6ff', 
                                            padding: '5px 15px', 
                                            borderRadius: '20px', 
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                    >
                                        {isChatLoading ? 'Carregando...' : '⬆ Carregar anteriores'}
                                    </button>
                                </div>

                                {chatHistory.map((m, i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        maxWidth: '70%',
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            background: m.isOut ? '#238636' : '#21262d',
                                            padding: '8px 12px', 
                                            borderRadius: '8px',
                                            borderTopLeftRadius: !m.isOut ? '0' : '8px',
                                            borderTopRightRadius: m.isOut ? '0' : '8px',
                                            color: 'white',
                                            fontSize: '14px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                        }}>
                                            {m.mediaType === 'image' && m.media && (
                                                <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth: '100%', borderRadius: '5px', marginBottom: '5px'}} />
                                            )}
                                            {m.mediaType === 'audio' && m.media && (
                                                <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{maxWidth: '200px'}} />
                                            )}
                                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                                            <div style={{ 
                                                fontSize: '10px', 
                                                color: 'rgba(255,255,255,0.6)', 
                                                textAlign: 'right', 
                                                marginTop: '4px' 
                                            }}>
                                                {formatTime(m.date * 1000)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {/* Elemento invisível para scroll */}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input de Resposta (Visual - Envio via API/Backend) */}
                            <div style={{ padding: '15px', background: '#161b22', borderTop: '1px solid #30363d' }}>
                                <div style={{display:'flex', gap:'10px', alignItems: 'center'}}>
                                    <input 
                                        placeholder="Digite para responder..." 
                                        style={{...inputStyle, marginBottom: 0, borderRadius: '20px'}}
                                    />
                                    <button style={{...btnStyle, width: 'auto', borderRadius: '50%', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                        ➤
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                            <div style={{fontSize: '40px', marginBottom: '10px'}}>💬</div>
                            <div>Selecione uma conversa ao lado para clonar ofertas ou responder.</div>
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* ================= ABA SPY (GRUPOS) ================= */}
        {activeTab === 'spy' && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d' }}>
                        <h3>Scanner de Grupos</h3>
                        <p style={{fontSize: '13px', color: '#8b949e', marginBottom: '15px'}}>Encontra grupos onde as contas conectadas são membros.</p>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                             <button onClick={scanGroups} disabled={isScanning} style={{ ...btnStyle, background: '#238636' }}>
                                 {isScanning ? 'Escaneando...' : '1. Escanear Grupos'}
                             </button>
                             <button onClick={harvestAll} disabled={isHarvesting} style={{ ...btnStyle, background: '#8957e5' }}>
                                 {isHarvesting ? 'Aspirando...' : '2. Aspirar Leads'}
                             </button>
                        </div>
                        <div style={{ height: '300px', overflowY: 'auto', background: '#0d1117', padding: '10px', borderRadius: '6px', textAlign: 'left' }}>
                            {allGroups.length === 0 && <div style={{color: '#8b949e', textAlign: 'center', marginTop: '20px'}}>Nenhum grupo escaneado.</div>}
                            {allGroups.map((g, i) => (
                                <div key={i} style={{padding: '5px', borderBottom: '1px solid #21262d', fontSize: '13px'}}>
                                    {harvestedIds.has(g.id) ? '✅ ' : '⬜ '} 
                                    <b>{g.title}</b> <span style={{color: '#8b949e'}}>({g.participantsCount} membros)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Espaço para futuras funcionalidades de Spy */}
                    <div style={{ background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                        <div>Ferramentas de Clonagem de Oferta (Em Breve)</div>
                    </div>
                </div>
            </div>
        )}
        
        {/* ================= ABA TOOLS (PERFIL & STORIES) ================= */}
        {activeTab === 'tools' && (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                 <div style={{ background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d' }}>
                     <h3>Atualizar Perfil</h3>
                     <p style={{fontSize: '13px', color: '#8b949e', marginBottom: '15px'}}>Altera nome e foto de todas as contas selecionadas.</p>
                     <input placeholder="Novo Nome" value={toolsInput.name} onChange={e => setToolsInput({ ...toolsInput, name: e.target.value })} style={inputStyle} />
                     <input placeholder="URL da Nova Foto" value={toolsInput.photo} onChange={e => setToolsInput({ ...toolsInput, photo: e.target.value })} style={inputStyle} />
                     <button onClick={() => runTool('/api/update-profile', { newName: toolsInput.name, photoUrl: toolsInput.photo })} style={btnStyle}>Aplicar em Massa</button>
                 </div>
                 <div style={{ background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d' }}>
                     <h3>Postar Story</h3>
                     <p style={{fontSize: '13px', color: '#8b949e', marginBottom: '15px'}}>Publica um story em todas as contas selecionadas.</p>
                     <input placeholder="URL da Mídia (Imagem/Vídeo)" value={toolsInput.storyUrl} onChange={e => setToolsInput({ ...toolsInput, storyUrl: e.target.value })} style={inputStyle} />
                     <input placeholder="Legenda do Story" value={toolsInput.storyCaption} onChange={e => setToolsInput({ ...toolsInput, storyCaption: e.target.value })} style={inputStyle} />
                     <button onClick={() => runTool('/api/post-story', { mediaUrl: toolsInput.storyUrl, caption: toolsInput.storyCaption })} style={btnStyle}>Postar em Massa</button>
                 </div>
            </div>
        )}

    </div>
  );
}

// ESTILOS GERAIS
const inputStyle = { 
    width: '100%', 
    padding: '12px', 
    background: '#010409', 
    border: '1px solid #30363d', 
    color: 'white', 
    borderRadius: '6px', 
    marginBottom: '10px',
    outline: 'none',
    fontSize: '14px'
};

const btnStyle = { 
    width: '100%', 
    padding: '12px', 
    background: '#238636', 
    color: 'white', 
    border: 'none', 
    borderRadius: '6px', 
    cursor: 'pointer', 
    fontWeight: 'bold', 
    fontSize: '14px',
    transition: 'opacity 0.2s'
};

// COMPONENTES AUXILIARES
const StatBox = ({ label, val, color }) => (
    <div style={{ 
        flex: 1, 
        background: '#161b22', 
        padding: '15px', 
        borderRadius: '8px', 
        border: `1px solid ${color}`, 
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }}>
        <h2 style={{ margin: 0, color: color, fontSize: '24px' }}>{val}</h2>
        <small style={{ color: '#8b949e', fontWeight: 'bold' }}>{label}</small>
    </div>
);
