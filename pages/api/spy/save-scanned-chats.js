import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  await authenticate(req, res, async () => {
    const { groups, channels } = req.body || {};

    if ((!groups || groups.length === 0) && (!channels || channels.length === 0)) {
      return res.status(400).json({ error: 'Nenhum grupo ou canal fornecido' });
    }

    try {
      const allChats = [...(groups || []), ...(channels || [])];
      const recordsToSave = [];

      for (const chat of allChats) {
        // Busca owner_id da sessão pelo ownerPhone
        let ownerId = null;
        if (chat.ownerPhone) {
          const { data: sessionData } = await supabase
            .from('telegram_sessions')
            .select('owner_id')
            .eq('phone_number', chat.ownerPhone)
            .single();
          
          if (sessionData?.owner_id) {
            ownerId = sessionData.owner_id;
          }
        }

        // Se não for admin, valida que o owner_id corresponde ao usuário logado
        if (!req.isAdmin && req.userId && ownerId !== req.userId) {
          continue; // Pula este chat se não pertencer ao usuário
        }

        // Limita tamanho da foto (base64 pode ser muito grande)
        let photoData = chat.photo || null;
        if (photoData && photoData.length > 500000) { // ~500KB
          photoData = null; // Remove foto muito grande
        }

        recordsToSave.push({
          chat_id: chat.id,
          title: chat.title || 'Sem nome',
          type: chat.type || 'Grupo',
          participants_count: chat.participantsCount || 0,
          photo: photoData,
          owner_phone: chat.ownerPhone || null,
          owner_id: ownerId || req.userId || null,
          is_megagroup: chat.isMegagroup || false,
          scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      if (recordsToSave.length === 0) {
        return res.status(403).json({ error: 'Nenhum chat válido para salvar' });
      }

      // Faz upsert por chat_id para evitar duplicatas
      const { error } = await supabase
        .from('scanned_chats')
        .upsert(recordsToSave, {
          onConflict: 'chat_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Erro ao salvar chats escaneados:', error);
        return res.status(500).json({ error: error.message || 'Erro ao salvar no banco de dados' });
      }

      res.status(200).json({
        success: true,
        saved: recordsToSave.length,
        message: `${recordsToSave.length} chats salvos com sucesso`
      });

    } catch (error) {
      console.error('Erro ao processar chats escaneados:', error);
      res.status(500).json({ error: error.message || 'Erro interno do servidor' });
    }
  });
}
