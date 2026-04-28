import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { dataSourceTracker } from './data-source-tracker';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrlReader = import.meta.env.VITE_SUPABASE_URL_READER;
const supabaseAnonKeyReader = import.meta.env.VITE_SUPABASE_ANON_KEY_READER;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('❌ Supabase credentials not found. Check your .env setup.');
}

/**
 * Utility to track data source usage via Proxy
 */
function withTracking(client: SupabaseClient, source: 'primary' | 'replica'): SupabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      
      // If the property is a function (like rpc, from, auth, etc.)
      if (typeof value === 'function') {
        return (...args: any[]) => {
          // Notify tracker that this source is being used
          dataSourceTracker.notify(source);
          return value.apply(target, args);
        };
      }
      
      // If it's a property that returns an object (like .auth or .storage)
      // we could recursively proxy, but for tracking "activity", 
      // just accessing the top level methods is usually enough.
      return value;
    }
  });
}

// 🟢 PRIMARY CLIENT: Read/Write (Transactional)
const rawPrimary = createClient(supabaseUrl, supabaseAnonKey);
export const supabase = withTracking(rawPrimary, 'primary');

// 🔵 READER CLIENT: Strictly Read-Only (Dashboards & Metrics)
const rawReader = supabaseUrlReader && supabaseAnonKeyReader 
    ? createClient(supabaseUrlReader, supabaseAnonKeyReader)
    : rawPrimary;

export const supabaseReader = withTracking(rawReader, supabaseUrlReader ? 'replica' : 'primary');

if (!supabaseUrlReader) {
    console.warn('⚠️ Supabase Reader credentials not found. Falling back to primary database.');
}
