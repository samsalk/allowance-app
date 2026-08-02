// Not a secret: safe to commit. Security is enforced by Supabase Row Level
// Security (see supabase/migrations/0001_family_data.sql) requiring a real
// authenticated session, not by hiding this key -- the anon key is always
// visible in frontend source no matter what.
//
// Fill these in after creating your Supabase project:
// Project Settings -> API -> Project URL / anon public key.
const SUPABASE_URL = 'https://llabdxhrvcxipvqrynrz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IhiWDJ5BktO7pev9x1-Jeg_tNPAJjGm';

// The single shared family login. The "PIN" is this account's password
// (see README for how to create it in the Supabase dashboard).
const FAMILY_EMAIL = 'salkinfam@gmail.com';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
