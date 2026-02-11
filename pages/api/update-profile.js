import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone, newName, photoUrl } = req.body;

    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();

    if (!sessionData) return res.status(404).json({ error: 'Sessão não encontrada' });

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const { data } = { data: { session_string: sessionData.session_string } };

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, {
    connectionRetries: 2,
    useWSS: false,
  });

  try {
    await client.connect();

    // 1. Atualizar Nome (Primeiro e Último)
    if (newName) {
      // Divide "Maria Silva" em ["Maria", "Silva"]
      const [firstName, ...rest] = newName.split(' ');
      const lastName = rest.join(' ');
      
      await client.invoke(new Api.account.UpdateProfile({
        firstName: firstName,
        lastName: lastName || "",
        about: "Atendimento Oficial" // Opcional: Bio
      }));
    }

    // 2. Atualizar Foto (Se houver URL)
    if (photoUrl) {
      // Baixa a imagem da URL para a memória
      const imgRes = await fetch(photoUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Prepara o arquivo para o GramJS
      const toUpload = new CustomFile("profile.jpg", buffer.byteLength, "image/jpeg", buffer);
      
      // Faz o upload para os servidores do Telegram
      const uploadedFile = await client.uploadFile({
        file: toUpload,
        workers: 1,
      });

      // Define como foto de perfil
      await client.invoke(new Api.photos.UploadProfilePhoto({
        file: uploadedFile
      }));
    }

    await client.disconnect();
    return res.status(200).json({ success: true, msg: 'Identidade clonada com sucesso!' });

    } catch (error) {
      await client.disconnect();
      console.error(error);
      return res.status(500).json({ error: error.message || 'Erro ao atualizar perfil' });
    }
  });
}
