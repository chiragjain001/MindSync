import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Browser client for Supabase (public anon key)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.');
}

// Create Supabase client with rate limiting protection
export const supabase = createClientComponentClient({
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_ANON_KEY,
  options: {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      headers: {
        'X-Client-Info': 'mindSync-web'
      }
    }
  }
});

// Rate limiting utility
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}

const rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute

// Enhanced Supabase client with rate limiting
export const safeSupabase = {
  auth: {
    getSession: async () => {
      const key = 'auth-getSession';
      if (!rateLimiter.isAllowed(key)) {
        console.warn('Rate limit exceeded for getSession');
        return { data: { session: null }, error: null };
      }
      return supabase.auth.getSession();
    },
    onAuthStateChange: (callback: any) => {
      return supabase.auth.onAuthStateChange(callback);
    },
    signOut: async () => {
      const key = 'auth-signOut';
      if (!rateLimiter.isAllowed(key)) {
        console.warn('Rate limit exceeded for signOut');
        return { error: { message: 'Rate limit exceeded' } };
      }
      return supabase.auth.signOut();
    }
  },
  from: (table: string) => {
    return {
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          single: async () => {
            const key = `db-${table}-select`;
            if (!rateLimiter.isAllowed(key)) {
              console.warn(`Rate limit exceeded for ${table} select`);
              return { data: null, error: { message: 'Rate limit exceeded' } };
            }
            return supabase.from(table).select(columns).eq(column, value).single();
          }
        })
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          select: async () => {
            const key = `db-${table}-update`;
            if (!rateLimiter.isAllowed(key)) {
              console.warn(`Rate limit exceeded for ${table} update`);
              return { data: null, error: { message: 'Rate limit exceeded' } };
            }
            return supabase.from(table).update(data).eq(column, value).select();
          }
        })
      })
    };
  }
};
