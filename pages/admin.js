import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V15 - CHAT FIXO & DADOS EM TEMPO REAL
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

  // --- INBOX (CHAT CORRIGIDO) ---
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
  // INICIALIZAÇÃO E POLLING (DADOS REAIS)
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

  // Polling Agressivo (Atualiza a cada 3s para garantir dados frescos)
  useEffect(() => {
      if (isAuthenticated) {
          fetchData(); 
          const intervalId = setInterval(() => {
              // Adiciona timestamp para evitar cache do navegador
              const t = Date.now();
              apiCall(`/api/list-sessions?t=${t}`).then(r => r?.ok && r.json().then(d => setSessions(d.sessions || [])));
              apiCall(`/api/stats?t=${t}`).then(r => r?.ok && r.json().then(d => setStats(d)));
          }, 3000); // 3 segundos

          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated]);

  // Controle de Scroll Inteligente
  useLayoutEffect(() => {
      if (chatListRef.current && shouldScrollToBottom) {
          // Rola para o final apenas se for abertura de chat ou nova mensagem enviada
          chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      }
  }, [chatHistory, shouldScrollToBottom, selectedChat]);

  // ==========================================================================
  // FUNÇÕES API
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
  // LÓGICA DO ENGINE (DISPARO)
  // ==========================================================================

  const startEngine = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas!');
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
              await new Promise(r => setTimeout(r, 10000));
              continue;
          }

          // Busca leads SEM cache
          const t = Date.now();
          const leadsRes = await apiCall(`/api/get-campaign-leads?limit=15&random=${config.useRandom}&t=${t}`);
          const leadsData = await leadsRes?.json();
          const leads = leadsData?.leads || [];

          if (leads.length === 0) { addLog('✅ Sem leads pendentes.'); break; }

          // Processamento em Lote
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
                      addLog(`✅ Enviado: ${sender} -> ${lead.username}`);
                      setStats(prev => ({ ...prev, sent: prev.sent + 1, pending: prev.pending - 1 }));
                  } else {
                      addLog(`❌ Erro ${sender}: ${data.error}`);
                  }
               } catch (e) { }
          });

          await Promise.all(promises);
          await new Promise(r => setTimeout(r, 2000));
      }
      setIsProcessing(false);
      addLog('🏁 Engine Parada.');
  };

  // ==========================================================================
  // INBOX (CHAT) - LÓGICA CORRIGIDA
  // ==========================================================================

  const loadInbox = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas na Dashboard!');
      setIsLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let all = [];
      const t = Date.now();

      // Busca mensagens em blocos de 5 contas
      for (let i = 0; i < phones.length; i += 5) {
          const batch = phones.slice(i, i + 5);
          const results = await Promise.all(batch.map(p => 
              apiCall(`/api/spy/check-replies?phone=${p}&t=${t}`).then(r => r.json()).catch(() => ({}))
          ));
          results.forEach(r => { if (r.replies) all.push(...r.replies); });
      }
      setReplies(all.sort((a, b) => b.timestamp - a.timestamp));
      setIsLoadingReplies(false);
  };

  const openChat = async (reply, offset = 0) => {
      if (offset === 0) {
          setSelectedChat(reply);
          setChatHistory([]);
          setChatOffset(0);
          setShouldScrollToBottom(true); // Abre chat -> Rola pro final
      } else {
          setShouldScrollToBottom(false); // Carrega mais -> NÃO rola pro final
      }
      
      setIsChatLoading(true);
      try {
          const res = await apiCall('/api/spy/get-history', {
              phone: reply.fromPhone,
              chatId: reply.chatId,
              limit: 20,
              offset: offset
          });
          const data = await res.json();
          if (data.history) {
              // Garante ordem correta e concatena
              const newMsgs = data.history.reverse();
              setChatHistory(prev => offset === 0 ? newMsgs : [...newMsgs, ...prev]);
              setChatOffset(offset + 20);
          }
      } catch (e) { console.error(e); }
      setIsChatLoading(false);
  };

  // ==========================================================================
  // SPY & TOOLS
  // ==========================================================================
  const scanGroups = async () => { /* Mantido igual */
      if (selectedPhones.size === 0) return alert('Selecione contas!');
      setIsScanning(true);
      addLog('📡 Escaneando...');
      let found = [];
      const phones = Array.from(selectedPhones);
      for (const p of phones) {
          try {
              const res = await apiCall('/api/spy/list-chats', { phone: p });
              const data = await res.json();
              if (data.chats) data.chats.forEach(c => !c.type.includes('Canal') && found.push({ ...c, ownerPhone: p }));
          } catch (e) { }
      }
      const unique = [...new Map(found.map(i => [i.id, i])).values()];
      setAllGroups(unique);
      localStorage.setItem('godModeGroups', JSON.stringify(unique));
      setIsScanning(false);
      addLog(`📡 ${unique.length} grupos.`);
  };

  const harvestAll = async () => { /* Mantido igual */
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if (targets.length === 0) return alert('Nada novo.');
      if (!confirm(`Aspirar ${targets.length} grupos?`)) return;
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
          } catch (e) { }
          await new Promise(r => setTimeout(r, 1000));
      }
      setIsHarvesting(false);
      addLog('🏁 Fim.');
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
              <h2 style={{ textAlign: 'center', color:'white', marginBottom:'20px' }}>HOTTRACK ADMIN</h2>
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
                <span style={styles.versionBadge}>V15 PRO</span>
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
                        <StatBox label="ENVIADOS" val={stats.sent} color="#238636" />
                        <StatBox label="ONLINE" val={sessions.filter(s => s.is_active).length} color="#1f6feb" />
                    </div>
                    
                    <div style={styles.card}>
                        <h3>Configuração de Envio</h3>
                        <div style={{ display: 'flex', gap: '10px', margin: '10px 0' }}>
                            <input placeholder="URL Imagem" value={config.imgUrl} onChange={e => setConfig({ ...config, imgUrl: e.target.value })} style={{ flex: 1, ...styles.input, marginBottom: 0 }} />
                            <label style={styles.checkboxLabel}>
                                <input type="checkbox" checked={config.useRandom} onChange={e => setConfig({ ...config, useRandom: e.target.checked })} /> Aleatório
                            </label>
                        </div>
                        <textarea placeholder="Mensagem..." value={config.msg} onChange={e => setConfig({ ...config, msg: e.target.value })} style={{ ...styles.input, height: '80px' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!isProcessing ? 
                                <button onClick={startEngine} style={{ ...styles.btn, background: '#238636' }}>🚀 INICIAR</button> : 
                                <button onClick={() => stopProcessRef.current = true} style={{ ...styles.btn, background: '#f85149' }}>🛑 PARAR</button>
                            }
                        </div>
                    </div>
                    <div style={styles.logBox}>
                        {logs.map((l, i) => <div key={i} style={{ fontSize:'12px', color: l.includes('Erro') ? '#f85149' : '#8b949e' }}>{l}</div>)}
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

        {/* INBOX CORRIGIDO */}
        {activeTab === 'inbox' && (
            <div style={styles.chatContainer}>
                <div style={styles.chatSidebar}>
                    <div style={{ padding: '10px', borderBottom: '1px solid #30363d' }}>
                        <button onClick={loadInbox} style={{...styles.btn, background: isLoadingReplies ? '#21262d' : '#1f6feb', fontSize:'12px'}}>
                            {isLoadingReplies ? 'Buscando...' : '🔄 Atualizar'}
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
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
                                <b>{selectedChat.name}</b>
                                <span style={{fontSize:'11px', color:'#8b949e'}}>{selectedChat.fromPhone}</span>
                            </div>
                            
                            {/* LISTA DE MENSAGENS COM SCROLL CORRIGIDO */}
                            <div 
                                ref={chatListRef} 
                                style={styles.messagesList} // AQUI ESTAVA O PROBLEMA DO SCROLL
                            >
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
                                        <div>{m.text}</div>
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
                            Selecione uma conversa
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* OUTRAS ABAS (SPY / TOOLS) */}
        {(activeTab === 'spy' || activeTab === 'tools') && (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={styles.card}>
                    <h3>{activeTab === 'spy' ? 'Grupos' : 'Perfil'}</h3>
                    {activeTab === 'spy' ? (
                        <>
                            <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                                <button onClick={scanGroups} disabled={isScanning} style={styles.btn}>{isScanning ? '...' : 'Escanear'}</button>
                                <button onClick={harvestAll} disabled={isHarvesting} style={{...styles.btn, background:'#8957e5'}}>{isHarvesting ? '...' : 'Aspirar'}</button>
                            </div>
                            <div style={styles.listArea}>
                                {allGroups.map((g, i) => <div key={i} style={styles.listItem}>{g.title}</div>)}
                            </div>
                        </>
                    ) : (
                        <>
                            <input placeholder="Novo Nome" value={toolsInput.name} onChange={e => setToolsInput({...toolsInput, name:e.target.value})} style={styles.input}/>
                            <input placeholder="URL Foto" value={toolsInput.photo} onChange={e => setToolsInput({...toolsInput, photo:e.target.value})} style={styles.input}/>
                            <button onClick={() => {}} style={styles.btn}>Atualizar</button>
                        </>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}

// ESTILOS CORRIGIDOS PARA O SCROLL FUNCIONAR
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif', overflow: 'hidden' }, // Height 100vh fixo
    header: { padding: '15px 20px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    
    // LOGIN
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: '30px', borderRadius: '10px', border: '1px solid #30363d', width: '300px' },

    // DASHBOARD
    dashboardGrid: { padding: '20px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', flex: 1, overflowY: 'auto' },
    card: { background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' },
    logBox: { height: '200px', overflowY: 'auto', background: '#010409', padding: '10px', borderRadius: '8px', border: '1px solid #30363d', fontFamily: 'monospace' },
    accountRow: { padding: '8px', borderBottom: '1px solid #21262d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },

    // CHAT CONTAINER (O SEGREDO DO SCROLL)
    chatContainer: { 
        flex: 1, // Ocupa o resto da tela
        display: 'grid', 
        gridTemplateColumns: '300px 1fr', 
        overflow: 'hidden', // Impede que a tela inteira role
        background: '#0b141a'
    },
    chatSidebar: { borderRight: '1px solid #30363d', background: '#111b21', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    chatArea: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundImage: 'linear-gradient(#0b141a 2px, transparent 2px), linear-gradient(90deg, #0b141a 2px, transparent 2px)', backgroundSize: '20px 20px' },
    chatHeader: { padding: '10px 20px', background: '#202c33', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    
    // AQUI É A CORREÇÃO PRINCIPAL DO FLEXBOX
    messagesList: { 
        flex: 1, 
        overflowY: 'auto', // Scroll acontece SÓ AQUI
        display: 'flex', 
        flexDirection: 'column', 
        padding: '20px',
        minHeight: 0 // CRUCIAL PARA FLEXBOX ANINHADO
    },

    // COMPONENTES
    input: { width: '100%', padding: '10px', background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: '6px', marginBottom: '10px', outline: 'none', boxSizing: 'border-box' },
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
