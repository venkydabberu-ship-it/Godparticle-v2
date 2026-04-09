import { supabase } from './supabase';

export async function signUp(
  email: string,
  password: string,
  username: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  userId: string,
  updates: Record<string, any>
) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function useCredits(userId: string, credits: number = 2) {
  const { data, error } = await supabase
    .rpc('use_credits', {
      p_user_id: userId,
      p_credits: credits
    });
  if (error) throw error;
  return data;
}

export async function addCredits(
  userId: string,
  credits: number,
  type: string,
  description: string
) {
  const { data, error } = await supabase
    .rpc('add_credits', {
      p_user_id: userId,
      p_credits: credits,
      p_type: type,
      p_description: description
    });
  if (error) throw error;
  return data;
}