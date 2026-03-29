require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('AuthError:', authError);
    return;
  }
  const u = users.users.find(u => u.email === 'adouwilfried@gmail.com');
  if (!u) {
    console.log('User not found in Auth.');
    return;
  }
  console.log('User ID:', u.id);
  const { data: profile, error: dbError } = await supabase.from('profiles').select('*').eq('id', u.id).single();
  if (dbError) {
    console.error('DbError:', dbError);
    return;
  }
  console.log('Profile:', profile);
  
  // Also check if admin page is there
}
run();
