-- armazenamento privado das fotos (limite 3 MB, só imagens)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sala-digital', 'sala-digital', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- cópia de segurança automática todo dia às 02:00 (horário de Recife = 05:00 UTC)
create extension if not exists pg_cron;
select cron.unschedule('sala-digital-backup') where exists (select 1 from cron.job where jobname = 'sala-digital-backup');
select cron.schedule('sala-digital-backup', '0 5 * * *', 'select public.sd_backup()');
