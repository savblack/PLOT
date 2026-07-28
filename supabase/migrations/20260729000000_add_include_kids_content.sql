alter table profiles
  add column if not exists include_kids_content boolean not null default true;
