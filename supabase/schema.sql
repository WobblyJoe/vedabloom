-- VedaBloom schema. Run in Supabase SQL Editor.
-- Partner sharing is opt-in, revocable, and limited to discreet in-app notifications.

create table if not exists public.wellness_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('period', 'checkin', 'journal', 'settings')),
  entry_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, entry_key)
);
alter table public.wellness_entries enable row level security;
drop policy if exists "Users can read own wellness entries" on public.wellness_entries;
create policy "Users can read own wellness entries" on public.wellness_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own wellness entries" on public.wellness_entries;
create policy "Users can insert own wellness entries" on public.wellness_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own wellness entries" on public.wellness_entries;
create policy "Users can update own wellness entries" on public.wellness_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own wellness entries" on public.wellness_entries;
create policy "Users can delete own wellness entries" on public.wellness_entries for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists wellness_entries_user_kind_idx on public.wellness_entries (user_id, kind);

create table if not exists public.partner_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, partner_id),
  check (owner_id <> partner_id)
);
alter table public.partner_links enable row level security;
drop policy if exists "Users can view their own partner links" on public.partner_links;
create policy "Users can view their own partner links" on public.partner_links for select to authenticated using (auth.uid() = owner_id or auth.uid() = partner_id);
drop policy if exists "Owner can unlink partner" on public.partner_links;
create policy "Owner can unlink partner" on public.partner_links for delete to authenticated using (auth.uid() = owner_id);

create or replace function public.connect_partner_by_email(partner_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare partner_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select u.id into partner_user_id from auth.users u where lower(u.email) = lower(trim(partner_email)) limit 1;
  if partner_user_id is null then raise exception 'No account found for that email. Ask them to create their own VedaBloom account first.'; end if;
  if partner_user_id = auth.uid() then raise exception 'You cannot connect your own account.'; end if;
  insert into public.partner_links(owner_id, partner_id) values (auth.uid(), partner_user_id) on conflict do nothing;
end;
$$;
revoke all on function public.connect_partner_by_email(text) from public;
grant execute on function public.connect_partner_by_email(text) to authenticated;

create table if not exists public.partner_sharing_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  period_notifications_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.partner_sharing_settings enable row level security;
drop policy if exists "Owner manages own sharing settings" on public.partner_sharing_settings;
create policy "Owner manages own sharing settings" on public.partner_sharing_settings for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists public.partner_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind = 'period_logged'),
  message text not null default 'Your partner chose to share a period update in VedaBloom.',
  event_date date not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.partner_notifications enable row level security;

create or replace function public.set_partner_notification_recipient()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid; sharing_enabled boolean;
begin
  if auth.uid() is null or auth.uid() <> new.owner_id then raise exception 'Not authorized.'; end if;
  select s.period_notifications_enabled into sharing_enabled from public.partner_sharing_settings s where s.owner_id = new.owner_id;
  if coalesce(sharing_enabled, false) is not true then raise exception 'Partner notifications are not enabled by the data owner.'; end if;
  select l.partner_id into target_id from public.partner_links l where l.owner_id = new.owner_id order by l.created_at desc limit 1;
  if target_id is null then raise exception 'Connect a partner account first.'; end if;
  new.recipient_id := target_id;
  new.message := 'Your partner chose to share that they logged a period update in VedaBloom.';
  return new;
end;
$$;
drop trigger if exists partner_notification_recipient on public.partner_notifications;
create trigger partner_notification_recipient before insert on public.partner_notifications for each row execute function public.set_partner_notification_recipient();
drop policy if exists "Owner sends consented period notification" on public.partner_notifications;
create policy "Owner sends consented period notification" on public.partner_notifications for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "Recipient reads own notifications" on public.partner_notifications;
create policy "Recipient reads own notifications" on public.partner_notifications for select to authenticated using (auth.uid() = recipient_id);
drop policy if exists "Recipient marks own notifications read" on public.partner_notifications;
create policy "Recipient marks own notifications read" on public.partner_notifications for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create index if not exists partner_notifications_recipient_created_idx on public.partner_notifications (recipient_id, created_at desc);

-- Keep the Supabase service-role key out of all frontend environment variables.
