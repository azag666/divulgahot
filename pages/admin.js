import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V18 PRO - SMART COLLECTOR & ENGINE
// - Visualização de Vídeos e Áudios (Base64)
// - Prioridade Inteligente: @Username > UserID
// - Sistema de Coleta/Clonagem de Ofertas em Tempo Real
// - Layout Anti-Travamento de Scroll
// ============================================================================

export default function AdminPanel() {
  
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [credentials, setCredentials] = useState({ user: '', pass: '', token: '' });

  // --- ESTADOS DE INTERFACE E NAVEGAÇÃO ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  
  // --- ESTADOS DE DADOS DO SISTEMA ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- ESTADOS DE DISPARO (ENGINE) ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState({ msg: '', imgUrl: '', useRandom: true });
  const [templates, setTemplates] = useState([]); 
  const [templateName, setTemplateName] = useState('');
  const stopProcessRef = useRef(false);

  // --- ESTADOS DO INBOX (CHAT INTELIGENTE) ---
  const [replies, setReplies] = useState([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatOffset, setChatOffset] = useState(0);
  
  // Referências para controle de interface
  const chatListRef = useRef(null); 
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // --- ESTADOS DE FERRAMENTAS (SPY) ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [toolsInput, setToolsInput] = useState({ name: '', photo: '', storyUrl: '', storyCaption: '' });

  // ==========================================================================
  // INICIALIZAÇÃO E SINCRONIZAÇÃO (POLLING)
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

  useEffect(() => {
      if (isAuthenticated) {
          fetchData(); 
          const intervalId = setInterval(() => {
              const t = Date.now();
              apiCall(`/api/list-sessions?t=${t}`).then(r => r?.ok && r.json().then(d => {
                  setSessions(d.sessions || []);
              }));
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
  // FUNÇÕES DE COMUNICAÇÃO COM API
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
  // LÓGICA DE CLONAGEM E REUSO DE OFERTAS
  // ==========================================================================

  const coletarOferta = (msg) => {
      if (!msg.text) return alert('Esta oferta não possui texto para clonar.');
      
      const confirmar = confirm("♻️ Deseja clonar este conteúdo para o seu Dashboard de disparo?");
      if (confirmar) {
          setConfig({ ...config, msg: msg.text });
          setActiveTab('dashboard');
          addLog('♻️ Oferta capturada e enviada para o Dashboard.');
      }
  };

  // ==========================================================================
  // ENGINE V18 - DISPARO INTELIGENTE (SMART TARGETING)
  // ==========================================================================
  
  const startEngine = async () => {
      if (selectedPhones.size === 0) return alert('Selecione contas na lista lateral!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 ENGINE V18 SMART INICIADA');

      let senders = Array.from(selectedPhones);
      let cooldowns = {}; 

      while (!stopProcessRef.current) {
          const leadsRes = await apiCall(`/api/get-campaign-leads?limit=15&random=${config.useRandom}&t=${Date.now()}`);
          const leadsData = await leadsRes?.json();
          const leads = leadsData?.leads || [];

          if (leads.length === 0) { 
              addLog('✅ Fim da fila de leads.'); 
              break; 
          }

          const promises = leads.map(async (lead) => {
               if (stopProcessRef.current) return;
               
               const activeSenders = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
               if (activeSenders.length === 0) return;
               const sender = activeSenders[Math.floor(Math.random() * activeSenders.length)];

               // SMART TARGETING: Prioriza Username (@) sobre ID Numérico
               let smartTarget = (lead.username && lead.username !== 'null') 
                    ? (lead.username.startsWith('@') ? lead.username : `@${lead.username}`)
                    : lead.user_id;

               try {
                  const res = await apiCall('/api/dispatch', {
                      senderPhone: sender, 
                      target: smartTarget, 
                      message: config.msg, 
                      imageUrl: config.imgUrl, 
                      leadDbId: lead.id
                  });
                  const data = await res.json();

                  if (res.status === 429 || (data.error && data.error.includes('FLOOD'))) {
                      const wait = data.wait || 60;
                      cooldowns[sender] = Date.now() + (wait * 1000);
                      addLog(`⛔ Flood Wait em ${sender}. Pausa de ${wait}s.`);
                  } else if (data.success) {
                      addLog(`✅ Enviado: ${sender} -> ${smartTarget}`);
                      setStats(prev => ({ ...prev, sent: prev.sent + 1, pending: prev.pending - 1 }));
                  } else {
                      addLog(`❌ Erro ${sender} p/ ${smartTarget}: ${data.error}`);
                  }
               } catch (e) { }
          });

          await Promise.all(promises);
          await new Promise(r => setTimeout(r, 2000));
      }
      setIsProcessing(false);
      addLog('🏁 Engine Finalizada.');
      fetchData();
  };

  // ==========================================================================
  // INBOX - MONITORAMENTO DE OFERTAS E MÍDIAS
  // ==========================================================================
  
  const loadInbox = async () => {
      if (selectedPhones.size === 0) {
          const online = sessions.filter(s => s.is_active).map(s => s.phone_number);
          if (online.length > 0) {
              setSelectedPhones(new Set(online));
          } else {
              return alert('Conecte contas para ler o inbox.');
          }
      }

      setIsLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let allReplies = [];

      for (let i = 0; i < phones.length; i += 5) {
          const batch = phones.slice(i, i + 5);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p }).then(r => r.json()).catch(() => ({}))
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
          setChatOffset(0);
          setShouldScrollToBottom(true); 
      } else {
          setShouldScrollToBottom(false); 
      }

      setIsChatLoading(true);

      try {
          const response = await apiCall('/api/spy/get-history', {
              phone: reply.fromPhone,
              chatId: reply.chatId,
              limit: 25,
              offset: offset
          });
          
          if (response.ok) {
              const data = await response.json();
              if (data.history) {
                  const sortedHistory = data.history.reverse(); 
                  setChatHistory(prev => offset === 0 ? sortedHistory : [...sortedHistory, ...prev]);
                  setChatOffset(offset + 25);
              }
          }
      } catch (error) { console.error(error); }
      setIsChatLoading(false);
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
          if (data.success) { 
              setAuthToken(data.token); 
              setIsAuthenticated(true); 
              localStorage.setItem('authToken', data.token); 
          } else alert(data.error);
      } catch (e) { alert('Erro na conexão com o servidor.'); }
  };

  if (!isAuthenticated) return (
      <div style={styles.loginContainer}>
          <form onSubmit={handleLogin} style={styles.loginBox}>
              <h2 style={{ textAlign: 'center', color: 'white', marginBottom: '20px' }}>HOTTRACK V18</h2>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button type="button" onClick={() => setLoginMode('user')} style={{...styles.toggleBtn, background: loginMode === 'user' ? '#238636' : '#21262d'}}>Usuário</button>
                  <button type="button" onClick={() => setLoginMode('admin')} style={{...styles.toggleBtn, background: loginMode === 'admin' ? '#8957e5' : '#21262d'}}>Admin</button>
              </div>
              {loginMode === 'user' ? (
                  <>
                      <input placeholder="Usuário" value={credentials.user} onChange={e => setCredentials({ ...credentials, user: e.target.value })} style={styles.input} />
                      <input type="password" placeholder="Senha" value={credentials.pass} onChange={e => setCredentials({ ...credentials, pass: e.target.value })} style={styles.input} />
                  </>
              ) : (
                  <input type="password" placeholder="Token de Acesso" value={credentials.token} onChange={e => setCredentials({ ...credentials, token: e.target.value })} style={styles.input} />
              )}
              <button type="submit" style={styles.btn}>ENTRAR NO PAINEL</button>
          </form>
      </div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* CABEÇALHO PRINCIPAL */}
        <div style={styles.header}>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <h2 style={{ margin: 0, color: 'white' }}>HOTTRACK</h2>
                <span style={styles.versionBadge}>V18 SMART LIVE</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
                {['dashboard', 'inbox', 'spy', 'tools'].map(tab => (
                    <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'inbox') loadInbox(); }} style={{
                        ...styles.navBtn,
                        background: activeTab === tab ? '#1f6feb' : 'transparent', 
                        borderColor: activeTab === tab ? '#1f6feb' : '#30363d'
                    }}>{tab.toUpperCase()}</button>
                ))}
            </div>
            <button onClick={() => { setIsAuthenticated(false); localStorage.removeItem('authToken'); }} style={styles.logoutBtn}>SAIR</button>
        </div>

        {/* ÁREA DE CONTEÚDO: DASHBOARD */}
        {activeTab === 'dashboard' && (
            <div style={styles.dashboardGrid}>
                <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <StatBox label="LEADS PENDENTES" val={stats.pending} color="#d29922" />
                        <StatBox label="ENVIADOS HOJE" val={stats.sent} color="#238636" />
                        <StatBox label="CONTAS ONLINE" val={sessions.filter(s => s.is_active).length} color="#1f6feb" />
                    </div>
                    
                    <div style={styles.card}>
                        <h3>Configuração de Disparo</h3>
                        <div style={{ display: 'flex', gap: '10px', margin: '15px 0' }}>
                            <input placeholder="URL da Imagem de Capa (Opcional)" value={config.imgUrl} onChange={e => setConfig({ ...config, imgUrl: e.target.value })} style={{ flex: 1, ...styles.input, marginBottom: 0 }} />
                            <label style={styles.checkboxLabel}>
                                <input type="checkbox" checked={config.useRandom} onChange={e => setConfig({ ...config, useRandom: e.target.checked })} /> Ordem Aleatória
                            </label>
                        </div>
                        <textarea 
                            placeholder="Sua oferta capturada ou nova mensagem aqui... (Suporta Spintax {Oi|Olá})" 
                            value={config.msg} 
                            onChange={e => setConfig({ ...config, msg: e.target.value })} 
                            style={{ ...styles.input, height: '150px', fontFamily:'monospace' }} 
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!isProcessing ? 
                                <button onClick={startEngine} style={{ ...styles.btn, background: '#238636' }}>🚀 INICIAR DISPARO EM MASSA</button> : 
                                <button onClick={() => stopProcessRef.current = true} style={{ ...styles.btn, background: '#f85149' }}>🛑 PARAR OPERAÇÃO</button>
                            }
                        </div>
                    </div>
                    <div style={styles.logBox}>
                        {logs.map((l, i) => <div key={i} style={{fontSize:'12px', color: l.includes('Erro') || l.includes('Flood') ? '#f85149' : '#8b949e'}}>{l}</div>)}
                    </div>
                </div>

                {/* LISTA DE CONTAS LATERAIS */}
                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <h4>Suas Contas ({sessions.length})</h4>
                        <button onClick={() => setSelectedPhones(new Set(sessions.filter(s => s.is_active).map(s => s.phone_number)))} style={styles.linkBtn}>Selecionar Online</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => {
                                const newS = new Set(selectedPhones);
                                newS.has(s.phone_number) ? newS.delete(s.phone_number) : newS.add(s.phone_number);
                                setSelectedPhones(newS);
                            }} style={{...styles.accountRow, background: selectedPhones.has(s.phone_number) ? '#1f6feb22' : 'transparent'}}>
                                <div style={{width:'10px', height:'10px', borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149'}}></div>
                                <span>{s.phone_number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* ÁREA DE CONTEÚDO: INBOX (MONITORAMENTO) */}
        {activeTab === 'inbox' && (
            <div style={styles.chatContainer}>
                <div style={styles.chatSidebar}>
                    <div style={{ padding: '10px', borderBottom: '1px solid #30363d' }}>
                        <button onClick={loadInbox} style={{...styles.btn, background: isLoadingReplies ? '#21262d' : '#1f6feb', fontSize:'12px'}}>
                            {isLoadingReplies ? 'Buscando Mensagens...' : '🔄 Atualizar Inbox'}
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
                                <div>
                                    <b>{selectedChat.name}</b>
                                    <div style={{fontSize:'11px', color:'#8b949e'}}>{selectedChat.fromPhone}</div>
                                </div>
                            </div>
                            
                            <div ref={chatListRef} style={styles.messagesList}>
                                <div style={{textAlign: 'center', margin: '15px 0'}}>
                                    <button onClick={() => openChat(selectedChat, chatOffset)} style={styles.loadMoreBtn}>
                                        {isChatLoading ? 'Carregando...' : '⬆ Ver mensagens anteriores'}
                                    </button>
                                </div>

                                {chatHistory.map((m, i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        maxWidth: '75%',
                                        marginBottom: '12px',
                                        background: m.isOut ? '#005c4b' : '#202c33',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontSize: '14px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                        position: 'relative'
                                    }}>
                                        {/* SUPORTE PARA VÍDEOS */}
                                        {m.mediaType === 'video' && m.media && (
                                            <video controls style={{maxWidth:'100%', borderRadius:'6px', marginBottom:'8px', display:'block'}}>
                                                <source src={`data:video/mp4;base64,${m.media}`} type="video/mp4" />
                                            </video>
                                        )}

                                        {/* SUPORTE PARA ÁUDIOS */}
                                        {(m.mediaType === 'audio' || m.mediaType === 'voice') && m.media && (
                                            <audio controls style={{maxWidth:'220px', marginBottom:'8px', display:'block'}}>
                                                <source src={`data:audio/ogg;base64,${m.media}`} type="audio/ogg" />
                                                <source src={`data:audio/mp3;base64,${m.media}`} type="audio/mpeg" />
                                            </audio>
                                        )}

                                        {/* SUPORTE PARA IMAGENS */}
                                        {m.mediaType === 'image' && m.media && (
                                            <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'6px', marginBottom:'8px', display:'block'}} />
                                        )}

                                        <div style={{whiteSpace:'pre-wrap', lineHeight:'1.5'}}>{m.text}</div>
                                        
                                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'8px'}}>
                                            {!m.isOut && (
                                                <button onClick={() => coletarOferta(m)} style={styles.cloneBtn}>
                                                    ♻️ CLONAR OFERTA
                                                </button>
                                            )}
                                            <div style={{fontSize:'10px', opacity:0.6}}>
                                                {new Date(m.date * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div style={styles.chatInputArea}>
                                <input placeholder="Escrever uma resposta..." style={{...styles.input, marginBottom:0, borderRadius:'20px'}} />
                                <button style={{...styles.btn, width:'auto', borderRadius:'50%', padding:'10px 15px'}}>➤</button>
                            </div>
                        </>
                    ) : (
                        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#8b949e'}}>
                            <div style={{fontSize: '50px', opacity: 0.3}}>💬</div>
                            <p>Selecione uma conversa para extrair ofertas em tempo real.</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* ÁREA DE CONTEÚDO: SPY (ASPIRAÇÃO) */}
        {activeTab === 'spy' && (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={styles.card}>
                    <h3>Coletor de Grupos</h3>
                    <div style={{display:'flex', gap:'10px', margin:'15px 0'}}>
                        <button onClick={scanGroups} disabled={isScanning} style={styles.btn}>{isScanning ? 'Escaneando...' : '1. Escanear Grupos Atuais'}</button>
                        <button onClick={harvestAll} disabled={isHarvesting} style={{...styles.btn, background:'#8957e5'}}>{isHarvesting ? 'Aspirando...' : '2. Aspirar Leads de Todos'}</button>
                    </div>
                    <div style={styles.listArea}>
                        {allGroups.map((g, i) => <div key={i} style={styles.listItem}>{g.title} <span style={{fontSize:'11px', color:'#8b949e'}}>({g.participantsCount} membros)</span></div>)}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}

// ============================================================================
// SISTEMA DE ESTILOS (UI/UX)
// ============================================================================

const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif', overflow: 'hidden' },
    header: { padding: '15px 25px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    versionBadge: { fontSize: '10px', background: '#238636', padding: '3px 7px', borderRadius: '4px', color: 'white', fontWeight: 'bold' },
    
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: '40px', borderRadius: '12px', border: '1px solid #30363d', width: '350px' },

    dashboardGrid: { padding: '25px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '25px', flex: 1, overflowY: 'auto' },
    card: { background: '#161b22', padding: '20px', borderRadius: '10px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center', borderBottom: '1px solid #21262d', paddingBottom: '10px' },
    
    logBox: { height: '250px', overflowY: 'auto', background: '#010409', padding: '15px', borderRadius: '10px', border: '1px solid #30363d', fontFamily: 'monospace', marginTop: '10px' },
    accountRow: { padding: '12px', borderBottom: '1px solid #21262d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'background 0.2s' },

    chatContainer: { flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden', background: '#0b141a' },
    chatSidebar: { borderRight: '1px solid #30363d', background: '#111b21', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    chatArea: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundImage: 'linear-gradient(#0b141a 2px, transparent 2px), linear-gradient(90deg, #0b141a 2px, transparent 2px)', backgroundSize: '25px 25px' },
    chatHeader: { padding: '15px 25px', background: '#202c33', borderBottom: '1px solid #30363d', zIndex: 5 },
    messagesList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '25px', minHeight: 0 },
    chatInputArea: { padding: '15px 20px', background: '#202c33', display: 'flex', gap: '12px', alignItems: 'center' },

    input: { width: '100%', padding: '12px', background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: '8px', marginBottom: '12px', outline: 'none', boxSizing: 'border-box', fontSize: '14px' },
    btn: { width: '100%', padding: '14px', background: '#238636', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
    navBtn: { color: 'white', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', border: '1px solid transparent', fontSize: '13px', fontWeight: 'bold', transition: 'all 0.3s' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
    linkBtn: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#c9d1d9', cursor: 'pointer' },
    loadMoreBtn: { background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 18px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px' },
    toggleBtn: { flex: 1, border: 'none', color: 'white', padding: '10px', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' },
    cloneBtn: { background: 'rgba(31, 111, 235, 0.2)', color: '#58a6ff', border: '1px solid #1f6feb', fontSize: '10px', padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' },
    listArea: { height: '350px', overflowY: 'auto', background: '#0d1117', padding: '15px', borderRadius: '10px' },
    listItem: { padding: '10px', borderBottom: '1px solid #21262d', fontSize: '14px' }
};

const StatBox = ({ label, val, color }) => (
    <div style={{ flex: 1, background: '#161b22', padding: '20px', borderRadius: '10px', borderLeft: `5px solid ${color}`, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: 0, color: 'white', fontSize: '26px' }}>{val}</h2>
        <small style={{ color: '#8b949e', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px' }}>{label}</small>
    </div>
);
