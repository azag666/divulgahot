import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { supabase } from "./supabase";

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '20455328');
const API_HASH = process.env.TELEGRAM_API_HASH || '6720790e72956790937a441369369363';

export const getClient = async (phone) => {
    if (!supabase) throw new Error("Supabase não configurado.");

    const cleanPhone = String(phone).replace(/\D/g, '');

    // Compatibilidade: o projeto usa `telegram_sessions`, mas há rotas antigas usando `sessions`
    const fetchSessionString = async () => {
        const { data: tgData, error: tgError } = await supabase
            .from('telegram_sessions')
            .select('session_string')
            .eq('phone_number', cleanPhone)
            .single();

        if (!tgError && tgData?.session_string) {
            return tgData.session_string;
        }

        const { data: legacyData, error: legacyError } = await supabase
            .from('sessions')
            .select('session_string')
            .eq('phone_number', cleanPhone)
            .single();

        if (!legacyError && legacyData?.session_string) {
            return legacyData.session_string;
        }

        throw new Error(`Sessão não encontrada para ${cleanPhone}.`);
    };

    const sessionString = await fetchSessionString();

    const client = new TelegramClient(
        new StringSession(sessionString),
        API_ID,
        API_HASH,
        { connectionRetries: 2, useWSS: true, timeout: 10000 }
    );

    // Tenta conectar. Se falhar, lança erro para o painel saber que caiu.
    try {
        await client.connect();
    } catch (e) {
        throw new Error(`Falha ao conectar ${cleanPhone}: ${e.message}`);
    }
    
    return client;
};
