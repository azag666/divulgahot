import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone, mediaUrl, caption } = req.body;

    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();
    
    if (!sessionData) return res.status(404).json({ error: "Sessão não encontrada" });

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const { data } = { data: { session_string: sessionData.session_string } };

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

  try {
    await client.connect();

    // 1. Baixar a imagem/video da URL
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) throw new Error("Erro ao baixar mídia da URL");
    const arrayBuffer = await mediaRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Upload para o Telegram
    // Detecta se é imagem ou vídeo básico pela extensão ou assume jpg
    const isVideo = mediaUrl.endsWith('.mp4');
    const mimeType = isVideo ? "video/mp4" : "image/jpeg";
    const fileName = isVideo ? "story.mp4" : "story.jpg";

    const toUpload = new CustomFile(fileName, buffer.byteLength, mimeType, buffer);
    const uploadedFile = await client.uploadFile({ file: toUpload, workers: 1 });

    // 3. Postar o Story
    // Privacy: Ninguém específico (visível para Todos ou Contatos dependendo da config do user)
    // O GramJS usa a API raw para stories
    await client.invoke(new Api.stories.SendStory({
      peer: "me", // Postar no próprio perfil
      media: new Api.InputMediaUploadedPhoto({ file: uploadedFile }), // Se for video, usar InputMediaUploadedDocument
      caption: caption,
      privacyRules: [new Api.InputPrivacyValueAllowAll()] // Tenta público
    }));

    await client.disconnect();
    res.status(200).json({ success: true });

    } catch (error) {
      await client.disconnect();
      console.error(error);
      // Erro comum: User não é premium (alguns limites) ou erro de API
      res.status(500).json({ error: error.message || "Erro ao postar story" });
    }
  });
}
