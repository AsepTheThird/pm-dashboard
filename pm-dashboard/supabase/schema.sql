-- Ruang Kerja PM: skema database, keamanan (RLS), dan penyimpanan file.
-- Jalankan sekali di Supabase: SQL Editor -> New query -> tempel semua -> Run.
-- Aman dijalankan ulang (memakai IF NOT EXISTS / DROP POLICY IF EXISTS).

-- =========================================================
-- 1. TABEL
-- Setiap baris punya user_id yang otomatis terisi dari akun yang login.
-- =========================================================

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  due         date not null,
  progress    integer not null default 0 check (progress between 0 and 100),
  status      text not null default 'Perencanaan'
              check (status in ('Perencanaan','Desain','Berjalan','Review','Selesai')),
  tone        integer not null default 0 check (tone between 0 and 3),
  created_at  timestamptz not null default now()
);

create table if not exists public.pins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  label       text not null check (char_length(label) between 1 and 200),
  created_at  timestamptz not null default now()
);

create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  role        text not null default '' check (char_length(role) <= 120),
  created_at  timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  member_id   uuid not null references public.team_members(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (project_id, member_id)
);

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 200),
  type        text not null default 'Lainnya' check (type in ('PRD','Update','Lainnya')),
  url         text not null default '' check (char_length(url) <= 2000),
  file_path   text,            -- lokasi di bucket "documents": <user_id>/<nama-unik>
  file_name   text,
  file_size   bigint check (file_size is null or file_size <= 20971520),
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  lead_days   integer not null default 3 check (lead_days in (1,3,7)),
  theme       text not null default 'dark' check (theme in ('dark','light')),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx        on public.projects (user_id);
create index if not exists pins_user_date_idx       on public.pins (user_id, date);
create index if not exists team_members_user_idx    on public.team_members (user_id);
create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists documents_user_proj_idx  on public.documents (user_id, project_id);

-- =========================================================
-- 2. KEAMANAN: Row Level Security
-- Tanpa ini, siapa pun yang tahu URL dan kunci anon bisa membaca data.
-- Dengan ini, hanya pemilik baris (user_id = akun yang login) yang boleh akses.
-- Peran "anon" (pengunjung tanpa login) tidak diberi kebijakan sama sekali.
-- =========================================================

alter table public.projects         enable row level security;
alter table public.pins             enable row level security;
alter table public.team_members     enable row level security;
alter table public.project_members  enable row level security;
alter table public.documents        enable row level security;
alter table public.settings         enable row level security;

drop policy if exists "pemilik penuh" on public.projects;
create policy "pemilik penuh" on public.projects
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "pemilik penuh" on public.pins;
create policy "pemilik penuh" on public.pins
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "pemilik penuh" on public.team_members;
create policy "pemilik penuh" on public.team_members
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Penugasan hanya boleh menghubungkan proyek dan anggota milik sendiri.
drop policy if exists "pemilik penuh" on public.project_members;
create policy "pemilik penuh" on public.project_members
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.projects p     where p.id = project_id and p.user_id = (select auth.uid()))
    and exists (select 1 from public.team_members m where m.id = member_id  and m.user_id = (select auth.uid()))
  );

-- Dokumen hanya boleh menunjuk proyek milik sendiri.
drop policy if exists "pemilik penuh" on public.documents;
create policy "pemilik penuh" on public.documents
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (project_id is null
         or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  );

drop policy if exists "pemilik penuh" on public.settings;
create policy "pemilik penuh" on public.settings
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Cabut akses tabel dari pengunjung tanpa login (lapisan tambahan di atas RLS).
revoke all on public.projects, public.pins, public.team_members,
              public.project_members, public.documents, public.settings
  from anon;

-- =========================================================
-- 3. PENYIMPANAN FILE (bucket privat "documents", maks. 20 MB per file)
-- Aturan: tiap file wajib berada di folder bernama user_id pemiliknya,
-- contoh: <user_id>/1718000000-prd.pdf
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do update
  set public = false, file_size_limit = 20971520;

drop policy if exists "dokumen: baca milik sendiri"  on storage.objects;
drop policy if exists "dokumen: unggah milik sendiri" on storage.objects;
drop policy if exists "dokumen: ubah milik sendiri"  on storage.objects;
drop policy if exists "dokumen: hapus milik sendiri" on storage.objects;

create policy "dokumen: baca milik sendiri" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "dokumen: unggah milik sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "dokumen: ubah milik sendiri" on storage.objects
  for update to authenticated
  using      (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "dokumen: hapus milik sendiri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
