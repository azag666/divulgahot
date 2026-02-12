import { getClient } from '../../../lib/telegram-client';

const serialize = (obj) => JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
));

export default async function handler(req, res) {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
        const client = await getClient(phone);
        
        // Pega dialogos (chats) recentes
        const dialogs = await client.getDialogs({ limit: 50 });
        
        const chats = dialogs
            .filter(d => d.isGroup || d.isChannel)
            .map(d => ({
                id: d.id,
                title: d.title,
                type: d.isGroup ? 'Group' : 'Channel',
                participantsCount: d.entity.participantsCount || 0
            }));

        return res.status(200).json(serialize({ chats }));
    } catch (error) {
        console.error("Spy List Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
