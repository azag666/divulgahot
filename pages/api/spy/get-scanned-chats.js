import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  await authenticate(req, res, async () => {
    try {
      let query = supabase
        .from('scanned_chats')
        .select('*')
        .order('participants_count', { ascending: false });

      // Se não for admin, filtra por owner_id do usuário logado
      if (!req.isAdmin && req.userId) {
        query = query.eq('owner_id', req.userId);
      }
      // Se for admin, retorna todos os chats (sem filtro)

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar chats escaneados:', error);
        return res.status(500).json({ error: error.message || 'Erro ao buscar no banco de dados' });
      }

      // Separa em grupos e canais
      const groups = [];
      const channels = [];

      for (const chat of (data || [])) {
        const chatObj = {
          id: chat.chat_id,
          title: chat.title,
          type: chat.type,
          participantsCount: chat.participants_count || 0,
          photo: chat.photo,
          ownerPhone: chat.owner_phone,
          isMegagroup: chat.is_megagroup || false
        };

        if (chat.type === 'Canal') {
          channels.push(chatObj);
        } else {
          groups.push(chatObj);
        }
      }

      res.status(200).json({
        success: true,
        groups: groups,
        channels: channels,
        total: (groups.length + channels.length)
      });

    } catch (error) {
      console.error('Erro ao processar busca de chats:', error);
      res.status(500).json({ error: error.message || 'Erro interno do servidor' });
    }
  });
}
