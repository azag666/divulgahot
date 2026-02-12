import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { supabase } from "./supabase";

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '20455328');
const API_HASH = process.env.TELEGRAM_API_HASH || '6720790e72956790937a441369369363';

export const getClient = async (phone) => {
    if (!supabase) throw new Error("Supabase não configurado.");

    const cleanPhone = String(phone).replace(/\D/g, '');

    const { data, error } = await supabase
        .from('sessions')
        .select('session_string')
        .eq('phone_number', cleanPhone)
        .single();

    if (error || !data) {
        throw new Error(`Sessão não encontrada para ${cleanPhone}.`);
    }

    const client = new TelegramClient(
        new StringSession(data.session_string),
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
