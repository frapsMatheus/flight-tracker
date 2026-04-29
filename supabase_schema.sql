-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create User Profiles Table
create table public.user_profiles (
    id uuid references auth.users not null primary key,
    email text not null,
    serpapi_key text,
    resend_api_key text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Observed Flights Table
create table public.observed_flights (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    title text not null,
    flight_config jsonb not null,
    interval_hours integer default 24 not null,
    last_checked timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.user_profiles enable row level security;
alter table public.observed_flights enable row level security;

-- Policies for user_profiles
create policy "Users can view own profile" on public.user_profiles
    for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.user_profiles
    for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.user_profiles
    for update using (auth.uid() = id);

-- Policies for observed_flights
create policy "Users can view own flights" on public.observed_flights
    for select using (auth.uid() = user_id);

create policy "Users can insert own flights" on public.observed_flights
    for insert with check (auth.uid() = user_id);

create policy "Users can update own flights" on public.observed_flights
    for update using (auth.uid() = user_id);

create policy "Users can delete own flights" on public.observed_flights
    for delete using (auth.uid() = user_id);

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call function on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
