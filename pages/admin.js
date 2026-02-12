import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V16 - FINAL STABLE
// Correções: Fetch POST no Inbox, Scroll Chat, Seleção Automática
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
  
  // Refs para controle de scroll
  const chatListRef = useRef(null); 
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // --- SPY & TOOLS ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [toolsInput, setToolsInput] = useState({ name: '', photo: '', storyUrl: '', storyCaption: '' });

  // ==========================================================================
  // INICIALIZAÇÃO E POLLING
  // ==========================================================================

  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { 
          setAuthToken(token); 
          setIsAuthenticated(true); 
      }
      
      const savedGroups = localStorage.getItem('godModeGroups');
      if (savedGroups) setAllGroups(JSON.parse(savedGroups));

      const savedTemplates = localStorage.getItem('ht_templates');
      if (savedTemplates) setTemplates(JSON.parse(savedTemplates));
  }, []);

  // Polling de Dados (Atualiza status e estatísticas)
  useEffect(() => {
      if (isAuthenticated) {
          fetchData(); // Carga inicial
          const intervalId = setInterval(() => {
              // Atualiza apenas sessões e stats a cada 4s
              const t = Date.now();
              apiCall(`/api/list-sessions?t=${t}`).then(r => r?.ok && r.json().then(d => {
                  setSessions(d.sessions || []);
              }));
              apiCall(`/api/stats?t=${t}`).then(r => r?.ok && r.json().then(d => setStats(d)));
          }, 4000);

          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated]);

  // Auto-seleção de contas ao entrar no Inbox se vazio
  useEffect(() => {
      if (activeTab === 'inbox' && selectedPhones.size === 0 && sessions.length > 0) {
          const online = sessions.filter(s => s.is_active).map(s => s.phone_number);
          if (online.length > 0) {
              setSelectedPhones(new Set(online));
              // Pequeno delay para garantir que o estado atualizou antes de carregar
              setTimeout(() => loadInbox(new Set(online)), 100);
          }
      }
  }, [activeTab]);

  // Scroll Inteligente do Chat
  useLayoutEffect(() => {
      if (chatListRef.current && shouldScrollToBottom) {
          chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      }
  }, [chatHistory, shouldScrollToBottom, selectedChat]);

  // ==========================================================================
  // FUNÇÕES API (HELPER)
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
  // GESTÃO DE MODELOS
  // ==========================================================================
  
  const saveTemplate = () => {
      if (!templateName) return alert('Nome do modelo obrigatório');
      const newTemplates = [...templates, { id: Date.now(), name: templateName, msg: config.msg, img: config.imgUrl }];
      setTemplates(newTemplates);
      localStorage.setItem('ht_templates', JSON.stringify(newTemplates));
      setTemplateName('');
      alert('Salvo!');
  };

  const loadTemplate = (id) => {
      const template = templates.find(x => x.id == id);
      if (template) setConfig({ ...config, msg: template.msg, imgUrl: template.img });
  };

  const deleteTemplate = (id) => {
      if(!confirm('Excluir?')) return;
      const newTemplates = templates.filter(x => x.id !== id);
      setTemplates(newTemplates);
      localStorage.setItem('ht_templates', JSON.stringify(newTemplates));
  };

  // ==========================================================================
  // ENGINE V16 (SISTEMA DE DISPARO)
  // ==========================================================================
  
  const startEngine = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas na lista ao lado!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 ENGINE INICIADA');

      let senders = Array.from(selectedPhones);
      let cooldowns = {}; 

      while (!stopProcessRef.current) {
          const now = Date.now();
          const activeSenders = senders.filter(p => !cooldowns[p] || now > cooldowns[p]);

          if (activeSenders.length === 0) {
              addLog('⏳ Flood Wait em todas as contas. Aguardando 10s...');
              await new Promise(r => setTimeout(r, 10000));
              continue;
          }

          // Busca leads (sem cache)
          const leadsRes = await apiCall(`/api/get-campaign-leads?limit=15&random=${config.useRandom}&t=${Date.now()}`);
          const leadsData = await leadsRes?.json();
          const leads = leadsData?.leads || [];

          if (leads.length === 0) { 
              addLog('✅ Lista de leads finalizada.'); 
              break; 
          }

          // Disparo Paralelo
          const promises = leads.map(async (lead) => {
               if (stopProcessRef.current) return;
               
               const currentSenders = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
               if (currentSenders.length === 0) return;
               const sender = currentSenders[Math.floor(Math.random() * currentSenders.length)];

               try {
                  const res = await apiCall('/api/dispatch', {
                      senderPhone: sender, 
                      target: lead.user_id, 
                      username: lead.username,
                      message: config.msg, 
                      imageUrl: config.imgUrl, 
                      leadDbId: lead.id
                  });
                  const data = await res.json();

                  if (res.status === 429 || (data.error && data.error.includes('FLOOD'))) {
                      const wait = data.wait || 60;
                      cooldowns[sender] = Date.now() + (wait * 1000);
                      addLog(`⛔ Flood ${sender}. Pausa ${wait}s.`);
                  } else if (data.success) {
                      addLog(`✅ Enviado: ${sender} -> ${lead.username || lead.user_id}`);
                      setStats(prev => ({ ...prev, sent: prev.sent + 1, pending: prev.pending - 1 }));
                  } else {
                      addLog(`❌ Erro ${sender}: ${data.error}`);
                  }
               } catch (e) { }
          });

          await Promise.all(promises);
          await new Promise(r => setTimeout(r, 1500));
      }
      setIsProcessing(false);
      addLog('🏁 Engine Parada.');
      fetchData();
  };

  // ==========================================================================
  // INBOX (CHAT) - CORRIGIDO
  // ==========================================================================
  
  const loadInbox = async (forcePhones = null) => {
      const phonesToUse = forcePhones ? forcePhones : selectedPhones;
      
      if (phonesToUse.size === 0) {
          // Tenta pegar sessões ativas se nada selecionado
          const active = sessions.filter(s => s.is_active).map(s => s.phone_number);
          if (active.length > 0) {
             alert(`Nenhuma conta selecionada. Carregando ${active.length} contas online.`);
             phonesToUse.add(...active);
             setSelectedPhones(new Set(active));
          } else {
             return alert('Nenhuma conta online para carregar inbox.');
          }
      }

      setIsLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(phonesToUse);
      let allReplies = [];

      // POST request para garantir compatibilidade
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
      
      // Remove duplicados e ordena
      const uniqueReplies = Array.from(new Map(allReplies.map(item => [item.chatId, item])).values());
      setReplies(uniqueReplies.sort((a, b) => b.timestamp - a.timestamp));
      setIsLoadingReplies(false);
  };

  const openChat = async (reply, offset = 0) => {
      if (offset === 0) {
          setSelectedChat(reply);
          setChatHistory([]);
          setChatOffset(0);
          setShouldScrollToBottom(true); // Rola para baixo ao abrir
      } else {
          setShouldScrollToBottom(false); // Mantém posição ao carregar antigas
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
                  // Inverte para exibir cronologicamente (antigas no topo, novas embaixo)
                  const sortedHistory = data.history.reverse(); 
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
      addLog('⚙️ Executando em massa...');
      const phones = Array.from(selectedPhones);
      for (const p of phones) {
          try {
              await apiCall(endpoint, { phone: p, ...payload });
              addLog(`✅ OK: ${p}`);
          } catch (e) { addLog(`❌ Erro: ${p}`); }
      }
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
      } catch (e) { alert('Erro conexão'); }
  };

  if (!isAuthenticated) return (
      <div style={styles.loginContainer}>
          <form onSubmit={handleLogin} style={styles.loginBox}>
              <h2 style={{ textAlign: 'center', margin: '0 0 20px 0', color: 'white' }}>HOTTRACK V16</h2>
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
                <span style={styles.versionBadge}>V16 PRO</span>
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
                <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <StatBox label="PENDENTES" val={stats.pending} color="#d29922" />
                        <StatBox label="ENVIADOS HOJE" val={stats.sent} color="#238636" />
                        <StatBox label="ONLINE" val={sessions.filter(s => s.is_active).length} color="#1f6feb" />
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
                            <input placeholder="URL Imagem" value={config.imgUrl} onChange={e => setConfig({ ...config, imgUrl: e.target.value })} style={{ flex: 1, ...styles.input, marginBottom: 0 }} />
                            <label style={styles.checkboxLabel}>
                                <input type="checkbox" checked={config.useRandom} onChange={e => setConfig({ ...config, useRandom: e.target.checked })} /> Aleatório
                            </label>
                        </div>
                        <textarea placeholder="Mensagem..." value={config.msg} onChange={e => setConfig({ ...config, msg: e.target.value })} style={{ ...styles.input, height: '80px', fontFamily:'monospace' }} />
                        
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <input placeholder="Nome Modelo" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ flex: 1, ...styles.input, marginBottom: 0 }} />
                            <button onClick={saveTemplate} style={{...styles.btn, background:'#1f6feb', width:'auto'}}>Salvar</button>
                            {templateName && <button onClick={() => deleteTemplate(Date.now())} style={{...styles.btn, background:'#f85149', width:'auto'}}>X</button>}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!isProcessing ? 
                                <button onClick={startEngine} style={{ ...styles.btn, background: '#238636' }}>🚀 INICIAR</button> : 
                                <button onClick={() => stopProcessRef.current = true} style={{ ...styles.btn, background: '#f85149' }}>🛑 PARAR</button>
                            }
                        </div>
                    </div>
                    <div style={styles.logBox}>
                        {logs.map((l, i) => <div key={i} style={{fontSize:'12px', color: l.includes('Erro') ? '#f85149' : '#8b949e'}}>{l}</div>)}
                    </div>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <h4>Contas ({sessions.length})</h4>
                        <button onClick={() => setSelectedPhones(new Set(sessions.filter(s => s.is_active).map(s => s.phone_number)))} style={styles.linkBtn}>Selecionar Online</button>
                    </div>
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

        {/* INBOX (CHAT) */}
        {activeTab === 'inbox' && (
            <div style={styles.chatContainer}>
                <div style={styles.chatSidebar}>
                    <div style={{ padding: '10px', borderBottom: '1px solid #30363d' }}>
                        <button onClick={() => loadInbox()} style={{...styles.btn, background: isLoadingReplies ? '#21262d' : '#1f6feb', fontSize:'12px'}}>
                            {isLoadingReplies ? 'Buscando...' : '🔄 Atualizar Inbox'}
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {replies.length === 0 && <div style={{padding:20, textAlign:'center', color:'#8b949e', fontSize:'13px'}}>Sem mensagens.</div>}
                        {replies.map((r, i) => (
                            <div key={i} onClick={() => openChat(r)} style={{
                                padding: '12px', borderBottom: '1px solid #21262d', cursor: 'pointer',
                                background: selectedChat?.chatId === r.chatId ? '#1f6feb15' : 'transparent',
                                borderLeft: selectedChat?.chatId === r.chatId ? '3px solid #1f6feb' : '3px solid transparent'
                            }}>
                                <div style={{fontWeight:'bold', fontSize:'13px', color:'#e6edf3'}}>{r.name || 'Desconhecido'}</div>
                                <div style={{fontSize:'12px', color:'#8b949e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.lastMessage}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={styles.chatArea}>
                    {selectedChat ? (
                        <>
                            <div style={styles.chatHeader}>
                                <div>
                                    <b>{selectedChat.name}</b>
                                    <div style={{fontSize:'11px', color:'#8b949e'}}>{selectedChat.fromPhone}</div>
                                </div>
                            </div>
                            
                            {/* AREA DE MENSAGENS COM REF DE SCROLL */}
                            <div ref={chatListRef} style={styles.messagesList}>
                                <div style={{textAlign: 'center', margin: '10px 0'}}>
                                    <button onClick={() => openChat(selectedChat, chatOffset)} style={styles.loadMoreBtn}>
                                        {isChatLoading ? 'Carregando...' : '⬆ Carregar Mais'}
                                    </button>
                                </div>

                                {chatHistory.map((m, i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        maxWidth: '70%',
                                        marginBottom: '8px',
                                        background: m.isOut ? '#005c4b' : '#202c33',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        color: 'white',
                                        fontSize: '14px',
                                        position: 'relative'
                                    }}>
                                        {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px'}} />}
                                        <div style={{whiteSpace:'pre-wrap'}}>{m.text}</div>
                                        <div style={{fontSize:'10px', textAlign:'right', opacity:0.6, marginTop:'2px'}}>
                                            {new Date(m.date * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div style={{padding:'10px', background:'#202c33', display:'flex', gap:'10px'}}>
                                <input placeholder="Mensagem..." style={{...styles.input, marginBottom:0, borderRadius:'20px'}} />
                                <button style={{...styles.btn, width:'auto', borderRadius:'50%', padding:'10px 15px'}}>➤</button>
                            </div>
                        </>
                    ) : (
                        <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e'}}>
                            Selecione uma conversa para iniciar
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* OUTRAS ABAS (SPY / TOOLS) */}
        {(activeTab === 'spy' || activeTab === 'tools') && (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={styles.card}>
                    <h3>{activeTab === 'spy' ? 'Scanner de Grupos' : 'Ferramentas de Perfil'}</h3>
                    {activeTab === 'spy' ? (
                        <>
                            <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                                <button onClick={scanGroups} disabled={isScanning} style={styles.btn}>{isScanning ? '...' : '1. Escanear'}</button>
                                <button onClick={harvestAll} disabled={isHarvesting} style={{...styles.btn, background:'#8957e5'}}>{isHarvesting ? '...' : '2. Aspirar'}</button>
                            </div>
                            <div style={styles.listArea}>
                                {allGroups.map((g, i) => <div key={i} style={styles.listItem}>{g.title}</div>)}
                            </div>
                        </>
                    ) : (
                        <>
                            <input placeholder="Novo Nome" value={toolsInput.name} onChange={e => setToolsInput({...toolsInput, name:e.target.value})} style={styles.input}/>
                            <input placeholder="URL Foto" value={toolsInput.photo} onChange={e => setToolsInput({...toolsInput, photo:e.target.value})} style={styles.input}/>
                            <button onClick={() => runTool('/api/update-profile', { newName: toolsInput.name, photoUrl: toolsInput.photo })} style={styles.btn}>Aplicar em Massa</button>
                        </>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}

// ESTILOS (CSS-IN-JS)
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif', overflow: 'hidden' },
    header: { padding: '15px 20px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: '30px', borderRadius: '10px', border: '1px solid #30363d', width: '300px' },

    dashboardGrid: { padding: '20px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', flex: 1, overflowY: 'auto' },
    card: { background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' },
    logBox: { height: '200px', overflowY: 'auto', background: '#010409', padding: '10px', borderRadius: '8px', border: '1px solid #30363d', fontFamily: 'monospace' },
    accountRow: { padding: '8px', borderBottom: '1px solid #21262d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },

    // Layout do Chat
    chatContainer: { flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden', background: '#0b141a' },
    chatSidebar: { borderRight: '1px solid #30363d', background: '#111b21', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    chatArea: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundImage: 'linear-gradient(#0b141a 2px, transparent 2px), linear-gradient(90deg, #0b141a 2px, transparent 2px)', backgroundSize: '20px 20px' },
    chatHeader: { padding: '10px 20px', background: '#202c33', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    
    // Lista de mensagens com Scroll correto
    messagesList: { 
        flex: 1, 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '20px',
        minHeight: 0 
    },

    input: { width: '100%', padding: '10px', background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: '6px', marginBottom: '10px', outline: 'none', boxSizing: 'border-box' },
    select: { background: '#21262d', color: 'white', border: '1px solid #30363d', padding: '5px', borderRadius: '4px' },
    btn: { width: '100%', padding: '10px', background: '#238636', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    navBtn: { color: 'white', padding: '5px 15px', borderRadius: '6px', cursor: 'pointer', border: '1px solid transparent', fontSize: '13px', fontWeight: 'bold' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
    linkBtn: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '12px' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#c9d1d9', cursor: 'pointer' },
    versionBadge: { fontSize: '10px', background: '#238636', padding: '2px 5px', borderRadius: '4px', color: 'white', fontWeight: 'bold' },
    loadMoreBtn: { background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px' },
    listArea: { height: '250px', overflowY: 'auto', background: '#0d1117', padding: '10px', borderRadius: '6px' },
    listItem: { padding: '5px', borderBottom: '1px solid #21262d', fontSize: '13px' },
    toggleBtn: { flex: 1, border: 'none', color: 'white', padding: '8px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }
};

const StatBox = ({ label, val, color }) => (
    <div style={{ flex: 1, background: '#161b22', padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${color}` }}>
        <h2 style={{ margin: 0, color: 'white', fontSize: '20px' }}>{val}</h2>
        <small style={{ color: '#8b949e', fontSize: '10px', fontWeight: 'bold' }}>{label}</small>
    </div>
);
