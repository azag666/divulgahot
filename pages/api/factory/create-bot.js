import { getClient } from '../../../lib/telegram-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, name, username, photoUrl } = req.body;

  try {
    const client = await getClient(phone);
    
    await client.sendMessage('BotFather', { message: '/newbot' });
    await new Promise(r => setTimeout(r, 1000));
    
    await client.sendMessage('BotFather', { message: name });
    await new Promise(r => setTimeout(r, 1000));
    
    const result = await client.sendMessage('BotFather', { message: username });
    
    // Lógica simplificada: assume sucesso se não der erro.
    // Em produção real, você deve ler a resposta do BotFather para pegar o token exato.
    // Aqui geramos um placeholder para demonstrar no painel.
    const tokenPlaceholder = `TOKEN_PENDENTE_VERIFICAR_NO_TELEGRAM`; 

    if (photoUrl) {
         await client.sendMessage('BotFather', { message: '/setuserpic' });
         await new Promise(r => setTimeout(r, 500));
         await client.sendMessage('BotFather', { message: `@${username}` });
         await new Promise(r => setTimeout(r, 500));
         await client.sendMessage('BotFather', { file: photoUrl });
    }

    return res.status(200).json({ success: true, token: tokenPlaceholder });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
