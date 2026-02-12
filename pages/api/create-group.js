import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  // Garantir que sempre retorna JSON, mesmo em caso de erro
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    await authenticate(req, res, async () => {
      const { creatorPhone, groupName, groupPhotoUrl } = req.body || {};

      if (!creatorPhone || !groupName) {
        return res.status(400).json({ error: 'creatorPhone e groupName são obrigatórios' });
      }

      let client = null;
      try {
        const { data: sessionData } = await supabase
          .from('telegram_sessions')
          .select('session_string, owner_id')
          .eq('phone_number', creatorPhone)
          .single();

        if (!sessionData?.session_string) {
          return res.status(404).json({ error: 'Sessão não encontrada' });
        }

        // Validação de ownership (se não for admin)
        if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
          return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário' });
        }

        client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

        try {
          await client.connect();

          // 1. Criar o Grupo (novo)
          const result = await client.invoke(new Api.channels.CreateChannel({
            title: groupName,
            broadcast: false, // false = Grupo
            megagroup: true,  // true = Supergrupo
            about: groupPhotoUrl ? `Foto: ${groupPhotoUrl}` : ''
          }));

          // Verifica se retornou updates corretamente
          if (!result.chats || result.chats.length === 0) {
            throw new Error('Falha ao criar grupo: Resposta vazia do Telegram');
          }

          const newChatId = result.chats[0].id;

          // 2. (Opcional) Tentar definir foto do grupo se URL foi enviada
          if (groupPhotoUrl) {
            try {
              await client.invoke(new Api.channels.EditPhoto({
                channel: newChatId,
                photo: { _: 'inputChatUploadedPhoto', url: groupPhotoUrl }
              }));
            } catch (photoErr) {
              console.warn('Não foi possível definir a foto do grupo:', photoErr.message);
              // Não falha o processo inteiro por falha na foto
            }
          }

          // Salva registro (opcional, para auditoria)
          try {
            await supabase.from('created_groups').insert({
              creator_phone: creatorPhone,
              group_id: newChatId.toString(),
              group_name: groupName,
              created_at: new Date(),
              ...(req.userId && { owner_id: req.userId })
            });
          } catch (dbErr) {
            console.warn('Erro ao salvar registro do grupo:', dbErr.message);
            // Não falha o processo por erro no banco
          }

          return res.status(200).json({
            success: true,
            groupId: newChatId.toString(),
            groupName,
            creatorPhone
          });

        } catch (error) {
          console.error('Erro ao criar grupo:', error);
          if (!res.headersSent) {
            return res.status(500).json({ 
              success: false,
              error: error.message || 'Erro interno do servidor' 
            });
          }
        } finally {
          if (client) {
            try {
              await client.disconnect();
            } catch (disconnectErr) {
              console.warn('Erro ao desconectar cliente:', disconnectErr.message);
            }
          }
        }

      } catch (error) {
        console.error('Erro ao processar criação de grupo:', error);
        if (!res.headersSent) {
          return res.status(500).json({ 
            success: false,
            error: error.message || 'Erro interno do servidor' 
          });
        }
      }
    });
  } catch (error) {
    console.error('Erro crítico na criação de grupo:', error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        success: false,
        error: error.message || 'Erro crítico no servidor' 
      });
    }
  }
}
