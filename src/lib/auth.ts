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
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('getProfile error:', error);
      // Return default profile if fetch fails
      return {
        id: userId,
        username: 'user',
        role: 'free',
        credits: 50,
        is_active: true,
        created_at: new Date().toISOString()
      };
    }
    return data;
  } catch(e) {
    console.error('getProfile exception:', e);
    return {
      id: userId,
      username: 'user',
      role: 'free',
      credits: 50,
      is_active: true,
      created_at: new Date().toISOString()
    };
  }
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

export async function resendSignupOTP(email: string) {
  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) throw error;
  return data;
}

export async function verifySignupOTP(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordResetOTP(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return data;
}

export async function verifyPasswordResetOTP(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  return data;
}

export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
  return data;
}
