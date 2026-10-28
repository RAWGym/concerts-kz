-- Повтор неудачных писем каждые 5 минут: база сама вызывает сервер продаж.
-- Сервер отправляет только письма, которые ещё не ушли (журнал email_log).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'mail-retry';
select cron.schedule(
  'mail-retry',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://jlpfqasntsnuzxlouqvq.supabase.co/functions/v1/tickets/mail/retry',
       headers := '{"content-type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
