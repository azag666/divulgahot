-- Criar tabela de canais se não existir
CREATE TABLE IF NOT EXISTS public.channels (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_access_hash TEXT DEFAULT '',
  channel_name TEXT NOT NULL,
  channel_description TEXT DEFAULT '',
  creator_phone TEXT NOT NULL,
  selected_phones TEXT[] DEFAULT '{}',
  total_members INTEGER DEFAULT 1,
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'members_added', 'broadcast_sent')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_broadcast TIMESTAMP WITH TIME ZONE,
  created_by TEXT REFERENCES auth.users(id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON public.channels(created_by);
CREATE INDEX IF NOT EXISTS idx_channels_status ON public.channels(status);
CREATE INDEX IF NOT EXISTS idx_channels_created_at ON public.channels(created_at);
CREATE INDEX IF NOT EXISTS idx_channels_creator_phone ON public.channels(creator_phone);

-- Criar tabela de leads se não existir (para referência)
CREATE TABLE IF NOT EXISTS public.leads (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  assigned_to_channel TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para leads
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_channel ON public.leads(assigned_to_channel);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);

-- Limpar cache do schema (forçar atualização)
NOTIFY pgrst, 'reload schema';
