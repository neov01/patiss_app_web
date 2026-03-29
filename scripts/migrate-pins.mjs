import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const envVars = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(part => part.trim()))
    .filter(parts => parts.length >= 2)
    .map(([key, ...rest]) => [key, rest.join('=')])
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase URL or Service Role Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migratePins() {
  console.log("Fetching profiles...");
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, pin_code')
    .not('pin_code', 'is', null);

  if (error) {
    console.error("Error fetching profiles:", error);
    return;
  }

  console.log(`Found ${profiles.length} profiles to process.`);
  
  let migratedCount = 0;
  for (const profile of profiles) {
    // Only hash if it's not already a bcrypt hash
    if (profile.pin_code && !profile.pin_code.startsWith('$2a$') && !profile.pin_code.startsWith('$2b$')) {
        console.log(`Hashing PIN for profile ${profile.id}...`);
        const hashedPin = await bcrypt.hash(profile.pin_code, 10);
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ pin_code: hashedPin })
          .eq('id', profile.id);
        
        if (updateError) {
            console.error(`Failed to update profile ${profile.id}:`, updateError);
        } else {
            migratedCount++;
        }
    } else {
        console.log(`Profile ${profile.id} already hashed or empty.`);
    }
  }
  
  console.log(`Migration complete. Successfully updated ${migratedCount} profiles.`);
}

migratePins();
