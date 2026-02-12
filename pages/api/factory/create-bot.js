import { getClient } from '../../../lib/telegram-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, name, username, photoUrl } = req.body;

  try {
    const client = await getClient(phone);
    
    // Inicia conversa
    await client.sendMessage('BotFather', { message: '/newbot' });
    await new Promise(r => setTimeout(r, 1500));
    
    // Envia Nome
    await client.sendMessage('BotFather', { message: name });
    await new Promise(r => setTimeout(r, 1500));
    
    // Envia Username
    await client.sendMessage('BotFather', { message: username });
    await new Promise(r => setTimeout(r, 3000)); // Espera resposta do BotFather
    
    // Tenta ler a última mensagem para pegar o token
    const history = await client.getMessages('BotFather', { limit: 1 });
    const lastMsg = history[0]?.message || "";
    
    // Extrai o token via Regex
    const tokenMatch = lastMsg.match(/([0-9]{8,10}:[a-zA-Z0-9_-]{35})/);
    const token = tokenMatch ? tokenMatch[0] : "TOKEN_NAO_CAPTURADO_VERIFIQUE_MANUALMENTE";

    // Define foto se tiver token e URL
    if (tokenMatch && photoUrl) {
         await client.sendMessage('BotFather', { message: '/setuserpic' });
         await new Promise(r => setTimeout(r, 1000));
         
         // Seleciona o bot recém criado
         await client.sendMessage('BotFather', { message: `@${username}` });
         await new Promise(r => setTimeout(r, 1000));
         
         // Envia a foto
         await client.sendMessage('BotFather', { file: photoUrl });
    }

    return res.status(200).json({ success: true, token: token, log: lastMsg });

  } catch (error) {
    console.error("Erro Factory Bot:", error);
    return res.status(500).json({ error: error.message });
  }
}
